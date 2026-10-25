/**
 * Espaço do banco (só leitura, só o administrador): tamanho de cada tabela e dos logs binários do MySQL,
 * para saber o que está enchendo o volume antes de decidir qualquer limpeza.
 * GET /api/sistema/espaco
 */
import type { Express } from 'express';
import { sql } from 'drizzle-orm';

const mb = (b: unknown) => Math.round((Number(b) || 0) / 1048576 * 10) / 10;
const linhas = (r: any): any[] => (Array.isArray(r?.[0]) ? r[0] : Array.isArray(r) ? r : r?.rows ?? []);

export function registrarRotaEspaco(app: Express) {
  app.get('/api/sistema/espaco', async (req, res) => {
    try {
      const { sdk } = await import('../_core/sdk');
      const user: any = await sdk.authenticateRequest(req).catch(() => null);
      const { perfilDe } = await import('../../shared/equipe');
      if (!user || perfilDe(user) !== 'admin') return res.status(404).json({ ok: false });
      const { getDb, getDbDriver } = await import('../db');
      const db: any = await getDb();
      if (!db || getDbDriver() !== 'mysql') return res.json({ ok: false, erro: 'Só no MySQL de produção' });
      const tabelas = linhas(await db.execute(sql`
        SELECT TABLE_NAME AS tabela, TABLE_ROWS AS linhas, DATA_LENGTH AS dados, INDEX_LENGTH AS indices, DATA_FREE AS livre
        FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC`));
      let binlogs: { arquivos: number; mb: number } | string = 'sem permissão para ver';
      try {
        const b = linhas(await db.execute(sql`SHOW BINARY LOGS`));
        binlogs = { arquivos: b.length, mb: mb(b.reduce((s: number, x: any) => s + Number(x.File_size ?? x.file_size ?? 0), 0)) };
      } catch { /* sem privilégio ou binlog desligado */ }
      const total = tabelas.reduce((s, t) => s + Number(t.dados || 0) + Number(t.indices || 0), 0);
      res.json({
        ok: true, totalTabelasMB: mb(total), binlogs,
        tabelas: tabelas.slice(0, 25).map(t => ({ tabela: t.tabela, linhas: Number(t.linhas) || 0, mb: mb(Number(t.dados || 0) + Number(t.indices || 0)), livreMB: mb(t.livre) })),
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, erro: e?.message });
    }
  });
}
