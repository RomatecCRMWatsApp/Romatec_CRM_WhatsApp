/**
 * Restore one-time: recria o imóvel Mod_Vaz-02 deletado acidentalmente
 * Executado uma vez na inicialização — idempotente (verifica antes de inserir)
 */
import { getDb } from '../../db';
import { properties } from '../../../drizzle/schema';
import { eq } from 'drizzle-orm';

export async function restoreModVaz02() {
  try {
    const db = await getDb();
    if (!db) return;

    // Verifica se já existe
    const existing = await db.select().from(properties)
      .where(eq(properties.publicSlug, 'mod-vaz-02'))
      .limit(1);

    if (existing.length > 0) {
      console.log('[Restore] Mod_Vaz-02 já existe — pulando');
      return;
    }

    await db.insert(properties).values({
      denomination: 'Mod_Vaz-02',
      address: 'Rua Amaro Pedroza, Quadra 17, Lote 011, Juscelino Kubitschek de Oliveira',
      city: 'Açailândia',
      state: 'MA',
      price: '250000.00',
      status: 'available',
      publicSlug: 'mod-vaz-02',
      images: [],
      propertyType: 'casa',
    } as any);

    console.log('[Restore] ✅ Mod_Vaz-02 reinserido com sucesso');
  } catch (e) {
    console.error('[Restore] Erro ao restaurar Mod_Vaz-02:', e);
  }
}
