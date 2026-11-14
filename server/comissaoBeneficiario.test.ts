import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
process.env.ASAAS_API_KEY = 'aact_hmlg_teste';
process.env.ASAAS_WALLET_COMISSAO = 'wallet-romatec';

const { parcelasComissao, mesSeguinte } = await import('../shared/comissaoBeneficiario');
const M = await import('./financeiro/comissaoBeneficiario');
const R = await import('./financeiro/renegociacao');
const A = await import('./assinatura/servico');
const { cobrancasDoContrato } = await import('./financeiro/servico');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

// Concessão: comissão paga pelo beneficiário em 1–4 parcelas, por proposta assinada pelo link. Dados fictícios.
describe('parcelas da comissão', () => {
  it('iguais, centavos na última, mês a mês', () => {
    expect(parcelasComissao(8250, 3, '2026-11-20')).toEqual([
      { numero: 1, vencimento: '2026-11-20', valor: 2750 }, { numero: 2, vencimento: '2026-12-20', valor: 2750 }, { numero: 3, vencimento: '2027-01-20', valor: 2750 },
    ]);
    expect(parcelasComissao(100, 3, '2026-11-20').map(p => p.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(mesSeguinte('2027-01-31', 1)).toBe('2027-02-28');
    expect(() => parcelasComissao(100, 5, '2026-11-20')).toThrow(/1 a 4/);
  });
});

describe('proposta → assinatura → boletos (100% Romatec) → revogar → nova proposta', () => {
  let db: any;
  const msgs: [string, string][] = [];
  const pagamentos: any[] = [];
  let n = 0;
  beforeAll(async () => {
    R.definirEnviador(async (t, m) => { msgs.push([t, m]); });
    A.definirEnviador(async (t, m) => { msgs.push([t, m]); });
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      const u = String(url), metodo = init?.method ?? 'GET';
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
      if (u.includes('/customers?')) return json({ data: [] });
      if (u.endsWith('/customers')) return json({ id: 'cus_1' });
      if (u.endsWith('/payments') && metodo === 'POST') { const b = JSON.parse(init.body); pagamentos.push(b); n++; return json({ id: `pay_${n}`, bankSlipUrl: `https://boleto/${n}`, invoiceUrl: `https://fatura/${n}` }); }
      if (metodo === 'DELETE') return json({ deleted: true });
      if (u.includes('/identificationField')) return json({ identificationField: '0'.repeat(47), barCode: '1'.repeat(44), nossoNumero: '123' });
      if (u.includes('/pixQrCode')) return json({ payload: 'pix-copia-e-cola', encodedImage: '' });
      return json({});
    });
    db = await getDb();
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
    db.run(sql`INSERT INTO users (id, openId, name, role) VALUES (1, 'u1', 'Admin Ficticio', 'admin')`);
    db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, status, codigoVerificacao)
      VALUES (1, 'BJ-2026-0090', 1, 0, 'D16', 1, '{"modalidade":"avista","preco_avista":165000,"parcelas":[],"concessao":{"motivo":"","comissaoValor":8250,"comissaoPrazo":"Pix","despesasPor":"beneficiario"}}', '{}', 'em_assinatura', 'COD12345')`);
    db.run(sql`INSERT INTO pessoas (id, nome, cpfCnpj, telefone1) VALUES (1, 'Carlos Beneficiario Ficticio', '52998224725', '99988776655')`);
    db.run(sql`INSERT INTO contratoPessoas (contratoId, pessoaId, papel) VALUES (1, 1, 'comprador')`);
  });

  const assinar = async (token: string) => {
    await R.enviarCodigo(token);
    const codigo = msgs.at(-1)![1].match(/(\d{6})/)![1];
    return R.assinarAditivo(token, codigo, { aceite: true, ip: '1.2.3.4', ua: 'teste' });
  };
  const token = async (numero: number) => db.all(sql`SELECT token FROM contratoAditivos WHERE contratoId = 1 AND numero = ${numero}`)[0].token;

  it('gera a proposta (PDF) e manda o link; uma por vez', async () => {
    const r = await M.proporComissaoBeneficiario(1, { parcelas: 3, primeiroVencimento: '2026-11-20' }, 1, '2026-11-14');
    expect(r).toMatchObject({ numero: 1, enviado: true });
    expect(r.parcelas.map(p => p.valor)).toEqual([2750, 2750, 2750]);
    expect(msgs.at(-1)![1]).toMatch(/proposta de parcelamento da comissão/);
    await expect(M.proporComissaoBeneficiario(1, { parcelas: 2, primeiroVencimento: '2026-11-20' }, 1, '2026-11-14')).rejects.toThrow(/aguardando assinatura/);
  });

  it('assinada: 3 boletos no Asaas com 100% de split para a Romatec, enviados no WhatsApp; fora das parcelas do contrato', async () => {
    const r = await assinar(await token(1));
    expect(r.resultado).toMatchObject({ criadas: 3, emitidas: 3 });
    expect(pagamentos).toHaveLength(3);
    expect(pagamentos[0].split).toEqual([{ walletId: 'wallet-romatec', percentualValue: 100 }]);
    expect(pagamentos[0].billingType).toBe('UNDEFINED');
    expect(msgs.some(([, m]) => /boletos da comissão de gestão/.test(m) && m.includes('https://boleto/1'))).toBe(true);
    expect((await M.cobrancasComissao(1)).map(c => c.status)).toEqual(['emitida', 'emitida', 'emitida']);
    expect(await cobrancasDoContrato(1)).toHaveLength(0);
    const plano = JSON.parse(db.all(sql`SELECT simulacaoJson FROM contratos WHERE id = 1`)[0].simulacaoJson);
    expect(plano.concessao.comissaoPagador).toBe('beneficiario');
  });

  it('com boletos em aberto não gera outra; revogar cancela os em aberto (1ª paga fica) e a nova proposta é do saldo, no cartão em 1×', async () => {
    await expect(M.proporComissaoBeneficiario(1, { parcelas: 1, primeiroVencimento: '2026-12-01' }, 1, '2026-11-14')).rejects.toThrow(/Revogue/);
    db.run(sql`UPDATE cobrancas SET status = 'paga', pagoEm = '2026-11-20' WHERE tipo = 'comissao' AND numero = 1`);
    expect(await M.revogarComissao(1, 1)).toMatchObject({ canceladas: 2 });
    const r = await M.proporComissaoBeneficiario(1, { parcelas: 1, primeiroVencimento: '2026-12-01', forma: 'cartao' }, 1, '2026-11-14');
    expect(r.parcelas).toEqual([{ numero: 1, vencimento: '2026-12-01', valor: 5500 }]);
    await assinar(await token(2));
    const cobs = await M.cobrancasComissao(1);
    expect(cobs.map(c => [c.numero, c.total, c.status])).toEqual([[1, 3, 'paga'], [2, 3, 'cancelada'], [3, 3, 'cancelada'], [4, 4, 'emitida']]);
    expect(pagamentos.at(-1)).toMatchObject({ billingType: 'CREDIT_CARD', value: 5500 });
    expect(cobs.at(-1)!.boleto).toBe(`https://fatura/${n}`);
  });

  it('só contrato de concessão', async () => {
    db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, status, codigoVerificacao) VALUES (2, 'BJ-2026-0091', 1, 0, 'D17', 1, '{"modalidade":"avista","parcelas":[]}', '{}', 'ativo', 'COD2')`);
    await expect(M.proporComissaoBeneficiario(2, { parcelas: 1, primeiroVencimento: '2026-12-01' }, 1, '2026-11-14')).rejects.toThrow(/concessão/);
  });
});
