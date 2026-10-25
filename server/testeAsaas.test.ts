import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

// Asaas falso: guarda o que foi enviado e devolve como a API real
const chamadas: { metodo: string; caminho: string; corpo?: any }[] = [];
vi.mock('./financeiro/asaas', async orig => {
  const real = await orig<any>();
  const cfg = { apiKey: '$aact_prod_x', baseUrl: 'https://api.asaas.com/v3', ambiente: 'producao', walletComissao: null };
  return {
    ...real,
    exigirConfigAsaas: () => cfg,
    asaasReq: vi.fn(async (_c: any, metodo: string, caminho: string, corpo?: any) => {
      chamadas.push({ metodo, caminho, corpo });
      if (caminho.startsWith('/customers?')) return { data: [] };
      if (caminho === '/customers') return { id: 'cus_1' };
      if (caminho === '/payments') return { id: 'pay_teste1', invoiceUrl: 'https://www.asaas.com/i/teste1' };
      return {};
    }),
    // Dentro do módulo, buscarOuCriarCliente usa o asaasReq real: troca pela versão falsa (nenhuma chamada sai para a rede)
    buscarOuCriarCliente: vi.fn(async (_c: any, payload: any) => { chamadas.push({ metodo: 'POST', caminho: '/customers', corpo: payload }); return 'cus_1'; }),
    obterCobranca: vi.fn(async (_c: any, id: string) => ({ id, status: 'PENDING', value: 5, dueDate: '2026-10-28', externalReference: id === 'pay_teste1' ? 'crm-teste-1' : 'crm-cobranca-9', customer: 'cus_1' })),
    cancelarCobranca: vi.fn(async () => ({ deleted: true })),
  };
});

const T = await import('./financeiro/testeAsaas');
const A = await import('./financeiro/asaas');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

beforeAll(async () => {
  const db: any = await getDb();
  db.run(sql`INSERT INTO users (id, openId, name, role, cpf, telefone, email) VALUES (1, 'u1', 'Jose Romario P Bezerra', 'admin', '52998224725', '99991811246', 'jose@exemplo.com')`);
  db.run(sql`INSERT INTO users (id, openId, name, role) VALUES (2, 'u2', 'Sem CPF', 'admin')`);
});

describe('boleto de teste do Asaas', () => {
  it('cria em nome do administrador: R$ 5,00 por padrão, sem multa/juros, marcado como teste', async () => {
    const r = await T.criarBoletoTeste(1);
    expect(r).toMatchObject({ paymentId: 'pay_teste1', valor: 5, ambiente: 'producao' });
    const pagador = chamadas.find(c => c.caminho === '/customers')!.corpo;
    expect(pagador).toMatchObject({ name: 'Jose Romario P Bezerra', cpfCnpj: '52998224725', notificationDisabled: true });
    const cobranca = chamadas.find(c => c.caminho === '/payments')!.corpo;
    expect(cobranca).toMatchObject({ customer: 'cus_1', value: 5, fine: { value: 0 }, interest: { value: 0 } });
    expect(cobranca.externalReference).toMatch(/^crm-teste-\d+$/);
    // Valor escolhido (limitado a R$ 1,00–50,00)
    expect((await T.criarBoletoTeste(1, 1)).valor).toBe(1);
    expect((await T.criarBoletoTeste(1, 999)).valor).toBe(50);
  });

  it('sem CPF no cadastro do administrador: avisa; só cancela cobrança de teste', async () => {
    await expect(T.criarBoletoTeste(2)).rejects.toMatchObject({ codigo: 'SEM_CPF' });
    expect(await T.cancelarBoletoTeste('pay_teste1')).toEqual({ ok: true });
    await expect(T.cancelarBoletoTeste('pay_contrato9')).rejects.toMatchObject({ codigo: 'NAO_E_TESTE' });
    expect(A.cancelarCobranca).toHaveBeenCalledTimes(1);
  });
});
