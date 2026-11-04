/**
 * Carimbo das mídias (Materiais › Meu carimbo): cada usuário — corretor, secretária, empreendedor, administrador —
 * define uma vez o nome, o WhatsApp, o Instagram e o e-mail que saem na faixa das imagens, vídeos e PDFs que ele
 * baixa ou compartilha. O CRECI vem do cadastro (não é editável aqui: anúncio de corretor leva o CRECI dele).
 * Sem carimbo salvo, vale o cadastro (shared/cartaoVendas.ts).
 */
import { formatarTelefone, normalizarInstagram, type CartaoVendas } from './cartaoVendas';

export interface Carimbo { nome: string; telefone: string | null; instagram: string | null; email: string | null }
export interface CarimboAplicado { cartao: CartaoVendas; instagram: string | null; email: string | null }

export const LIMITES_CARIMBO = { nome: 80, telefone: 20, instagram: 40, email: 120 } as const;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

export class CarimboErro extends Error { constructor(msg: string) { super(msg); this.name = 'CarimboErro'; } }

/** Limpa e valida o que o usuário digitou; lança CarimboErro com a mensagem para a tela */
export function normalizarCarimbo(c: { nome?: string | null; telefone?: string | null; instagram?: string | null; email?: string | null }): Carimbo {
  const nome = String(c.nome ?? '').replace(/\s+/g, ' ').trim();
  if (nome.length < 2) throw new CarimboErro('Informe o nome que vai no carimbo');
  if (nome.length > LIMITES_CARIMBO.nome) throw new CarimboErro(`Nome com até ${LIMITES_CARIMBO.nome} letras`);
  const telBruto = String(c.telefone ?? '').trim();
  const telefone = telBruto ? formatarTelefone(telBruto) : null;
  if (telBruto && !telefone) throw new CarimboErro('WhatsApp inválido: use DDD + número, ex.: (99) 9 9999-9999');
  const igBruto = String(c.instagram ?? '').trim();
  const instagram = igBruto ? normalizarInstagram(igBruto) : null;
  if (igBruto && !instagram) throw new CarimboErro('Instagram inválido: use só o @ (letras, números, ponto e _)');
  const email = String(c.email ?? '').trim().toLowerCase() || null;
  if (email && (!EMAIL.test(email) || email.length > LIMITES_CARIMBO.email)) throw new CarimboErro('E-mail inválido');
  return { nome, telefone, instagram, email };
}

/** Sugestão do formulário quando ainda não há carimbo salvo: o que está no cadastro */
export function carimboDoCadastro(cartao: CartaoVendas, instagramProprio: string | null): Carimbo {
  return { nome: cartao.nome, telefone: cartao.telefones[0] ?? null, instagram: instagramProprio, email: cartao.email };
}

/** Dados que vão na faixa: o carimbo salvo (se houver) por cima do cadastro; o CRECI é sempre o do cadastro */
export function aplicarCarimbo(cartao: CartaoVendas, instagramProprio: string | null, carimbo: Carimbo | null): CarimboAplicado {
  if (!carimbo) return { cartao, instagram: instagramProprio, email: null };
  return {
    cartao: { ...cartao, nome: carimbo.nome, telefones: carimbo.telefone ? [carimbo.telefone] : [], instagram: carimbo.instagram ?? cartao.instagram },
    instagram: carimbo.instagram,
    email: carimbo.email,
  };
}

/** Assinatura do texto que acompanha a mídia (WhatsApp), com os dados do carimbo — Instagram e e-mail só se preenchidos */
export function assinaturaDoCarimbo(a: CarimboAplicado): string {
  const c = a.cartao;
  return [
    '—',
    `👤 *${c.nome}* · ${c.papel}`,
    c.creci ? `🪪 ${c.creci}` : null,
    c.telefones[0] ? `📲 WhatsApp: ${c.telefones[0]}` : null,
    a.instagram ? `📸 @${a.instagram}` : null,
    a.email ? `✉️ ${a.email}` : null,
  ].filter(Boolean).join('\n');
}

/** Linhas da faixa: "Nome · CRECI" e "WhatsApp … · @insta"; o e-mail vai numa linha própria */
export function linhasCarimbo(a: CarimboAplicado): { nome: string; detalhe: string; email: string | null } {
  const nome = `${a.cartao.nome}${a.cartao.creci ? ` · ${a.cartao.creci}` : ''}`;
  const detalhe = [a.cartao.telefones[0] ? `WhatsApp ${a.cartao.telefones[0]}` : null, a.instagram ? `@${a.instagram}` : null].filter(Boolean).join('  ·  ');
  return { nome, detalhe, email: a.email };
}
