/**
 * Relatórios do financeiro (portados do ZAYRA, paCaixa.ts) e a cobrança manual por WhatsApp:
 * - extrato por comprador: contratado, recebido, em aberto, vencido, a vencer, % pago e situação;
 * - fluxo de caixa: recebimentos por dia/mês com saldo acumulado e por forma, e a previsão por mês de vencimento;
 * - a cobrar: quem está vencido ou vence em breve, com a mensagem pronta — o envio é sempre escolha do administrador.
 */
import { inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, contratos, financeiroAuditoria } from '../../drizzle/schema';
import { telefoneWhatsApp } from '../../shared/contratos';
import { rotuloParcela } from './dados';
import { auditar, FinanceiroErro, pessoasDoContrato, urlPublica } from './servico';

const centavos = (v: number) => Math.round(v * 100) / 100;
const hojeBrasil = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const ABERTAS = ['prevista', 'emitida', 'vencida'];
const ENCERRADOS = ['cancelado', 'distratado'];
const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

async function base() {
  const d: any = await getDb();
  if (!d) throw new FinanceiroErro('DB', 'Banco indisponível', 503);
  const cs: any[] = (await d.select().from(contratos)).filter((c: any) => !ENCERRADOS.includes(c.status));
  const ids = cs.map(c => c.id);
  const cobs: any[] = ids.length ? await d.select().from(cobrancas).where(inArray(cobrancas.contratoId, ids)) : [];
  return { d, cs, cobs: cobs.filter(c => c.tipo !== 'antecipacao' && c.status !== 'cancelada') };
}

export type SituacaoExtrato = 'QUITADO' | 'EM_DIA' | 'EM_ATRASO' | 'AGUARDANDO_ASSINATURA';
export interface LinhaExtrato {
  contratoId: number; contratoNumero: string; loteCodigo: string; comprador: string;
  contratado: number; recebido: number; emAberto: number; vencido: number; aVencer: number; pctPago: number; situacao: SituacaoExtrato;
  parcelasPagas: number; parcelasTotal: number; parcelasVencidas: number; diasAtraso: number;
  ultimoPagamento: string | null; proximoVencimento: string | null; boletosEmitidos: number;
}

/** Extrato por comprador (um por contrato), com os totais */
export async function extratoCompradores(hoje = hojeBrasil()) {
  const { cs, cobs } = await base();
  const linhas: LinhaExtrato[] = [];
  for (const c of cs) {
    const minhas = cobs.filter(x => x.contratoId === c.id);
    const { comprador } = await pessoasDoContrato(c.id);
    const pagas = minhas.filter(x => x.status === 'paga');
    const abertas = minhas.filter(x => ABERTAS.includes(x.status));
    const vencidas = abertas.filter(x => String(x.vencimento).slice(0, 10) < hoje);
    const contratado = centavos(minhas.reduce((s, x) => s + Number(x.valor), 0));
    const recebido = centavos(pagas.reduce((s, x) => s + Number(x.valorPago ?? x.valor), 0));
    const vencido = centavos(vencidas.reduce((s, x) => s + Number(x.valor), 0));
    const emAberto = centavos(abertas.reduce((s, x) => s + Number(x.valor), 0));
    const maisAntiga = vencidas.map(x => String(x.vencimento).slice(0, 10)).sort()[0] ?? null;
    const proxima = abertas.map(x => String(x.vencimento).slice(0, 10)).filter(v => v >= hoje).sort()[0] ?? null;
    const situacao: SituacaoExtrato = !minhas.length ? 'AGUARDANDO_ASSINATURA' : !abertas.length ? 'QUITADO' : vencido > 0 ? 'EM_ATRASO' : 'EM_DIA';
    linhas.push({
      contratoId: c.id, contratoNumero: c.numero, loteCodigo: c.loteCodigo, comprador: comprador?.nome ?? '—',
      contratado, recebido, emAberto, vencido, aVencer: centavos(emAberto - vencido),
      pctPago: contratado > 0 ? Math.round((recebido / contratado) * 1000) / 10 : 0, situacao,
      parcelasPagas: pagas.length, parcelasTotal: minhas.length, parcelasVencidas: vencidas.length,
      diasAtraso: maisAntiga ? dias(maisAntiga, hoje) : 0, ultimoPagamento: pagas.map(x => String(x.pagoEm ?? '').slice(0, 10)).filter(Boolean).sort().at(-1) ?? null,
      proximoVencimento: proxima, boletosEmitidos: minhas.filter(x => x.asaasPaymentId).length,
    });
  }
  linhas.sort((a, b) => b.diasAtraso - a.diasAtraso || a.contratoNumero.localeCompare(b.contratoNumero));
  const soma = (k: 'contratado' | 'recebido' | 'emAberto' | 'vencido' | 'aVencer') => centavos(linhas.reduce((s, l) => s + l[k], 0));
  return {
    hoje, linhas,
    totais: { contratos: linhas.length, contratado: soma('contratado'), recebido: soma('recebido'), emAberto: soma('emAberto'), vencido: soma('vencido'), aVencer: soma('aVencer'),
      emAtraso: linhas.filter(l => l.situacao === 'EM_ATRASO').length, quitados: linhas.filter(l => l.situacao === 'QUITADO').length },
  };
}

const ROTULO_SITUACAO: Record<SituacaoExtrato, string> = { QUITADO: 'Quitado', EM_DIA: 'Em dia', EM_ATRASO: 'Em atraso', AGUARDANDO_ASSINATURA: 'Aguardando assinatura' };
const br = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

export async function extratoXlsx(hoje = hojeBrasil()): Promise<Buffer> {
  const { gerarXlsx } = await import('./planilha');
  const e = await extratoCompradores(hoje);
  return gerarXlsx(`Extrato ${br(hoje)}`, [
    ['Contrato', 'Chácara', 'Comprador', 'Situação', 'Contratado (R$)', 'Recebido (R$)', 'Em aberto (R$)', 'Vencido (R$)', 'A vencer (R$)', '% pago', 'Parcelas pagas', 'Parcelas vencidas', 'Dias de atraso', 'Último pagamento', 'Próximo vencimento'],
    ...e.linhas.map(l => [l.contratoNumero, l.loteCodigo, l.comprador, ROTULO_SITUACAO[l.situacao], l.contratado, l.recebido, l.emAberto, l.vencido, l.aVencer, l.pctPago,
      `${l.parcelasPagas}/${l.parcelasTotal}`, l.parcelasVencidas, l.diasAtraso, br(l.ultimoPagamento), br(l.proximoVencimento)]),
    ['TOTAL', '', `${e.totais.contratos} contrato(s)`, '', e.totais.contratado, e.totais.recebido, e.totais.emAberto, e.totais.vencido, e.totais.aVencer, '', '', '', '', '', ''],
  ] as any, [14, 9, 30, 20, 15, 15, 15, 14, 14, 8, 12, 12, 11, 15, 16]);
}

/** Fluxo de caixa: recebimentos no período (dia/mês) com saldo acumulado, por forma, e a previsão de entradas */
export async function fluxoCaixa(de: string, ate: string, agrupar: 'dia' | 'mes' = 'mes', hoje = hojeBrasil()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate) || de > ate) throw new FinanceiroErro('PERIODO', 'Período inválido', 400);
  const { cobs } = await base();
  const pagas = cobs.filter(x => x.status === 'paga' && x.pagoEm).map(x => ({ data: String(x.pagoEm).slice(0, 10), valor: Number(x.valorPago ?? x.valor), forma: String(x.formaPagamento ?? 'BOLETO') }));
  const chave = (d: string) => (agrupar === 'mes' ? d.slice(0, 7) : d);
  const saldoInicial = centavos(pagas.filter(p => p.data < de).reduce((s, p) => s + p.valor, 0));
  const periodo = pagas.filter(p => p.data >= de && p.data <= ate);
  const grupos = new Map<string, number>();
  for (const p of periodo) grupos.set(chave(p.data), centavos((grupos.get(chave(p.data)) ?? 0) + p.valor));
  let acumulado = saldoInicial;
  const serie = Array.from(grupos.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([periodo, entradas]) => {
    acumulado = centavos(acumulado + entradas);
    return { periodo, entradas, acumulado };
  });
  const porForma = new Map<string, number>();
  for (const p of periodo) porForma.set(p.forma, centavos((porForma.get(p.forma) ?? 0) + p.valor));
  // Previsão: parcelas em aberto por mês de vencimento; as já vencidas num grupo "ATRASADO"
  const previsto = new Map<string, number>();
  for (const x of cobs.filter(c => ABERTAS.includes(c.status))) {
    const v = String(x.vencimento).slice(0, 10);
    const k = v < hoje ? 'ATRASADO' : v.slice(0, 7);
    previsto.set(k, centavos((previsto.get(k) ?? 0) + Number(x.valor)));
  }
  return {
    de, ate, agrupar, saldoInicial, totalEntradas: centavos(periodo.reduce((s, p) => s + p.valor, 0)), saldoFinal: acumulado, serie,
    porForma: Array.from(porForma.entries()).map(([forma, valor]) => ({ forma, valor })).sort((a, b) => b.valor - a.valor),
    previsao: Array.from(previsto.entries()).map(([mes, valor]) => ({ mes, valor })).sort((a, b) => (a.mes === 'ATRASADO' ? -1 : b.mes === 'ATRASADO' ? 1 : a.mes.localeCompare(b.mes))),
  };
}

// ─── Cobrança manual por WhatsApp ────────────────────────────────────────────

export function mensagemCobranca(nome: string, parcelas: { rotulo: string; vencimento: string; valor: number }[], link: string, hoje = hojeBrasil()): string {
  const primeiro = String(nome || '').trim().split(/\s+/)[0] || 'tudo bem';
  const vencidas = parcelas.filter(p => p.vencimento < hoje);
  const linhas = parcelas.map(p => `• ${p.rotulo} — vence${p.vencimento < hoje ? 'u' : ''} em ${br(p.vencimento)}: R$ ${p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  return [
    `Olá, ${primeiro}! Aqui é da administração do Condomínio de Chácaras Bom Jardims.`,
    vencidas.length ? `Consta${vencidas.length > 1 ? 'm' : ''} em aberto:` : 'Lembrete do próximo vencimento:',
    ...linhas,
    `Boleto, PIX e 2ª via atualizada no seu carnê digital: ${link}`,
    'Se já pagou, desconsidere esta mensagem. Qualquer dúvida, é só responder aqui.',
  ].join('\n');
}

/** Quem cobrar: parcelas vencidas e as que vencem em até N dias, por contrato, com a mensagem pronta e o último envio */
export async function aCobrar(diasAntes = 5, hoje = hojeBrasil()) {
  const { d, cs, cobs } = await base();
  const limite = new Date(Date.parse(`${hoje}T12:00:00Z`) + diasAntes * 86_400_000).toISOString().slice(0, 10);
  const ids = cs.map(c => c.id);
  const envios: any[] = ids.length ? (await d.select().from(financeiroAuditoria).where(inArray(financeiroAuditoria.contratoId, ids))).filter((a: any) => a.acao === 'cobranca_whatsapp') : [];
  const out = [];
  for (const c of cs) {
    const abertas = cobs.filter(x => x.contratoId === c.id && ABERTAS.includes(x.status) && String(x.vencimento).slice(0, 10) <= limite)
      .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
    if (!abertas.length) continue;
    const { comprador, conjuge } = await pessoasDoContrato(c.id);
    const parcelas = abertas.map(x => ({ cobrancaId: x.id, rotulo: rotuloParcela({ tipo: x.tipo, numero: Number(x.numero), total: Number(x.total) }), vencimento: String(x.vencimento).slice(0, 10), valor: Number(x.valor) }));
    const link = `${urlPublica()}/c/${c.codigoVerificacao}`;
    const ultimo = envios.filter(a => a.contratoId === c.id).sort((a, b) => +new Date(b.criadoEm) - +new Date(a.criadoEm))[0];
    out.push({
      contratoId: c.id, contratoNumero: c.numero, loteCodigo: c.loteCodigo, comprador: comprador?.nome ?? '—',
      telefone: telefoneWhatsApp(comprador?.telefone1) ?? telefoneWhatsApp(conjuge?.telefone1), parcelas,
      total: centavos(parcelas.reduce((s, p) => s + p.valor, 0)), diasAtraso: parcelas[0].vencimento < hoje ? dias(parcelas[0].vencimento, hoje) : 0,
      mensagem: mensagemCobranca(comprador?.nome ?? '', parcelas, link, hoje), ultimoEnvio: ultimo ? ultimo.criadoEm : null,
    });
  }
  return out.sort((a, b) => b.diasAtraso - a.diasAtraso);
}

/**
 * Envia a cobrança dos contratos escolhidos pelo administrador (fila com intervalo entre as mensagens, em segundo plano).
 * Sem Z-API configurada, recusa. Cada envio (ou falha) fica na auditoria.
 */
export async function enviarCobrancas(contratoIds: number[], autorId: number, o: { dias?: number; hoje?: string; intervaloMs?: number; enviar?: (fone: string, msg: string) => Promise<unknown> } = {}) {
  if (!o.enviar && !process.env.ZAPI_INSTANCE_ID) throw new FinanceiroErro('ZAPI', 'WhatsApp (Z-API) não configurado', 503);
  // Mesmo prazo da lista que o administrador viu na tela
  const lista = (await aCobrar(o.dias ?? 5, o.hoje)).filter(x => contratoIds.includes(x.contratoId));
  const semTelefone = lista.filter(x => !x.telefone).map(x => x.contratoNumero);
  const fila = lista.filter(x => x.telefone);
  const enviar = o.enviar ?? (async (fone: string, msg: string) => (await import('../leads/zapiClient')).enviarTexto(fone, msg));
  const intervalo = o.intervaloMs ?? 4000;
  const processar = async () => {
    for (let i = 0; i < fila.length; i++) {
      const x = fila[i];
      try {
        await enviar(x.telefone!, x.mensagem);
        await auditar('cobranca_whatsapp', { contratoId: x.contratoId, usuarioId: autorId, origem: 'perfil', detalhe: { parcelas: x.parcelas.map(p => p.cobrancaId), total: x.total } });
      } catch (e: any) {
        await auditar('cobranca_whatsapp_falha', { contratoId: x.contratoId, usuarioId: autorId, origem: 'perfil', detalhe: { erro: String(e?.message ?? e).slice(0, 200) } });
      }
      if (i < fila.length - 1 && intervalo > 0) await new Promise(r => setTimeout(r, intervalo));
    }
  };
  if (o.intervaloMs === 0) await processar(); else setImmediate(() => processar().catch(e => console.warn('[Cobrança WhatsApp]', e?.message)));
  return { enviando: fila.length, semTelefone };
}
