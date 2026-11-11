import { describe, expect, it } from 'vitest';
import { docTermoCongelamento } from './contratos/docsComissao';
import { localizarAssinaturas } from './assinatura/autoPosicao';
import { planoEscolhido } from './contratos/servico';

const c: any = { precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625, jurosAaEfetivo: 0.06, metodo: 'PRICE', prazos: [12, 24, 36, 60, 120], comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5 };

describe('termo de anuência da proprietária ao congelamento (Plano C)', () => {
  it('traz o valor, as parcelas, o mês e o 1º vencimento; a proprietária, a compradora e a gestora têm linha de assinatura localizável', async () => {
    const plano = planoEscolhido({ modalidade: 'financiado', entradaParcelas: 1, prazo: 120, dataPrimeiroPagamento: '2026-11-20', condicao: 'C', modoC: 'congelado', inicioComplemento: 15 }, 3025.11, 160000, c, true);
    const ctx: any = { ctr_numero: 'BJ-2026-0002', emp_nome: 'Condomínio de Chácaras Bom Jardims', lote_codigo: 'D16', lote_area_m2: '3.025,11', vend_nome: 'ANA PROPRIETARIA FICTICIA', vend_cpf: '111.444.777-35',
      comp_nome: 'MARIA FICTICIA DE TESTE', comp_cpf: '529.982.247-25', ctr_data_extenso: '11 de novembro de 2026' };
    const pdf = await docTermoCongelamento(ctx, plano, 'bomjardims');
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise;
    let texto = '';
    for (let n = 1; n <= doc.numPages; n++) texto += (await (await doc.getPage(n)).getTextContent()).items.map((i: any) => i.str).join('') + ' ';
    texto = texto.replace(/\s+/g, '');
    expect(texto).toMatch(/anuiexpressamenteaocongelamentodocomplementodaentrada/);
    expect(texto).toMatch(/38\.000,00/);
    expect(texto).toMatch(/no15ºmêscontadodopagamentodovalordoato/);
    expect(texto).toMatch(/20\/02\/2028/);
    const cx = await localizarAssinaturas(pdf, [{ papel: 'vendedora', nome: 'ANA PROPRIETARIA FICTICIA' }, { papel: 'comprador', nome: 'Maria Ficticia de Teste' }, { papel: 'intermediadora', nome: 'José Romário Pinto Bezerra', apelidos: ['Romatec Consultoria Total'] }]);
    expect(new Set(cx.map(x => x.papel))).toEqual(new Set(['vendedora', 'comprador', 'intermediadora']));
  });
});
