/**
 * Formulário de recrutamento para preencher fora do sistema: PDF (imprimir/preencher à mão) e DOC (Word),
 * com os mesmos campos do formulário do link e a lista dos documentos a anexar.
 */
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ROTULO_PERFIL_RECRUTAMENTO, documentosDoPerfil, type PerfilRecrutamento } from '../../shared/recrutamento';

interface Secao { titulo: string; campos: string[]; nota?: string }
export interface OpcoesFormulario { nome?: string | null; empreendimento?: string | null }

/** Marca da plataforma (não do empreendimento): rosa + wordmark do Romatec CRM */
export const MARCA = { nome: 'Romatec Consultoria Total', linha: 'CRM · Consultoria Imobiliária', cnpj: 'CNPJ 17.261.987/0001-09', endereco: 'Rua São Raimundo, 10, Centro — Açailândia/MA' };
const cacheMarca = new Map<string, Promise<Buffer | null>>();
/** Logo reduzido (PNG na largura pedida) — o original tem 1.664 px e deixaria o PDF/DOC pesado para o WhatsApp */
function marca(nome: string, largura: number): Promise<Buffer | null> {
  const chave = `${nome}@${largura}`;
  if (!cacheMarca.has(chave)) {
    cacheMarca.set(chave, (async () => {
      const orig = arquivoMarca(nome);
      if (!orig) return null;
      try { const sharp = (await import('sharp')).default; return await sharp(orig).resize({ width: largura }).png({ compressionLevel: 9 }).toBuffer(); } catch { return orig; }
    })());
  }
  return cacheMarca.get(chave)!;
}
function arquivoMarca(nome: string): Buffer | null {
  for (const raiz of [path.resolve('dist/public/brand'), path.resolve('client/public/brand')]) {
    try { return fs.readFileSync(path.join(raiz, nome)); } catch { /* tenta a próxima */ }
  }
  return null;
}

export function secoesDoFormulario(perfil: PerfilRecrutamento): Secao[] {
  return [
    {
      titulo: 'Dados pessoais',
      campos: ['Nome completo', 'CPF', 'RG e órgão emissor', 'Sexo', 'Nacionalidade', 'Profissão', 'Estado civil', 'E-mail', 'Telefone / WhatsApp', 'Instagram (opcional)'],
    },
    ...(perfil === 'corretor' ? [{ titulo: 'CRECI', campos: ['Nº do CRECI', 'UF do CRECI'] }] : []),
    { titulo: 'Endereço', campos: ['CEP', 'Rua / avenida', 'Número', 'Complemento', 'Bairro', 'Cidade', 'UF'] },
    {
      titulo: 'Cônjuge ou companheiro(a)',
      nota: 'Só se for casado(a) ou em união estável.',
      campos: ['Nome completo', 'CPF', 'RG e órgão emissor', 'Profissão', 'Data de nascimento', 'Telefone', 'E-mail', 'Regime de bens (casamento)', 'Data do casamento / início da união'],
    },
  ];
}

const documentos = (perfil: PerfilRecrutamento) => documentosDoPerfil(perfil).map(d => `${d.rotulo}${d.obrigatorio ? ' (obrigatório)' : ' (opcional)'}`);
const DECLARACAO = 'Declaro que as informações acima são verdadeiras e autorizo a Romatec Consultoria Total a usá-las no meu cadastro e nos contratos em que eu atuar (Lei n.º 13.709/2018 — LGPD).';

/** PDF A4 com linhas para preencher */
export async function formularioPdf(perfil: PerfilRecrutamento, o: OpcoesFormulario = {}): Promise<Buffer> {
  const nome = o.nome;
  const pdf = await PDFDocument.create();
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const verde = rgb(0.05, 0.2, 0.13), dourado = rgb(0.79, 0.66, 0.3), cinza = rgb(0.35, 0.35, 0.35);
  let pg = pdf.addPage([595, 842]);
  let y = 800;
  const nova = () => { pg = pdf.addPage([595, 842]); y = 800; };
  const precisa = (h: number) => { if (y - h < 50) nova(); };
  // Cabeçalho com a marca da plataforma (Romatec CRM)
  const escuro = rgb(0.06, 0.07, 0.06);
  pg.drawRectangle({ x: 0, y: 772, width: 595, height: 70, color: escuro });
  const rosa = await marca('rosa-dark.png', 160), wordmark = await marca('wordmark-dourado.png', 480);
  let xm = 40;
  if (rosa) { const img = await pdf.embedPng(rosa); pg.drawImage(img, { x: xm, y: 780, width: 54, height: 54 * img.height / img.width }); xm += 64; }
  if (wordmark) { const img = await pdf.embedPng(wordmark); pg.drawImage(img, { x: xm, y: 800, width: 150, height: 150 * img.height / img.width }); }
  else pg.drawText('ROMATEC CONSULTORIA TOTAL', { x: xm, y: 806, size: 13, font: negrito, color: dourado });
  pg.drawText(MARCA.linha, { x: xm, y: 786, size: 9, font: negrito, color: dourado });
  y = 748;
  pg.drawText(`Formulário de cadastro — ${ROTULO_PERFIL_RECRUTAMENTO[perfil]}`, { x: 40, y, size: 15, font: negrito, color: verde });
  y -= 18;
  if (nome) { pg.drawText(`Candidato(a): ${nome}`, { x: 40, y, size: 10, font: fonte, color: cinza }); y -= 14; }
  if (o.empreendimento) { pg.drawText(`Convocação para atuar no empreendimento: ${o.empreendimento}`, { x: 40, y, size: 10, font: negrito, color: verde }); y -= 14; }
  pg.drawText(`Prestação de serviços à ${MARCA.nome} — consultoria imobiliária`, { x: 40, y, size: 9, font: fonte, color: cinza }); y -= 13;
  pg.drawText('Preencha com letra legível e devolva pelo WhatsApp junto com os documentos.', { x: 40, y, size: 9, font: fonte, color: cinza });
  y -= 22;
  for (const s of secoesDoFormulario(perfil)) {
    precisa(40);
    pg.drawText(s.titulo.toUpperCase(), { x: 40, y, size: 10, font: negrito, color: verde });
    y -= 4;
    pg.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.8, color: dourado });
    y -= 14;
    if (s.nota) { pg.drawText(s.nota, { x: 40, y, size: 8, font: fonte, color: cinza }); y -= 13; }
    for (const c of s.campos) {
      precisa(22);
      pg.drawText(`${c}:`, { x: 40, y, size: 9, font: fonte });
      const x0 = 40 + fonte.widthOfTextAtSize(`${c}:`, 9) + 6;
      pg.drawLine({ start: { x: x0, y: y - 2 }, end: { x: 555, y: y - 2 }, thickness: 0.4, color: cinza });
      y -= 20;
    }
    y -= 6;
  }
  precisa(30 + documentos(perfil).length * 14);
  pg.drawText('DOCUMENTOS PARA ANEXAR (foto ou PDF)', { x: 40, y, size: 10, font: negrito, color: verde });
  y -= 4;
  pg.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.8, color: dourado });
  y -= 14;
  for (const d of documentos(perfil)) {
    pg.drawRectangle({ x: 40, y: y - 2, width: 8, height: 8, borderColor: cinza, borderWidth: 0.7 });
    pg.drawText(d, { x: 54, y, size: 9, font: fonte });
    y -= 14;
  }
  y -= 10;
  precisa(90);
  const linhas = quebrar(DECLARACAO, fonte, 9, 515);
  for (const l of linhas) { pg.drawText(l, { x: 40, y, size: 9, font: fonte }); y -= 12; }
  y -= 30;
  pg.drawLine({ start: { x: 40, y }, end: { x: 300, y }, thickness: 0.6, color: cinza });
  pg.drawLine({ start: { x: 340, y }, end: { x: 555, y }, thickness: 0.6, color: cinza });
  y -= 12;
  pg.drawText('Assinatura', { x: 40, y, size: 8, font: fonte, color: cinza });
  pg.drawText('Local e data', { x: 340, y, size: 8, font: fonte, color: cinza });
  // Rodapé com os dados da plataforma em todas as páginas
  for (const p of pdf.getPages()) p.drawText(`${MARCA.nome} · ${MARCA.cnpj} · ${MARCA.endereco}`, { x: 40, y: 24, size: 7, font: fonte, color: cinza });
  return Buffer.from(await pdf.save());
}

function quebrar(texto: string, fonte: any, tam: number, larg: number): string[] {
  const out: string[] = [];
  let linha = '';
  for (const p of texto.split(' ')) {
    const t = linha ? `${linha} ${p}` : p;
    if (fonte.widthOfTextAtSize(t, tam) > larg && linha) { out.push(linha); linha = p; } else linha = t;
  }
  if (linha) out.push(linha);
  return out;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const par = (t: string, o: { negrito?: boolean; tam?: number; cor?: string } = {}) =>
  `<w:p><w:r><w:rPr>${o.negrito ? '<w:b/>' : ''}${o.cor ? `<w:color w:val="${o.cor}"/>` : ''}<w:sz w:val="${(o.tam ?? 11) * 2}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;

/** DOCX mínimo (Word/Google Docs/LibreOffice abrem): campos com linha para preencher */
export async function formularioDocx(perfil: PerfilRecrutamento, o: OpcoesFormulario = {}): Promise<Buffer> {
  const nome = o.nome;
  const logo = await marca('wordmark-dourado.png', 480);
  const corpo = [
    ...(logo ? [imagem('rIdLogo', 2286000, Math.round(2286000 * 465 / 1664))] : [par('ROMATEC CONSULTORIA TOTAL', { negrito: true, cor: 'C9A84C', tam: 12 })]),
    par(MARCA.linha, { negrito: true, cor: 'C9A84C', tam: 9 }),
    par(`Formulário de cadastro — ${ROTULO_PERFIL_RECRUTAMENTO[perfil]}`, { negrito: true, cor: '0C3320', tam: 16 }),
    ...(nome ? [par(`Candidato(a): ${nome}`)] : []),
    ...(o.empreendimento ? [par(`Convocação para atuar no empreendimento: ${o.empreendimento}`, { negrito: true, cor: '0C3320' })] : []),
    par(`Prestação de serviços à ${MARCA.nome} — consultoria imobiliária`, { cor: '5C6B5F', tam: 9 }),
    par('Preencha e devolva pelo WhatsApp junto com os documentos.', { cor: '5C6B5F', tam: 9 }),
    ...secoesDoFormulario(perfil).flatMap(s => [
      par(''), par(s.titulo.toUpperCase(), { negrito: true, cor: '0C3320' }),
      ...(s.nota ? [par(s.nota, { cor: '5C6B5F', tam: 9 })] : []),
      ...s.campos.map(c => par(`${c}: ________________________________________________`)),
    ]),
    par(''), par('DOCUMENTOS PARA ANEXAR (foto ou PDF)', { negrito: true, cor: '0C3320' }),
    ...documentos(perfil).map(d => par(`☐ ${d}`)),
    par(''), par(DECLARACAO, { tam: 9 }),
    par(''), par('Assinatura: ______________________________    Local e data: ____________________'),
    par(''), par(`${MARCA.nome} · ${MARCA.cnpj} · ${MARCA.endereco}`, { cor: '5C6B5F', tam: 8 }),
  ].join('');
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  if (logo) {
    zip.file('word/media/logo.png', logo);
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/></Relationships>');
  }
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${corpo}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

/** Imagem inline (logo) no DOCX; cx/cy em EMU */
function imagem(rid: string, cx: number, cy: number): string {
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Logo Romatec"/>`
    + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
    + `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}
