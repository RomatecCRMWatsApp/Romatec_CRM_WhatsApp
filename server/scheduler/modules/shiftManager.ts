// @module ShiftManager — Lógica de turnos NOITE/DIA, standby e auto-toggle de ciclos

/**
 * ROMATEC CRM v9.0 — Gerenciamento de turnos (DIA/NOITE/STANDBY)
 *
 * Responsabilidades:
 * - Auto-toggle de activeDay/activeNight nos horários programados
 * - Ativação/encerramento dos ciclos de turno (08h, 18h, 20h, 06h)
 * - Correção de flags inconsistentes ao iniciar/restaurar
 * - Determinação da fase do sistema (active_day, active_night, standby, blocked)
 */

import { getDb } from '../../db';
import { campaigns } from '../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import type { SystemPhase } from '../types/campaign.types';

/**
 * Auto-ativa/desativa ciclos DIA e NOITE nos horários programados.
 * Chamado a cada nova hora detectada em checkAndSend().
 */
export async function autoToggleCycles(brasiliaHour: number, setNightMode: (value: boolean) => void): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    if (brasiliaHour === 8) {
      await db.update(campaigns).set({ activeDay: true, activeNight: false }).where(eq(campaigns.status, 'running'));
      console.log(`☀️ [ShiftMgr] 08:00 — CICLO DIA INICIADO (activeDay=true, activeNight=false)`);
      setNightMode(false);
    } else if (brasiliaHour === 18) {
      await db.update(campaigns).set({ activeDay: false });
      console.log(`🌆 [ShiftMgr] 18:00 — CICLO DIA ENCERRADO`);
    } else if (brasiliaHour === 20) {
      await db.update(campaigns).set({ activeNight: true, activeDay: false }).where(eq(campaigns.status, 'running'));
      console.log(`🌙 [ShiftMgr] 20:00 — CICLO NOITE INICIADO (activeNight=true, activeDay=false)`);
      setNightMode(true);
    } else if (brasiliaHour === 6) {
      await db.update(campaigns).set({ activeNight: false });
      console.log(`🌅 [ShiftMgr] 06:00 — CICLO NOITE ENCERRADO`);
    }
  } catch (err) {
    console.error('[ShiftMgr] Erro no autoToggleCycles:', err);
  }
}

/**
 * Corrige flags activeDay/activeNight em todas as campanhas running
 * conforme o horário atual (usado no restoreAndResume).
 */
export async function fixActiveFlagsForCurrentShift(brasiliaHour: number): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const isDayHour   = brasiliaHour >= 8  && brasiliaHour < 18;
    const isNightHour = brasiliaHour >= 20 || brasiliaHour < 6;

    if (isNightHour) {
      await db.update(campaigns).set({ activeNight: true, activeDay: false }).where(eq(campaigns.status, 'running'));
      console.log(`🌙 [ShiftMgr] Restore: activeNight=true aplicado em todas as campanhas running`);
    } else if (isDayHour) {
      await db.update(campaigns).set({ activeDay: true, activeNight: false }).where(eq(campaigns.status, 'running'));
      console.log(`☀️ [ShiftMgr] Restore: activeDay=true aplicado em todas as campanhas running`);
    }
  } catch (err) {
    console.error('[ShiftMgr] Erro em fixActiveFlagsForCurrentShift:', err);
  }
}

/**
 * Retorna a fase do sistema baseado na hora atual de Brasília.
 * active_day: 08-17h | active_night: 20h-05h | standby: 18-19h | blocked: 06-07h
 */
export function getSystemPhase(brasiliaHour: number): SystemPhase {
  if (brasiliaHour >= 6 && brasiliaHour < 8)   return 'blocked';
  if (brasiliaHour >= 8 && brasiliaHour < 18)  return 'active_day';
  if (brasiliaHour >= 18 && brasiliaHour < 20) return 'standby';
  return 'active_night';
}
