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

    // Reset all campaigns to have cycle activation disabled
    await (db as any).execute(
      `UPDATE campaigns SET activeDay = false, activeNight = false, cycleActivationUpdatedAt = CURRENT_TIMESTAMP`
    );

    console.log('[Migration] ✅ Cycle activation reset: all campaigns disabled (activeDay=false, activeNight=false)');
  } catch (error) {
    console.error('[Migration] ❌ Error resetting cycle activation:', error);
  }
}
