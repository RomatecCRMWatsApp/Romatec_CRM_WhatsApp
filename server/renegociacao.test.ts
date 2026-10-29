import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { tabelaPrice, somarMeses, montarRenegociacao } = await import('../shared/renegociacao');
const R = await import('./financeiro/renegociacao');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

describe('renegociação — cálculo', () => {
  it('soma meses mantendo o dia (fim de mês ajustado)', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2026-11-10', 3)).toBe('2027-02-10');
  });
  it('Tabela Price fecha o saldo em zero; sem juros divide igual', () => {
    const t = tabelaPrice(3000, 3, 0.01, '2026-11-10');
    expect(t.map(p => p.vencimento)).toEqual(['2026-11-10', '2026-12-10', '2027-01-10']);
    expect(t[0].valor).toBe(1020.07);
    expect(t.at(-1)!.saldo).toBe(0);
    expect(tabelaPrice(1000, 4, 0, '2026-11-10').map(p => p.valor)).toEqual([250, 250, 250, 250]);
  });
  it('valor renegociado = original + encargos − desconto', () => {
    const r = montarRenegociacao([{ id: 1, rotulo: 'Saldo 1/10', vencimento: '2026-09-10', valor: 1000, atualizado: 1080, diasAtraso: 49 }], { desconto: 50, parcelas: 2, taxaMensal: 0, primeiroVencimento: '2026-11-10' });
    expect(r).toMatchObject({ totalOriginal: 1000, encargos: 80, desconto: 50, valorRenegociado: 1030, totalAPagar: 1030 });
  });
});

describe('renegociação — termo aditivo, assinatura por código e aplicação', () => {
  let db: any;
  const msgs: [string, string][] = [];
  beforeAll(async () => {
    R.definirEnviador(async (t, m) => { msgs.push([t, m]); });
    db = await getDb();
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
    db.run(sql`INSERT INTO lotes (id, empreendimentoId, codigo, quadra, numero, areaM2, situacao) VALUES (5, 1, 'A05', 'A', 5, '3025.11', 'vendido_parcelado')`);
    db.run(sql`INSERT INTO users (id, openId, name, role) VALUES (1, 'u1', 'José Romário', 'admin')`);
    db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{}', '{"vend_nome":"Maria Vendedora","vend_cpf":"111.444.777-35"}')`);
    db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, status, codigoVerificacao)
      VALUES (1, 'BJ-2026-0001', 1, 5, 'A05', 1, '{"taxa_am":0.01,"modalidade":"financiado","parcelas":[],"saldo_qtd":10,"entrada_qtd":1}', '{}', 'ativo', 'EX7K2M9P4Q1R')`);
    db.run(sql`INSERT INTO pessoas (id, nome, cpfCnpj, telefone1) VALUES (1, 'Carlos Eduardo Mendes', '52998224725', '99988776655')`);
    db.run(sql`INSERT INTO contratoPessoas (contratoId, pessoaId, papel) VALUES (1, 1, 'comprador')`);
    db.run(sql`INSERT INTO cobrancas (id, contratoId, tipo, numero, total, vencimento, valor, status) VALUES
      (11, 1, 'saldo', 1, 10, '2026-09-10', '1000.00', 'vencida'), (12, 1, 'saldo', 2, 10, '2026-10-10', '1000.00', 'vencida'),
      (13, 1, 'saldo', 3, 10, '2026-11-10', '1000.00', 'prevista'), (14, 1, 'saldo', 4, 10, '2026-08-10', '1000.00', 'paga')`);
  });

  const pedido = { ids: [11, 12], desconto: 0, parcelas: 3, taxaMensal: 0.01, primeiroVencimento: '2026-11-20' };

  it('simula com encargos de mora e recusa parcela paga', async () => {
    const s = await R.simularRenegociacao(1, pedido, '2026-10-29');
    expect(s.totalOriginal).toBe(2000);
    expect(s.encargos).toBeGreaterThan(40);   // multa 2% + juros 1% a.m. (sem IPCA no teste)
    expect(s.parcelas).toHaveLength(3);
    await expect(R.simularRenegociacao(1, { ...pedido, ids: [14] }, '2026-10-29')).rejects.toThrow(/paga ou cancelada/);
  });

  let token = '';
  it('gera o termo (PDF) e manda o link ao comprador; um por vez', async () => {
    const r = await R.criarAditivo(1, pedido, 1, '2026-10-29');
    expect(r).toMatchObject({ numero: 1, enviado: true });
    token = r.link.split('/').pop()!;
    expect(msgs[0][0]).toBe('5599988776655');
    expect(msgs[0][1]).toContain('Termo Aditivo n.º 1');
    await expect(R.criarAditivo(1, pedido, 1, '2026-10-29')).rejects.toThrow(/aguardando/);
    const pdf = await R.pdfDoToken(token);
    expect(pdf!.buf.subarray(0, 5).toString()).toBe('%PDF-');
    const pg = await R.paginaAditivo(token);
    expect(pg).toMatchObject({ numero: 1, contrato: 'BJ-2026-0001', status: 'aguardando', comprador: 'Carlos' });
  });

  it('assina só com o código certo e o aceite; aplica nas cobranças', async () => {
    await R.enviarCodigo(token);
    const codigo = msgs.at(-1)![1].match(/(\d{6})/)![1];
    await expect(R.assinarAditivo(token, codigo, { aceite: false, ip: '1.2.3.4', ua: 'teste' })).rejects.toThrow(/concorda/);
    await expect(R.assinarAditivo(token, codigo === '000000' ? '111111' : '000000', { aceite: true, ip: '1.2.3.4', ua: 'teste' })).rejects.toThrow(/incorreto/);
    const r = await R.assinarAditivo(token, codigo, { aceite: true, ip: '1.2.3.4', ua: 'teste' });
    expect(r.resultado).toMatchObject({ canceladas: 2, criadas: 3, emitidas: 0 });
    const cobs = db.all(sql`SELECT tipo, numero, total, status FROM cobrancas WHERE contratoId = 1 ORDER BY id`);
    expect(cobs.filter((c: any) => c.status === 'cancelada').length).toBe(2);
    expect(cobs.filter((c: any) => c.tipo === 'renegociacao').map((c: any) => `${c.numero}/${c.total}`)).toEqual(['1/3', '2/3', '3/3']);
    await expect(R.assinarAditivo(token, codigo, { aceite: true, ip: '1.2.3.4', ua: 'teste' })).rejects.toThrow(/já foi assinado/);
    const lista = await R.aditivosDo(1);
    expect(lista[0]).toMatchObject({ status: 'assinado', parcelas: 3, link: null });
    const assinado = await R.pdfDoAditivo(lista[0].id);
    expect(assinado!.nome).toBe('Termo-Aditivo-1-assinado.pdf');
  });
});
