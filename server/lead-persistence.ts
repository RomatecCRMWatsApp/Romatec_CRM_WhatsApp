/**
 * Persistência de Lead no Banco
 * Salva estado de conversa para continuar após restart
 */

import { getDb } from './db';
import { leadQualifications } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

export interface LeadState {
  phone: string;
  stage: string;
  senderName: string;
  answers: Record<string, any>;
  lastActivityAt: Date;
}

/**
 * Salvar ou atualizar lead no banco após cada resposta
 * Chamado após cada message processada
 */
export async function persistLeadState(
  phone: string,
  stage: string,
  senderName: string,
  answers: Record<string, any>,
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.log('[Persistence] ⚠️  Database unavailable');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const now = new Date();

    // Verificar se já existe
    const existing = await db
      .select()
      .from(leadQualifications)
      .where(eq(leadQualifications.phone, cleanPhone))
      .limit(1);

    const realName = senderName && senderName !== 'Cliente' ? senderName : undefined;

    if (existing && existing[0]) {
      // UPDATE
      await db
        .update(leadQualifications)
        .set({
          stage,
          ...(realName ? { nome: realName } : {}),
          answers: answers as any,
          lastActivityAt: now,
          updatedAt: now,
        })
        .where(eq(leadQualifications.phone, cleanPhone));
      await slotsDoBotEScore(cleanPhone, answers);

      console.log(`[Lead Update] phone=${cleanPhone} stage=${stage} name=${realName || existing[0].nome || 'sem nome'}`);
    } else {
      // INSERT
      await db.insert(leadQualifications).values({
        phone: cleanPhone,
        stage,
        nome: realName || null,
        answers: answers as any,
        score: 'frio', // default — atualizado ao completar qualificação
        lastActivityAt: now,
        createdAt: now,
        updatedAt: now,
      } as any);

      console.log(`[Lead Update] phone=${cleanPhone} stage=${stage} name=${realName || 'sem nome'} [CRIADO]`);
    }
  } catch (error) {
    console.error('[Persistence] ❌ Erro ao persistir lead:', error);
    // Não falhar a conversa se banco estiver fora
  }
}

/**
 * Carregar lead do banco para continuar conversa
 * Chamado quando lead retorna após tempo
 */
export async function loadLeadState(phone: string): Promise<LeadState | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const cleanPhone = phone.replace(/\D/g, '');

    const result = await db
      .select()
      .from(leadQualifications)
      .where(eq(leadQualifications.phone, cleanPhone))
      .limit(1);

    if (result && result[0]) {
      const lead = result[0];
      return {
        phone: lead.phone,
        stage: lead.stage || 'nao_iniciado',
        senderName: lead.nome || 'Cliente',
        answers: (lead.answers as any) || {},
        lastActivityAt: lead.lastActivityAt || new Date(),
      };
    }

    return null;
  } catch (error) {
    console.error('[Persistence] ❌ Erro ao carregar lead:', error);
    return null;
  }
}

/**
 * Marcar lead como descartado (aguardar 24h antes de reativar)
 * Todo "não" de hoje pode ser "sim" amanhã
 */
export async function discardLead(
  phone: string,
  reason: string,
  blockHours: number = 24, // opt-out LGPD ("PARAR") passa um prazo bem maior
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const cleanPhone = phone.replace(/\D/g, '');
    const blockedUntil = new Date();
    blockedUntil.setHours(blockedUntil.getHours() + blockHours);

    const existing = await db
      .select()
      .from(leadQualifications)
      .where(eq(leadQualifications.phone, cleanPhone))
      .limit(1);

    if (existing && existing[0]) {
      await db
        .update(leadQualifications)
        .set({
          stage: 'descartado',
          discardReason: reason,
          blockedUntil,
          updatedAt: new Date(),
        })
        .where(eq(leadQualifications.phone, cleanPhone));

      console.log(
        `[Persistence] 🚫 Lead ${cleanPhone} descartado: ${reason}. Bloqueado até ${blockedUntil.toLocaleDateString('pt-BR')}`,
      );
    }
  } catch (error) {
    console.error('[Persistence] ❌ Erro ao descartar lead:', error);
  }
}

/**
 * Verificar se lead está bloqueado
 * Retorna true se bloqueado (não enviar mensagens)
 */
export async function isLeadBlocked(phone: string): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    const cleanPhone = phone.replace(/\D/g, '');
    const result = await db
      .select()
      .from(leadQualifications)
      .where(eq(leadQualifications.phone, cleanPhone))
      .limit(1);

    if (result && result[0]) {
      const lead = result[0];
      if (lead.blockedUntil) {
        const now = new Date();
        if (now < lead.blockedUntil) {
          console.log(
            `[Persistence] 🚫 Lead ${cleanPhone} está bloqueado até ${lead.blockedUntil.toLocaleDateString('pt-BR')}`,
          );
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('[Persistence] ❌ Erro ao verificar bloqueio:', error);
    return false;
  }
}

/**
 * Buscar leads com timeout (sem resposta há 45 min)
 * Para enviar mensagem de reengajamento
 */
export async function getStaleLeads(timeoutMinutes: number = 45): Promise<LeadState[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const timeoutMs = timeoutMinutes * 60 * 1000;
    const cutoffTime = new Date(Date.now() - timeoutMs);

    // Buscar leads em qualificação que não responderam
    const results = await db
      .select()
      .from(leadQualifications)
      .where(eq(leadQualifications.stage, 'qual_etapa_1')); // Simplificado: apenas primeira etapa

    const stale = results.filter((lead) => {
      if (!lead.lastActivityAt) return false;
      return lead.lastActivityAt < cutoffTime;
    });

    console.log(
      `[Persistence] 📊 Found ${stale.length} leads com timeout (>${timeoutMinutes}min sem resposta)`,
    );

    return stale.map((lead) => ({
      phone: lead.phone,
      stage: lead.stage || 'nao_iniciado',
      senderName: lead.nome || 'Cliente',
      answers: (lead.answers as any) || {},
      lastActivityAt: lead.lastActivityAt || new Date(),
    }));
  } catch (error) {
    console.error('[Persistence] ❌ Erro ao buscar leads stale:', error);
    return [];
  }
}

/**
 * Respostas do bot que batem com o enum viram slots (fonte bot) e o score
 * é recalculado pelas regras (o bot não dá mais a nota sozinho).
 */
export async function slotsDoBotEScore(phone: string, answers: Record<string, any>): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const [lead] = await db.select({ id: leadQualifications.id, funil: leadQualifications.funil, slots: leadQualifications.slots })
      .from(leadQualifications).where(eq(leadQualifications.phone, phone)).limit(1);
    if (!lead) return;
    const { mesclarSlots, slotsDeRespostas } = await import('./leads/slots');
    const novos = slotsDeRespostas(answers);
    const atuais = (lead.slots || {}) as Record<string, { valor: string }>;
    // Não sobrescreve slot que veio de formulário ou do painel
    const soNovos = Object.fromEntries(Object.entries(novos).filter(([k]) => !atuais[k]));
    if (Object.keys(soNovos).length) {
      const { slots, aceitos } = mesclarSlots((lead.funil as any) || 'comprador', lead.slots as any, soNovos, 'bot');
      if (aceitos.length) await db.update(leadQualifications).set({ slots } as any).where(eq(leadQualifications.id, lead.id));
    }
    const { recalcularScoreLead } = await import('./leads/scoreService');
    await recalcularScoreLead(lead.id, { motivo: 'resposta_bot', slotsNovos: soNovos });
  } catch (e) {
    console.warn('[Persistence] Score do bot não recalculado (não crítico):', e);
  }
}

/**
 * Empreendimento do lead (ex.: bom-jardims) — esses leads têm roteiro próprio
 * e atendimento humano; o bot genérico não responde.
 */
export async function getLeadEmpreendimento(phone: string): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const cleanPhone = phone.replace(/\D/g, '');
    const [lead] = await db
      .select({ empreendimentoSlug: leadQualifications.empreendimentoSlug, funil: leadQualifications.funil, stage: leadQualifications.stage })
      .from(leadQualifications)
      .where(eq(leadQualifications.phone, cleanPhone))
      .limit(1);
    if (lead?.empreendimentoSlug) return lead.empreendimentoSlug;
    // Proprietário (captação) e handoff: o corretor atende, o bot de comprador não responde
    if (lead?.funil === 'proprietario' || lead?.stage === 'atendimento_humano') return 'atendimento_humano';
    return null;
  } catch (error) {
    console.error('[Persistence] ❌ Erro ao buscar empreendimento do lead:', error);
    return null;
  }
}
