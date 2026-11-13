/**
 * Resumo e linha do tempo (auditoria) do contrato, para a lista e o detalhe:
 * preenchido → minuta → definitivo → enviado para assinatura → cada assinatura → manifesto → entrada paga →
 * via oficial enviada pelo WhatsApp → contrato ativo. Cada etapa traz a data; a feita fica verde na tela.
 */
import { atoPagoEm, linhasDoAto } from '../../shared/entradaAto';
import { asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { assinaturaEventos, assinaturaSignatarios, cobrancas, contratos, contratoVersoes } from '../../drizzle/schema';
import { ROTULO_CONDICAO, ROTULO_MODO_C } from '../../shared/condicoesLancamento';

const json = (v: unknown): any => { if (typeof v !== 'string') return v ?? {}; try { return JSON.parse(v); } catch { return {}; } };
const brl = (v: unknown) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const data = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v).length === 10 ? `${v}T12:00:00` : String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export const PAPEL: Record<string, string> = {
  comprador: 'Comprador(a)', conjuge: 'Cônjuge', vendedora: 'Proprietária', proprietaria: 'Proprietária', gestora: 'Gestora (Romatec)',
  administradora: 'Gestora (Romatec)', corretor: 'Corretor(a)', intermediador: 'Corretor(a)', testemunha: 'Testemunha', testemunha1: 'Testemunha', testemunha2: 'Testemunha',
};
const papel = (p: unknown) => PAPEL[String(p)] ?? String(p ?? '');

export interface ResumoContrato { plano: string; observacoes: string[] }

/** Plano em uma linha + observações do contrato (congelamento, concessão, condições específicas) */
export function resumoDoContrato(c: { simulacaoJson: unknown; dadosJson: unknown }): ResumoContrato {
  const p = json(c.simulacaoJson);
  const dados = json(c.dadosJson);
  const obs: string[] = [];
  let plano = '—';
  if (p.modalidade === 'avista') plano = `À vista · ${brl(p.total_pagar)}`;
  else if (p.modalidade) {
    const cond = p.condicao && p.condicao !== 'padrao' ? `${ROTULO_CONDICAO[p.condicao as 'A']?.titulo ?? `Plano ${p.condicao}`} · ` : '';
    const entrada = p.complemento_ato ? `entrada ${brl(p.complemento_ato)} no ato` : `entrada ${Number(p.entrada_qtd) > 1 ? `${p.entrada_qtd}× ` : ''}${brl(p.entrada_valor)}`;
    plano = `${cond}${entrada} + ${p.saldo_qtd}× de ${brl(p.saldo_parcela)}`;
    if (p.reforco_qtd) plano += ` + ${p.reforco_qtd} reforços de ${brl(p.reforco_valor)}`;
  }
  if (p.complemento_qtd) {
    const modo = ROTULO_MODO_C?.[p.complemento_modo as 'unificado']?.titulo ?? p.complemento_modo;
    obs.push(p.complemento_modo === 'congelado'
      ? `Complemento da entrada congelado: ${p.complemento_qtd}× de ${brl(p.complemento_parcela)} a partir do ${p.complemento_inicio_mes}º mês, em carnê à parte`
      : `Resto da entrada: ${p.complemento_qtd}× de ${brl(p.complemento_parcela)} (${String(modo).toLowerCase()})`);
  }
  if (p.concessao) obs.push(`Concessão da proprietária${p.concessao.motivo ? `: ${p.concessao.motivo}` : ''}`);
  const esp = String(dados?.condicionantes?.ctr_condicoes_especificas ?? '').trim();
  if (esp && !/^não há\.?$/i.test(esp)) obs.push(`Condições específicas: ${esp.length > 220 ? `${esp.slice(0, 217)}…` : esp}`);
  return { plano, observacoes: obs };
}

export interface EtapaLinha { chave: string; titulo: string; detalhe: string | null; em: string | null; feito: boolean }

const ETAPA_VERSAO = (e: string) => (e === 'gerado:minuta' ? 'minuta' : e === 'gerado' ? 'definitivo' : e === 'para_assinatura' ? 'envio' : e === 'manuscrito' ? 'manuscrito' : null);

export async function linhaDoTempo(contratoId: number): Promise<EtapaLinha[]> {
  const d: any = await getDb();
  if (!d) return [];
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c) return [];
  const [versoes, sigs, eventos, cobs]: any[][] = await Promise.all([
    d.select({ etapa: contratoVersoes.etapa, versao: contratoVersoes.versao, criadoEm: contratoVersoes.criadoEm }).from(contratoVersoes).where(eq(contratoVersoes.contratoId, contratoId)).orderBy(asc(contratoVersoes.versao)),
    d.select().from(assinaturaSignatarios).where(eq(assinaturaSignatarios.contratoId, contratoId)),
    d.select({ signatarioId: assinaturaEventos.signatarioId, evento: assinaturaEventos.evento, detalhe: assinaturaEventos.detalhe, criadoEm: assinaturaEventos.criadoEm }).from(assinaturaEventos).where(eq(assinaturaEventos.contratoId, contratoId)).orderBy(asc(assinaturaEventos.criadoEm)),
    d.select({ tipo: cobrancas.tipo, numero: cobrancas.numero, status: cobrancas.status, pagoEm: cobrancas.pagoEm, valor: cobrancas.valor, vencimento: cobrancas.vencimento, vencimentoOriginal: cobrancas.vencimentoOriginal, formaPagamento: cobrancas.formaPagamento }).from(cobrancas).where(eq(cobrancas.contratoId, contratoId)),
  ]);
  const primeiraVersao = (k: string) => versoes.find(v => ETAPA_VERSAO(String(v.etapa)) === k);
  const ev = (nome: string, sid?: number | null) => eventos.find(e => e.evento === nome && (sid === undefined || e.signatarioId === sid));
  const out: EtapaLinha[] = [];
  const add = (chave: string, titulo: string, em: unknown, feito: boolean, detalhe: string | null = null) => out.push({ chave, titulo, detalhe, em: data(em), feito });

  add('preenchido', 'Contrato preenchido', c.criadoEm, true, `Nº ${c.numero} · Chácara ${c.loteCodigo}`);
  const minuta = primeiraVersao('minuta');
  add('minuta', 'Minuta gerada', minuta?.criadoEm, !!minuta, minuta ? `versão ${minuta.versao}` : null);
  const definitivo = versoes.filter(v => ETAPA_VERSAO(String(v.etapa)) === 'definitivo').at(-1);
  add('definitivo', 'Definitivo gerado', definitivo?.criadoEm, !!definitivo, definitivo ? `versão ${definitivo.versao}` : null);
  const manuscrito = primeiraVersao('manuscrito');
  if (manuscrito) add('manuscrito', 'PDF assinado à mão anexado', manuscrito.criadoEm, true, `versão ${manuscrito.versao}`);
  const envio = ev('enviado_para_assinatura') ?? (primeiraVersao('envio') ? { criadoEm: primeiraVersao('envio').criadoEm } : null);
  if (sigs.length || envio) add('envio', 'Enviado para assinatura', envio?.criadoEm, !!envio, sigs.length ? `${sigs.length} signatário(s), links pelo WhatsApp` : null);
  for (const s of [...sigs].sort((a, b) => Number(a.ordem) - Number(b.ordem))) {
    const convite = ev('convite_enviado', s.id), abriu = ev('link_aberto', s.id);
    const det = s.status === 'assinado' ? `${papel(s.papel)} · ${s.metodo === 'avancada' ? 'assinatura eletrônica com código no WhatsApp' : String(s.metodo ?? '')}`
      : [papel(s.papel), convite ? `convite em ${new Date(convite.criadoEm).toLocaleDateString('pt-BR')}` : null, abriu ? 'abriu o link' : 'ainda não abriu'].filter(Boolean).join(' · ');
    add(`assinatura:${s.id}`, `Assinatura de ${s.nome}`, s.assinadoEm, s.status === 'assinado', det);
  }
  const dispensa = ev('conjuge_dispensado');
  if (dispensa) {
    const dd = json(dispensa.detalhe);
    add('conjuge_dispensado', `Assinatura do(a) cônjuge ${dd?.nome ?? ''} dispensada`.trim(), dispensa.criadoEm, true, dd?.motivo ? `Motivo: ${dd.motivo}` : null);
  }
  const manifesto = ev('manifesto_gerado');
  if (sigs.length) add('manifesto', 'Todas as assinaturas · manifesto gerado', manifesto?.criadoEm, !!c.manifestoArquivo, c.manifestoArquivo ? 'Anexo VII com as evidências' : null);
  const p = json(c.simulacaoJson);
  if (!p.concessao) {
    const ato = linhasDoAto(cobs);
    const pagoEm = atoPagoEm(cobs);
    const paga = c.entradaPagaNoAto === true || c.entradaPagaNoAto === 1 || !!pagoEm;
    const totalAto = ato.reduce((t: number, x: any) => t + Number(x.valor ?? 0), 0);
    const det = !ato.length ? 'boleto ainda não emitido' : ato.length > 1
      ? `${brl(totalAto)} (${ato.map((x: any) => `${String(x.formaPagamento ?? '') === 'CARTAO' ? 'cartão' : 'boleto/PIX'} ${brl(x.valor)}${x.status === 'paga' ? ' ✓' : ''}`).join(' + ')})`
      : brl(ato[0].valor);
    add('entrada', p.modalidade === 'avista' ? 'Pagamento à vista compensado' : 'Entrada paga', pagoEm ?? ato[0]?.pagoEm, paga, det);
  }
  const vias = eventos.filter(e => e.evento === 'via_assinada_enviada');
  for (const v of vias) {
    const s = sigs.find(x => x.id === v.signatarioId);
    const det = json(v.detalhe);
    const quem = s ? `${s.nome} (${papel(s.papel)})` : 'corretor(a) do contrato';
    add(`via:${v.signatarioId ?? 'corretor'}`, `Via oficial enviada pelo WhatsApp a ${quem}`, v.criadoEm, true, det?.pdf ? 'PDF da via + link de conferência' : 'link da via assinada');
  }
  const semVia = sigs.filter(s => s.whatsapp && !vias.some(v => v.signatarioId === s.id));
  if (c.manifestoArquivo) for (const s of semVia) add(`via:${s.id}`, `Via oficial para ${s.nome} (${papel(s.papel)})`, null, false, ['comprador', 'conjuge'].includes(String(s.papel)) ? 'vai pelo WhatsApp quando a entrada for paga' : 'aguardando envio');
  for (const e of eventos.filter(x => x.evento === 'posicionamento_corrigido')) {
    const det = json(e.detalhe);
    add(`correcao:${det.versaoNova ?? e.criadoEm}`, 'Posicionamento das assinaturas corrigido', e.criadoEm, true, `versão ${det.versaoNova ?? '—'} · ${det.caixas ?? '?'} carimbo(s) sobre a versão enviada (v${det.versaoBase ?? '?'}), mesmos dados de cada assinatura · manifesto refeito`);
  }
  for (const e of eventos.filter(x => x.evento === 'vencimentos_alterados')) {
    const det = json(e.detalhe);
    add(`vencimentos:${e.criadoEm}`, `Vencimento das parcelas no dia ${det.dia ?? '?'}`, e.criadoEm, true, `${det.parcelas ?? '?'} parcela(s) remarcada(s) · 1ª em ${String(det.primeira ?? '').split('-').reverse().join('/')}`);
  }
  const ROT_JUR: Record<string, string> = { notificacao: 'Notificação de constituição em mora', requerimento: 'Requerimento ao Oficial do cartório', ata: 'Ata de resolução por inadimplemento', avulso: 'Documento jurídico' };
  for (const e of eventos.filter(x => x.evento === 'juridico_documento' || x.evento === 'juridico_assinado')) {
    const det = json(e.detalhe);
    add(`jur:${e.evento}:${det.documentoId}:${e.criadoEm}`, e.evento === 'juridico_documento' ? `${ROT_JUR[det.tipo] ?? 'Documento jurídico'} gerado` : `${ROT_JUR[det.tipo] ?? 'Documento jurídico'} assinado com certificado digital`,
      e.criadoEm, true, e.evento === 'juridico_assinado' ? `por ${det.nome ?? '—'} (ICP-Brasil)` : 'corpo jurídico');
  }
  add('ativo', ['quitado'].includes(c.status) ? 'Contrato quitado' : 'Contrato ativo', null, ['ativo', 'quitado'].includes(String(c.status)), ['ativo', 'quitado'].includes(String(c.status)) ? 'chácara vendida e cobranças gravadas' : null);
  return out;
}

/** Contagem das assinaturas por contrato (lista) */
export async function assinaturasPorContrato(ids: number[]): Promise<Map<number, { assinados: number; total: number }>> {
  const m = new Map<number, { assinados: number; total: number }>();
  const d: any = await getDb();
  if (!d || !ids.length) return m;
  const sigs: any[] = await d.select({ contratoId: assinaturaSignatarios.contratoId, status: assinaturaSignatarios.status }).from(assinaturaSignatarios).where(inArray(assinaturaSignatarios.contratoId, ids));
  for (const s of sigs) {
    const x = m.get(s.contratoId) ?? { assinados: 0, total: 0 };
    m.set(s.contratoId, { assinados: x.assinados + (s.status === 'assinado' ? 1 : 0), total: x.total + 1 });
  }
  return m;
}
