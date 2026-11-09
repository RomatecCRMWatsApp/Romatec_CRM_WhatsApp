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
      if (!user) return res.status(401).json({ ok: false, erro: 'Entre no CRM (romateccrm.com) neste navegador e abra de novo.' });
      if (perfilDe(user) !== 'admin') return res.status(403).json({ ok: false, erro: 'Só o administrador consulta.' });
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
      } catch (e: any) {
        const ligado: any[] = linhas(await db.execute(sql`SHOW VARIABLES LIKE 'log_bin'`).catch(() => []));
        binlogs = String(ligado[0]?.Value ?? ligado[0]?.value ?? '').toUpperCase() === 'OFF' ? 'desligado (não ocupa espaço)' : `não consultável: ${String(e?.message ?? '').slice(0, 120)}`;
      }
      const total = tabelas.reduce((s, t) => s + Number(t.dados || 0) + Number(t.indices || 0), 0);
      // O resto do volume: outros bancos no mesmo MySQL e os arquivos internos do InnoDB (redo, undo, temporários)
      const tentar = async (q: any) => { try { return linhas(await db.execute(q)); } catch { return []; } };
      const bancos = (await tentar(sql`SELECT TABLE_SCHEMA AS banco, SUM(DATA_LENGTH + INDEX_LENGTH) AS tamanho FROM information_schema.TABLES GROUP BY TABLE_SCHEMA ORDER BY tamanho DESC`))
        .map((b: any) => ({ banco: b.banco, mb: mb(b.tamanho) }));
      const arquivos = (await tentar(sql`SELECT FILE_NAME AS arquivo, FILE_TYPE AS tipo, TOTAL_EXTENTS * EXTENT_SIZE AS tamanho FROM information_schema.FILES WHERE TOTAL_EXTENTS * EXTENT_SIZE > 5242880 ORDER BY tamanho DESC LIMIT 15`))
        .map((f: any) => ({ arquivo: String(f.arquivo), tipo: f.tipo, mb: mb(f.tamanho) }));
      const variaveis = Object.fromEntries((await tentar(sql`SHOW VARIABLES WHERE Variable_name IN ('version', 'log_bin', 'binlog_expire_logs_seconds', 'expire_logs_days', 'innodb_redo_log_capacity', 'innodb_log_file_size', 'innodb_undo_log_truncate', 'max_binlog_size')`))
        .map((v: any) => [v.Variable_name ?? v.variable_name, v.Value ?? v.value]));
      // Tabelas com o mesmo nome no CRM e na ZAYRA (mesmo banco): colunas que existem de fato
      const compartilhadas: Record<string, string[]> = {};
      for (const t of ['recibos', 'crm_recibos', 'users', 'contacts', 'properties', 'campaigns', 'messages']) {
        compartilhadas[t] = (await tentar(sql`SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${t} ORDER BY ORDINAL_POSITION`)).map((r: any) => String(r.c));
      }
      // Conexões: teto do MySQL, uso agora e pico desde que o banco ligou; quem está conectado (CRM, ZAYRA, outros)
      const status = Object.fromEntries((await tentar(sql`SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected', 'Threads_running', 'Max_used_connections', 'Max_used_connections_time', 'Aborted_connects', 'Connection_errors_max_connections', 'Slow_queries', 'Uptime')`))
        .map((v: any) => [v.Variable_name ?? v.variable_name, v.Value ?? v.value]));
      const maxConn: Record<string, string> = (await tentar(sql`SHOW VARIABLES WHERE Variable_name IN ('max_connections', 'wait_timeout')`))
        .reduce((o: Record<string, string>, v: any) => ({ ...o, [v.Variable_name ?? v.variable_name]: v.Value ?? v.value }), {} as Record<string, string>);
      const quem = (await tentar(sql`SELECT USER AS usuario, SUBSTRING_INDEX(HOST, ':', 1) AS origem, IFNULL(DB, '') AS banco, COUNT(*) AS conexoes, SUM(COMMAND <> 'Sleep') AS ativas
        FROM information_schema.PROCESSLIST GROUP BY usuario, origem, banco ORDER BY conexoes DESC LIMIT 20`))
        .map((r: any) => ({ usuario: String(r.usuario), origem: String(r.origem), banco: String(r.banco), conexoes: Number(r.conexoes) || 0, ativas: Number(r.ativas) || 0 }));
      // Consultas que mais tomam tempo (performance_schema: texto normalizado, sem os valores) e o critério de "lenta"
      const lentaS = Number(((await tentar(sql`SHOW VARIABLES LIKE 'long_query_time'`))[0] ?? {}).Value ?? NaN);
      const pesadas = (await tentar(sql`SELECT SCHEMA_NAME AS banco, LEFT(DIGEST_TEXT, 220) AS consulta, COUNT_STAR AS vezes,
          ROUND(AVG_TIMER_WAIT / 1e12, 2) AS mediaS, ROUND(MAX_TIMER_WAIT / 1e12, 2) AS maxS, ROUND(SUM_TIMER_WAIT / 1e12, 1) AS totalS, SUM_ROWS_EXAMINED AS linhasLidas
        FROM performance_schema.events_statements_summary_by_digest
        WHERE DIGEST_TEXT IS NOT NULL AND DIGEST_TEXT NOT LIKE '%performance_schema%' AND DIGEST_TEXT NOT LIKE '%information_schema%'
        ORDER BY MAX_TIMER_WAIT DESC LIMIT 12`))
        .map((r: any) => ({ banco: String(r.banco ?? ''), consulta: String(r.consulta ?? ''), vezes: Number(r.vezes) || 0, mediaS: Number(r.mediaS) || 0, maxS: Number(r.maxS) || 0, totalS: Number(r.totalS) || 0, linhasLidas: Number(r.linhasLidas) || 0 }));
      const { situacaoPool, consultasLentasCrm } = await import('../db');
      const conexoes = {
        maximo: Number(maxConn.max_connections) || null, waitTimeoutS: Number(maxConn.wait_timeout) || null,
        agora: Number(status.Threads_connected) || 0, executando: Number(status.Threads_running) || 0,
        pico: Number(status.Max_used_connections) || 0, picoEm: status.Max_used_connections_time ?? null,
        recusadasPorLimite: Number(status.Connection_errors_max_connections) || 0, falhasDeConexao: Number(status.Aborted_connects) || 0,
        consultasLentas: Number(status.Slow_queries) || 0, lentaAcimaDeS: Number.isFinite(lentaS) ? lentaS : null, pesadas, ligadoHaHoras: Math.round((Number(status.Uptime) || 0) / 360) / 10,
        quem, poolDoCrm: situacaoPool({ zerarEsperas: false }), lentasDoCrm: consultasLentasCrm(),
      };
      res.json({
        ok: true, conexoes, totalTabelasMB: mb(total), binlogs, bancos, arquivos, variaveis, compartilhadas,
        tabelas: tabelas.slice(0, 25).map(t => ({ tabela: t.tabela, linhas: Number(t.linhas) || 0, mb: mb(Number(t.dados || 0) + Number(t.indices || 0)), livreMB: mb(t.livre) })),
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, erro: e?.message });
    }
  });
}
