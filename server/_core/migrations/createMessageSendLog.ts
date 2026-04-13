import { getDb } from '../../db';

/**
 * Migration: Create messageSendLog table for duplicate prevention
 *
 * Enforces: 1 message per contact per cycle hour (UNIQUE constraint at DB level)
 * This is the CRITICAL table that prevents duplicate message sends
 */
export async function createMessageSendLogTable(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.log('[Migration] ⚠️  Database not available');
      return;
    }

    // Check if table already exists
    const result = await (db as any).execute(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messageSendLog'`
    );

    if (result && result.length > 0) {
      console.log('[Migration] ✅ messageSendLog table already exists');
      return;
    }

    // Create the table with UNIQUE constraint
    await (db as any).execute(`
      CREATE TABLE messageSendLog (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contactPhone VARCHAR(20) NOT NULL,
        campaignId INT NOT NULL,
        sentAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        cycleHour INT NOT NULL,
        status ENUM('sent', 'skipped_duplicate', 'failed') DEFAULT 'sent' NOT NULL,
        reason VARCHAR(255),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        UNIQUE KEY unique_contact_cycle_hour (contactPhone, cycleHour),
        KEY idx_contactPhone (contactPhone),
        KEY idx_cycleHour (cycleHour),
        KEY idx_sentAt (sentAt)
      )
      ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('[Migration] ✅ messageSendLog table created successfully');
    console.log('[Migration] ✅ UNIQUE constraint on (contactPhone, cycleHour) active');
    console.log('[Migration] 🔒 DUPLICATE PROTECTION ENABLED: 1 message per contact per hour');
  } catch (error) {
    const err = error as any;
    // Ignore "table already exists" error
    if (err.message?.includes('already exists') || err.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('[Migration] ℹ️  messageSendLog table already exists');
    } else {
      console.error('[Migration] ❌ Error creating messageSendLog table:', error);
    }
  }
}
