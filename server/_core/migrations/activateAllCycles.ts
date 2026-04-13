import { getDb } from '../../db';
import { campaigns } from '../../../drizzle/schema';

/**
 * Migration: Auto-ativar campanhas para ciclos DIA e NOITE
 *
 * Ativa as 5 campanhas por padrão para ambos os ciclos
 * Executa apenas uma vez no startup
 */
export async function activateAllCycles(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.log('[Migration] ⚠️  Database not available');
      return;
    }

    // Obter todas as campanhas ativas (running)
    const allCampaigns = await (db as any).execute(
      `SELECT id, activeDay, activeNight FROM campaigns WHERE status = 'running'`
    );

    const rows = Array.isArray(allCampaigns) && allCampaigns[0] ? allCampaigns[0] : allCampaigns;

    if (!Array.isArray(rows) || rows.length === 0) {
      console.log('[Migration] ⚠️  Nenhuma campanha ativa encontrada');
      return;
    }

    // Contar campanhas já ativas
    const alreadyActiveDia = rows.filter((r: any) => r.activeDay).length;
    const alreadyActiveNoite = rows.filter((r: any) => r.activeNight).length;

    // Se nenhuma ativa, ativar todas
    if (alreadyActiveDia === 0 && alreadyActiveNoite === 0) {
      await (db as any).execute(
        `UPDATE campaigns SET activeDay = 1, activeNight = 1 WHERE status = 'running'`
      );
      console.log(`[Migration] ✅ Ativadas ${rows.length} campanhas para DIA e NOITE`);
      console.log(`[Migration] 🚀 Sistema pronto para enviar mensagens!`);
    } else {
      console.log(`[Migration] ℹ️  Campanhas já configuradas (DIA: ${alreadyActiveDia}/5, NOITE: ${alreadyActiveNoite}/5)`);
    }
  } catch (error) {
    console.error('[Migration] ❌ Erro ao ativar ciclos:', error);
  }
}
