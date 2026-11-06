/**
 * Versão nova no ar com a página antiga aberta: o navegador pede um pedaço do sistema (ex.: Dashboard-xxxx.js) que
 * já não existe e aparece "Failed to fetch dynamically imported module". Em vez da tela de erro, recarrega a página
 * uma vez para pegar a versão nova. A trava evita ficar recarregando em loop se o erro for outro (ex.: sem internet).
 */
const CHAVE = "rt_recarga_versao";
const JANELA_MS = 30_000;

const PADRAO = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading (?:CSS )?chunk [\w-]+ failed|Unable to preload CSS/i;

export function ehErroDeVersao(erro: unknown): boolean {
  const msg = erro instanceof Error ? `${erro.name} ${erro.message}` : String((erro as any)?.message ?? erro ?? "");
  return PADRAO.test(msg);
}

/** Recarrega se não recarregou nos últimos 30 s; devolve true quando vai recarregar */
export function recarregarUmaVez(agora = Date.now(), armazenamento: Pick<Storage, "getItem" | "setItem"> | null = seguro()): boolean {
  const ultima = Number(armazenamento?.getItem(CHAVE) || 0);
  if (ultima && agora - ultima < JANELA_MS) return false;
  armazenamento?.setItem(CHAVE, String(agora));
  if (typeof window !== "undefined") window.location.reload();
  return true;
}

function seguro(): Storage | null {
  try { return typeof sessionStorage === "undefined" ? null : sessionStorage; } catch { return null; }
}

/** Liga no início do app: erros de pedaço da versão antiga viram uma recarga silenciosa */
export function instalarRecargaDeVersao(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", (e: Event) => { if (recarregarUmaVez()) e.preventDefault(); });
  window.addEventListener("unhandledrejection", e => { if (ehErroDeVersao(e.reason) && recarregarUmaVez()) e.preventDefault(); });
}
