/**
 * Cartão de vendas por usuário logado (white-label da camada de VENDAS): propostas, links, folders e
 * mensagens saem com nome, CRECI (se houver), telefone/WhatsApp, e-mail e foto de quem gera.
 * - Admin, corretor e secretária: os dados do próprio usuário;
 * - Empreendedor: os dados do ADMINISTRADOR (a divulgação dele cai no contato do administrador).
 * O CPF nunca entra em material de divulgação (LGPD). A marca do empreendimento não muda.
 */
import { telefoneWhatsApp } from './contratos';

export interface CartaoVendas {
  nome: string;
  /** "CRECI/MA 4.705"; null quando o usuário não tem CRECI (some do rodapé sem quebrar o layout) */
  creci: string | null;
  telefones: string[];
  /** Dígitos com 55 para o wa.me */
  whatsapp: string | null;
  email: string | null;
  fotoUrl: string | null;
  /** Papel exibido: "Corretor(a)", "Atendimento" … */
  papel: string;
  /** Usuário do Instagram, sem @ — o do corretor ou o institucional (@avalieimob) */
  instagram: string;
}

export interface UsuarioCartao {
  name?: string | null; role?: string | null; perfil?: string | null; creci?: string | null; creciUf?: string | null;
  telefone?: string | null; email?: string | null; fotoUrl?: string | null; instagram?: string | null;
}

/** Instagram institucional — usado quando o corretor não cadastrou o dele */
export const INSTAGRAM_PADRAO = 'avalieimob';

/** "@Fulano", "instagram.com/fulano/?utm…" ou "fulano" → "fulano"; inválido → null */
export function normalizarInstagram(v: string | null | undefined): string | null {
  let s = String(v ?? '').trim();
  if (!s) return null;
  const m = /instagram\.com\/([^/?#\s]+)/i.exec(s);
  if (m) s = m[1];
  s = s.replace(/^@+/, '').toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(s) ? s : null;
}

/** Link limpo do perfil (sem parâmetros) */
export const linkInstagram = (usuario: string) => `https://www.instagram.com/${usuario}`;

/** Contato padrão (fallback sem cadastro): o corretor responsável da Romatec */
export const CARTAO_PADRAO: CartaoVendas = {
  nome: 'José Romário', creci: 'CRECI/MA 4.705', telefones: ['(99) 9 9181-1246', '(99) 9 9206-2871'], whatsapp: '5599991811246',
  email: 'romateccrm@gmail.com', fotoUrl: null, papel: 'Corretor', instagram: INSTAGRAM_PADRAO,
};

/** De quem são os dados do material: do próprio usuário ou do administrador */
export const origemDoCartao = (perfil: string | null | undefined): 'proprio' | 'admin' => (perfil === 'empreendedor' ? 'admin' : 'proprio');

export function formatarTelefone(t: string | null | undefined): string | null {
  const d = String(t ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d[2]} ${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return null;
}

export function formatarCreci(creci: string | null | undefined, uf: string | null | undefined): string | null {
  const c = String(creci ?? '').trim();
  if (!c) return null;
  const n = /^\d{4,}$/.test(c) ? Number(c).toLocaleString('pt-BR') : c;
  return `CRECI/${(uf || 'MA').toUpperCase()} ${n}`;
}

/**
 * Cartão a partir do cadastro. Sem telefone ou e-mail, usa o que houver; o administrador sem telefone
 * cadastrado herda os contatos padrão (mesmos números de hoje).
 */
export function cartaoDe(u: UsuarioCartao, perfil: string | null | undefined): CartaoVendas {
  const tel = formatarTelefone(u.telefone);
  const admin = perfil === 'admin';
  const telefones = tel ? [tel] : admin ? CARTAO_PADRAO.telefones : [];
  return {
    nome: String(u.name ?? '').trim() || (admin ? CARTAO_PADRAO.nome : 'Equipe Romatec'),
    creci: formatarCreci(u.creci, u.creciUf),
    telefones,
    whatsapp: telefoneWhatsApp(u.telefone) ?? (admin ? CARTAO_PADRAO.whatsapp : null),
    email: String(u.email ?? '').trim() || (admin ? CARTAO_PADRAO.email : null),
    fotoUrl: String(u.fotoUrl ?? '').trim() || null,
    papel: perfil === 'secretario' ? 'Atendimento' : 'Corretor(a)',
    instagram: normalizarInstagram(u.instagram) ?? INSTAGRAM_PADRAO,
  };
}

/** Linha de texto (mensagem de WhatsApp): "Corretor(a) Fulano · CRECI/MA 1.234 · (99) 9 9999-9999" */
export function linhaCartao(c: CartaoVendas): string {
  return [`${c.papel} ${c.nome}`, c.creci, c.telefones[0], c.email, c.instagram && `@${c.instagram}`].filter(Boolean).join(' · ');
}

/**
 * Assinatura de quem divulga, no fim de todo texto de WhatsApp (links, banners, vídeos, folders):
 * nome, CRECI, WhatsApp e Instagram do corretor logado — o cliente responde direto para ele.
 */
export function assinaturaWhatsApp(c: CartaoVendas): string {
  return [
    '—',
    `👤 *${c.nome}* · ${c.papel}`,
    c.creci ? `🪪 ${c.creci}` : null,
    c.telefones[0] ? `📲 WhatsApp: ${c.telefones[0]}` : null,
    c.instagram ? `📸 @${c.instagram}` : null,
  ].filter(Boolean).join('\n');
}

/** Texto + assinatura (sem repetir a assinatura se o texto já tiver) */
export function comAssinatura(texto: string, c: CartaoVendas): string {
  const a = assinaturaWhatsApp(c);
  const t = texto.trim();
  return t.endsWith(a) ? t : `${t}\n\n${a}`;
}

/** Linhas do rodapé carimbado em banner, vídeo e PDF (sem emoji: fontes padrão do PDF não têm) */
export function linhasRodape(c: CartaoVendas): { nome: string; detalhe: string } {
  return {
    nome: `${c.nome}${c.creci ? ` · ${c.creci}` : ''}`,
    detalhe: [c.telefones[0] ? `WhatsApp ${c.telefones[0]}` : null, c.instagram ? `@${c.instagram}` : null].filter(Boolean).join('  ·  '),
  };
}
