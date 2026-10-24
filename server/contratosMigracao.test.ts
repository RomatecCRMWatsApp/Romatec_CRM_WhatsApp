import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { initSqliteTables } from './_core/migrations/initSqlite';
import { SEED_EMP_JURIDICO } from './_core/migrations/seedContratos';

const TABELAS = ['contratoArquivos', 'empJuridico', 'contratoSeq', 'contratos', 'contratoVersoes', 'assinaturaSignatarios', 'assinaturaPosicoes',
  'assinaturaOtp', 'assinaturaEventos', 'cobrancas', 'asaasWebhookLog', 'pessoas', 'contratoPessoas', 'pessoaReferencias', 'pessoaDocumentos',
  'chacaraDependentes', 'carteiras', 'eventosAutorizacoes', 'eventosConvidados'];

function banco() {
  const db = new Database(':memory:');
  initSqliteTables(db);
  return db;
}

describe('migração dos contratos (v1.9.0)', () => {
  it('cria as tabelas novas e as colunas em lotes e usuarioDocumentos', () => {
    const db = banco();
    const existentes = new Set(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((r: any) => r.name));
    for (const t of TABELAS) expect(existentes, t).toContain(t);
    const cols = (t: string) => db.prepare(`PRAGMA table_info(${t})`).all().map((r: any) => r.name);
    expect(cols('lotes')).toEqual(expect.arrayContaining(['contratoReservaId', 'memorialTexto', 'viaFrente', 'matricula', 'situacao', 'reservadoAte']));
    expect(cols('usuarioDocumentos')).toContain('emissao');
  });

  it('seed do jurídico do Bom Jardims: entra uma vez e nunca sobrescreve o que foi editado', () => {
    const db = banco();
    db.prepare(`INSERT INTO empreendimentos (slug, nome) VALUES ('bom-jardims', 'Bom Jardims')`).run();
    initSqliteTables(db);
    const linha = () => db.prepare(`SELECT * FROM empJuridico`).all() as any[];
    expect(linha()).toHaveLength(1);
    const d = JSON.parse(linha()[0].defaultsJson);
    expect(d.emp_matricula_origem).toBe('33.036');
    expect(d.emp_parcelamento_registrado).toBe(false);
    expect(d.limite_dependentes).toBe(6);
    expect(JSON.parse(linha()[0].vendedoraJson).vend_cpf).toBe(SEED_EMP_JURIDICO.vendedora.vend_cpf);

    db.prepare(`UPDATE empJuridico SET defaultsJson = '{"editado":true}'`).run();
    initSqliteTables(db); // boot de novo
    expect(linha()).toHaveLength(1);
    expect(JSON.parse(linha()[0].defaultsJson)).toEqual({ editado: true });
  });

  it('dois contratos cancelados no mesmo lote são permitidos (o índice do lote não é único)', () => {
    const db = banco();
    const ins = db.prepare(`INSERT INTO contratos (numero, empreendimentoId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, status, codigoVerificacao)
      VALUES (?, 1, 'A01', 1, '{}', '{}', 'cancelado', ?)`);
    ins.run('BJ-2026-0001', 'AAAAAAAAAAAA');
    expect(() => ins.run('BJ-2026-0002', 'BBBBBBBBBBBB')).not.toThrow();
    expect(() => ins.run('BJ-2026-0002', 'CCCCCCCCCCCC')).toThrow(/UNIQUE/);
  });
});
