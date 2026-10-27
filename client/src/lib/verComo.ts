/**
 * "Ver como" do administrador, lado do navegador: a pessoa escolhida fica guardada nesta aba (sessionStorage —
 * outras abas continuam como administrador) e toda chamada ao servidor leva o cabeçalho x-ver-como. O servidor
 * responde como a pessoa e recusa qualquer gravação (server/_core/verComo.ts).
 */
export interface PessoaVerComo { id: number; nome: string; perfil: string; rotuloPerfil: string }

const CHAVE = "verComo";
export const CABECALHO_VER_COMO = "x-ver-como";

export function verComoAtual(): PessoaVerComo | null {
  try { const v = sessionStorage.getItem(CHAVE); return v ? (JSON.parse(v) as PessoaVerComo) : null; } catch { return null; }
}

/** Começa a ver como a pessoa e abre a tela inicial dela (recarrega: nada do administrador fica em cache) */
export function entrarVerComo(p: PessoaVerComo) {
  try { sessionStorage.setItem(CHAVE, JSON.stringify(p)); } catch { /* sem armazenamento: não há como manter */ }
  window.location.href = p.perfil === "empreendedor" ? "/empreendedor" : "/dashboard";
}

/** Volta a ser o administrador, na tela de escolha */
export function sairVerComo(destino = "/ver-como") {
  try { sessionStorage.removeItem(CHAVE); } catch { /* nada */ }
  window.location.href = destino;
}

/**
 * Inclui o cabeçalho nas requisições ao próprio servidor (/api). Chamado uma vez na abertura do app: cobre o tRPC e
 * os downloads/consultas REST (fetch); com o modo desligado, não muda nada.
 */
export function instalarVerComo() {
  const p = verComoAtual();
  if (!p || typeof window === "undefined") return;
  const original = window.fetch.bind(window);
  window.fetch = (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const mesmoServidor = url.startsWith("/api") || url.startsWith(`${window.location.origin}/api`);
    if (!mesmoServidor) return original(entrada, init);
    const headers = new Headers(init?.headers ?? (entrada instanceof Request ? entrada.headers : undefined));
    headers.set(CABECALHO_VER_COMO, String(p.id));
    return original(entrada, { ...(init ?? {}), headers });
  };
}
