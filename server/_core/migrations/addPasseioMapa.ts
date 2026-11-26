import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/** Migration: Passeio no Mapa (links públicos do empreendimento e eventos do cliente). Só cria tabelas novas; idempotente. */
export async function addPasseioMapa(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  try {
    await (db as any).execute(sql`CREATE TABLE IF NOT EXISTS tourLinks (
      id INT AUTO_INCREMENT PRIMARY KEY, token VARCHAR(24) NOT NULL, empreendimentoId INT NOT NULL, loteDestaqueId INT NULL, leadId INT NULL,
      corretorId INT NOT NULL, mostrarPreco BOOLEAN NOT NULL DEFAULT TRUE, expiraEm TIMESTAMP NULL, ativo BOOLEAN NOT NULL DEFAULT TRUE,
      aberturas INT NOT NULL DEFAULT 0, ultimaAberturaAt TIMESTAMP NULL, criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY ux_tour_token (token), KEY ix_tour_emp (empreendimentoId)
    )`);
    await (db as any).execute(sql`CREATE TABLE IF NOT EXISTS tourEventos (
      id INT AUTO_INCREMENT PRIMARY KEY, tourLinkId INT NOT NULL, tipo VARCHAR(16) NOT NULL, loteId INT NULL, passo INT NULL,
      sessao VARCHAR(40) NULL, ua VARCHAR(120) NULL, ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY ix_tourev_link (tourLinkId)
    )`);
  } catch (e: any) { console.error('[Migration] addPasseioMapa:', e?.message); }
  console.log('[Migration] ✅ addPasseioMapa (links do Passeio no Mapa)');
}
