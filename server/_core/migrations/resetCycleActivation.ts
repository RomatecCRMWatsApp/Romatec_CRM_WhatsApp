import { getDb } from '../../db';

/**
 * Migration: Reset cycle activation to all false
 *
 * Ensures all campaigns start with activeDay and activeNight disabled (false)
 * This gives users a clean slate to selectively enable campaigns per cycle
 */
export async function resetCycleActivation(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.log('[Migration] ⚠️  Database not available');
      return;
    }

    // Reset all campaigns to have cycle activation disabled (using 0 for MySQL BOOLEAN)
    const result = await (db as any).execute(
      `UPDATE campaigns SET activeDay = 0, activeNight = 0 WHERE activeDay = 1 OR activeNight = 1`
    );

    const affectedRows = (result as any)?.affectedRows || 0;
    if (affectedRows > 0) {
      console.log(`[Migration] ✅ Cycle activation reset: ${affectedRows} campaigns disabled`);
    } else {
      console.log('[Migration] ℹ️  All campaigns already disabled (no changes needed)');
    }
  } catch (error) {
    console.error('[Migration] ❌ Error resetting cycle activation:', error);
  }
}
