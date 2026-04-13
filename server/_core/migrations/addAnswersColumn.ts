/**
 * Migration: Add answers column to leadQualifications table
 * Stores JSON array of all 10 qualification question answers
 */
export async function addAnswersColumn(): Promise<void> {
  try {
    const db = await (await import('../../db')).getDb();
    if (!db) {
      console.log('[Migration] ⚠️  Database not available');
      return;
    }

    try {
      await (db as any).execute(
        `ALTER TABLE leadQualifications ADD COLUMN answers JSON COMMENT "Respostas JSON das 10 perguntas de qualificação"`
      );
      console.log('[Migration] ✅ Coluna answers adicionada com sucesso');
    } catch (error: any) {
      if (error.code === 'ER_DUP_FIELDNAME' || error.message?.includes('Duplicate column')) {
        console.log('[Migration] ℹ️  Coluna answers já existe');
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('[Migration] ❌ Erro ao adicionar coluna answers:', error);
  }
}
