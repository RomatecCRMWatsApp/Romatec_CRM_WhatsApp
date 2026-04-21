// @module ResetManager — Reset de contadores e carga de novos contatos a cada turno

/**
 * ROMATEC CRM v9.0 — Reset de ciclo e limpeza de logs
 *
 * Responsabilidades:
 * - Limpeza de registros 'pending' no boot (evita falsos positivos após restart)
 * - Remoção de logs antigos/formato-legado do messageSendLog
 * - Inicialização de campaignStates com sentThisHour restaurado do DB
 * - Sincronização campanhas × imóveis (criar/pausar/atualizar)
 * - Geração de variações de mensagens para novos imóveis
 */

import { getDb } from '../../db';
import {
  campaigns,
  properties,
  messageSendLog,
} from '../../../drizzle/schema';
import { eq, and, or, gt, lt } from 'drizzle-orm';
import { asc } from 'drizzle-orm';
import { getCurrentHourKey } from './cycleManager';
import { assignContactsToCampaign } from '../contactManager';
import type { CampaignHourState, SchedulerState } from '../types/campaign.types';

/** Marca registros 'pending' como 'failed' no boot e remove registros antigos */
export async function cleanupPendingLogs(db: any): Promise<void> {
  try {
    await db.update(messageSendLog)
      .set({ status: 'failed', reason: 'server_restart' })
      .where(eq(messageSendLog.status, 'pending'));
    console.log(`🧹 [ResetMgr] Boot cleanup: 'pending' → 'failed' (restarts anteriores)`);

    const currentCycleHour = Math.floor(Date.now() / 3600000);
    await db.delete(messageSendLog)
      .where(or(
        gt(messageSendLog.cycleHour, 1000000),
        lt(messageSendLog.cycleHour, currentCycleHour - 25)
      ));
    console.log(`🧹 [ResetMgr] Boot cleanup: registros antigos/formato-legado removidos`);
  } catch (e) {
    console.error('[ResetMgr] Erro na limpeza de pending:', e);
  }
}

/**
 * Inicializa campaignStates restaurando sentThisHour do DB.
 * Sobrevive a restarts: consulta messageSendLog para saber quem já enviou nesta hora.
 */
export async function initCampaignStates(
  currentStates: CampaignHourState[],
  nightMode: boolean
): Promise<CampaignHourState[]> {
  const db = await getDb();
  if (!db) return currentStates;

  await cleanupPendingLogs(db);

  const allCampaigns = await db.select().from(campaigns)
    .where(eq(campaigns.status, 'running'))
    .orderBy(asc(campaigns.id));

  const currentHourKey = getCurrentHourKey();
  const activePeriod = nightMode ? 'activeNight' : 'activeDay';
  const eligible = allCampaigns.filter((camp: any) => camp[activePeriod] === true);

  console.log(`📊 [ResetMgr] Campanhas elegíveis: ${eligible.length}/5 (modo ${nightMode ? 'NOITE 🌙' : 'DIA ☀️'})`);

  const cycleHour = Math.floor(Date.now() / 3600000);
  const sentLogs = await db
    .select({ campaignId: messageSendLog.campaignId })
    .from(messageSendLog)
    .where(and(
      eq(messageSendLog.cycleHour, cycleHour),
      eq(messageSendLog.status, 'sent')
    ));
  const alreadySentIds = new Set<number>(sentLogs.map((r: any) => r.campaignId));

  if (alreadySentIds.size > 0) {
    console.log(`♻️ [ResetMgr] Campanhas que já enviaram (restaurado do DB): ${Array.from(alreadySentIds).join(', ')}`);
  }

  return eligible.map((camp: any) => {
    const alreadySent = alreadySentIds.has(camp.id);
    const existing = currentStates.find(cs => cs.campaignId === camp.id);
    return {
      campaignId: camp.id,
      campaignName: camp.name,
      sentThisHour: alreadySent || (existing?.lastSentHourKey === currentHourKey),
      lastSentHourKey: alreadySent ? currentHourKey : (existing?.lastSentHourKey || null),
    };
  });
}

/**
 * Sincroniza campanhas com imóveis: cria campanhas para novos imóveis,
 * pausa campanhas sem imóvel ativo, atualiza templates desatualizados.
 */
export async function syncCampaignsWithProperties(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const activeProperties = await db.select().from(properties).where(eq(properties.status, 'available'));
    const existingCampaigns = await db.select().from(campaigns);
    const existingPropertyIds = existingCampaigns.map((c: any) => c.propertyId);
    const sharedUsedIds = new Set<number>();

    for (const prop of activeProperties) {
      const freshVariations = generateMessageVariations(prop);

      if (!existingPropertyIds.includes(prop.id)) {
        console.log(`➕ [ResetMgr] Criando campanha: ${prop.denomination}`);
        const result = await db.insert(campaigns).values({
          propertyId: prop.id,
          name: prop.denomination,
          messageVariations: freshVariations,
          totalContacts: 2,
          sentCount: 0,
          failedCount: 0,
          messagesPerHour: 1,
          status: 'running',
          startDate: new Date(),
        });
        const campaignId = Number((result as any)[0].insertId);
        await assignContactsToCampaign(campaignId, sharedUsedIds);
      } else {
        const existingCamp = existingCampaigns.find((c: any) => c.propertyId === prop.id);
        if (existingCamp) {
          const rawVar = String(existingCamp.messageVariations || '');
          if (rawVar.includes('{ENDERECO}') || rawVar.includes('ENDERECO') || rawVar.length < 50 || !rawVar.includes('👀')) {
            await db.update(campaigns)
              .set({ messageVariations: freshVariations })
              .where(eq(campaigns.id, existingCamp.id));
            console.log(`🔄 [ResetMgr] Templates atualizados: ${existingCamp.name}`);
          }
        }
      }
    }

    const activePropertyIds = activeProperties.map((p: any) => p.id);
    for (const camp of existingCampaigns) {
      if (!activePropertyIds.includes(camp.propertyId)) {
        await db.update(campaigns).set({ status: 'paused' }).where(eq(campaigns.id, camp.id));
      } else if (camp.status === 'paused') {
        await db.update(campaigns).set({ status: 'running' }).where(eq(campaigns.id, camp.id));
      }
    }

    const running = await db.select().from(campaigns).where(eq(campaigns.status, 'running'));
    console.log(`✅ [ResetMgr] ${running.length} campanhas ativas`);
  } catch (error) {
    console.error('❌ [ResetMgr] Erro na sincronização:', error);
  }
}

/**
 * Auto-fix: garante que activeDay/activeNight estejam corretos para o modo atual.
 * Corrige campanhas com flag errado antes de agendar o slot.
 */
export async function fixActiveFlagsForMode(nightMode: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;

  if (nightMode) {
    const wrong = await db.select().from(campaigns)
      .where(and(eq(campaigns.status, 'running'), eq(campaigns.activeNight, false)));
    if (wrong.length > 0) {
      await db.update(campaigns).set({ activeNight: true, activeDay: false }).where(eq(campaigns.status, 'running'));
      console.log(`🔧 [ResetMgr] ${wrong.length} campanha(s) com activeNight=false corrigidas → true`);
    }
  } else {
    const wrong = await db.select().from(campaigns)
      .where(and(eq(campaigns.status, 'running'), eq(campaigns.activeDay, false)));
    if (wrong.length > 0) {
      await db.update(campaigns).set({ activeDay: true, activeNight: false }).where(eq(campaigns.status, 'running'));
      console.log(`🔧 [ResetMgr] ${wrong.length} campanha(s) com activeDay=false corrigidas → true`);
    }
  }
}

/** Gera variações de mensagem para um imóvel */
export function generateMessageVariations(prop: any): string[] {
  const priceFormatted = Number(prop.price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const denom = prop.denomination || '';
  const city = prop.address?.split(',').pop()?.trim() || 'Açailândia';
  const isChacara = denom.toLowerCase().includes('chacara') || denom.toLowerCase().includes('chácar') || denom.toLowerCase().includes('giuliano');

  if (isChacara) {
    return [
      `{{NOME}}, ainda tem uma chácara disponível aqui em Açailândia 👀\n\nMuita gente perguntou essa semana, mas ainda não fechou.\n\n*Você tem interesse em sair do aluguel ou investir?*`,
      `{{NOME}} 🌿\n\nImagina acordar no seu próprio espaço, sem vizinho em cima, com quintal de *1.000m²*...\n\nEsso lugar existe aqui em Açailândia e ainda tem parcela que cabe no salário.\n\n*Posso te mostrar?*`,
      `{{NOME}}, rápido — tenho uma chácara aqui que tá praticamente saindo 🔥\n\nA última que ofereci assim fechou em 3 dias.\n\n*Você quer ver antes que some?*`,
      `Boa noite {{NOME}}! 🌙\n\nUma família de Açailândia fechou uma chácara igual a essa semana passada — disseram que foi a melhor decisão.\n\nAinda tem uma no mesmo condomínio por *R$ ${priceFormatted}*.\n\n*Quer que eu reserve pra você ver?*`,
      `{{NOME}}, quantos anos ainda pagando aluguel? 🤔\n\nTenho uma chácara de *1.000m²* aqui em Açailândia que sai por parcela menor do que você imagina.\n\n*Me fala: você prefere casa ou chácara?*`,
      `{{NOME}} 🤫\n\nNão tô divulgando esse imóvel pra todo mundo não — mas achei que era exatamente o que você busca.\n\nChácara de *~1.000m²* em Açailândia, *R$ ${priceFormatted}*, financiamento fácil.\n\n*Posso te mandar as fotos?*`,
    ];
  }

  return [
    `{{NOME}}, me tira uma dúvida rápida 👇\n\nVocê ainda tá buscando casa própria em ${city}?\n\nTenho um imóvel aqui que tá saindo muito rápido e queria te mostrar antes de fechar.`,
    `{{NOME}} 🔥\n\nEsse imóvel aqui em ${city} já teve 4 consultas essa semana — e ainda não fechou.\n\n*R$ ${priceFormatted}* com financiamento que cabe no bolso.\n\n*Você quer ser o próximo a conhecer?*`,
    `Boa noite {{NOME}}! 🌙\n\nAluguel todo mês é dinheiro jogado fora, né?\n\nTenho uma casa em ${city} por *R$ ${priceFormatted}* — parcela que você provavelmente já paga de aluguel.\n\n*Faz sentido pra você?*`,
    `{{NOME}}, preciso te avisar de algo ⚠️\n\nEsse imóvel em ${city} tá com *última unidade disponível*.\n\nJá tive 2 interessados essa semana. Se quiser ver primeiro, me responde agora.`,
    `{{NOME}} 👀\n\nVocê toparia sair do aluguel com parcela de financiamento?\n\nTenho algo aqui em ${city} que pode mudar de figura pra você — *R$ ${priceFormatted}*.\n\n*Quer ver?*`,
    `{{NOME}}, tenho uma condição especial aqui 🤫\n\nNão ofereço pra todo mundo, mas tenho um imóvel em ${city} por *R$ ${priceFormatted}* com entrada negociável.\n\n*Você tem FGTS disponível?*`,
  ];
}

/** Seleciona variação de mensagem sem repetir a última enviada */
export async function getMessageVariation(
  campaignId: number,
  lastVariationIndex: Map<number, number>
): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  const campaign = result[0];
  if (!campaign?.messageVariations) return null;

  let variations: string[] = [];
  const raw = campaign.messageVariations;
  if (Array.isArray(raw)) {
    variations = raw as string[];
  } else if (raw) {
    try {
      const parsed = JSON.parse(raw as string);
      variations = Array.isArray(parsed) ? parsed : [String(raw)];
    } catch {
      const rawStr = String(raw).trim();
      if (rawStr.length > 5) variations = [rawStr];
    }
  }

  if (variations.length === 0) return null;

  const lastIndex = lastVariationIndex.get(campaignId) ?? -1;
  let newIndex: number;
  if (variations.length <= 1) {
    newIndex = 0;
  } else {
    do {
      newIndex = Math.floor(Math.random() * variations.length);
    } while (newIndex === lastIndex);
  }

  lastVariationIndex.set(campaignId, newIndex);
  return variations[newIndex];
}
