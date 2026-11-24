import { afterEach, describe, expect, it } from 'vitest';
import { dataBr, definirLeitorIa, extrairDeTexto, faltandoEm, lerComprovante, valorBr } from './financeiro/comprovante';

// Leitura de comprovante na nova despesa: PDF com texto pelas regras, imagem pela IA (aqui um leitor falso)

const ASAAS = `J R P BEZERRA LTDA
romateccrm@gmail.com
Comprovante Transação Pix
Gerado em 24/11/2026 às 16:42
Dados da transação
ID/Transação
E19540550202611241942YYX5MTLM1YR
Valor
R$ 12.000,00
Data/Hora
24/11/2026 às 16:42
Dados do destinatário
Nome
Construsul Construcoes Ltda
CPF/CNPJ
11.238.467/0001-90
Instituição
Caixa Economica Federal
Dados do pagador
Nome
J R P Bezerra Ltda
CPF/CNPJ
17.261.987/0001-09
Instituição
Asaas I.P S.A`;

describe('comprovante — regras do texto', () => {
  it('lê o comprovante Pix do Asaas: valor, data, recebedor (não o pagador), CNPJ, banco e ID', () => {
    const d = extrairDeTexto(ASAAS);
    expect(d).toEqual({
      valor: 12000, data: '2026-11-24', recebedor: 'Construsul Construcoes Ltda', documentoRecebedor: '11.238.467/0001-90',
      instituicaoRecebedor: 'Caixa Economica Federal', pagador: 'J R P Bezerra Ltda', forma: 'PIX', idTransacao: 'E19540550202611241942YYX5MTLM1YR',
    });
    expect(faltandoEm(d)).toEqual([]);
  });

  it('converte valores e datas brasileiras', () => {
    expect(valorBr('1.234,56')).toBe(1234.56);
    expect(valorBr('0,00')).toBeNull();
    expect(dataBr('Pago em 05/03/26')).toBe('2026-03-05');
    expect(dataBr('24 de nov de 2026')).toBe('2026-11-24');
    expect(dataBr('sem data')).toBeNull();
  });

  it('comprovante de boleto em uma linha só por campo', () => {
    const d = extrairDeTexto('Comprovante de pagamento de boleto\nValor pago: R$ 350,90\nData do pagamento: 10/12/2026\nBeneficiário\nNome: Cartório do 1º Ofício\nCNPJ: 12.345.678/0001-99');
    expect(d).toMatchObject({ valor: 350.9, data: '2026-12-10', forma: 'BOLETO', recebedor: 'Cartório do 1º Ofício', documentoRecebedor: '12.345.678/0001-99' });
  });
});

describe('comprovante — foto pela IA', () => {
  afterEach(() => definirLeitorIa(null));

  it('imagem vai para a IA; o que ela devolve é limpo (data e valor no formato certo)', async () => {
    let recebeu: any = null;
    definirLeitorIa(async a => { recebeu = a; return { valor: '12.000,00' as any, data: '24/11/2026', recebedor: ' Construsul Construcoes Ltda ', documentoRecebedor: null, instituicaoRecebedor: null, pagador: null, forma: 'PIX', idTransacao: null }; });
    const r = await lerComprovante({ base64: Buffer.from('jpg').toString('base64'), mime: 'image/jpeg' });
    expect(recebeu).toMatchObject({ mime: 'image/jpeg' });
    expect(r).toMatchObject({ origem: 'ia', valor: 12000, data: '2026-11-24', recebedor: 'Construsul Construcoes Ltda', forma: 'PIX', faltando: [] });
  });

  it('se a IA falhar, avisa para preencher à mão', async () => {
    definirLeitorIa(async () => { throw new Error('sem chave'); });
    await expect(lerComprovante({ base64: Buffer.from('x').toString('base64'), mime: 'image/png' })).rejects.toThrow('Preencha os campos à mão');
  });
});
