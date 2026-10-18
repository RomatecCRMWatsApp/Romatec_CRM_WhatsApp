/**
 * De onde veio o visitante (Google, Instagram, direto…) — mesma regra do
 * AvalieImob (backend/services/origem_trafego.py), nos canais do CRM.
 * UTM (link marcado por nós) vence o referrer; sem os dois, é "Direto".
 * Funções puras: usadas no navegador (captura) e no servidor (classificação).
 */

export interface OrigemVisita {
  /** Origem + caminho de onde a pessoa veio (sem query string), ex.: https://www.google.com/ */
  referrer?: string | null;
  /** Primeira página do site nesta visita, ex.: /bom-jardims?utm_source=instagram */
  paginaEntrada?: string | null;
}

export interface OrigemClassificada {
  /** Canal do CRM (leadCampanhas.canal / leadQualifications.origemCanal) ou null = decidir pelas UTMs */
  canal: string | null;
  /** Texto para o aviso e a tela do lead, ex.: "Google (orgânico)" */
  rotulo: string;
  /** Host de onde veio (sem www.) */
  host: string | null;
}

/** Domínios próprios: navegação interna não é canal de aquisição */
const PROPRIOS = ['romateccrm.com', 'localhost', '127.0.0.1'];

// host (trecho) → [canal do CRM, rótulo]
const HOSTS: [string, string, string][] = [
  ['google.', 'busca_organica', 'Google (orgânico)'],
  ['bing.', 'busca_organica', 'Bing (orgânico)'],
  ['duckduckgo', 'busca_organica', 'DuckDuckGo (orgânico)'],
  ['yahoo.', 'busca_organica', 'Yahoo (orgânico)'],
  ['ecosia.', 'busca_organica', 'Ecosia (orgânico)'],
  ['instagram', 'instagram_organico', 'Instagram'],
  ['facebook', 'facebook_organico', 'Facebook'],
  ['fb.com', 'facebook_organico', 'Facebook'],
  ['fb.me', 'facebook_organico', 'Facebook'],
  ['whatsapp', 'indicacao', 'Link compartilhado no WhatsApp'],
  ['wa.me', 'indicacao', 'Link compartilhado no WhatsApp'],
  ['t.me', 'indicacao', 'Link compartilhado no Telegram'],
  ['telegram', 'indicacao', 'Link compartilhado no Telegram'],
  ['youtube', 'outras_redes', 'YouTube'],
  ['youtu.be', 'outras_redes', 'YouTube'],
  ['tiktok', 'outras_redes', 'TikTok'],
  ['linkedin', 'outras_redes', 'LinkedIn'],
  ['olx.', 'portal_olx', 'OLX'],
  ['zapimoveis', 'portal_zap', 'ZAP Imóveis'],
  ['vivareal', 'portal_vivareal', 'VivaReal'],
];

export function hostDe(url?: string | null): string | null {
  const u = String(url || '').trim();
  if (!u) return null;
  try {
    const h = new URL(u.includes('//') ? u : `https://${u}`).hostname.toLowerCase();
    return h.startsWith('www.') ? h.slice(4) : h || null;
  } catch {
    return null;
  }
}

/** Referrer sem query string nem fragmento (pode ter dados pessoais), no máximo 300 caracteres */
export function limparReferrer(url?: string | null): string | null {
  const u = String(url || '').trim();
  if (!u) return null;
  try {
    const p = new URL(u);
    if (p.protocol !== 'http:' && p.protocol !== 'https:') return null;
    return `${p.origin}${p.pathname}`.slice(0, 300);
  } catch {
    return null;
  }
}

/**
 * Classifica pelo referrer. Com UTM, devolve canal null: quem decide é a UTM
 * (origemFromUtm / campanha cadastrada), como no AvalieImob.
 */
export function classificarOrigem(utm: { source?: string | null } | null | undefined, visita?: OrigemVisita | null): OrigemClassificada {
  const host = hostDe(visita?.referrer);
  if (utm?.source) return { canal: null, rotulo: '', host };
  // gclid na URL de entrada = clique em anúncio do Google, mesmo sem UTM
  if (/[?&]gclid=/.test(visita?.paginaEntrada || '')) return { canal: 'google_ads', rotulo: 'Google Ads', host };
  if (host && !PROPRIOS.some(p => host.includes(p))) {
    const achado = HOSTS.find(([trecho]) => host.includes(trecho));
    if (achado) return { canal: achado[1], rotulo: achado[2], host };
    return { canal: 'site', rotulo: `Site parceiro (${host})`, host };
  }
  return { canal: 'site', rotulo: 'Direto (digitou o endereço ou link sem origem)', host: null };
}

/** Linha "🌐 De: …" do aviso e da tela do lead */
export function linhaOrigem(rotulo: string, visita?: OrigemVisita | null): string {
  const partes = [rotulo];
  if (visita?.paginaEntrada) partes.push(`entrou por ${visita.paginaEntrada.split('?')[0]}`);
  return partes.filter(Boolean).join(' · ');
}
