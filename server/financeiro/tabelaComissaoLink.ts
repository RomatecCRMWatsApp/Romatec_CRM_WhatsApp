/**
 * Link compartilhável da tabela de comissão (PDF): assinado (HMAC, financeiro/links.ts), válido por 30 dias, sem login.
 * Leva o empreendimento, o tipo (corretor 2% / escritório 5%), a chácara de exemplo e quem compartilhou — o PDF sai
 * com as permissões dessa pessoa, como na tela dela.
 */
import { assinarLink, linkValido } from './links';

export const VALIDADE_LINK_TABELA_DIAS = 30;
const CAMINHO = '/api/public/comissao/tabela.pdf';

export interface LinkTabelaComissao { slug: string; tipo: 'corretor' | 'escritorio'; lote?: string; usuarioId: number }

const caminhoDe = (l: LinkTabelaComissao) =>
  `${CAMINHO}?slug=${encodeURIComponent(l.slug)}&tipo=${l.tipo}${l.lote ? `&lote=${encodeURIComponent(l.lote)}` : ''}&u=${l.usuarioId}`;

/** Caminho assinado (relativo ao domínio do sistema) */
export function linkTabelaComissao(l: LinkTabelaComissao, agora = Date.now()): string {
  return assinarLink(caminhoDe(l), agora, VALIDADE_LINK_TABELA_DIAS);
}

/** Confere a assinatura e a validade; devolve o pedido ou null */
export function lerLinkTabelaComissao(q: Record<string, unknown>, agora = Date.now()): LinkTabelaComissao | null {
  const slug = typeof q.slug === 'string' && /^[a-z0-9-]{1,80}$/.test(q.slug) ? q.slug : '';
  const tipo = q.tipo === 'escritorio' ? 'escritorio' : q.tipo === 'corretor' ? 'corretor' : null;
  const lote = typeof q.lote === 'string' && /^[A-Za-z0-9]{1,10}$/.test(q.lote) ? q.lote : undefined;
  const usuarioId = typeof q.u === 'string' && /^\d{1,10}$/.test(q.u) ? Number(q.u) : 0;
  if (!slug || !tipo || !usuarioId || (q.lote !== undefined && !lote)) return null;
  const l: LinkTabelaComissao = { slug, tipo, lote, usuarioId };
  return linkValido(caminhoDe(l), q.exp, q.sig, agora) ? l : null;
}

/** "TABELA-COMISSAO-GESTAO-BOM-JARDIMS-A01.pdf" */
export const nomeArquivoTabelaComissao = (slug: string, tipo: 'corretor' | 'escritorio', lote?: string | null) =>
  `TABELA-COMISSAO-${tipo === 'corretor' ? 'VENDA' : 'GESTAO'}-${slug.toUpperCase()}${lote ? `-${String(lote).toUpperCase()}` : ''}.pdf`;
