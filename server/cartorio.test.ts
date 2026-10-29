import { beforeAll, describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const K = await import('./cartorio');
const S = await import('../shared/cartorio');
const { salvarArquivo } = await import('./contratos/arquivos');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

describe('registro em cartório', () => {
  beforeAll(async () => {
    const db: any = await getDb();
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf, registroMatricula) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA', '12.345')`);
    db.run(sql`INSERT INTO lotes (id, empreendimentoId, codigo, quadra, numero, areaM2, situacao) VALUES (5, 1, 'A05', 'A', 5, '3025.11', 'vendido_parcelado')`);
    db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{}', '{"vend_nome":"Maria Vendedora","vend_cpf":"111.444.777-35"}')`);
    await salvarArquivo('contratos/1/final.pdf', Buffer.from('%PDF-1.4 teste'), 'application/pdf');
    db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, status, codigoVerificacao, pdfAtual)
      VALUES (1, 'BJ-2026-0001', 1, 5, 'A05', 1, '{}', '{}', 'ativo', 'EX7K2M9P4Q1R', 'contratos/1/final.pdf'), (2, 'BJ-2026-0002', 1, 5, 'A05', 1, '{}', '{}', 'minuta', 'ZZ7K2M9P4Q1R', NULL)`);
    db.run(sql`INSERT INTO pessoas (id, nome, cpfCnpj, logradouro, numero, cidade, uf) VALUES (1, 'Carlos Eduardo Mendes', '52998224725', 'Rua A', '10', 'Açailândia', 'MA')`);
    db.run(sql`INSERT INTO contratoPessoas (contratoId, pessoaId, papel) VALUES (1, 1, 'comprador')`);
  });

  it('prazo de referência e atraso', () => {
    expect(S.prazoDoRegistro('2026-11-02')).toBe('2026-11-12');
    expect(S.registroAtrasado('protocolado', '2026-11-02', '2026-11-13')).toBe(true);
    expect(S.registroAtrasado('registrado', '2026-11-02', '2026-11-13')).toBe(false);
  });

  it('exige protocolo, exigência e matrícula conforme a situação; guarda o histórico', async () => {
    await expect(K.atualizarRegistro(1, { status: 'protocolado' }, { id: 1, nome: 'José' })).rejects.toThrow(/protocolo/);
    await K.atualizarRegistro(1, { status: 'protocolado', protocolo: '45.678', dataProtocolo: '2026-11-02' }, { id: 1, nome: 'José' });
    await expect(K.atualizarRegistro(1, { status: 'exigencia', protocolo: '45.678', dataProtocolo: '2026-11-02' }, { id: 1, nome: 'José' })).rejects.toThrow(/exigência/);
    await expect(K.atualizarRegistro(1, { status: 'registrado', protocolo: '45.678', dataProtocolo: '2026-11-02' }, { id: 1, nome: 'José' })).rejects.toThrow(/matrícula/);
    await K.atualizarRegistro(1, { status: 'registrado', protocolo: '45.678', dataProtocolo: '2026-11-02', matricula: 'R-3/12.345', registradoEm: '2026-11-10' }, { id: 1, nome: 'José' });
    const r = (await K.situacaoRegistro(1))!;
    expect(r).toMatchObject({ status: 'registrado', prazo: '2026-11-12', matricula: 'R-3/12.345' });
    expect(r.historico.map(h => h.nota)).toEqual(['Protocolo 45.678', 'Matrícula R-3/12.345']);
  });

  it('kit: requerimento + contrato assinado + leia-me; contrato não assinado não sai', async () => {
    await expect(K.kitRegistro(2)).rejects.toThrow(/assinado/);
    const { zip, nome } = await K.kitRegistro(1);
    expect(nome).toBe('Kit-registro-BJ-2026-0001.zip');
    const arqs = unzipSync(new Uint8Array(zip));
    expect(Object.keys(arqs).sort()).toEqual(['01-Requerimento-de-registro.pdf', '02-Contrato-BJ-2026-0001-assinado.pdf', 'LEIA-ME.txt']);
    expect(strFromU8(arqs['01-Requerimento-de-registro.pdf'].subarray(0, 5))).toBe('%PDF-');
    expect(strFromU8(arqs['LEIA-ME.txt'])).toContain('registradores.onr.org.br');
  });
});
