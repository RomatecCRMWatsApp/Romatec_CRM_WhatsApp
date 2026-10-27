import { describe, expect, it, vi } from 'vitest';
import { simular } from '../shared/simulador';
import { planoDoContrato } from './contratos/plano';
import { SEED_EMP_JURIDICO } from './_core/migrations/seedContratos';

// Contrato fictício sem banco (o mesmo formato que prepararModelo devolve)
const C = {
  precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625,
  descontoAvistaTotal: 10000, jurosAaEfetivo: 0.06, metodo: 'PRICE' as const, prazos: [12, 24, 36, 60, 120],
  comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5,
};
const plano = planoDoContrato(simular(3025.11, 6, C), { modalidade: 'financiado', prazo: 120, dataPrimeiroPagamento: '2026-11-10' }, C, false);
const corretor = { nome: 'José Romário Pinto Bezerra', cpf: '', creci: '4.705', creciUf: 'MA', creciValidade: '2027-03-31', certidaoCodigo: '', certidaoEmissao: '', certidaoValidade: '' };

vi.mock('./contratos/modelo', async orig => ({
  ...(await orig<any>()),
  prepararModelo: vi.fn(async () => {
    const { CLIENTE_EXEMPLO } = await orig<any>();
    return {
      emp: { id: 1, slug: 'bom-jardims' }, j: { marcaSlug: 'bomjardims', modeloVersao: 'CPCV-BJ v2.0' },
      lote: { codigo: 'A01', quadra: 'A', areaM2: 3025.11 }, plano, unidade: null,
      entrada: {
        contrato: { numero: 'BO-MODELO', codigoVerificacao: 'MODELO000000', modoAssinatura: 'eletronica', dataGeracao: '2026-10-25' },
        juridico: { defaults: SEED_EMP_JURIDICO.defaults, vendedoraTipo: 'PF', vendedora: SEED_EMP_JURIDICO.vendedora, modeloVersao: 'CPCV-BJ v2.0' },
        overrides: null, lote: { codigo: 'A01', quadra: 'A', numero: 1, areaM2: 3025.11, perimetroM: 220, descricao: 'Chácara A01', viaFrente: 'Rua 1', matricula: '' },
        plano, comprador: { ...CLIENTE_EXEMPLO.comprador }, conjuge: { ...CLIENTE_EXEMPLO.conjuge }, corretor,
        parceiro: { ...corretor, nome: 'Maria Corretora', creci: '1.234' },
      },
    };
  }),
}));
// Sem Asaas configurado: o beneficiário fica "pendente" (nunca um nome fixo no código)
vi.mock('./financeiro/servico', async orig => ({
  ...(await orig<any>()),
  beneficiarioDoEmpreendimento: vi.fn(async () => ({ texto: 'Beneficiário: conta Asaas do empreendimento (a configurar)', nome: '', cpfCnpj: '', agenciaConta: '', configurado: false })),
}));

describe('modelos em PDF da aba Contratos', () => {
  it('intermediação, carnê, boleto, recibo, tabela (Anexo II) e Diretrizes: PDFs prontos, sem dado pagável', async () => {
    const { modeloDocumento } = await import('./contratos/modelosDocs');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { PDFDocument } = await import('pdf-lib');
    const pasta = process.env.MODELOS_SAIDA;
    if (pasta) await mkdir(pasta, { recursive: true });
    // O Estatuto passa pelo LibreOffice (fora daqui); o texto dele é conferido no teste abaixo
    for (const tipo of ['intermediacao', 'carne', 'boleto', 'recibo', 'tabela', 'diretrizes'] as const) {
      const { pdf, nome } = await modeloDocumento(tipo, 'bom-jardims', 2);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(nome).toMatch(/-BOM-JARDIMS\.pdf$/);
      expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(0);
      if (pasta) await writeFile(`${pasta}/${nome}`, pdf);
    }
  }, 60_000);

  it('parâmetros da proprietária: rateio por unidade, R$ 100,00 e até 3 veículos no CPCV e no Estatuto', async () => {
    const { mergeDocx } = await import('./contratos/render');
    const { ESTATUTO } = await import('./contratos/anexos');
    const PizZip = (await import('pizzip')).default;
    const texto = async (modelo: string) => new PizZip(await mergeDocx(modelo, SEED_EMP_JURIDICO.defaults as any, { minuta: false, marca: 'bomjardims' }))
      .file('word/document.xml')!.asText().replace(/<[^>]+>/g, '');
    const cpcv = await texto('MODELO-CPCV-BOM-JARDIMS-v2.docx');
    expect(cpcv).toContain('R$ 100,00/mês por chácara, rateada igualmente por unidade');
    const est = await texto(ESTATUTO.arquivo);
    expect(est).toContain('rateadas igualmente por unidade');
    expect(est).toContain('até 3 (três) veículos');
    for (const t of [cpcv, est]) expect(t).not.toMatch(/proporcional(mente)? à área/);
    expect(SEED_EMP_JURIDICO.defaults.limite_veiculos).toBe(3);
  });

  it('Diretrizes de Uso: 45 itens, cada um com uma única opção válida, e a contribuição vem da configuração', async () => {
    const { readFile } = await import('node:fs/promises');
    const d = JSON.parse(await readFile('templates/diretrizes-uso-bom-jardims.json', 'utf8'));
    const itens = d.secoes.flatMap((s: any) => s.itens);
    expect(itens.map((i: any) => i[0])).toEqual(Array.from({ length: 45 }, (_, k) => k + 1));
    for (const i of itens) expect(['P', 'CC', 'PR']).toContain(i[2]);
    const { anexoDiretrizes } = await import('./contratos/anexos');
    const pdf = await anexoDiretrizes({ ...SEED_EMP_JURIDICO.defaults, ...SEED_EMP_JURIDICO.vendedora } as any, 'bomjardims');
    const { PDFDocument } = await import('pdf-lib');
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThanOrEqual(2);
    expect(d.parametros[0][1]).toContain('{{emp_contribuicao_mensal}}');
  });
});
