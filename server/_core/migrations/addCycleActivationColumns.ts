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

    // Check if columns already exist
    const result = await (db as any).execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'campaigns'
       AND COLUMN_NAME IN ('activeDay', 'activeNight')`
    );

    if (result && result.length >= 2) {
      console.log('[Migration] ✅ Cycle activation columns already exist');
      return;
    }

    // Add columns if they don't exist
    const columnsToAdd: { name: string; definition: string }[] = [];

    if (!result?.some((r: any) => r.COLUMN_NAME === 'activeDay')) {
      columnsToAdd.push({
        name: 'activeDay',
        definition: 'BOOLEAN DEFAULT false NOT NULL COMMENT "Ativo no ciclo dia (08h-18h)"',
      });
    }

    if (!result?.some((r: any) => r.COLUMN_NAME === 'activeNight')) {
      columnsToAdd.push({
        name: 'activeNight',
        definition: 'BOOLEAN DEFAULT false NOT NULL COMMENT "Ativo no ciclo noite (20h-06h)"',
      });
    }

    if (!result?.some((r: any) => r.COLUMN_NAME === 'cycleActivationUpdatedAt')) {
      columnsToAdd.push({
        name: 'cycleActivationUpdatedAt',
        definition: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT "Quando a ativação foi alterada"',
      });
    }

    for (const col of columnsToAdd) {
      await (db as any).execute(
        `ALTER TABLE campaigns ADD COLUMN ${col.name} ${col.definition}`
      );
      console.log(`[Migration] ✅ Adicionada coluna: ${col.name}`);
    }

    console.log('[Migration] ✅ Cycle activation columns added successfully');
    console.log('[Migration] 📊 Campanhas agora têm activeDay e activeNight (máx 5 por ciclo)');
  } catch (error) {
    const err = error as any;
    // Ignore "column already exists" error
    if (err.message?.includes('Duplicate column name') || err.code === 'ER_DUP_FIELDNAME') {
      console.log('[Migration] ℹ️  Cycle activation columns already exist');
    } else {
      console.error('[Migration] ❌ Error adding cycle activation columns:', error);
    }
  }
}
