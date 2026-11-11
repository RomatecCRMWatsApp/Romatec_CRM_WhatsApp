/**
 * Cartão "Seu corretor" dos PDFs comerciais (proposta, todas as condições, tabelas de financiamento, kit):
 * foto do cadastro em círculo com aro dourado (ou as iniciais), nome em destaque, CRECI e, cada um na sua linha,
 * WhatsApp, Instagram e e-mail — dados do Meu carimbo (Materiais), com o cadastro de reserva.
 */
import { rgb, StandardFonts, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import type { CartaoVendas } from '../../shared/cartaoVendas';

export interface CorretorPdf {
  nome: string;
  creci: string | null;
  papel?: string | null;
  telefone: string | null;
  instagram?: string | null;
  email: string | null;
  /** PNG já recortado em círculo (fotoRedonda); null = iniciais */
  foto?: Buffer | null;
}

const VERDE = rgb(0.047, 0.2, 0.125);
const DOURADO = rgb(0.788, 0.651, 0.275);
const CINZA = rgb(0.38, 0.38, 0.38);
const FUNDO = rgb(0.975, 0.965, 0.93);
export const ALTURA_CARTAO = 104;

/** Foto do cadastro recortada em círculo, com aro dourado (PNG com fundo transparente) */
export async function fotoRedonda(bruto: Buffer, lado = 360): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const r = lado / 2, aro = Math.round(lado * 0.035);
  const mascara = Buffer.from(`<svg width="${lado}" height="${lado}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`);
  const anel = Buffer.from(`<svg width="${lado}" height="${lado}"><circle cx="${r}" cy="${r}" r="${r - aro / 2}" fill="none" stroke="#c9a646" stroke-width="${aro}"/></svg>`);
  const recorte = await sharp(bruto).rotate().resize(lado, lado, { fit: 'cover', position: 'attention' }).ensureAlpha()
    .composite([{ input: mascara, blend: 'dest-in' }]).png().toBuffer();
  return sharp(recorte).composite([{ input: anel }]).png().toBuffer();
}

/** Do cartão de vendas (cadastro) para o cartão do PDF */
export function corretorDoCartao(c: CartaoVendas, extra: { instagram?: string | null; email?: string | null; foto?: Buffer | null } = {}): CorretorPdf {
  return { nome: c.nome, creci: c.creci, papel: c.papel, telefone: c.telefones[0] ?? null, instagram: extra.instagram ?? c.instagram ?? null, email: extra.email ?? c.email ?? null, foto: extra.foto ?? null };
}

/** Carimbo + foto do usuário, prontos para o PDF; null se não achar o usuário */
export async function corretorParaPdf(usuarioId: number | null | undefined): Promise<CorretorPdf | null> {
  if (!usuarioId) return null;
  try {
    const { dadosDoCarimbo } = await import('../carimbo');
    const cb = await dadosDoCarimbo(usuarioId);
    const { getDb } = await import('../db');
    const { fotoPng } = await import('../credenciamento');
    const bruto = await fotoPng(await getDb(), usuarioId);
    const foto = bruto ? await fotoRedonda(bruto).catch(() => null) : null;
    return corretorDoCartao(cb.cartao, { instagram: cb.instagram, email: cb.email ?? cb.cartao.email, foto });
  } catch {
    return null;
  }
}

/**
 * Usuário do contato padrão (CARTAO_PADRAO, o corretor responsável da Romatec): pelo WhatsApp ou pelo CRECI do
 * cartão padrão, preferindo o administrador ativo. Guardado depois da primeira busca.
 */
let padraoId: number | null | undefined;
export async function usuarioDoCartaoPadrao(): Promise<number | null> {
  if (padraoId !== undefined) return padraoId;
  try {
    const { getDb } = await import('../db');
    const { users } = await import('../../drizzle/schema');
    const { CARTAO_PADRAO } = await import('../../shared/cartaoVendas');
    const d: any = await getDb();
    if (!d) return null;
    const lista: any[] = await d.select({ id: users.id, role: users.role, ativo: users.ativo, telefone: users.telefone, creci: users.creci }).from(users);
    const tel = String(CARTAO_PADRAO.whatsapp ?? '').replace(/\D/g, '').slice(-9);
    const creci = String(CARTAO_PADRAO.creci ?? '').replace(/\D/g, '');
    const ativos = lista.filter(u => u.ativo !== false && u.ativo !== 0);
    const bate = (u: any) => (tel && String(u.telefone ?? '').replace(/\D/g, '').endsWith(tel)) || (creci && String(u.creci ?? '').replace(/\D/g, '') === creci);
    const achado = ativos.filter(bate).sort((a, b) => Number(b.role === 'admin') - Number(a.role === 'admin') || a.id - b.id)[0];
    padraoId = achado ? Number(achado.id) : null;
  } catch { return null; }
  return padraoId;
}

/** Cartão do contato padrão com a foto dele (sem o usuário, o cartão padrão com as iniciais) */
export async function corretorPadraoPdf(): Promise<CorretorPdf> {
  const { CARTAO_PADRAO } = await import('../../shared/cartaoVendas');
  return (await corretorParaPdf(await usuarioDoCartaoPadrao())) ?? corretorDoCartao(CARTAO_PADRAO);
}

const iniciais = (nome: string) => {
  const ps = nome.split(/\s+/).filter(w => w.length > 2);
  const lista = ps.length ? ps : nome.split(/\s+/).filter(Boolean);
  return ((lista[0]?.[0] ?? '') + (lista.length > 1 ? lista[lista.length - 1][0] : '')).toUpperCase();
};

/**
 * Desenha o cartão com o topo em `topo`, de `x` a `x + largura`; devolve a altura usada.
 * Fontes: as do documento, ou Helvetica embutida aqui.
 */
export async function desenharCartaoCorretor(doc: PDFDocument, p: PDFPage, x: number, topo: number, largura: number, c: CorretorPdf,
  fontes: { normal?: PDFFont; negrito?: PDFFont } = {}): Promise<number> {
  const f = fontes.normal ?? await doc.embedFont(StandardFonts.Helvetica);
  const fh = fontes.negrito ?? await doc.embedFont(StandardFonts.HelveticaBold);
  const H = ALTURA_CARTAO, D = 74, X1 = x + largura;
  p.drawRectangle({ x, y: topo - H, width: largura, height: H, color: FUNDO, borderColor: DOURADO, borderWidth: 0.8 });
  p.drawRectangle({ x, y: topo - H, width: 5, height: H, color: VERDE });
  const fx = x + 22, fy = topo - (H + D) / 2;
  if (c.foto) {
    p.drawImage(await doc.embedPng(c.foto), { x: fx, y: fy, width: D, height: D });
  } else {
    p.drawCircle({ x: fx + D / 2, y: fy + D / 2, size: D / 2, color: VERDE, borderColor: DOURADO, borderWidth: 2.5 });
    const sigla = iniciais(c.nome), ts = 24;
    p.drawText(sigla, { x: fx + (D - fh.widthOfTextAtSize(sigla, ts)) / 2, y: fy + D / 2 - ts * 0.35, size: ts, font: fh, color: rgb(1, 1, 1) });
  }
  const tx = fx + D + 18, largT = X1 - 14 - tx;
  const caber = (t: string, fonte: PDFFont, tam: number, min: number) => { let z = tam; while (z > min && fonte.widthOfTextAtSize(t, z) > largT) z -= 0.25; return z; };
  p.drawText('Seu corretor', { x: tx, y: topo - 22, size: 8.5, font: fh, color: DOURADO });
  p.drawText(c.nome, { x: tx, y: topo - 40, size: caber(c.nome, fh, 14, 9), font: fh, color: VERDE });
  let ly = topo - 54;
  const sub = [c.creci, `${c.papel && c.papel !== 'Corretor' ? c.papel : 'Corretor(a) de imóveis'}`].filter(Boolean).join(' · ');
  p.drawText(sub, { x: tx, y: ly, size: caber(sub, f, 9.5, 7), font: f, color: CINZA });
  ly -= 7;
  p.drawLine({ start: { x: tx, y: ly }, end: { x: X1 - 14, y: ly }, thickness: 0.5, color: DOURADO });
  ly -= 12;
  const linhas = [c.telefone && `WhatsApp: ${c.telefone}`, c.instagram && `Instagram: @${String(c.instagram).replace(/^@/, '')}`, c.email && `E-mail: ${c.email}`].filter(Boolean) as string[];
  for (const l of linhas) { p.drawText(l, { x: tx, y: ly, size: caber(l, f, 10, 7.5), font: f, color: rgb(0.1, 0.1, 0.1) }); ly -= 12.5; }
  return H;
}
