import { describe, expect, it } from 'vitest';
import { docDeclaracaoConcessao, docTermoConcessao } from './contratos/docsComissao';
import { localizarAssinaturas } from './assinatura/autoPosicao';
import { naturezaConcessao, planoEscolhido } from './contratos/servico';

// Concessão: Termo Aditivo + Declaração de Recebimento e Quitação (liberalidade ou acordo). Dados fictícios.
const c: any = { precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625, jurosAaEfetivo: 0.06, metodo: 'PRICE', prazos: [12, 24, 36, 60, 120], comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5 };
const ctx: any = {
  ctr_numero: 'BJ-2026-0099', emp_nome: 'Condomínio de Chácaras Bom Jardims', lote_codigo: 'D16', lote_quadra: 'D', lote_numero: '16', lote_area_m2: '3.155,71',
  vend_nome: 'ANA PROPRIETARIA FICTICIA', vend_cpf: '111.444.777-35', comp_nome: 'CARLOS BENEFICIARIO FICTICIO', comp_cpf: '529.982.247-25',
  comp_casado: true, conj_nome: 'BEATRIZ CONJUGE FICTICIA', conj_cpf: '390.533.447-05', ctr_data_extenso: '14 de novembro de 2026',
};
const texto = async (pdf: Buffer) => {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise;
  let t = '';
  for (let n = 1; n <= doc.numPages; n++) t += (await (await doc.getPage(n)).getTextContent()).items.map((i: any) => i.str).join('') + ' ';
  return t.replace(/\s+/g, '');
};
const plano = (k: any) => {
  const p = planoEscolhido({ modalidade: 'avista', entradaParcelas: 1, dataPrimeiroPagamento: '2026-11-20', condicao: 'padrao' }, 3155.71, 160000, c, false);
  return { ...p, preco_avista: 165000, concessao: { motivo: '', comissaoValor: 7500, comissaoPrazo: 'Pix', despesasPor: 'beneficiario' as const, ...k } };
};
const sigs = [
  { papel: 'vendedora', nome: 'ANA PROPRIETARIA FICTICIA' }, { papel: 'comprador', nome: 'Carlos Beneficiario Ficticio' },
  { papel: 'conjuge', nome: 'Beatriz Conjuge Ficticia' }, { papel: 'intermediadora', nome: 'José Romário Pinto Bezerra', apelidos: ['Romatec Consultoria Total'] },
];

describe('declaração de recebimento da concessão', () => {
  it('acordo: termo em dação em pagamento; declaração de recebimento e quitação do acordo descrito', async () => {
    const p = plano(naturezaConcessao({ natureza: 'acordo', acordo: 'verbas do acordo de encerramento do contrato de trabalho mantido com a proprietária' }));
    const t = await texto(await docTermoConcessao(ctx, p, 'bomjardims'));
    expect(t).toMatch(/CONCESSÃOEMPAGAMENTO\(ACORDO\)/);
    expect(t).toMatch(/daçãoempagamento—CódigoCivil,arts\.356a359/);
    const pdf = await docDeclaracaoConcessao(ctx, p, 'bomjardims');
    const d = await texto(pdf);
    expect(d).toMatch(/DECLARAÇÃODERECEBIMENTOEQUITAÇÃO/);
    expect(d).toMatch(/quitaçãodasobrigaçõesdescritasnoitem2/);
    expect(d).toMatch(/verbasdoacordodeencerramentodocontratodetrabalho/);
    expect(d).toMatch(/CLT,arts\.855-Ba855-E/);
    const cx = await localizarAssinaturas(pdf, sigs);
    expect(new Set(cx.map(x => x.papel))).toEqual(new Set(['comprador', 'conjuge', 'vendedora']));
  });

  it('liberalidade: declara que não é salário nem pagamento de dívida; termo segue como doação', async () => {
    const p = plano(naturezaConcessao({ natureza: 'liberalidade' }));
    expect(await texto(await docTermoConcessao(ctx, p, 'bomjardims'))).toMatch(/CONCESSÃOPORLIBERALIDADE/);
    const d = await texto(await docDeclaracaoConcessao(ctx, p, 'bomjardims'));
    expect(d).toMatch(/atodeliberalidadedaPROPRIETÁRIA/);
    expect(d).toMatch(/nãocorrespondeasalário/);
  });

  it('termo: as quatro partes têm linha de assinatura localizável (nome centralizado embaixo do traço)', async () => {
    const cx = await localizarAssinaturas(await docTermoConcessao(ctx, plano({ natureza: 'liberalidade' }), 'bomjardims'), sigs);
    expect(new Set(cx.map(x => x.papel))).toEqual(new Set(['vendedora', 'comprador', 'conjuge', 'intermediadora']));
  });

  it('acordo sem descrição é recusado', () => {
    expect(() => naturezaConcessao({ natureza: 'acordo', acordo: '' })).toThrow(/Descreva o acordo/);
  });
});
