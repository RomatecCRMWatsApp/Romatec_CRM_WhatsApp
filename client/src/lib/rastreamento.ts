/**
 * Google Analytics 4 / Google Ads nas páginas públicas de marketing (shared/rastreamento.ts).
 * Os IDs chegam pelo HTML (window.__RASTREAMENTO, só quando as variáveis existem no servidor).
 * O gtag só é baixado depois que o visitante aceita os cookies; recusou ou não respondeu = nada é enviado.
 */
import { EVENTOS, rotaDeMarketing, type ConfigRastreamento } from "@shared/rastreamento";

declare global {
  interface Window { __RASTREAMENTO?: ConfigRastreamento; dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void }
}

const CHAVE = "romatec_cookies";
export type EscolhaCookies = "aceito" | "recusado";

export const configRastreamento = (): ConfigRastreamento | null => (typeof window !== "undefined" ? window.__RASTREAMENTO ?? null : null);

export function escolhaCookies(): EscolhaCookies | null {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === "aceito" || v === "recusado" ? v : null;
  } catch { return null; }
}

export function registrarEscolha(e: EscolhaCookies) {
  try { localStorage.setItem(CHAVE, e); } catch { /* navegador sem armazenamento: vale só nesta visita */ }
  escolhaNaVisita = e;
  if (e === "aceito") carregarTags();
}

let escolhaNaVisita: EscolhaCookies | null = null;
let carregado = false;

/** Baixa o gtag e configura GA4/Ads — só com IDs, cookies aceitos e numa página pública de marketing */
export function carregarTags() {
  const cfg = configRastreamento();
  const aceito = (escolhaNaVisita ?? escolhaCookies()) === "aceito";
  if (carregado || !cfg || !aceito || !rotaDeMarketing(window.location.pathname)) return;
  carregado = true;
  window.dataLayer = window.dataLayer || [];
  // O gtag exige o objeto "arguments" (não um array)
  window.gtag = function gtag() { window.dataLayer!.push(arguments); } as (...args: unknown[]) => void;
  window.gtag("js", new Date());
  if (cfg.ga4) window.gtag("config", cfg.ga4);
  if (cfg.ads) window.gtag("config", cfg.ads);
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent((cfg.ga4 ?? cfg.ads)!)}`;
  document.head.appendChild(s);
}

/** Evento GA4 e, se for conversão e o rótulo existir, a conversão do Google Ads */
export function registrarEvento(nome: string, params: Record<string, unknown> = {}, conversao?: "agendamento" | "whatsapp") {
  const cfg = configRastreamento();
  if (!carregado || !cfg || !window.gtag || !rotaDeMarketing(window.location.pathname)) return;
  window.gtag("event", nome, params);
  const sendTo = conversao === "agendamento" ? cfg.conversaoAgendamento : conversao === "whatsapp" ? cfg.conversaoWhatsapp : null;
  if (sendTo) window.gtag("event", "conversion", { send_to: sendTo });
}

const LINK_WHATSAPP = /^(https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\/|whatsapp:)/i;
let escutando = false;

/** Qualquer link de WhatsApp da página (botões, rodapé, cartão do corretor) conta como "clique_whatsapp" */
export function escutarCliquesWhatsapp() {
  if (escutando) return;
  escutando = true;
  document.addEventListener("click", e => {
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (a && LINK_WHATSAPP.test(a.href)) registrarEvento(EVENTOS.whatsapp, { pagina: window.location.pathname }, "whatsapp");
  }, true);
}
