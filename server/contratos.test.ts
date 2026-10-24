import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { readFile } from 'node:fs/promises';
import { simular } from '../shared/simulador';
import { planoDoContrato } from './contratos/plano';
import { montarContexto, type EntradaContexto } from './contratos/contexto';
import { avaliarGate } from './contratos/gate';
import { aplicarMarca } from './contratos/render';
import { brl } from './contratos/formato';
import { SEED_EMP_JURIDICO } from './_core/migrations/seedContratos';

const C = {
  precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625,
  descontoAvistaTotal: 10000, jurosAaEfetivo: 0.06, metodo: 'PRICE' as const, prazos: [12, 24, 36, 60, 120],
  comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5,
};
const planoA01 = () => planoDoContrato(simular(3025.11, 6, C), { modalidade: 'financiado', prazo: 120, dataPrimeiroPagamento: '2026-11-10' }, C, false);

function entrada(over: Partial<EntradaContexto> = {}): EntradaContexto {
  return {
    contrato: { numero: 'BJ-2026-0001', codigoVerificacao: 'ABCDEFGHJKLM', modoAssinatura: 'eletronica', dataGeracao: '2026-10-24' },
    juridico: { defaults: SEED_EMP_JURIDICO.defaults, vendedoraTipo: 'PF', vendedora: SEED_EMP_JURIDICO.vendedora, modeloVersao: 'CPCV-BJ v2.0' },
    lote: { codigo: 'A01', quadra: 'A', numero: 1, areaM2: 3025.11, perimetroM: 220.01, descricao: 'x', viaFrente: 'Rua 03', matricula: '' },
    plano: planoA01(),
    comprador: { nome: 'Fulano de Tal', cpfCnpj: '52998224725', estadoCivil: 'casado', regimeBens: 'comunhao_parcial', logradouro: 'Rua A', numero: '1', cidade: 'Açailândia', uf: 'MA' },
    conjuge: { nome: 'Beltrana de Tal', cpfCnpj: '11144477735', sexo: 'F' },
    corretor: { nome: 'José', cpf: '', creci: '4.705', creciUf: 'MA', creciValidade: '2027-03-31', certidaoCodigo: '1', certidaoEmissao: '2026-10-20', certidaoValidade: '2026-11-19' },
    ...over,
  };
}

describe('plano do contrato (A01, entrada 6× + 120×)', () => {
  it('total a pagar = R$ 196.141,20 (igual ao simulador e à proposta); tabela soma o mesmo total', () => {
    const p = planoA01();
    expect(brl(p.total_pagar)).toBe('196.141,20');
    expect(brl(p.total_juros)).toBe('36.141,20');
    expect(p.saldo_parcela).toBe(1234.51);
    const soma = p.parcelas.reduce((s, l) => s + l.valor, 0);
    expect(Math.round(soma * 100) / 100).toBe(196141.2);
    expect(p.parcelas).toHaveLength(126);
    expect(p.parcelas.every(l => l.tipo !== 'saldo' || l.valor === 1234.51)).toBe(true);
    expect(p.parcelas.at(-1)!.saldoDevedor).toBe(0);
    expect(p.saldo_venc1).toBe('2027-05-10');
  });

  it('à vista total: parcela única de R$ 150.000,00, comissão 100% sobre o valor à vista', () => {
    const p = planoDoContrato(simular(3025.11, 1, C), { modalidade: 'avista', dataPrimeiroPagamento: '2026-11-10' }, C, true);
    expect(p.total_pagar).toBe(150000);
    expect(p.parcelas).toHaveLength(1);
    expect(p.comissao_total).toBe(7500);
  });
});

describe('contexto e gate', () => {
  it('cônjuge entra quando casado; corretor parceiro só quando informado', () => {
    const ctx = montarContexto(entrada());
    expect(ctx.comp_casado).toBe(true);
    expect(ctx.conj_nome).toBe('BELTRANA DE TAL');
    expect(ctx.conj_regime_bens).toBe('comunhão parcial de bens');
    expect(ctx.comp_cpf).toBe('529.982.247-25');
    expect(ctx.corr_parceiro).toBe(false);
    expect(ctx.plano_total_pagar).toBe('196.141,20');
  });

  it('minuta passa; definitivo bloqueado sem registro do parcelamento (Lei 6.766, art. 37)', () => {
    const ctx = montarContexto(entrada());
    expect(avaliarGate(ctx, 'minuta', new Date('2026-10-24')).ok).toBe(true);
    const g = avaliarGate(ctx, 'definitivo', new Date('2026-10-24'));
    expect(g.ok).toBe(false);
    expect(g.bloqueios.join()).toMatch(/Parcelamento não registrado/);
    expect(g.faltantes).toContain('emp_matricula_empreendimento');
  });

  it('definitivo: matrícula de origem e credencial vencida bloqueiam', () => {
    const ctx = montarContexto(entrada({ overrides: { emp_matricula_empreendimento: '33.036', emp_parcelamento_registrado: true } }));
    const g = avaliarGate(ctx, 'definitivo', new Date('2026-12-01'));
    expect(g.bloqueios.join()).toMatch(/Matrícula de origem/);
    expect(g.bloqueios.join()).toMatch(/Certidão de regularidade/);
  });

  it('casado sem cônjuge informado: minuta acusa falta', () => {
    const ctx = montarContexto(entrada({ conjuge: null }));
    expect(avaliarGate(ctx, 'minuta').faltantes).toEqual(expect.arrayContaining(['conj_nome', 'conj_cpf']));
  });
});

describe('anexos da unidade (I memorial, V mapa, VI licença)', () => {
  it('memorial e mapa saem da geometria do DXF; sem o PDF da LO, o Anexo VI vira página "a anexar"', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const { anexoLicenca, anexoMapa, anexoMemorial } = await import('./contratos/anexosLote');
    const { memorialDoLote } = await import('./lotes/memorial');
    const q = (e: number, n: number): [number, number][] => [[e, n], [e + 55, n], [e + 55, n - 55], [e, n - 55]];
    const lote = { codigo: 'A01', quadra: 'A', numero: 1, areaM2: 3025, perimetroM: 220, verticesUtm: q(236000, 9455000) };
    const vizinho = { codigo: 'A02', quadra: 'A', numero: 2, areaM2: 3025, perimetroM: 220, verticesUtm: q(236055, 9455000) };
    const memorial = memorialDoLote(lote, [lote, vizinho], { nome: 'Bom Jardims', fuso: 23 });
    expect(memorial.vertices.some(v => /Lote 02 da Quadra A/.test(v.confronta))).toBe(true);
    const unidade = { ...lote, memorial, outros: [vizinho], perimetroUtm: q(235900, 9455100).map(([e, n]) => [e * 1, n] as [number, number]), ruas: [], fuso: 23 };
    const ctx = montarContexto(entrada());
    for (const pdf of [await anexoMemorial(unidade, ctx, 'bomjardims'), await anexoMapa(unidade, ctx, 'bomjardims')]) {
      expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThanOrEqual(1);
    }
    expect((await PDFDocument.load(await anexoLicenca(ctx, 'bomjardims'))).getPageCount()).toBe(1);
    const lo = Buffer.from('%PDF-LO');
    expect(await anexoLicenca(ctx, 'bomjardims', lo)).toBe(lo);
  });
});

describe('marca do empreendimento', () => {
  it('troca cabeçalho, marca d\'água e rodapé do modelo pelos PNGs da marca', async () => {
    const zip = new PizZip(await readFile('templates/MODELO-CPCV-BOM-JARDIMS-v2.docx'));
    await aplicarMarca(zip, 'bomjardims');
    const cab = await readFile('templates/marca/bomjardims/cabecalho.png');
    expect(Buffer.from(zip.file('word/media/image1.png')!.asUint8Array()).equals(cab)).toBe(true);
    await expect(aplicarMarca(zip, '../x')).rejects.toThrow(/Marca inválida/);
  });
});
