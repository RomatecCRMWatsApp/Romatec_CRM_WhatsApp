import { getDb } from '../../db';

/**
 * Migration: Add cycle activation columns to campaigns table
 *
 * Enables per-campaign, per-cycle (day/night) activation toggle
 * Maximum 5 campaigns can be active per cycle
 */
export async function addCycleActivationColumns(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.log('[Migration] ⚠️  Database not available');
      return;
    }

    // Try to add columns - ignore if they already exist
    const columnsToAdd = [
      { name: 'activeDay', definition: 'BOOLEAN DEFAULT false NOT NULL COMMENT "Ativo no ciclo dia (08h-18h)"' },
      { name: 'activeNight', definition: 'BOOLEAN DEFAULT false NOT NULL COMMENT "Ativo no ciclo noite (20h-06h)"' },
      { name: 'cycleActivationUpdatedAt', definition: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT "Quando a ativação foi alterada"' },
    ];

    let addedCount = 0;
    let skippedCount = 0;

    for (const col of columnsToAdd) {
      try {
        await (db as any).execute(
          `ALTER TABLE campaigns ADD COLUMN ${col.name} ${col.definition}`
        );
        console.log(`[Migration] ✅ Adicionada coluna: ${col.name}`);
        addedCount++;
      } catch (error: any) {
        // Skip if column already exists
        if (error.code === 'ER_DUP_FIELDNAME' || error.message?.includes('Duplicate column')) {
          skippedCount++;
        } else {
          throw error;
        }
      }
    }

    if (addedCount > 0) {
      console.log(`[Migration] ✅ ${addedCount} colunas adicionadas ao campaigns`);
    }
    if (skippedCount > 0) {
      console.log(`[Migration] ℹ️  ${skippedCount} colunas já existiam`);
    }
    if (addedCount === 0 && skippedCount === 3) {
      console.log('[Migration] ℹ️  Cycle activation columns já existem, pulando');
    }
  } catch (error) {
    const err = error as any;
    console.error('[Migration] ❌ Error adding cycle activation columns:', err.message || error);
  }
}
