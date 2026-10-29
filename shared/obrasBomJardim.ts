/** Campanha das obras do Bom Jardim (/obras-bom-jardim): textos e origem padrão (shared com a página e o servidor) */

export const ROTA_OBRAS = '/obras-bom-jardim';
export const CAMPANHA_OBRAS = 'IG-OBRAS-NOV26';
export const MSG_VALOR_OBRAS = 'Olá, vi a campanha das obras do Bom Jardim e quero saber os valores';
export const LANCAMENTO_OBRAS = '14 de novembro';

export const TITULO_OBRAS = 'Obras iniciadas — Condomínio de Chácaras Bom Jardim (CCBJ), Açailândia/MA';
export const DESCRICAO_OBRAS = 'As obras começaram! Lançamento oficial em 14 de novembro. Só 82 chácaras a partir de 3.025 m², 100% documentado e liberado para vendas. Cadastre-se e agende sua visita.';

/** Sem UTM no link (ex.: compartilhado no direct), a página é da campanha do Instagram */
export function utmObras(u?: { source?: string; medium?: string; campaign?: string; content?: string } | null) {
  return { source: u?.source || 'instagram', medium: u?.medium, campaign: u?.campaign || CAMPANHA_OBRAS, content: u?.content };
}
