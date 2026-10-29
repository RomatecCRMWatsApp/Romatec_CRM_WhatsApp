import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { simularAntecipacao, antecipaveis } = await import('../shared/portalComprador');
const P = await import('./financeiro/portalComprador');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

describe('antecipação de parcelas (valor presente pela taxa do contrato)', () => {
  const parcelas = [
    { id: 1, rotulo: 'Saldo 1/3', vencimento: '2026-11-10', valor: 1000 },
    { id: 2, rotulo: 'Saldo 2/3', vencimento: '2027-01-08', valor: 1000 },
    { id: 3, rotulo: 'Saldo 3/3', vencimento: '2027-10-25', valor: 1000 },
  ];
  it('só antecipa as que vencem em mais de 30 dias, das últimas para as primeiras', () => {
    expect(antecipaveis(parcelas, '2026-10-29')).toBe(2);
    const s = simularAntecipacao(parcelas, 0.01, 1, '2026-10-29');
    expect(s.parcelas.map(p => p.id)).toEqual([3]);
    // 361 dias ≈ 12,03 meses a 1% a.m.
    expect(s.totalAPagar).toBeCloseTo(1000 / Math.pow(1.01, 361 / 30), 1);
    expect(s.economia).toBeGreaterThan(110);
    expect(simularAntecipacao(parcelas, 0.01, 5, '2026-10-29').parcelas.map(p => p.id)).toEqual([2, 3]);
  });
  it('sem juros não há desconto', () => {
    expect(simularAntecipacao(parcelas, 0, 2, '2026-10-29')).toMatchObject({ totalNominal: 2000, totalAPagar: 2000, economia: 0 });
  });
});

describe('portal do comprador — banco', () => {
  let db: any;
  const enviados: string[] = [];
  beforeAll(async () => {
    db = await getDb();
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
    db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, status, codigoVerificacao)
      VALUES (1, 'BJ-2026-0001', 1, 5, 'A05', 1, '{"taxa_am":0.01}', '{}', 'ativo', 'EX7K2M9P4Q1R'), (2, 'BJ-2026-0002', 1, 6, 'A06', 1, '{}', '{}', 'em_assinatura', 'ZZ7K2M9P4Q1R')`);
    db.run(sql`INSERT INTO pessoas (id, nome, cpfCnpj, telefone1) VALUES (1, 'Carlos Eduardo Mendes', '52998224725', '99988776655')`);
    db.run(sql`INSERT INTO contratoPessoas (contratoId, pessoaId, papel) VALUES (1, 1, 'comprador')`);
    db.run(sql`INSERT INTO obraAtualizacoes (empreendimentoId, titulo, texto, percentual, data) VALUES (1, 'Rede de água', 'Concluída na Rua 3', 35, '2026-10-20')`);
  });

  it('código inválido, desconhecido ou contrato não assinado não abre', async () => {
    await expect(P.contratoDoCodigo('abc')).rejects.toThrow(/inválido/);
    await expect(P.contratoDoCodigo('AAAAAAAAAAAA')).rejects.toThrow(/não encontrado/);
    await expect(P.contratoDoCodigo('ZZ7K2M9P4Q1R')).rejects.toThrow(/assinado/);
  });

  it('chamado aberto pelo comprador, respondido pelo escritório com aviso no WhatsApp', async () => {
    await expect(P.abrirChamado('EX7K2M9P4Q1R', { tipo: 'duvida', assunto: 'Olá', mensagem: '' })).rejects.toThrow(/mensagem/);
    expect(await P.abrirChamado('EX7K2M9P4Q1R', { tipo: 'duvida', assunto: 'Quando liga a água?', mensagem: 'Queria saber a previsão da água na minha rua.' })).toMatchObject({ ok: true });
    const [c] = await P.listarChamados('aberto');
    expect(c).toMatchObject({ contrato: 'BJ-2026-0001', lote: 'A05', comprador: 'Carlos Eduardo Mendes', rotulo: 'Dúvida', assunto: 'Quando liga a água?' });
    const r = await P.responderChamado(c.id, 'Previsão: dezembro.', false, 1, async (tel, txt) => { enviados.push(`${tel}|${txt}`); });
    expect(r.avisado).toBe(true);
    expect(enviados[0]).toMatch(/^5599988776655\|Olá, Carlos! A administração respondeu o seu chamado "Quando liga a água\?"\. Veja no seu portal: .*\/c\/EX7K2M9P4Q1R$/);
    expect(await P.listarChamados('aberto')).toEqual([]);
  });

  it('portal traz obra, documentos e chamados do contrato', async () => {
    const p = await P.portalDoComprador('EX7K2M9P4Q1R', '2026-10-29');
    expect(p.obra[0]).toMatchObject({ titulo: 'Rede de água', percentual: 35, foto: null });
    expect(p.documentos.map(d => d.url)).toEqual(expect.arrayContaining(['/documentos/bom-jardims/estatuto', '/c/v/EX7K2M9P4Q1R']));
    expect(p.chamados[0]).toMatchObject({ status: 'respondido', resposta: 'Previsão: dezembro.' });
  });
});
