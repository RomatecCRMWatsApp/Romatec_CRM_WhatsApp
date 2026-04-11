import { eq } from "drizzle-orm";
import { campaigns } from "../../../drizzle/schema";
import { getDb } from "../../db";

const CAMPAIGN_NAMES: { id: number; name: string }[] = [
  { id: 60132, name: "ALACIDE" },
  { id: 60133, name: "Mod_Vaz-01" },
  { id: 60134, name: "Mod_Vaz-02" },
  { id: 60135, name: "Mod_Vaz-03" },
  { id: 60136, name: "Condomínio de Chácaras Giuliano" },
];

export async function updateCampaignNames(): Promise<void> {
  console.log("[Migration] Iniciando atualização de nomes das campanhas...");

  const db = await getDb();
  if (!db) {
    console.warn("[Migration] Banco de dados não disponível, pulando migração.");
    return;
  }

  for (const { id, name } of CAMPAIGN_NAMES) {
    try {
      const existing = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, id))
        .limit(1);

      if (existing.length === 0) {
        console.warn(`[Migration] Campanha id=${id} não encontrada, pulando.`);
        continue;
      }

      if (existing[0].name === name) {
        console.log(`[Migration] ⏭️  Campanha id=${id} já possui o nome correto ("${name}"), pulando.`);
        continue;
      }

      await db.update(campaigns).set({ name }).where(eq(campaigns.id, id));
      console.log(`[Migration] ✅ Campanha id=${id} atualizada → "${name}"`);
    } catch (error) {
      console.error(`[Migration] ❌ Erro ao atualizar campanha id=${id}:`, error);
    }
  }

  console.log("[Migration] Atualização de nomes das campanhas concluída.");
}
