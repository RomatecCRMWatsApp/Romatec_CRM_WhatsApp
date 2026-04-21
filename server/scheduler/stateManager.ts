/**
 * ROMATEC CRM v9.0 — Persistência de estado do scheduler (schedulerState table)
 */

import { getDb } from '../db';
import { schedulerState as schedulerStateTable } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';
import type { SchedulerState } from './types';

export async function saveStateToDB(state: SchedulerState): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const status = state.isRunning ? 'running' : 'stopped';
    const stateJson = {
      hourNumber: state.hourNumber,
      totalSent: state.totalSent,
      totalFailed: state.totalFailed,
      startedAt: state.startedAt,
      nightMode: state.nightMode,
      campaignStates: state.campaignStates,
      scheduledSlots: state.scheduledSlots,
    };

    const rows = await db.select().from(schedulerStateTable).where(eq(schedulerStateTable.id, 1)).limit(1);
    if (rows[0]) {
      // Preservar campos extras (ex: lastCycleNotif do Telegram)
      const existingJson = (rows[0].stateJson as Record<string, any>) || {};
      const mergedJson = { ...existingJson, ...stateJson };
      await db.update(schedulerStateTable)
        .set({ status, cycleNumber: state.hourNumber, stateJson: mergedJson, updatedAt: new Date() })
        .where(eq(schedulerStateTable.id, 1));
    } else {
      await db.insert(schedulerStateTable).values({
        id: 1,
        status,
        cycleNumber: state.hourNumber,
        stateJson,
        messagesThisCycle: state.totalSent,
      });
    }
    console.log(`💾 Estado salvo: ${status} | Ciclo ${state.hourNumber + 1}/10`);
  } catch (e) {
    console.error('❌ Erro ao salvar estado:', e);
  }
}

export async function loadStateFromDB(): Promise<Partial<SchedulerState> | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const rows = await db.select().from(schedulerStateTable).where(eq(schedulerStateTable.id, 1)).limit(1);
    if (rows[0] && rows[0].status === 'running') {
      const json = rows[0].stateJson as any;
      if (json) {
        console.log(`✅ Estado restaurado: Ciclo ${(json.hourNumber || 0) + 1}/10`);
        return {
          hourNumber: json.hourNumber || 0,
          totalSent: json.totalSent || 0,
          totalFailed: json.totalFailed || 0,
          startedAt: json.startedAt || Date.now(),
          nightMode: json.nightMode || false,
          campaignStates: json.campaignStates || [],
        };
      }
    }
    console.log('📋 Nenhum estado salvo - scheduler parado');
    return null;
  } catch (e) {
    console.error('❌ Erro ao carregar estado:', e);
    return null;
  }
}

export async function getDBStatus(): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(schedulerStateTable).where(eq(schedulerStateTable.id, 1)).limit(1);
    return rows[0]?.status || null;
  } catch {
    return null;
  }
}

export async function setZApiAutopausedFlag(value: boolean): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(schedulerStateTable).where(eq(schedulerStateTable.id, 1)).limit(1);
    if (rows[0]) {
      const merged = { ...(rows[0].stateJson as Record<string, any> || {}), zapiAutopaused: value };
      await db.update(schedulerStateTable).set({ stateJson: merged }).where(eq(schedulerStateTable.id, 1));
      console.log(`💾 [Z-API] zapiAutopaused=${value} salvo no banco`);
    }
  } catch (e) {
    console.error('[Z-API] Erro ao salvar zapiAutopaused:', e);
  }
}
