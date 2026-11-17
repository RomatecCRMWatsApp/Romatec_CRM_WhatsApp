/**
 * Caracterização da regra de atraso (multa 2%, juros 1% ao mês, recebimento até 59 dias).
 * Os valores esperados ficam escritos à mão, sem ler as constantes da implementação: se alguém mudar a regra num
 * lugar só, estes testes mostram o que passou a sair diferente no Asaas e no papel.
 */
import { describe, expect, it } from 'vitest';
import { payloadCobranca, payloadSegundaVia } from './financeiro/asaas';
import { CONTATO_PADRAO, INSTRUCOES_PAGAMENTO, instrucoesFicha } from './financeiro/render/documentos';
import { dadosLamina } from './financeiro/dados';
import { linhasComoPagarComissao } from './financeiro/render/comissao';
import { CLAUSULA_ATRASO_COMISSAO, PONTO_ATRASO_COMISSAO } from './financeiro/comissaoBeneficiario';

const baseCobranca = { customerId: 'cus_1', cobrancaId: 7, valor: 1234.5, vencimento: '2026-12-10', descricao: 'Parcela' };

describe('regra de atraso — o que vai para o Asaas', () => {
  it('cobrança normal: multa 2 e juros 1 (percentuais do Asaas, não frações)', () => {
    const p = payloadCobranca(baseCobranca);
    expect(p.fine).toEqual({ value: 2 });
    expect(p.interest).toEqual({ value: 1 });
  });
  it('2ª via: multa e juros zerados (os encargos já vêm no valor)', () => {
    expect(payloadSegundaVia(100, '2026-12-10')).toEqual({ value: 100, dueDate: '2026-12-10', fine: { value: 0 }, interest: { value: 0 } });
  });
});

describe('regra de atraso — o que sai impresso', () => {
  it('instruções do boleto das parcelas', () => {
    expect(INSTRUCOES_PAGAMENTO(CONTATO_PADRAO)[1]).toBe(
      'Após o vencimento: correção pelo IPCA/IBGE, multa de 2% e juros de mora de 1% ao mês pro rata die (CPCV, Cláusula 7ª; CDC, art. 52, § 1º).');
  });
  it('ficha de compensação das parcelas', () => {
    const f = instrucoesFicha('Saldo 2/120', CONTATO_PADRAO);
    expect(f[0]).toBe('Após o vencimento: multa de 2% e juros de 1% a.m. pro rata die.');
    expect(f[2]).toBe('Não receber após 59 dias do vencimento.');
    expect(instrucoesFicha('Saldo 2/120', CONTATO_PADRAO, true)[0]).toBe('Valor já atualizado com correção, multa e juros até o novo vencimento.');
  });
  it('ficha de compensação da comissão', () => {
    const ctx: any = {
      contrato: { id: 1, numero: 'BJ-2026-0004', modeloVersao: 'x', codigoVerificacao: 'x' }, lote: { codigo: 'D17', quadra: 'D', areaM2: 1 },
      comprador: { nome: 'F', cpfCnpj: '', endereco: '' }, beneficiario: 'V', agenciaCodigo: '-', urlPublica: '', plano: { parcelas: [], saldo_qtd: 0 },
    };
    const asaas = { identificationField: '1'.repeat(47), barCode: '2'.repeat(44), nossoNumero: 'NN', pixPayload: null };
    const l = dadosLamina(ctx, { id: 9, tipo: 'comissao', numero: 1, total: 1, vencimento: '2026-12-14', valor: 10, juros: 0, amortizacao: 0, saldoDevedor: 0, asaas: asaas as any, dataDocumento: '2026-11-16' });
    expect(l.instrucoes[1]).toBe('Após o vencimento: multa de 2% e juros de 1% a.m.');
    expect(l.instrucoes[2]).toBe('Não receber após 59 dias do vencimento.');
  });
  it('orientações do boleto da comissão', () => {
    expect(linhasComoPagarComissao('BJ-2026-0004', '(99) 9 9101-1970')[2]).toBe(
      'Após o vencimento: multa de 2% e juros de 1% ao mês. Pague somente por este boleto/Pix; o comprovante sai pelo WhatsApp (99) 9 9101-1970.');
  });
  it('proposta de parcelamento da comissão (cláusula e resumo assinado)', () => {
    expect(CLAUSULA_ATRASO_COMISSAO).toBe('3.2. Após o vencimento: multa de 2% e juros de mora de 1% ao mês; o valor em aberto poderá ser cobrado pelos meios legais.');
    expect(PONTO_ATRASO_COMISSAO).toBe('Atraso: multa de 2% e juros de 1% ao mês.');
  });
});
