/**
 * Jobs do Bloco Financeiro (verificação a cada hora; as operações são idempotentes):
 * - IPCA: dia 15, a partir das 08h — busca a variação mensal na SIDRA/IBGE (tabela 1737, variável 63) e grava em indicesIpca.
 *   Falhou a API: alerta no log e mantém o último índice (a 2ª via usa o último publicado).
 * - Declaração anual de quitação (Lei 12.007/2009): 2º dia útil de maio, a partir das 08h, referente ao ano anterior.
 *   Contrato com parcela do ano em aberto: não emite — fica "retida — débito em aberto" no painel da Secretária.
 */
import { eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, contratos, declaracoesQuitacao, empJuridico, indicesIpca } from '../../drizzle/schema';
import { salvarArquivo } from '../contratos/arquivos';
import { diaUtil } from './encargos';
import { rotuloParcela } from './dados';
import { auditar, codigoVerificacao, contextoDocs, hojeBrasil, linhaParaCobranca, pessoasDoContrato, urlPublica } from './servico';
import { renderDeclaracaoAnual } from './render/documentos';
import { configAsaas } from './asaas';

export const URL_SIDRA = 'https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/63/p/last%2012';

/** Resposta da SIDRA → [{ competencia: 'AAAA-MM', variacao }] (a 1ª linha é o cabeçalho) */
export function lerSidra(json: unknown): { competencia: string; variacao: number }[] {
  if (!Array.isArray(json)) return [];
  return json.slice(1).flatMap((r: any) => {
    const per = String(r?.D3C ?? '');
    const v = Number(String(r?.V ?? '').replace(',', '.'));
    return /^\d{6}$/.test(per) && Number.isFinite(v) ? [{ competencia: `${per.slice(0, 4)}-${per.slice(4)}`, variacao: v }] : [];
  });
}

export async function atualizarIpca(fetchFn: typeof fetch = fetch): Promise<{ gravados: number } | { erro: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20_000);
    const r = await fetchFn(URL_SIDRA, { signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const linhas = lerSidra(await r.json());
    if (!linhas.length) throw new Error('resposta sem índices');
    const db = (await getDb()) as any;
    for (const l of linhas) {
      const valor = l.variacao.toFixed(4);
      const [ja] = await db.select().from(indicesIpca).where(eq(indicesIpca.competencia, l.competencia)).limit(1);
      if (ja) { if (Number(ja.variacao) !== l.variacao) await db.update(indicesIpca).set({ variacao: valor, atualizadoEm: new Date() }).where(eq(indicesIpca.competencia, l.competencia)); }
      else await db.insert(indicesIpca).values({ competencia: l.competencia, variacao: valor, atualizadoEm: new Date() });
    }
    console.log(`[IPCA] ✅ ${linhas.length} competências (até ${linhas.at(-1)!.competencia})`);
    return { gravados: linhas.length };
  } catch (e: any) {
    console.error(`[IPCA] ⚠️ SIDRA/IBGE indisponível (${e?.message ?? e}) — mantido o último índice`);
    return { erro: String(e?.message ?? e) };
  }
}

/** 2º dia útil de maio do ano */
export function segundoDiaUtilDeMaio(ano: number): string {
  let n = 0;
  for (let d = 1; d <= 31; d++) {
    const iso = `${ano}-05-${String(d).padStart(2, '0')}`;
    if (diaUtil(iso) && ++n === 2) return iso;
  }
  return `${ano}-05-02`;
}

/** Situação do ano: pagas (com vencimento no ano) e pendentes (vencidas no ano e não pagas) */
export function situacaoDoAno<T extends { status: string; vencimento: string }>(linhas: T[], ano: number, hoje: string) {
  const doAno = linhas.filter(l => l.vencimento.startsWith(String(ano)) && l.status !== 'cancelada');
  return {
    pagas: doAno.filter(l => l.status === 'paga'),
    pendentes: doAno.filter(l => l.status !== 'paga' && l.vencimento < hoje),
  };
}

export async function gerarDeclaracoesAnuais(ano: number, hoje = hojeBrasil()) {
  const db = (await getDb()) as any;
  const cs = await db.select().from(contratos).where(inArray(contratos.status, ['ativo', 'quitado']));
  const res = { emitidas: 0, retidas: 0, jaExistiam: 0 };
  for (const c of cs) {
    const [ja] = await db.select().from(declaracoesQuitacao)
      .where(sql`${declaracoesQuitacao.contratoId} = ${c.id} AND ${declaracoesQuitacao.anoRef} = ${ano}`).limit(1);
    if (ja) { res.jaExistiam++; continue; }
    const linhas: ReturnType<typeof linhaParaCobranca>[] = (await db.select().from(cobrancas).where(eq(cobrancas.contratoId, c.id))).map(linhaParaCobranca);
    const { pagas, pendentes } = situacaoDoAno(linhas, ano, hoje);
    if (!pagas.length && !pendentes.length) continue;
    if (pendentes.length) {
      await db.insert(declaracoesQuitacao).values({ contratoId: c.id, anoRef: ano, status: 'retida', criadoEm: new Date(),
        motivo: `Declaração retida — débito em aberto (${pendentes.length} parcela(s) de ${ano})` });
      res.retidas++;
      continue;
    }
    const ctx = await contextoDocs(c.id);
    const [j] = await db.select().from(empJuridico).where(eq(empJuridico.empreendimentoId, c.empreendimentoId)).limit(1);
    const vend = (typeof j?.vendedoraJson === 'string' ? JSON.parse(j.vendedoraJson) : j?.vendedoraJson) ?? {};
    const codigo = codigoVerificacao();
    const pdf = await renderDeclaracaoAnual({
      ano, contratoNumero: ctx.contrato.numero, compradorNome: ctx.comprador.nome, compradorDoc: ctx.comprador.cpfCnpj ? `CPF ${ctx.comprador.cpfCnpj.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}` : '',
      unidade: `Chácara ${ctx.lote.codigo} (Quadra ${ctx.lote.quadra ?? '—'})`, vendedora: String(vend.vend_nome ?? ''),
      pagamentos: pagas.map(p => ({ parcela: rotuloParcela(p), vencimento: p.vencimentoOriginal ?? p.vencimento, pagoEm: p.pagoEm, valor: p.valorPago ?? p.valor })),
      codigoVerif: codigo, urlVerificacao: `${urlPublica()}/c/${ctx.contrato.codigoVerificacao}`, emitidaEm: hoje,
    });
    const chave = `declaracoes/${c.id}-${ano}.pdf`;
    await salvarArquivo(chave, pdf);
    const total = Math.round(pagas.reduce((s, p) => s + (p.valorPago ?? p.valor), 0) * 100) / 100;
    await db.insert(declaracoesQuitacao).values({ contratoId: c.id, anoRef: ano, status: 'emitida', valorTotal: String(total), pdfArquivo: chave, criadoEm: new Date() });
    res.emitidas++;
    // Envio ao cliente só com a cobrança ligada (Asaas configurado)
    if (configAsaas()) {
      const { comprador } = await pessoasDoContrato(c.id);
      if (comprador?.telefone1) {
        try {
          const { enviarDocumento } = await import('../leads/zapiClient');
          await enviarDocumento(comprador.telefone1, { base64: pdf.toString('base64'), extensao: 'pdf', mime: 'application/pdf',
            nomeArquivo: `Declaracao-quitacao-${ano}.pdf`, legenda: `Declaração anual de quitação de ${ano} — Condomínio de Chácaras Bom Jardims` });
          await db.update(declaracoesQuitacao).set({ enviadoEm: new Date() }).where(sql`${declaracoesQuitacao.contratoId} = ${c.id} AND ${declaracoesQuitacao.anoRef} = ${ano}`);
        } catch (e: any) { console.warn('[Declaração] envio falhou:', e?.message); }
      }
    }
    await auditar('declaracao_anual', { contratoId: c.id, origem: 'job', detalhe: { ano, total } });
  }
  return res;
}

let iniciado = false;
const feito = new Set<string>();

export function iniciarJobsFinanceiro() {
  if (iniciado) return;
  iniciado = true;
  const verificar = async () => {
    const agora = new Date(Date.now() - 3 * 3600_000); // horário de Brasília
    const hoje = agora.toISOString().slice(0, 10), hora = agora.getUTCHours();
    if (hora < 8) return;
    if (hoje.slice(8) === '15' && !feito.has(`ipca:${hoje}`)) { feito.add(`ipca:${hoje}`); await atualizarIpca(); }
    const ano = Number(hoje.slice(0, 4));
    if (hoje === segundoDiaUtilDeMaio(ano) && !feito.has(`decl:${ano}`)) {
      feito.add(`decl:${ano}`);
      console.log('[Declaração anual]', await gerarDeclaracoesAnuais(ano - 1, hoje));
    }
  };
  setInterval(() => verificar().catch(e => console.warn('[Financeiro] job:', e?.message)), 3600_000).unref?.();
  setTimeout(() => verificar().catch(() => undefined), 60_000).unref?.();
}
