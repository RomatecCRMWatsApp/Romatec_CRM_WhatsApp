import { describe, expect, it } from 'vitest';

// Avisos "Sistema atualizado" de versões só do administrador saem do sino da secretária e dos corretores
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
const { limparAvisosPrivativos } = await import('./notificacoes');

describe('avisos de versões privativas', () => {
  it('retira o aviso da versão "admin" de secretária, corretor e empreendedor; mantém o do administrador e os das versões da equipe', async () => {
    const db: any = await getDb();
    db.run(sql`INSERT INTO users (id, openId, role, perfil) VALUES (1, 'a', 'admin', NULL), (2, 's', 'user', 'secretario'), (3, 'c', 'user', 'corretor'), (4, 'e', 'user', 'empreendedor')`);
    db.run(sql`INSERT INTO systemRelease (versao, titulo, itens, publico) VALUES ('9.0.0', 'Contrato de gestão', '{}', 'admin'), ('9.0.1', 'Equipe', '{}', 'equipe')`);
    for (const u of [1, 2, 3, 4]) {
      db.run(sql`INSERT INTO notificacoes (usuarioId, tipo, titulo, mensagem, chave) VALUES (${u}, 'atualizacao_sistema', 'Sistema atualizado', 'v9.0.0', 'v9.0.0')`);
      if (u <= 2) db.run(sql`INSERT INTO notificacoes (usuarioId, tipo, titulo, mensagem, chave) VALUES (${u}, 'atualizacao_sistema', 'Sistema atualizado', 'v9.0.1', 'v9.0.1')`);
    }
    await limparAvisosPrivativos();
    const r: any[] = db.all(sql`SELECT usuarioId, chave FROM notificacoes ORDER BY usuarioId, chave`);
    expect(r).toEqual([{ usuarioId: 1, chave: 'v9.0.0' }, { usuarioId: 1, chave: 'v9.0.1' }, { usuarioId: 2, chave: 'v9.0.1' }]);
    await limparAvisosPrivativos(); // idempotente
    expect(db.all(sql`SELECT COUNT(*) AS n FROM notificacoes`)[0].n).toBe(3);
  });
});
