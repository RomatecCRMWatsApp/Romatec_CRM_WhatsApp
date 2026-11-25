import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
process.env.AVALIEIMOB_INTEGRACAO_SECRET = 'x'.repeat(40);
const R = await import('./receitaRtc/ponte');
const { assinarCorpo } = await import('./saas/avalieimob');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

const chamadas: { rota: string; corpo: any }[] = [];
let resposta: (rota: string, corpo: any) => R.Resposta = () => ({ status: 200, json: {} });
const USU = { id: 1, name: 'Admin' };
const pedido = { contratoId: 1, dataOperacao: '2027-01-10', valor: '166.230,00', nbs: '123456789', cst: '000', cClassTrib: '000001' };

describe('simulador de CBS/IBS no contrato (ponte do AvalieImob)', () => {
  beforeAll(async () => {
    const db: any = await getDb();
    db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, status, codigoVerificacao)
      VALUES (1, 'BJ-2026-0003', 1, 0, 'C13', 7, '{}', '{}', 'assinado', 'V1')`);
    R.transporte.chamar = async (rota, corpo) => { chamadas.push({ rota, corpo }); return resposta(rota, corpo); };
  });

  it('valor vai como texto com 2 casas, nunca número', () => {
    expect(R.valorTexto('166.230,00')).toBe('166230.00');
    expect(R.valorTexto('1234.5')).toBe('1234.50');
    expect(R.valorTexto(1000)).toBe('1000.00');
    expect(() => R.valorTexto('abc')).toThrow();
    expect(() => R.valorTexto('0')).toThrow();
  });

  it('assinatura é o HMAC do corpo exato', () => {
    expect(assinarCorpo('100', '{}', 'k')).toMatch(/^[a-f0-9]{64}$/);
    expect(assinarCorpo('100', '{}', 'k')).not.toBe(assinarCorpo('101', '{}', 'k'));
  });

  it('simulador desligado (404) ou fora do ar esconde o bloco', async () => {
    resposta = () => ({ status: 404, json: { detail: 'desativado' } });
    expect(await R.situacao()).toEqual({ disponivel: false, motivo: 'desligado' });
    resposta = () => ({ status: 200, json: { ativo: false } });
    expect((await R.situacao()).disponivel).toBe(false);
    resposta = () => ({ status: 200, json: { ativo: true, configurado: true } });
    expect(await R.situacao()).toEqual({ disponivel: true });
  });

  it('simula com o corpo do contrato, guarda o resultado e repete os códigos na próxima', async () => {
    resposta = () => ({ status: 200, json: { id: 'abc', situacao: 'calculado', totais: { base_calculo: '166230.00', cbs: '100.00', ibs: '200.00', is: '0.00' }, avisos: [], itens: [] } });
    const r = await R.simularContrato(USU, pedido);
    const c = chamadas.at(-1)!;
    expect(c.rota).toBe('simular');
    expect(c.corpo).toMatchObject({ regime: 'REGULAR', data_operacao: '2027-01-10', uf: 'MA', codigo_municipio: '2100055', simples: null,
      origem: { tipo: 'contrato', id: 'BJ-2026-0003' }, itens: [{ valor: '166230.00', nbs: '123456789', cst: '000', cClassTrib: '000001' }] });
    expect(r.avisos[0]).toBe(R.AVISO_FIXO);
    const h = await R.doContrato(1);
    expect(h.simulacoes).toHaveLength(1);
    expect(h.simulacoes[0]).toMatchObject({ situacao: 'calculado', valor: '166230.00' });
    expect(h.ultimosCodigos).toEqual({ nbs: '123456789', cst: '000', cClassTrib: '000001' });
  });

  it('erros da ponte viram mensagens claras', async () => {
    resposta = () => ({ status: 409, json: { detail: { mensagem: 'Sem alíquota para a data', faltantes: ['IBS MA'] } } });
    await expect(R.simularContrato(USU, pedido)).rejects.toThrow(/Sem alíquota.*IBS MA/);
    resposta = () => ({ status: 503, json: { detail: 'x' } });
    await expect(R.simularContrato(USU, pedido)).rejects.toThrow(R.MSG_INDISPONIVEL);
    resposta = () => ({ status: 422, json: { detail: [{ campo: 'itens.0.nbs', msg: 'inválido' }] } });
    await expect(R.simularContrato(USU, pedido)).rejects.toThrow(/itens\.0\.nbs: inválido/);
    await expect(R.simularContrato(USU, { ...pedido, dataOperacao: '' })).rejects.toThrow(/data/);
    await expect(R.simularContrato(USU, { ...pedido, cClassTrib: '12' })).rejects.toThrow(/cClassTrib/);
    expect((await R.doContrato(1)).simulacoes).toHaveLength(1);
  });
});
