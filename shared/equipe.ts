/**
 * Equipe do CRM: quem entra e o que cada perfil pode acessar (regras puras,
 * usadas no servidor — tRPC/rotas — e no navegador — menus e redirecionamento).
 *
 * - admin: tudo (José).
 * - secretario: CRM inteiro (todos os leads), menos configurações, equipe, ZAYRA e distribuição de leads.
 * - corretor: só os leads em que é o responsável e os empreendimentos/imóveis habilitados para ele.
 * - empreendedor: só o painel do empreendimento dele (gráficos de leads, sem dados
 *   pessoais) e as artes liberadas para divulgar.
 * Secretário e corretor usam o portal de permissões (pacote base por perfil + ajuste por pessoa).
 * O antigo perfil "equipe" (até a v1.5.0) é lido como corretor.
 */

export const PERFIS = ['admin', 'secretario', 'corretor', 'empreendedor'] as const;
export type Perfil = typeof PERFIS[number];

export const ROTULO_PERFIL: Record<Perfil, string> = {
  admin: 'Administrador',
  secretario: 'Secretário(a)',
  corretor: 'Corretor(a)',
  empreendedor: 'Empreendedor',
};

/** Cor do selo do perfil (dourado, azul, verde, roxo) */
export const COR_PERFIL: Record<Perfil, string> = {
  admin: '#C9A84C', secretario: '#5AA9E6', corretor: '#2BD47A', empreendedor: '#B07CE0',
};

/** Perfis da equipe interna (usam o portal de permissões) */
export const PERFIS_EQUIPE = ['secretario', 'corretor'] as const;
export const daEquipe = (p: Perfil | null): p is 'secretario' | 'corretor' => p === 'secretario' || p === 'corretor';

export function perfilDe(user: { role?: string | null; perfil?: string | null } | null | undefined): Perfil | null {
  if (!user) return null;
  if (user.role === 'admin') return 'admin';
  const p = String(user.perfil);
  if (p === 'secretario' || p === 'corretor' || p === 'empreendedor') return p;
  return 'corretor'; // "equipe" (antigo) ou vazio
}

/** CRECI só com dígitos: "CRECI/MA 4.705" → "4705" (é o login dos colaboradores) */
export function normalizarCreci(entrada: string | null | undefined): string | null {
  const d = String(entrada || '').replace(/\D/g, '');
  return d.length >= 3 && d.length <= 10 ? d : null;
}

/** Login: e-mail (tem @), CPF (11 dígitos) ou CRECI */
export function tipoLogin(entrada: string): 'email' | 'cpf' | 'creci' {
  if (entrada.includes('@')) return 'email';
  return entrada.replace(/\D/g, '').length === 11 ? 'cpf' : 'creci';
}

// ─── Servidor: procedimentos tRPC ────────────────────────────────────────────
/** O empreendedor só chama estes (o resto do CRM é negado por padrão); o próprio cadastro todos editam */
const TRPC_EMPREENDEDOR = ['auth.', 'empreendedor.', 'system.versao', 'cadastro.', 'novidades.naoLidas', 'novidades.historico', 'novidades.marcarLida', 'novidades.marcarTodas', 'novidades.novosLeads', 'novidades.definirDescanso', 'notificacoes.', 'saas.minhaAssinatura', 'saas.minhaCheckout', 'saas.cupomValidar',
  // Portal do empreendedor: mapa e situação das chácaras do empreendimento dele, vendas e tabelas (escopo conferido no servidor)
  'empreendimentosAdmin.detalhe', 'empreendimentosAdmin.atualizarLote', 'empreendimentosAdmin.historico', 'empreendimentosAdmin.memoriais',
  'financeiro.vendas', 'financeiro.tabelasEmpreendimentos', 'financeiro.tabela',
  // Carteirinhas oficiais do empreendimento dele (o corretor só baixa rascunho)
  'contratos.carteirinhasLista',
  // Reuniões do empreendimento dele e quem confirmou presença (só leitura)
  'convites.listar', 'convites.detalhe',
  // Ranking de vendas e campanha do empreendimento dele (só leitura)
  'ranking.empreendimentos', 'ranking.classificacao'];
/** Secretário e corretor não mexem em configurações, na equipe nem na ZAYRA */
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
  if (caminho === '/meu-cadastro') return true;
  // Área do assinante (camada SaaS): corretor e empreendedor
  if (caminho === '/assinatura') return perfil === 'corretor' || perfil === 'empreendedor';
  if (perfil === 'empreendedor') return caminho === '/empreendedor' || caminho.startsWith('/empreendedor/') || caminho === '/convites' || caminho.startsWith('/convites/') || caminho === '/ranking';
  // Recrutamento e talonários: administrador e secretária; Admin › SaaS: só o administrador
  if (caminho === '/recrutamento' || caminho.startsWith('/recrutamento/') || caminho === '/talonarios') return perfil === 'secretario';
  if (caminho === '/saas' || caminho === '/integracoes') return false;
  // Fila de reservas do escritório: administrador e secretária
  if (caminho === '/reservas' || caminho === '/portal-comprador') return perfil === 'secretario';
  // Respostas automáticas no WhatsApp (robô por empreendimento): administrador e secretária
  if (caminho === '/respostas-automaticas') return perfil === 'secretario';
  // "Ver como" (o sistema como cada pessoa vê, só leitura): só o administrador
  if (caminho === '/ver-como' || caminho.startsWith('/ver-como?') || caminho === '/visao-corretor') return false;
  // Disparos WhatsApp: administrador e secretária
  if (caminho === '/campaigns' || caminho.startsWith('/campaigns/')) return perfil === 'secretario';
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
