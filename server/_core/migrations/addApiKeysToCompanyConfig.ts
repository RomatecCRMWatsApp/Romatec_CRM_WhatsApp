import { getDb } from '../../db';

/**
 * Migration: Add telegramBotToken, telegramChatId, openAiApiKey to companyConfig
 * Allows credentials to be managed via UI instead of .env only
 */
export async function addApiKeysToCompanyConfig(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.log('[Migration] ⚠️  Database not available');
      return;
    }

    const columns = [
      { name: 'telegramBotToken', def: "VARCHAR(255) NULL" },
      { name: 'telegramChatId',   def: "VARCHAR(100) NULL" },
      { name: 'openAiApiKey',     def: "VARCHAR(255) NULL" },
    ];

    let added = 0;
    for (const col of columns) {
      try {
        await (db as any).execute(
          `ALTER TABLE companyConfig ADD COLUMN ${col.name} ${col.def}`
        );
        console.log(`[Migration] ✅ Coluna ${col.name} adicionada ao companyConfig`);
        added++;
      } catch (e: any) {
        if (e.code === 'ER_DUP_FIELDNAME' || e.message?.includes('Duplicate column')) {
          // já existe — ok
        } else {
          throw e;
        }
      }
    }

    if (added === 0) {
      console.log('[Migration] ℹ️  Colunas de API keys já existem no companyConfig');
    } else {
      console.log(`[Migration] ✅ ${added} colunas de API keys adicionadas ao companyConfig`);
    }
  } catch (error) {
    console.error('[Migration] ❌ Erro ao adicionar API keys ao companyConfig:', error);
  }
}
