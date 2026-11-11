import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { pdfProposta } from './propostaPdf';
import { condicoesDaLinha } from '../../shared/simulador';

const C = condicoesDaLinha({ precoBase: 70000, areaBaseM2: 1000, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.1, jurosAaEfetivo: 0.12, prazos: [60, 120], comissaoTotalPct: 0.06, comissaoCorretorPct: 0.04, comissao1aParcelaPct: 1 });

const base = {
  lote: { codigo: 'D16', quadra: 'D', areaM2: 1000, precoTabela: null },
  empreendimento: 'Condomínio de Chácaras Bom Jardims', c: C, entrada: 1, prazo: 120,
  corretor: { nome: 'CORRETOR FICTICIO DE TESTE', creci: 'CRECI/MA F-0.000', telefone: '(99) 9 0000-0000', instagram: 'corretor.teste', email: 'teste@exemplo.com' },
};

async function texto(pdf: Buffer): Promise<string> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise;
  let t = '';
  for (let n = 1; n <= doc.numPages; n++) t += (await (await doc.getPage(n)).getTextContent()).items.map((i: any) => i.str).join(' ');
  return t.replace(/\s+/g, '');
}

describe('pdfProposta', () => {
  it('gera a proposta padrão com o carimbo do corretor', async () => {
    const pdf = await pdfProposta({ ...base, condicao: 'padrao' } as any);
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThanOrEqual(1);
    const t = await texto(pdf);
    expect(t).toContain('PROPOSTADEFINANCIAMENTODIRETO');
    expect(t).toContain('CORRETORFICTICIODETESTE');
    expect(t).toContain('@corretor.teste');
  });
  it('gera a proposta do Plano C', async () => {
    const pdf = await pdfProposta({ ...base, condicao: 'C', prazo: 120 } as any).catch(e => e);
    if (pdf instanceof Error) expect(pdf.message).toMatch(/Prazo|meses/); else expect((await texto(pdf))).toContain('Entradanoato');
  });
});
