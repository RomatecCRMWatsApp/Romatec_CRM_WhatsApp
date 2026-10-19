/**
 * Equipe do CRM: quem entra e o que cada perfil pode acessar (regras puras,
 * usadas no servidor — tRPC/rotas — e no navegador — menus e redirecionamento).
 *
 * - admin: tudo (José).
 * - equipe: corretores/secretária — CRM inteiro, menos configurações, equipe e ZAYRA.
 * - empreendedor: só o painel do empreendimento dele (gráficos de leads, sem dados
 *   pessoais) e as artes liberadas para divulgar.
 */

export const PERFIS = ['admin', 'equipe', 'empreendedor'] as const;
export type Perfil = typeof PERFIS[number];

export const ROTULO_PERFIL: Record<Perfil, string> = {
  admin: 'Administrador',
  equipe: 'Equipe (corretor/secretária)',
  empreendedor: 'Empreendedor',
};

export function perfilDe(user: { role?: string | null; perfil?: string | null } | null | undefined): Perfil | null {
  if (!user) return null;
  if (user.role === 'admin') return 'admin';
  return (PERFIS as readonly string[]).includes(String(user.perfil)) ? (user.perfil as Perfil) : 'equipe';
}

/** CRECI só com dígitos: "CRECI/MA 4.705" → "4705" (é o login dos colaboradores) */
export function normalizarCreci(entrada: string | null | undefined): string | null {
  const d = String(entrada || '').replace(/\D/g, '');
  return d.length >= 3 && d.length <= 10 ? d : null;
}

/** Login: e-mail (tem @) ou CRECI */
export function tipoLogin(entrada: string): 'email' | 'creci' {
  return entrada.includes('@') ? 'email' : 'creci';
}

// ─── Servidor: procedimentos tRPC ────────────────────────────────────────────
/** O empreendedor só chama estes (o resto do CRM é negado por padrão) */
const TRPC_EMPREENDEDOR = ['auth.', 'empreendedor.', 'system.versao'];
/** Equipe não mexe em configurações, na equipe nem na ZAYRA */
const TRPC_SO_ADMIN = ['companyConfig.update', 'equipe.', 'zaira.'];

export function podeChamar(perfil: Perfil | null, caminho: string): boolean {
  if (!perfil) return false;
  if (perfil === 'admin') return true;
  if (perfil === 'empreendedor') return TRPC_EMPREENDEDOR.some(p => (p.endsWith('.') ? caminho.startsWith(p) : caminho === p));
  return !TRPC_SO_ADMIN.some(p => (p.endsWith('.') ? caminho.startsWith(p) : caminho === p));
}

// ─── Navegador: telas ────────────────────────────────────────────────────────
export function telaInicial(perfil: Perfil | null): string {
  return perfil === 'empreendedor' ? '/empreendedor' : '/dashboard';
}

/** Tela que o perfil pode abrir; se não puder, o app manda para telaInicial */
export function podeAbrir(perfil: Perfil | null, caminho: string): boolean {
  if (!perfil) return false;
  if (perfil === 'admin') return true;
  if (perfil === 'empreendedor') return caminho === '/empreendedor' || caminho.startsWith('/empreendedor/');
  return !['/equipe', '/settings', '/setup'].some(p => caminho === p || caminho.startsWith(`${p}/`)) && !caminho.startsWith('/empreendedor');
}

// ─── Convite de primeiro acesso ──────────────────────────────────────────────
export const DIAS_CONVITE = 7;

export function conviteValido(expira: Date | string | null | undefined, agora = Date.now()): boolean {
  if (!expira) return false;
  const t = new Date(expira).getTime();
  return Number.isFinite(t) && t > agora;
}

/** "jose@gmail.com" → "j***@gmail.com" (tela de primeiro acesso não revela o e-mail inteiro) */
export function mascararEmail(email: string | null | undefined): string {
  const [u, d] = String(email || '').split('@');
  if (!u || !d) return '';
  return `${u[0]}***@${d}`;
}
