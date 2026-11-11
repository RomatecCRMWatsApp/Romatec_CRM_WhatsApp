/**
 * Situações de venda do lote (controle interno do empreendimento) — usadas no
 * servidor e na tela. O site público só vê disponível / reservada / vendida / área técnica.
 */

/** Código de lote: quadra + número com 2 dígitos + sufixo opcional de desmembramento (A02, B14, A02A) */
export const CODIGO_LOTE = /^[A-Z]\d{2}[A-Z]?$/;
/** O mesmo padrão, sem diferenciar maiúsculas (entrada digitada) */
export const CODIGO_LOTE_I = /^[A-Z]\d{2}[A-Z]?$/i;

/** Número do lote por extenso nos documentos: "02"; desmembrado (A02A) → "02-A" */
export function numeroDoLote(l: { codigo: string; numero?: number | null }): string {
  const suf = /\d([A-Z])$/.exec(l.codigo)?.[1];
  const base = l.numero != null ? String(l.numero).padStart(2, '0') : (/\d+/.exec(l.codigo)?.[0] ?? '');
  return suf ? `${base}-${suf}` : base;
}
export const SITUACOES_LOTE = ['disponivel', 'interesse', 'reservado', 'entrada', 'vendido_parcelado', 'vendido_avista', 'quitado', 'concedido', 'bloqueado'] as const;
export type SituacaoLote = typeof SITUACOES_LOTE[number];

export const ROTULO_SITUACAO: Record<SituacaoLote, string> = {
  disponivel: 'Disponível',
  interesse: 'Interesse / pré-reserva',
  reservado: 'Reservado',
  entrada: 'Com entrada (sinal)',
  vendido_parcelado: 'Vendido — parcelado',
  vendido_avista: 'Vendido — à vista',
  quitado: 'Quitado',
  concedido: 'Concedido pela proprietária (à vista)',
  bloqueado: 'Bloqueado / fora de venda',
};

/** Cores do mapa temático */
export const COR_SITUACAO: Record<SituacaoLote, string> = {
  disponivel: '#9CC46A',
  interesse: '#7FC7E8',
  reservado: '#E9B44C',
  entrada: '#E8873A',
  vendido_parcelado: '#B05FC9',
  vendido_avista: '#C0504D',
  quitado: '#7A2E2B',
  concedido: '#5B6B8C',
  bloqueado: '#BFC5CC',
};

/** Precisa de cliente (lead ou nome) */
export const COM_CLIENTE: SituacaoLote[] = ['interesse', 'reservado', 'entrada', 'vendido_parcelado', 'vendido_avista', 'quitado', 'concedido'];
/** Concedido pela proprietária a terceiro (sem venda): indisponível, mas fora das vendas e do financeiro */
export const CONCEDIDOS: SituacaoLote[] = ['concedido'];
/** Contam como vendidos */
export const VENDIDOS: SituacaoLote[] = ['vendido_parcelado', 'vendido_avista', 'quitado'];

export type StatusPublico = 'disponivel' | 'reservado' | 'em_negociacao' | 'vendido' | 'nao_comercializavel';

/** O que o site público mostra (interesse não aparece: continua disponível) */
export function statusPublicoDe(s: SituacaoLote): StatusPublico {
  if (s === 'bloqueado') return 'nao_comercializavel';
  if (s === 'reservado' || s === 'entrada') return 'reservado';
  if (VENDIDOS.includes(s) || s === 'concedido') return 'vendido';
  return 'disponivel';
}

export function situacaoValida(s: unknown): s is SituacaoLote {
  return typeof s === 'string' && (SITUACOES_LOTE as readonly string[]).includes(s);
}

export interface DadosVenda {
  situacao: SituacaoLote;
  leadId?: number | null;
  clienteNome?: string | null;
  corretorId?: number | null;
  valorVenda?: number | null;
  valorEntrada?: number | null;
  numParcelas?: number | null;
}

/** Problema nos dados da mudança de situação (null = ok) */
export function problemaVenda(d: DadosVenda): string | null {
  if (COM_CLIENTE.includes(d.situacao) && !d.leadId && !String(d.clienteNome || '').trim()) return 'Informe o cliente (lead do CRM ou nome)';
  if (d.situacao === 'entrada' && !(Number(d.valorEntrada) > 0)) return 'Informe o valor da entrada';
  if (d.situacao === 'vendido_parcelado' && !(Number(d.numParcelas) > 0)) return 'Informe o número de parcelas';
  if (d.valorEntrada != null && d.valorVenda != null && Number(d.valorEntrada) > Number(d.valorVenda)) return 'A entrada não pode ser maior que o valor da venda';
  return null;
}

/** Etapa do lead no funil comprador conforme a situação do lote (null = não mexe) */
export function etapaDoLeadPelaVenda(s: SituacaoLote): string | null {
  if (s === 'reservado' || s === 'entrada') return 'proposta';
  if (VENDIDOS.includes(s)) return 'fechado';
  return null;
}

/** Aviso do memorial descritivo gerado pelo sistema (tela, impressão, imagem e WhatsApp) */
export const AVISO_RASCUNHO_MEMORIAL = 'Rascunho para conferência — não vale como documento oficial sem assinatura do responsável técnico';

/**
 * Corretor muda a situação da chácara (decisão de 08/11/2026): interesse, reserva, sinal/entrada e venda — menos
 * bloqueio e quitação, que são do escritório. Só em chácara livre ou que já é dele (não mexe na reserva de outro
 * corretor nem em chácara bloqueada); "Disponível" serve para ele desfazer a própria reserva.
 */
export const SITUACOES_CORRETOR: SituacaoLote[] = ['disponivel', 'interesse', 'reservado', 'entrada', 'vendido_parcelado', 'vendido_avista'];

export function corretorPodeAlterarLote(lote: { situacao?: string | null; corretorId?: number | null }, usuarioId: number): boolean {
  const s = lote.situacao || 'disponivel';
  if (s === 'bloqueado' || s === 'quitado' || s === 'concedido') return false;
  return s === 'disponivel' || !lote.corretorId || Number(lote.corretorId) === usuarioId;
}
