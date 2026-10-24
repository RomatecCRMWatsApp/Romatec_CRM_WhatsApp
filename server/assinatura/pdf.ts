/**
 * PDF da assinatura (spec §6.2, §6.4 e §6.7): página de assinaturas (posição automática das caixas), marcação das
 * caixas ICP/gov.br, carimbo visual da assinatura avançada e o manifesto (Anexo VII, arquivo separado).
 * Carimbo e marcação regravam o PDF — por isso só acontecem ANTES da primeira assinatura digital (ICP/gov.br).
 */
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { desenharMarca, embutirMarca } from '../contratos/anexos';
import { temAssinaturaDigital } from './icp';

const VERDE = rgb(0.047, 0.2, 0.125), DOURADO = rgb(0.79, 0.66, 0.3), CREME = rgb(0.95, 0.93, 0.87), CINZA = rgb(0.4, 0.4, 0.4);

export interface Caixa { papel: string; pagina: number; x: number; y: number; w: number; h: number }
export interface SignatarioPdf { papel: string; nome: string; cpf: string; metodo: string }

export const ROTULO_PAPEL: Record<string, string> = {
  comprador: 'Promissário(a) comprador(a)', conjuge: 'Cônjuge/companheiro(a) anuente', comprador2: '2º promissário(a) comprador(a)',
  vendedora: 'Promitente vendedora', titular: 'Titular anuente', intermediadora: 'Gestora de vendas e intermediadora (Romatec)',
  corretor_parceiro: 'Corretor(a) parceiro(a)', testemunha1: 'Testemunha', testemunha2: 'Testemunha',
};
export const ROTULO_METODO: Record<string, string> = {
  avancada: 'Assinatura eletrônica avançada (link + código)', govbr: 'Assinatura gov.br', icp_a1: 'Certificado digital ICP-Brasil (A1)', manuscrita: 'A punho',
};

export const cpfMascarado = (cpf: string) => String(cpf).replace(/^(\d{3})\d{6}(\d{2})$/, '$1.***.***-$2');

const pagina = (d: PDFDocument, n: number) => { const ps = d.getPages(); return ps[n === -1 ? ps.length - 1 : n - 1]; };

/** Acrescenta a página "Quadro de assinaturas" com uma caixa por signatário e devolve as posições normalizadas (página -1) */
export async function paginaDeAssinaturas(pdf: Buffer, sigs: SignatarioPdf[], o: { numero: string; marca: string; codigo: string }): Promise<{ pdf: Buffer; caixas: Caixa[] }> {
  if (temAssinaturaDigital(pdf)) throw new Error('O PDF já tem assinatura digital: a página de assinaturas tem de entrar antes');
  const d = await PDFDocument.load(pdf);
  const m = await embutirMarca(d, o.marca);
  const f = await d.embedFont(StandardFonts.Helvetica), fb = await d.embedFont(StandardFonts.HelveticaBold);
  const p = d.addPage([595.28, 841.89]);
  const { topo, base } = desenharMarca(p, m);
  const { width: W, height: H } = p.getSize();
  p.drawText('QUADRO DE ASSINATURAS ELETRÔNICAS', { x: 62, y: topo - 6, size: 12, font: fb, color: VERDE });
  p.drawText(`Contrato n.º ${o.numero} · código de verificação ${o.codigo}`, { x: 62, y: topo - 21, size: 8, font: f, color: CINZA });
  p.drawText('Assinaturas válidas nos termos da MP 2.200-2/2001, art. 10, § 2º, da Lei 14.063/2020 e da Cláusula 20ª.', { x: 62, y: topo - 33, size: 7.5, font: f, color: CINZA });
  const cols = 2, gap = 14, bw = (W - 124 - gap) / cols, bh = 88;
  const caixas: Caixa[] = [];
  sigs.forEach((s, i) => {
    const col = i % cols, lin = Math.floor(i / cols);
    const x = 62 + col * (bw + gap), yTopo = topo - 52 - lin * (bh + 30);
    if (yTopo - bh - 20 < base) return;
    p.drawText((ROTULO_PAPEL[s.papel] ?? s.papel).toUpperCase(), { x, y: yTopo, size: 6.8, font: fb, color: VERDE });
    p.drawText(`${s.nome} — CPF ${cpfMascarado(s.cpf)}`, { x, y: yTopo - 10, size: 7.2, font: f, maxWidth: bw });
    const y = yTopo - 16 - bh;
    p.drawRectangle({ x, y, width: bw, height: bh, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.5, borderDashArray: [3, 3] });
    caixas.push({ papel: s.papel, pagina: -1, x: x / W, y: y / H, w: bw / W, h: bh / H });
  });
  return { pdf: Buffer.from(await d.save({ useObjectStreams: false })), caixas };
}

/** Texto nas caixas ICP/gov.br (o leitor de PDF mostra a assinatura real no painel) */
export async function marcarCaixasDigitais(pdf: Buffer, caixas: (Caixa & { metodo: string })[]): Promise<Buffer> {
  const digitais = caixas.filter(c => c.metodo === 'icp_a1' || c.metodo === 'govbr');
  if (!digitais.length) return pdf;
  if (temAssinaturaDigital(pdf)) return pdf;
  const d = await PDFDocument.load(pdf);
  const f = await d.embedFont(StandardFonts.Helvetica), fb = await d.embedFont(StandardFonts.HelveticaBold);
  for (const c of digitais) {
    const p = pagina(d, c.pagina);
    if (!p) continue;
    const { width, height } = p.getSize();
    const [x, y, w, h] = [c.x * width, c.y * height, c.w * width, c.h * height];
    p.drawRectangle({ x, y, width: w, height: h, color: rgb(0.97, 0.97, 0.98), borderColor: rgb(0.55, 0.6, 0.7), borderWidth: 0.6 });
    p.drawText(c.metodo === 'govbr' ? 'ASSINATURA DIGITAL gov.br' : 'ASSINATURA DIGITAL ICP-Brasil', { x: x + 5, y: y + h - 13, size: 7, font: fb, color: rgb(0.2, 0.25, 0.4) });
    p.drawText('ver o painel de assinaturas do leitor de PDF e o manifesto', { x: x + 5, y: y + h - 23, size: 6, font: f, color: CINZA, maxWidth: w - 10 });
  }
  return Buffer.from(await d.save({ useObjectStreams: false }));
}

/** Carimbo visual da assinatura avançada (spec §6.4) */
export async function carimbarAvancada(pdf: Buffer, cx: Caixa, s: { nome: string; cpf: string; quando: Date; ip: string; codigo: string }): Promise<Buffer> {
  if (temAssinaturaDigital(pdf)) throw new Error('O PDF já tem assinatura digital: não pode receber carimbo');
  const d = await PDFDocument.load(pdf);
  const p = pagina(d, cx.pagina);
  if (!p) throw new Error('Página da caixa de assinatura inexistente');
  const { width, height } = p.getSize();
  const [x, y, w, h] = [cx.x * width, cx.y * height, cx.w * width, cx.h * height];
  const f = await d.embedFont(StandardFonts.Helvetica), fb = await d.embedFont(StandardFonts.HelveticaBold);
  p.drawRectangle({ x, y, width: w, height: h, borderColor: DOURADO, borderWidth: 0.8, color: CREME });
  const linhas: [string, PDFFont, number][] = [
    ['ASSINADO ELETRONICAMENTE', fb, 7], [s.nome, fb, 8],
    [`CPF ${cpfMascarado(s.cpf)} · ${s.quando.toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}`, f, 6.5],
    [`IP ${s.ip} · verificação ${s.codigo}`, f, 6.5],
  ];
  let yy = y + h - 11;
  for (const [t, font, size] of linhas) { p.drawText(t, { x: x + 5, y: yy, size, font, color: VERDE, maxWidth: w - 10 }); yy -= size + 4; }
  return Buffer.from(await d.save({ useObjectStreams: false }));
}

export interface LinhaManifesto { papel: string; nome: string; cpf: string; metodo: string; quando: Date | null; ip?: string | null; emissor?: string | null; status: string }

/** Manifesto de assinaturas (Anexo VII): arquivo separado, com o hash da versão final e QR da verificação pública */
export async function renderManifesto(o: { numero: string; codigo: string; sha256: string; url: string; marca: string; empreendimento: string; linhas: LinhaManifesto[]; emitidoEm: Date }): Promise<Buffer> {
  const d = await PDFDocument.create();
  d.setTitle(`Manifesto de assinaturas — ${o.numero}`);
  const m = await embutirMarca(d, o.marca);
  const f = await d.embedFont(StandardFonts.Helvetica), fb = await d.embedFont(StandardFonts.HelveticaBold), mono = await d.embedFont(StandardFonts.Courier);
  const p: PDFPage = d.addPage([595.28, 841.89]);
  const { topo } = desenharMarca(p, m);
  const X0 = 62, X1 = 595.28 - 62;
  let y = topo - 6;
  p.drawText('ANEXO VII — MANIFESTO DE ASSINATURAS', { x: X0, y, size: 12, font: fb, color: VERDE });
  y -= 16;
  p.drawText(`Contrato n.º ${o.numero} · ${o.empreendimento}`, { x: X0, y, size: 8.5, font: f, color: CINZA });
  y -= 22;
  p.drawText('Código de verificação', { x: X0, y, size: 7, font: f, color: CINZA });
  p.drawText(o.codigo, { x: X0, y: y - 12, size: 11, font: fb, color: VERDE });
  p.drawText('SHA-256 da versão final assinada', { x: X0 + 150, y, size: 7, font: f, color: CINZA });
  p.drawText(o.sha256.slice(0, 32), { x: X0 + 150, y: y - 11, size: 7.5, font: mono });
  p.drawText(o.sha256.slice(32), { x: X0 + 150, y: y - 20, size: 7.5, font: mono });
  const qr = await d.embedPng(Buffer.from((await QRCode.toDataURL(o.url, { margin: 0, width: 300 })).split(',')[1], 'base64'));
  p.drawImage(qr, { x: X1 - 64, y: y - 50, width: 64, height: 64 });
  y -= 70;
  const cols = [{ t: 'Papel', w: 92 }, { t: 'Nome / CPF', w: 150 }, { t: 'Método', w: 88 }, { t: 'Data/hora · IP · certificado', w: X1 - X0 - 330 }];
  p.drawRectangle({ x: X0, y: y - 13, width: X1 - X0, height: 14, color: VERDE });
  let x = X0;
  for (const c of cols) { p.drawText(c.t, { x: x + 3, y: y - 9.5, size: 7, font: fb, color: rgb(1, 1, 1) }); x += c.w; }
  y -= 14;
  o.linhas.forEach((l, i) => {
    const h = 34;
    if (i % 2) p.drawRectangle({ x: X0, y: y - h, width: X1 - X0, height: h, color: CREME });
    const quando = l.quando ? l.quando.toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' }) : 'pendente';
    const celulas: string[][] = [
      [ROTULO_PAPEL[l.papel] ?? l.papel],
      [l.nome, `CPF ${cpfMascarado(l.cpf)}`],
      [ROTULO_METODO[l.metodo] ?? l.metodo],
      [quando, l.ip ? `IP ${l.ip}` : '', l.emissor ? `Certificado: ${l.emissor}` : ''].filter(Boolean),
    ];
    let cx = X0;
    celulas.forEach((linhas, j) => {
      linhas.forEach((t, k) => p.drawText(t, { x: cx + 3, y: y - 10 - k * 9, size: 6.6, font: k === 0 && j === 1 ? fb : f, maxWidth: cols[j].w - 6 }));
      cx += cols[j].w;
    });
    y -= h;
  });
  y -= 16;
  for (const t of [
    `Verificação pública: ${o.url} — envie o PDF para conferir o SHA-256.`,
    'Avançada: link individual + código enviado ao WhatsApp do signatário, leitura integral e aceite (MP 2.200-2/2001, art. 10, § 2º).',
    'ICP-Brasil e gov.br: assinaturas digitais incrementais no próprio arquivo, conferíveis no painel do leitor de PDF.',
    `Emitido em ${o.emitidoEm.toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}.`,
  ]) { p.drawText(t, { x: X0, y, size: 7, font: f, color: CINZA, maxWidth: X1 - X0 }); y -= 11; }
  return Buffer.from(await d.save({ useObjectStreams: false }));
}
