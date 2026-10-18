/**
 * Score do lead (0–100) por regras — determinístico e auditável (§8).
 * A IA/bot só extrai respostas (slots); a nota vem daqui, com o detalhamento
 * regra → pontos que soma exatamente o score (antes do limite 0–100).
 *
 * Pesos: config/score.json. Ajuste sem mexer em código: variável SCORE_PESOS
 * com um JSON parcial (ex.: {"comprador":{"quer_visita":25}}).
 */
import pesosPadrao from '../../config/score.json';
import type { Funil } from './atribuicao';

export type Classe = 'frio' | 'morno' | 'quente';
export interface ResultadoScore { score: number; classe: Classe; detalhes: Record<string, number>; regras: string }

type Pesos = typeof pesosPadrao;

function mesclar(base: any, extra: any): any {
  if (!extra || typeof extra !== 'object') return base;
  const out: any = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(extra)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? mesclar(base?.[k] ?? {}, v) : v;
  }
  return out;
}

export function pesos(): Pesos {
  const raw = process.env.SCORE_PESOS;
  if (!raw) return pesosPadrao;
  try {
    return mesclar(pesosPadrao, JSON.parse(raw));
  } catch {
    console.warn('[Score] SCORE_PESOS não é um JSON válido — usando config/score.json');
    return pesosPadrao;
  }
}

export function classificar(score: number, limites: { morno: number; quente: number } = pesos().classes): Classe {
  if (score >= limites.quente) return 'quente';
  if (score >= limites.morno) return 'morno';
  return 'frio';
}

function fechar(d: Record<string, number>, regras: string, limites?: { morno: number; quente: number }): ResultadoScore {
  const bruto = Object.values(d).reduce((a, b) => a + b, 0);
  const score = Math.max(0, Math.min(100, bruto));
  return { score, classe: classificar(score, limites), detalhes: d, regras };
}

export interface CtxScore {
  temCodigoImovel: boolean;
  /** Preço do imóvel de interesse; null quando não há imóvel ou exibirPreco = false */
  precoImovel: number | null;
  sinais?: Set<string>;
  tempoPaginaS?: number;
  sessoesDias?: number;
  respondeuRapido?: boolean;
  inativo48h?: boolean;
  optout?: boolean;
}

// ─── Comprador (§8.1) ────────────────────────────────────────────────────────
export function calcularComprador(slots: Record<string, string>, ctx: CtxScore, p: Pesos['comprador'] = pesos().comprador): ResultadoScore {
  if (ctx.optout) return { score: 0, classe: 'frio', detalhes: { optout: 0 }, regras: 'comprador' };
  const d: Record<string, number> = {};
  if (ctx.temCodigoImovel) d.codigo_imovel = p.codigo_imovel;

  const fp = slots.forma_pagamento;
  if (fp === 'a_vista') d.pagamento = p.pagamento_a_vista;
  else if (fp === 'financiamento' || fp === 'fgts_financiamento') {
    if (slots.credito_aprovado === 'sim') d.pagamento = p.pagamento_financiamento_aprovado;
    else if (slots.credito_aprovado === 'em_analise') d.pagamento = p.pagamento_financiamento_em_analise;
  } else if (fp === 'permuta' || fp === 'parcelado_direto') d.pagamento = p.pagamento_permuta_ou_parcelado;

  const prazo: Record<string, number> = { ate_30d: p.prazo_ate_30d, '1_3m': p.prazo_1_3m, '3_6m': p.prazo_3_6m, pesquisando: p.prazo_pesquisando };
  if (slots.prazo_compra && prazo[slots.prazo_compra] !== undefined) d.prazo = prazo[slots.prazo_compra];

  // Só compara com o preço quando o preço é público (exibir_preco = true)
  const faixa = Number(slots.faixa_valor);
  if (ctx.precoImovel && Number.isFinite(faixa) && faixa > 0) {
    const r = faixa / ctx.precoImovel;
    if (r >= 0.9) d.faixa_valor = p.faixa_valor_compativel;
    else if (r < 0.7) d.faixa_valor = p.faixa_valor_baixa;
  }

  if (slots.quer_visita === 'sim') d.visita = p.quer_visita;
  if (ctx.sinais?.has('play_video') || ctx.sinais?.has('view_planta')) d.midia = p.midia;
  if ((ctx.tempoPaginaS ?? 0) >= 120) d.tempo_pagina = p.tempo_pagina;
  if ((ctx.sessoesDias ?? 0) >= 2) d.retorno = p.retorno;
  if (ctx.respondeuRapido) d.resposta_rapida = p.resposta_rapida;
  if (ctx.inativo48h) d.inatividade = p.inatividade_48h;
  return fechar(d, 'comprador');
}

// ─── Proprietário (§8.2) ─────────────────────────────────────────────────────
export function calcularProprietario(slots: Record<string, string>, ctx: Pick<CtxScore, 'respondeuRapido' | 'inativo48h' | 'optout'>, p: Pesos['proprietario'] = pesos().proprietario): ResultadoScore {
  if (ctx.optout) return { score: 0, classe: 'frio', detalhes: { optout: 0 }, regras: 'proprietario' };
  const d: Record<string, number> = {};
  const doc = slots.documentacao;
  if (doc === 'matricula') d.documentacao = p.documentacao_matricula;
  else if (doc === 'escritura_sem_registro' || doc === 'contrato_compra_venda') d.documentacao = p.documentacao_escritura_ou_contrato;
  else if (doc === 'posse' || doc === 'inventario') d.documentacao = p.documentacao_posse_ou_inventario;

  if (slots.urgencia === 'ate_30d') d.urgencia = p.urgencia_ate_30d;
  else if (slots.urgencia === '1_3m') d.urgencia = p.urgencia_1_3m;

  if (slots.aceita_exclusividade === 'sim') d.exclusividade = p.exclusividade_sim;
  else if (slots.aceita_exclusividade === 'quer_saber_mais') d.exclusividade = p.exclusividade_quer_saber_mais;

  if (slots.quer_avaliacao === 'sim') d.avaliacao = p.quer_avaliacao;
  if (slots.valor_pretendido && Number(slots.valor_pretendido) > 0) d.valor_pretendido = p.valor_pretendido;
  if (ctx.respondeuRapido) d.resposta_rapida = p.resposta_rapida;
  if (ctx.inativo48h) d.inatividade = p.inatividade_48h;
  return fechar(d, 'proprietario');
}

// ─── Bom Jardims (README do empreendimento §8.2) ─────────────────────────────
const sem = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function calcularBomJardims(
  input: { answers?: Record<string, unknown> | null; loteCodigo?: string | null; moraPerto: boolean; respondeuRapido?: boolean; optout?: boolean },
  p: Pesos['bom_jardims'] = pesos().bom_jardims,
): ResultadoScore {
  if (input.optout) return { score: 0, classe: 'frio', detalhes: { optout: 0 }, regras: 'bom_jardims' };
  const a = input.answers || {};
  const d: Record<string, number> = {};
  const prazo = sem(a.prazo);
  if (/imediat/.test(prazo)) d.prazo = p.prazo_imediato;
  else if (/3 meses|3m/.test(prazo)) d.prazo = p.prazo_3m;
  else if (/12 meses|12m/.test(prazo)) d.prazo = p.prazo_12m;
  if (/vista/.test(sem(a.pagamento))) d.pagamento = p.pagamento_a_vista;
  if (input.moraPerto) d.mora_perto = p.mora_perto;
  if (input.loteCodigo) d.chacara_escolhida = p.chacara_escolhida;
  if (input.respondeuRapido) d.resposta_rapida = p.resposta_rapida;
  return fechar(d, 'bom_jardims', p.classes);
}

/** Escolhe o conjunto de regras do lead */
export function regrasDoLead(lead: { funil?: string | null; empreendimentoSlug?: string | null }): 'comprador' | 'proprietario' | 'bom_jardims' {
  if (lead.empreendimentoSlug === 'bom-jardims') return 'bom_jardims';
  return (lead.funil as Funil) === 'proprietario' ? 'proprietario' : 'comprador';
}

export const ROTULO_REGRA: Record<string, string> = {
  codigo_imovel: 'Chegou com código de imóvel',
  pagamento: 'Forma de pagamento',
  prazo: 'Prazo de compra',
  faixa_valor: 'Faixa de valor x preço do imóvel',
  visita: 'Quer visitar',
  midia: 'Viu vídeo ou planta',
  tempo_pagina: '2+ min na página do imóvel',
  retorno: 'Voltou em outro dia',
  resposta_rapida: 'Respondeu rápido',
  inatividade: 'Sem resposta há 48 h',
  documentacao: 'Documentação',
  urgencia: 'Urgência para vender',
  exclusividade: 'Exclusividade',
  avaliacao: 'Quer avaliação (PTAM)',
  valor_pretendido: 'Informou valor pretendido',
  mora_perto: 'Mora a até 60 km',
  chacara_escolhida: 'Escolheu uma chácara no mapa',
  optout: 'Pediu para sair (SAIR)',
};
