import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { localizarAssinaturas } from './assinatura/autoPosicao';
import { anexoDocumentosPartes } from './contratos/anexosLote';

async function pdfComNomes() {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.HelveticaBold), r = await d.embedFont(StandardFonts.Helvetica);
  const p1 = d.addPage([595, 842]);
  // Qualificação (nome no meio do parágrafo): não conta
  p1.drawText('PROMISSARIA COMPRADORA: SYLVIA KELLY COELHO PEREIRA, brasileira, solteira', { x: 60, y: 700, size: 10, font: r });
  p1.drawText('SYLVIA KELLY COELHO PEREIRA', { x: 60, y: 300, size: 9, font: f });
  p1.drawText('VALMA MARILDA BONJARDIM FIGUEREDO', { x: 320, y: 300, size: 9, font: f });
  const p2 = d.addPage([595, 842]);
  p2.drawText('SYLVIA KELLY COELHO PEREIRA', { x: 60, y: 250, size: 9, font: f });
  p2.drawText('ROMATEC CONSULTORIA TOTAL — GESTORA DE VENDAS E INTERMEDIADORA'.replace('—', '-'), { x: 60, y: 150, size: 9, font: f });
  return Buffer.from(await d.save());
}

describe('assinaturas posicionadas pelos nomes', () => {
  it('uma caixa em cada linha de assinatura com o nome (todas as páginas); nome no parágrafo não conta', async () => {
    const cx = await localizarAssinaturas(await pdfComNomes(), [
      { papel: 'comprador', nome: 'Sylvia Kelly Coelho Pereira' }, { papel: 'vendedora', nome: 'VALMA MARILDA BONJARDIM FIGUEREDO' },
      { papel: 'intermediadora', nome: 'José Romário Pinto Bezerra', apelidos: ['Romatec Consultoria Total'] },
    ]);
    const resumo = cx.map(c => `${c.papel}:${c.pagina}`).sort();
    expect(resumo).toEqual(['comprador:1', 'comprador:2', 'intermediadora:2', 'vendedora:1']);
    const c1 = cx.find(c => c.papel === 'comprador' && c.pagina === 1)!;
    expect(c1.y).toBeGreaterThan(300 / 842); // logo acima do nome
    expect(c1.y).toBeLessThan(330 / 842);
    expect(c1.x).toBeCloseTo(60 / 595, 2);
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
      { rotulo: 'Documento com foto (RG/CNH) — Sylvia (comprador(a))', nome: 'cnh.jpg', mime: 'image/jpeg', conteudo: jpg },
      { rotulo: 'Comprovante de endereço — Sylvia (comprador(a))', nome: 'conta.webp', mime: 'image/webp', conteudo: webp },
      { rotulo: 'CPF — Sylvia', nome: 'cpf.pdf', mime: 'application/pdf', conteudo: pdf },
    ]);
    expect((await PDFDocument.load(out!)).getPageCount()).toBe(1 + 1 + 1 + 2);
  });
});
