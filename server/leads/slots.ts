/**
 * Slots de qualificação dos dois funis (§7.1 e §7.2 da spec).
 * Valor fora do enum é descartado: o slot continua pendente.
 */
import type { Funil } from './atribuicao';

export type FonteSlot = 'ia' | 'bot' | 'form' | 'manual';
export type SlotsLead = Record<string, { valor: string; fonte: FonteSlot; at: string }>;

type Tipo = { enum: readonly string[] } | { numero: true } | { texto: true };

interface SlotDef {
  nome: string;
  tipo: Tipo;
  /** true, false ou condição sobre os slots já preenchidos (+ tipo do imóvel de interesse) */
  obrigatorio: boolean | ((s: Record<string, string>, ctx: CtxSlots) => boolean);
  /** slot só faz sentido nesta condição (ex.: rural) */
  aplica?: (s: Record<string, string>, ctx: CtxSlots) => boolean;
}

export interface CtxSlots { tipoImovel?: string | null }

export const TIPOS_IMOVEL = ['lote_urbano', 'casa', 'chacara', 'condominio', 'rural', 'comercial', 'galpao'] as const;

const ehRural = (s: Record<string, string>, ctx: CtxSlots) => (s.tipo_imovel ?? ctx.tipoImovel) === 'rural';

export const SLOTS_COMPRADOR: SlotDef[] = [
  { nome: 'objetivo', tipo: { enum: ['morar', 'investir', 'negocio', 'produzir'] }, obrigatorio: true },
  { nome: 'forma_pagamento', tipo: { enum: ['a_vista', 'financiamento', 'parcelado_direto', 'permuta', 'fgts_financiamento'] }, obrigatorio: true },
  { nome: 'valor_entrada', tipo: { numero: true }, obrigatorio: s => !!s.forma_pagamento && s.forma_pagamento !== 'a_vista' },
  { nome: 'credito_aprovado', tipo: { enum: ['sim', 'em_analise', 'nao'] }, obrigatorio: s => s.forma_pagamento === 'financiamento' || s.forma_pagamento === 'fgts_financiamento' },
  { nome: 'prazo_compra', tipo: { enum: ['ate_30d', '1_3m', '3_6m', 'pesquisando'] }, obrigatorio: true },
  { nome: 'faixa_valor', tipo: { numero: true }, obrigatorio: true },
  { nome: 'regiao_interesse', tipo: { texto: true }, obrigatorio: false },
  { nome: 'quer_visita', tipo: { enum: ['sim', 'nao', 'depois'] }, obrigatorio: true },
  { nome: 'decisor', tipo: { enum: ['sozinho', 'com_conjuge', 'socios'] }, obrigatorio: false },
  { nome: 'rural_atividade', tipo: { enum: ['pecuaria', 'agricultura', 'lazer', 'reserva'] }, obrigatorio: ehRural, aplica: ehRural },
  { nome: 'rural_area_desejada_ha', tipo: { numero: true }, obrigatorio: ehRural, aplica: ehRural },
];

export const SLOTS_PROPRIETARIO: SlotDef[] = [
  { nome: 'tipo_imovel', tipo: { enum: TIPOS_IMOVEL }, obrigatorio: true },
  { nome: 'localizacao', tipo: { texto: true }, obrigatorio: true },
  { nome: 'documentacao', tipo: { enum: ['matricula', 'escritura_sem_registro', 'contrato_compra_venda', 'posse', 'inventario'] }, obrigatorio: true },
  { nome: 'area', tipo: { texto: true }, obrigatorio: true },
  { nome: 'valor_pretendido', tipo: { numero: true }, obrigatorio: false },
  { nome: 'urgencia', tipo: { enum: ['ate_30d', '1_3m', 'sem_pressa'] }, obrigatorio: true },
  { nome: 'aceita_exclusividade', tipo: { enum: ['sim', 'nao', 'quer_saber_mais'] }, obrigatorio: true },
  { nome: 'quer_avaliacao', tipo: { enum: ['sim', 'nao'] }, obrigatorio: true },
  { nome: 'rural_georref', tipo: { enum: ['sigef_certificado', 'nao_georreferenciado', 'nao_sabe'] }, obrigatorio: ehRural, aplica: ehRural },
  { nome: 'rural_car_ccir', tipo: { enum: ['ok', 'pendente', 'nao_sabe'] }, obrigatorio: ehRural, aplica: ehRural },
];

export function slotsDoFunil(funil: Funil): SlotDef[] {
  return funil === 'proprietario' ? SLOTS_PROPRIETARIO : SLOTS_COMPRADOR;
}

/** "R$ 30.000,00", "30 mil", "30k", "1,5 milhão" → 30000 / 1500000 */
export function parseNumeroBR(raw: string): number | null {
  const s = String(raw).toLowerCase().replace(/r\$|\s/g, '');
  const mult = /milh(ão|ao|ões|oes)|mi\b/.test(s) ? 1e6 : /mil|k\b/.test(s) ? 1e3 : 1;
  const num = s.replace(/[^\d.,]/g, '');
  if (!num) return null;
  let n: number;
  if (num.includes(',') ) n = Number(num.replace(/\./g, '').replace(',', '.'));
  else if ((num.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(num)) n = Number(num.replace(/\./g, ''));
  else n = Number(num);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * mult * 100) / 100 : null;
}

/** Normaliza o valor de um slot; null = inválido (slot continua pendente) */
export function validarSlot(funil: Funil, slot: string, valor: unknown): string | null {
  const def = slotsDoFunil(funil).find(d => d.nome === slot);
  if (!def || valor === null || valor === undefined) return null;
  const v = String(valor).trim();
  if (!v) return null;
  if ('enum' in def.tipo) {
    const norm = v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s-]+/g, '_');
    return def.tipo.enum.includes(norm) ? norm : null;
  }
  if ('numero' in def.tipo) {
    const n = typeof valor === 'number' ? valor : parseNumeroBR(v);
    return n !== null && Number.isFinite(n) && n >= 0 ? String(n) : null;
  }
  return v.slice(0, 255);
}

/** Grava slots válidos (descarta os inválidos), preservando os demais */
export function mesclarSlots(funil: Funil, atuais: SlotsLead | null | undefined, novos: Record<string, unknown>, fonte: FonteSlot, now = new Date()): { slots: SlotsLead; aceitos: string[]; recusados: string[] } {
  const slots: SlotsLead = { ...(atuais || {}) };
  const aceitos: string[] = [];
  const recusados: string[] = [];
  for (const [nome, valor] of Object.entries(novos)) {
    const ok = validarSlot(funil, nome, valor);
    if (ok === null) { recusados.push(nome); continue; }
    slots[nome] = { valor: ok, fonte, at: now.toISOString() };
    aceitos.push(nome);
  }
  return { slots, aceitos, recusados };
}

export function valoresSlots(slots: SlotsLead | null | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(slots || {}).map(([k, v]) => [k, v.valor]));
}

/** Slots obrigatórios ainda sem valor, na ordem de perguntar */
export function slotsPendentes(funil: Funil, slots: SlotsLead | null | undefined, ctx: CtxSlots = {}): string[] {
  const s = valoresSlots(slots);
  return slotsDoFunil(funil)
    .filter(d => !d.aplica || d.aplica(s, ctx))
    .filter(d => (typeof d.obrigatorio === 'function' ? d.obrigatorio(s, ctx) : d.obrigatorio))
    .filter(d => !s[d.nome])
    .map(d => d.nome);
}

/** Tags de oportunidade do funil proprietário (§7.2) */
export function tagsDoLead(funil: Funil, slots: SlotsLead | null | undefined): string[] {
  if (funil !== 'proprietario') return [];
  const s = valoresSlots(slots);
  const tags: string[] = [];
  if (s.documentacao === 'posse' || s.documentacao === 'inventario' || s.rural_georref === 'nao_georreferenciado' || s.rural_car_ccir === 'pendente') {
    tags.push('oportunidade_regularizacao');
  }
  if (s.quer_avaliacao === 'sim') tags.push('oportunidade_ptam');
  return tags;
}

/**
 * Respostas que já chegam por outros caminhos viram slots:
 * formulário da Meta/landing do Bom Jardims (finalidade/prazo/pagamento) e o bot antigo.
 */
export function slotsDeRespostas(answers: Record<string, unknown> | null | undefined): Record<string, string> {
  const a = (answers || {}) as Record<string, any>;
  const out: Record<string, string> = {};
  const txt = (v: unknown) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const fin = txt(a.finalidade || a.isMoradiaOuInvestimento);
  if (/morar|moradia/.test(fin)) out.objetivo = 'morar';
  else if (/invest/.test(fin)) out.objetivo = 'investir';
  const prazo = txt(a.prazo || a.prazoPrefido);
  if (/imediat|30 dias|ate 1 mes/.test(prazo)) out.prazo_compra = 'ate_30d';
  else if (/3 meses|1 a 3|1-3/.test(prazo)) out.prazo_compra = '1_3m';
  else if (/6 meses|3 a 6|12 meses/.test(prazo)) out.prazo_compra = '3_6m';
  else if (/pesquis/.test(prazo)) out.prazo_compra = 'pesquisando';
  const pag = txt(a.pagamento);
  if (/vista/.test(pag)) out.forma_pagamento = 'a_vista';
  else if (/parcel/.test(pag)) out.forma_pagamento = 'parcelado_direto';
  else if (/financ/.test(pag)) out.forma_pagamento = 'financiamento';
  const entrada = a.entradaDisponivel ? parseNumeroBR(String(a.entradaDisponivel)) : null;
  if (entrada) out.valor_entrada = String(entrada);
  const faixa = a.valorImovelPretendido ? parseNumeroBR(String(a.valorImovelPretendido)) : null;
  if (faixa) out.faixa_valor = String(faixa);
  if (a.regiaoBairro || a.cidade) out.regiao_interesse = String(a.regiaoBairro || a.cidade).slice(0, 255);
  return out;
}

/** Tipo do imóvel (propertyType livre do cadastro) → enum da spec */
export function tipoImovelDe(propertyType?: string | null): string | null {
  const t = String(propertyType || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!t) return null;
  if (/chacara|sitio/.test(t)) return 'chacara';
  if (/condom/.test(t)) return 'condominio';
  if (/fazenda|rural|area rural|gleba/.test(t)) return 'rural';
  if (/galpao|armazem/.test(t)) return 'galpao';
  if (/comerc|loja|sala|ponto/.test(t)) return 'comercial';
  if (/lote|terreno/.test(t)) return 'lote_urbano';
  if (/casa|apart|sobrado|residenc/.test(t)) return 'casa';
  return null;
}
