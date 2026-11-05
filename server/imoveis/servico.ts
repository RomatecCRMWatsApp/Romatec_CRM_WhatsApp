/**
 * Criação de imóvel — serviço único usado pela tela Imóveis (properties.create) e pelo Agente de Cadastro de Imóveis
 * do WhatsApp: grava o imóvel, gera o código IMV-xxxx, habilita o corretor responsável e cria a campanha pausada.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { acessosCorretor, campaigns, properties } from '../../drizzle/schema';

export interface NovoImovel {
  denomination: string; address: string; city?: string | null; state?: string | null; cep?: string | null; price: string;
  offerPrice?: string | null; areaConstruida?: number | null; areaTerreno?: number | null; bedrooms?: number | null; bathrooms?: number | null;
  garageSpaces?: number | null; propertyType?: string | null; description?: string | null; images?: string[] | null; finalidade?: 'venda' | 'aluguel';
  status?: 'available' | 'sold' | 'inactive'; exibirPreco?: boolean;
  /** campos extras aceitos pelo formulário antigo (ex.: areaTotal) */
  [extra: string]: unknown;
}

export async function criarImovel(dados: NovoImovel, o: { responsavelId?: number | null; responsavelPerfil?: string | null; habilitadoPor?: number | null; chave?: string | null } = {}): Promise<{ id: number; slug: string; codigo: string | null }> {
  const db: any = await getDb();
  if (!db) throw new Error('Database not available');
  const slug = dados.denomination.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36) + (o.chave ? `-${o.chave}` : '');
  const result = await db.insert(properties).values({
    ...dados, price: dados.price as any, offerPrice: (dados.offerPrice as any) || null,
    areaConstruida: (dados.areaConstruida as any) || null, ...(dados.areaTerreno ? { areaTerreno: dados.areaTerreno as any } : {}),
    publicSlug: slug,
  } as any);
  const propertyId = Number((result as any)?.[0]?.insertId ?? (result as any)?.insertId ?? (result as any)?.lastInsertRowid);
  let codigo: string | null = null;
  // Código de atribuição IMV-xxxx (vai na mensagem pré-preenchida do WhatsApp)
  try {
    const { formatCodigoImovel } = await import('../_core/migrations/addLeadsV1');
    codigo = formatCodigoImovel(propertyId);
    await db.update(properties).set({ codigo }).where(eq(properties.id, propertyId));
  } catch (e) { console.warn('[Properties] Código IMV não gravado:', e); codigo = null; }
  // Corretor responsável fica habilitado no imóvel (segue editando o que ele mesmo inseriu)
  if (o.responsavelId && o.responsavelPerfil === 'corretor') {
    await db.insert(acessosCorretor).values({ usuarioId: o.responsavelId, tipo: 'imovel', refId: propertyId, habilitadoPor: o.habilitadoPor ?? o.responsavelId } as any).catch(() => {});
  }
  // Campanha automática do imóvel (pausada: nada é disparado)
  try {
    const n = dados.denomination;
    await db.insert(campaigns).values({
      propertyId, name: n, totalContacts: 2, sentCount: 0, failedCount: 0, status: 'paused', messagesPerHour: 1,
      messageVariations: JSON.stringify([
        `Olá! Temos uma ótima oportunidade em ${n}. Gostaria de conhecer mais? 🏠`,
        `Vimos que você pode estar interessado em ${n}. Vamos conversar? 📞`,
        `Oportunidade especial em ${n}. Clique para saber mais! ✨`,
      ]),
    } as any);
  } catch (campErr) { console.warn('[Properties] Aviso: não foi possível criar campanha automática:', campErr); }
  return { id: propertyId, slug, codigo };
}
