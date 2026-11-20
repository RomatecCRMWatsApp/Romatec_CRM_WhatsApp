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
  const cfg = configRastreamento();
  // Opt-out oficial do gtag por ID: liga na recusa, desliga se a pessoa voltar a aceitar
  for (const id of [cfg?.ga4, cfg?.ads]) if (id) (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = e === "recusado";
  if (e === "aceito") { carregarTags(); return; }
  // Revogação: nenhum evento novo (registrarEvento confere a escolha atual), consentimento negado no gtag já carregado
  // e os cookies do Google que o site consegue apagar (_ga, _ga_*, _gcl_*) removidos. Limites: cópias já enviadas ao
  // Google seguem as regras dele (docs/privacidade/fornecedores-e-ia.md).
  if (carregado && window.gtag) window.gtag("consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  apagarCookiesGoogle();
}

/** Apaga os cookies first-party do Google Analytics/Ads no domínio atual e nos domínios-pai */
export function apagarCookiesGoogle() {
  if (typeof document === "undefined" || typeof document.cookie !== "string") return;
  const nomes = document.cookie.split(";").map(c => c.split("=")[0].trim()).filter(n => /^(_ga|_ga_.+|_gid|_gat.*|_gcl_.+)$/.test(n));
  const host = typeof location !== "undefined" ? location.hostname : "";
  const partes = host.split(".");
  const dominios = [""];
  for (let i = 0; i < partes.length - 1; i++) dominios.push(`; domain=.${partes.slice(i).join(".")}`);
  for (const n of nomes) for (const d of dominios) document.cookie = `${n}=; Max-Age=0; path=/${d}`;
}

/** Reabre o aviso para a pessoa mudar a escolha (link "Preferências de cookies") */
export const EVENTO_REABRIR_COOKIES = "romatec:preferencias-cookies";
export function reabrirPreferenciasCookies() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_REABRIR_COOKIES));
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
  // A escolha ATUAL vale: depois de "Recusar" (revogação) nenhum evento sai, mesmo com o gtag já carregado na página
  const aceitoAgora = (escolhaNaVisita ?? escolhaCookies()) === "aceito";
  if (!carregado || !aceitoAgora || !cfg || !window.gtag || !rotaDeMarketing(window.location.pathname)) return;
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
