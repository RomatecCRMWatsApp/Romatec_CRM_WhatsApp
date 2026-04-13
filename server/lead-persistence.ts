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

    if (existing && existing[0]) {
      // UPDATE
      await db
        .update(leadQualifications)
        .set({
          stage,
          answers: answers as any,
          lastActivityAt: now,
          updatedAt: now,
        })
        .where(eq(leadQualifications.phone, cleanPhone));

      console.log(`[Persistence] ✅ Updated lead ${cleanPhone} at stage ${stage}`);
    } else {
      // INSERT
      await db.insert(leadQualifications).values({
        phone: cleanPhone,
        stage,
        answers: answers as any,
        score: 'frio', // default
        lastActivityAt: now,
        createdAt: now,
        updatedAt: now,
      } as any);

      console.log(`[Persistence] ✅ Created lead ${cleanPhone} at stage ${stage}`);
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
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const cleanPhone = phone.replace(/\D/g, '');
    const blockedUntil = new Date();
    blockedUntil.setHours(blockedUntil.getHours() + 24); // Bloquear por 24 horas apenas

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
