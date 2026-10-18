/**
 * Captura de onde veio o visitante, uma vez por visita (como o AvalieImob faz em App.js):
 * UTMs do link, referrer e página de entrada. Fica no localStorage por 30 dias para
 * sobreviver à navegação até o formulário; um link novo com UTM substitui o anterior.
 */
import { limparReferrer, hostDe, type OrigemVisita } from "@shared/origemTrafego";

const CHAVE = "rmt_origem";
const VALIDADE_MS = 30 * 24 * 3600 * 1000;
const UTMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;

export interface OrigemSalva extends OrigemVisita {
  utm?: { source?: string; medium?: string; campaign?: string; content?: string } | null;
  at: number;
}

function ler(): OrigemSalva | null {
  try {
    const o = JSON.parse(localStorage.getItem(CHAVE) || "null") as OrigemSalva | null;
    return o && Date.now() - o.at < VALIDADE_MS ? o : null;
  } catch {
    return null;
  }
}

function gravar(o: OrigemSalva) {
  try { localStorage.setItem(CHAVE, JSON.stringify(o)); } catch { /* modo privado: segue sem guardar */ }
}

function utmDaUrl(): OrigemSalva["utm"] {
  const q = new URLSearchParams(location.search);
  const [source, medium, campaign, content] = UTMS.map(k => q.get(k)?.slice(0, 100) || undefined);
  return source || medium || campaign || content ? { source, medium, campaign, content } : null;
}

/** Chamar uma vez ao abrir o site (main.tsx) */
export function capturarOrigem() {
  if (typeof window === "undefined") return;
  const utm = utmDaUrl();
  const ref = limparReferrer(document.referrer);
  const externo = ref && hostDe(ref) !== hostDe(location.href) ? ref : null;
  const pagina = (location.pathname + location.search).slice(0, 300);
  const salvo = ler();
  // Link novo com UTM ou clique de anúncio: vale o mais recente. Sem nada novo: mantém o 1º toque.
  if (utm || /[?&]gclid=/.test(location.search) || !salvo) {
    gravar({ utm, referrer: externo, paginaEntrada: pagina, at: Date.now() });
  } else if (externo && !salvo.utm && !salvo.referrer) {
    gravar({ ...salvo, referrer: externo });
  }
}

/** UTMs da URL atual ou, se não houver, as da entrada no site */
export function utmDaVisita(): OrigemSalva["utm"] {
  return utmDaUrl() ?? ler()?.utm ?? null;
}

/** Referrer e página de entrada para mandar junto com o formulário */
export function origemDaVisita(): OrigemVisita {
  const o = ler();
  return { referrer: o?.referrer ?? limparReferrer(document.referrer), paginaEntrada: o?.paginaEntrada ?? (location.pathname + location.search).slice(0, 300) };
}
