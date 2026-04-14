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
      address: 'Rua Amaro Pedroza, Quadra 17, Lote 011, Lot. Juscelino Kubitschek de Oliveira, Açailândia-MA',
      city: 'Açailândia',
      state: 'MA',
      price: '250000.00',
      status: 'available',
      publicSlug: 'mod-vaz-02',
      images: [],
      propertyType: 'casa',
      bedrooms: 3,
      bathrooms: 2,
      garageSpaces: 1,
      areaConstruida: '65.42',
      areaTerreno: '143.00',
      description: 'Casa moderna com 65,42m² de edificação em lote de 143m² (7,15x20,00m). Projeto Mod_Vaz-02 — Dacity Empreendimentos.\n\nComposição:\n• 01 Garagem\n• 01 Sala de Estar (7,95m²)\n• 01 Cozinha (8,00m²)\n• 01 Copa (7,21m²)\n• 01 Hall (1,34m²)\n• 01 Suíte (9,63m²)\n• 02 Quartos Sociais (10,01m² e 6,56m²)\n• 01 Banheiro Social (3,58m² e 2,40m²)\n• 01 Área de Serviço\n\nFinanciamento facilitado. Parcelas que cabem no seu bolso!',
    } as any);

    console.log('[Restore] ✅ Mod_Vaz-02 reinserido com sucesso');
  } catch (e) {
    console.error('[Restore] Erro ao restaurar Mod_Vaz-02:', e);
  }
}
