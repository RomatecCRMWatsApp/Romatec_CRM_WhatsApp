import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { localizarAssinaturas } from './assinatura/autoPosicao';
import { anexoDocumentosPartes } from './contratos/anexosLote';

const TRACO = '_'.repeat(58);

async function pdfComNomes() {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.HelveticaBold), r = await d.embedFont(StandardFonts.Helvetica);
  const p1 = d.addPage([595, 842]);
  // Qualificação (nome no meio do parágrafo): não conta
  p1.drawText('PROMISSARIA COMPRADORA: MARIA FICTICIA DE TESTE, brasileira, solteira', { x: 60, y: 700, size: 10, font: r });
  // Quadro-Resumo: a gestora numa célula de tabela, sem traço em cima — não conta (era o erro do BJ-2026-0002, p. 1)
  p1.drawText('ROMATEC CONSULTORIA TOTAL - CNPJ 17.261.987/0001-09 - CRECI/MA', { x: 200, y: 640, size: 9, font: r });
  p1.drawText(TRACO.slice(0, 40), { x: 60, y: 312, size: 9, font: r });
  p1.drawText('MARIA FICTICIA DE TESTE', { x: 60, y: 300, size: 9, font: f });
  p1.drawText(TRACO.slice(0, 40), { x: 320, y: 312, size: 9, font: r });
  p1.drawText('ANA PROPRIETARIA FICTICIA', { x: 320, y: 300, size: 9, font: f });
  const p2 = d.addPage([595, 842]);
  // Texto logo acima do traço: a caixa encolhe para não cobrir
  p2.drawText('Assinatura digital (ICP-Brasil / gov.br) ou a punho', { x: 60, y: 300, size: 9, font: r });
  p2.drawText(TRACO, { x: 60, y: 262, size: 9, font: r });
  p2.drawText('MARIA FICTICIA DE TESTE', { x: 60, y: 250, size: 9, font: f });
  p2.drawText(TRACO, { x: 60, y: 162, size: 9, font: r });
  p2.drawText('ROMATEC CONSULTORIA TOTAL — GESTORA DE VENDAS E INTERMEDIADORA'.replace('—', '-'), { x: 60, y: 150, size: 9, font: f });
  // Documento anexado (conta de luz com o nome da compradora numa linha só, sem traço): não conta (p. 44 do BJ-2026-0002)
  const p3 = d.addPage([595, 842]);
  p3.drawText('MARIA FICTICIA DE TESTE', { x: 60, y: 760, size: 9, font: f });
  p3.drawText('MARIA FICTICIA DE TESTE', { x: 60, y: 120, size: 9, font: f });
  // Bloco que caiu no topo da página, colado no cabeçalho (p. 16 do BJ-2026-0002): sem espaço em cima, a caixa vai logo abaixo do bloco
  const p4 = d.addPage([595, 842]);
  // Cabeçalho da marca (faixa de imagem no topo)
  const cab = await d.embedPng(await sharp({ create: { width: 600, height: 80, channels: 3, background: '#2a5' } }).png().toBuffer());
  p4.drawImage(cab, { x: 40, y: 772, width: 515, height: 66 });
  p4.drawText(TRACO, { x: 60, y: 760, size: 9, font: r });
  p4.drawText('ANA PROPRIETARIA FICTICIA', { x: 60, y: 748, size: 9, font: f });
  return Buffer.from(await d.save());
}

describe('assinaturas posicionadas pelos nomes', () => {
  const sigs = [
    { papel: 'comprador', nome: 'Maria Ficticia de Teste' }, { papel: 'vendedora', nome: 'ANA PROPRIETARIA FICTICIA' },
    { papel: 'intermediadora', nome: 'José Romário Pinto Bezerra', apelidos: ['Romatec Consultoria Total'] },
  ];
  it('só a linha com o nome logo abaixo de um traço de assinatura: tabela, parágrafo e documento anexado não contam; bloco no topo da página assina embaixo', async () => {
    const cx = await localizarAssinaturas(await pdfComNomes(), sigs);
    expect(cx.map(c => `${c.papel}:${c.pagina}`).sort()).toEqual(['comprador:1', 'comprador:2', 'intermediadora:2', 'vendedora:1', 'vendedora:4']);
    const topo = cx.find(c => c.pagina === 4)!;
    expect((topo.y + topo.h) * 842).toBeLessThan(748 - 2); // abaixo do nome, sem cobrir
    expect(topo.y * 842).toBeGreaterThan(842 * 0.07);
    const c1 = cx.find(c => c.papel === 'comprador' && c.pagina === 1)!;
    expect(c1.y * 842).toBeGreaterThan(312); // em cima do traço
    expect(c1.y * 842).toBeLessThan(318);
    expect(c1.x).toBeCloseTo(60 / 595, 2);
  });
  it('a caixa nunca cobre o texto de cima nem outra caixa', async () => {
    const cx = await localizarAssinaturas(await pdfComNomes(), sigs);
    const c2 = cx.find(c => c.papel === 'comprador' && c.pagina === 2)!;
    expect((c2.y + c2.h) * 842).toBeLessThan(300 - 1); // abaixo da linha "Assinatura digital…"
    for (const a of cx) for (const b of cx) if (a !== b && a.pagina === b.pagina) {
      const sobre = Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
      expect(sobre).toBe(false);
    }
  });
  it('caixas repetidas (salvas à mão + automáticas) viram uma só', async () => {
    const { caixasSemSobreposicao } = await import('./assinatura/autoPosicao');
    const a = { papel: 'vendedora', pagina: 15, x: 0.31, y: 0.2, w: 0.4, h: 0.045 };
    const b = { papel: 'vendedora', pagina: 15, x: 0.32, y: 0.215, w: 0.28, h: 0.05 };
    const c = { papel: 'vendedora', pagina: 18, x: 0.31, y: 0.2, w: 0.4, h: 0.045 };
    expect(caixasSemSobreposicao([a, b, c])).toEqual([a, c]);
  });
});

describe('traços desenhados (PDFs antigos e anexos fixos)', () => {
  it('linha vetorial e retângulo fino valem como traço; papel escrito ("VENDEDORA") vale; contorno de carimbo não', async () => {
    const { rgb } = await import('pdf-lib');
    const d = await PDFDocument.create();
    const f = await d.embedFont(StandardFonts.HelveticaBold);
    const p = d.addPage([595, 842]);
    // Termo/intermediação antigos: traço vetorial + nome
    p.drawLine({ start: { x: 62, y: 400 }, end: { x: 283, y: 400 }, thickness: 0.6 });
    p.drawText('MARIA FICTICIA DE TESTE', { x: 62, y: 389, size: 8.6, font: f });
    // Anexo VIII: retângulo fino + papel escrito
    p.drawRectangle({ x: 320, y: 400, width: 200, height: 0.75, color: rgb(0, 0, 0) });
    p.drawText('VENDEDORA', { x: 390, y: 389, size: 9, font: f });
    // Carimbo antigo (caixa com borda) com o nome dentro: não é linha de assinatura
    p.drawRectangle({ x: 62, y: 200, width: 220, height: 40, borderColor: rgb(0.8, 0.6, 0.2), borderWidth: 0.8 });
    p.drawText('ANA PROPRIETARIA FICTICIA', { x: 67, y: 225, size: 8, font: f });
    const cx = await localizarAssinaturas(Buffer.from(await d.save()), [
      { papel: 'comprador', nome: 'Maria Ficticia de Teste' }, { papel: 'vendedora', nome: 'ANA PROPRIETARIA FICTICIA' },
    ]);
    expect(cx.map(c => c.papel).sort()).toEqual(['comprador', 'vendedora']);
    for (const c of cx) expect(Math.abs(c.y * 842 - 402)).toBeLessThan(2); // em cima do traço
  });
});

describe('Anexo X — documentos das partes', () => {
  it('capa com índice + cada documento (JPG, WEBP e PDF); sem documentos não entra', async () => {
    expect(await anexoDocumentosPartes({ ctr_numero: 'BJ-2026-0002' } as any, 'bomjardims', [])).toBeNull();
    const jpg = await sharp({ create: { width: 400, height: 250, channels: 3, background: '#ccddee' } }).jpeg().toBuffer();
    const webp = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#eeddcc' } }).webp().toBuffer();
    const pdfDoc = await PDFDocument.create(); pdfDoc.addPage(); pdfDoc.addPage();
    const pdf = Buffer.from(await pdfDoc.save());
    const out = await anexoDocumentosPartes({ ctr_numero: 'BJ-2026-0002' } as any, 'bomjardims', [
      { rotulo: 'Documento com foto (RG/CNH) — Maria (comprador(a))', nome: 'cnh.jpg', mime: 'image/jpeg', conteudo: jpg },
      { rotulo: 'Comprovante de endereço — Maria (comprador(a))', nome: 'conta.webp', mime: 'image/webp', conteudo: webp },
      { rotulo: 'CPF — Maria', nome: 'cpf.pdf', mime: 'application/pdf', conteudo: pdf },
    ]);
    expect((await PDFDocument.load(out!)).getPageCount()).toBe(1 + 1 + 1 + 2);
  });
});
