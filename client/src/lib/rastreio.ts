/**
 * Rastreio da landing /i/:codigo — só com aceite de cookies (LGPD).
 * Sem aceite: nenhum cookie é criado e nenhum evento sai do navegador.
 */

const CHAVE_CONSENTIMENTO = "rmt_consent";
const COOKIE = "rmt_vid";

export type Consentimento = "sim" | "nao" | null;
export type TipoEvento =
  | "view_imovel" | "view_galeria" | "play_video" | "view_planta" | "view_mapa"
  | "tempo_pagina" | "clique_whatsapp" | "submit_form";

export function lerConsentimento(): Consentimento {
  try {
    const v = localStorage.getItem(CHAVE_CONSENTIMENTO);
    return v === "sim" || v === "nao" ? v : null;
  } catch {
    return null;
  }
}

export function gravarConsentimento(v: "sim" | "nao") {
  try { localStorage.setItem(CHAVE_CONSENTIMENTO, v); } catch { /* modo privado */ }
  if (v === "nao") document.cookie = `${COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}

function novoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Id do visitante (cookie first-party, 180 dias). null sem consentimento. */
export function visitanteId(): string | null {
  if (lerConsentimento() !== "sim") return null;
  const atual = document.cookie.match(/(?:^|;\s*)rmt_vid=([0-9a-f-]{36})/i)?.[1];
  if (atual) return atual;
  const id = novoId();
  document.cookie = `${COOKIE}=${id}; Max-Age=${180 * 24 * 3600}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  return id;
}

/** UTMs da URL (guardadas na sessão para a visita inteira) */
export function utmsDaVisita(): Record<string, string> {
  const chaves = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "gclid", "fbclid"];
  const url = new URLSearchParams(location.search);
  const out: Record<string, string> = {};
  try {
    const salvo = JSON.parse(sessionStorage.getItem("rmt_utm") || "{}");
    Object.assign(out, salvo);
  } catch { /* ignora */ }
  for (const k of chaves) {
    const v = url.get(k);
    if (v) out[k] = v.slice(0, 120);
  }
  try { sessionStorage.setItem("rmt_utm", JSON.stringify(out)); } catch { /* ignora */ }
  return out;
}

/** Código de campanha válido para ir na mensagem (#CODIGO) */
export function campanhaDaVisita(): string | undefined {
  const c = (utmsDaVisita().utm_campaign || "").toUpperCase().replace(/\s+/g, "-");
  return /^[A-Z0-9][A-Z0-9-]{2,19}$/.test(c) ? c : undefined;
}

export function enviarEvento(tipo: TipoEvento, extra: { codigo?: string; segundos?: number } = {}): boolean {
  const vid = visitanteId();
  if (!vid) return false;
  const utm = utmsDaVisita();
  const payload = JSON.stringify({
    vid, tipo, codigo: extra.codigo, segundos: extra.segundos,
    campanha: campanhaDaVisita(),
    utm: Object.keys(utm).length ? utm : undefined,
  });
  const blob = new Blob([payload], { type: "application/json" });
  if (navigator.sendBeacon?.("/t", blob)) return true;
  fetch("/t", { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  return true;
}
