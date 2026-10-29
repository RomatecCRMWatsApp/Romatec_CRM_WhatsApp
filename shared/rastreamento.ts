/**
 * Rastreamento de conversão (Google Analytics 4 e Google Ads) — SÓ nas páginas públicas de marketing.
 * As telas do CRM (logadas) nunca carregam o gtag.
 *
 * IDs por variável de ambiente (Railway); sem elas, nada é carregado e não aparece aviso de cookies:
 *   GA4_MEASUREMENT_ID                       G-XXXXXXXXXX  (Google Analytics 4)
 *   GOOGLE_ADS_CONVERSION_ID                 AW-XXXXXXXXX  (Google Ads)
 *   GOOGLE_ADS_CONVERSION_LABEL              rótulo da conversão "agendamento/cadastro enviado"
 *   GOOGLE_ADS_CONVERSION_LABEL_WHATSAPP     (opcional) rótulo da conversão "clique no WhatsApp"
 */

/** Páginas públicas de marketing (landing, link da chácara, agendamento) */
export function rotaDeMarketing(path: string): boolean {
  const p = (path.split('?')[0] || '/').replace(/\/+$/, '') || '/';
  return p === '/bom-jardims' || p.startsWith('/bom-jardims/') || p.startsWith('/agendar/') || p === '/obras-bom-jardim';
}

export interface ConfigRastreamento {
  ga4: string | null;
  ads: string | null;
  /** send_to das conversões do Google Ads (AW-…/rótulo) */
  conversaoAgendamento: string | null;
  conversaoWhatsapp: string | null;
}

const ok = (v: string | undefined, re: RegExp) => {
  const s = String(v ?? '').trim().replace(/^['"]|['"]$/g, '');
  return re.test(s) ? s : null;
};

/** Lê e valida as variáveis (um ID mal digitado é ignorado, não quebra a página) */
export function configRastreamento(env: Record<string, string | undefined>): ConfigRastreamento | null {
  const ga4 = ok(env.GA4_MEASUREMENT_ID, /^G-[A-Z0-9]{4,20}$/i);
  const ads = ok(env.GOOGLE_ADS_CONVERSION_ID, /^AW-\d{5,15}$/i);
  const rotulo = (v: string | undefined) => (ads ? ok(v, /^[A-Za-z0-9_-]{4,40}$/) : null);
  const lAg = rotulo(env.GOOGLE_ADS_CONVERSION_LABEL);
  const lWa = rotulo(env.GOOGLE_ADS_CONVERSION_LABEL_WHATSAPP);
  if (!ga4 && !ads) return null;
  return { ga4, ads, conversaoAgendamento: lAg ? `${ads}/${lAg}` : null, conversaoWhatsapp: lWa ? `${ads}/${lWa}` : null };
}

/** Eventos medidos */
export const EVENTOS = {
  agendamento: 'agendamento_enviado',
  whatsapp: 'clique_whatsapp',
  mapa: 'lead_mapa',
} as const;
