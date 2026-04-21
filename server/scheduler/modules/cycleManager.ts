// @module CycleManager — Controle de ciclos (cycleCount, início/fim de turno, mapeamento hora→campanha)

/**
 * ROMATEC CRM v9.0 — Gerenciamento de ciclos de hora
 *
 * Responsabilidades:
 * - Mapeamento hora→índice de campanha (HOUR_TO_CAMP_INDEX)
 * - Determinação de horários ativos (dia/noite)
 * - Cálculo do índice do ciclo atual
 * - Geração da chave de hora (YYYY-MM-DD-HH)
 */

import { ACTIVE_HOURS_DAY, ACTIVE_HOURS_NIGHT, HOUR_TO_CAMP_INDEX } from '../constants';
import { getBrasiliaDate } from '../utils';

/** Retorna a hora atual em Brasília (0-23) */
export function getCurrentHour(): number {
  return getBrasiliaDate().getHours();
}

/** Retorna a chave da hora atual no formato YYYY-MM-DD-HH */
export function getCurrentHourKey(): string {
  const now = getBrasiliaDate();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}`;
}

/** Retorna true se a hora atual é um horário ativo (dia ou noite) */
export function isActiveHour(nightMode: boolean): boolean {
  const hour = getCurrentHour();
  const activeHours = nightMode ? ACTIVE_HOURS_NIGHT : ACTIVE_HOURS_DAY;
  return activeHours.includes(hour);
}

/** Retorna o índice do ciclo atual (0-9) ou -1 se fora do horário ativo */
export function getCurrentCycleIndex(nightMode: boolean): number {
  const hour = getCurrentHour();
  const activeHours = nightMode ? ACTIVE_HOURS_NIGHT : ACTIVE_HOURS_DAY;
  const idx = activeHours.indexOf(hour);
  return idx >= 0 ? idx : -1;
}

/** Detecta automaticamente se o horário atual é noturno (20h-05h59) */
export function getAutoNightMode(): boolean {
  const h = getCurrentHour();
  return h >= 20 || h < 6;
}

/**
 * Retorna a campanha correspondente à hora atual conforme HOUR_TO_CAMP_INDEX.
 * Valida elegibilidade (status=running + activePeriod=true).
 */
export function getCampaignForCurrentHour(allCampaigns: any[], nightMode: boolean): any | null {
  const hour = getCurrentHour();
  const campIndex = HOUR_TO_CAMP_INDEX[hour];
  if (campIndex === undefined) {
    console.log(`⚠️ [CycleMgr] Slot ${hour}h não mapeado em HOUR_TO_CAMP_INDEX`);
    return null;
  }

  const activePeriod = nightMode ? 'activeNight' : 'activeDay';
  const campaign = allCampaigns[campIndex];

  if (!campaign) {
    console.log(`⚠️ [CycleMgr] Índice ${campIndex} fora do range (${allCampaigns.length} campanhas)`);
    return null;
  }

  if (campaign.status !== 'running' || !campaign[activePeriod]) {
    console.log(`⚠️ [CycleMgr] ${campaign.name}: não elegível (status=${campaign.status}, ${activePeriod}=${campaign[activePeriod]})`);
    return null;
  }

  return campaign;
}

/**
 * Busca campanha com fallback: se a primária não estiver elegível,
 * tenta as próximas na sequência circular.
 */
export function resolveCampaignWithFallback(
  allCampaigns: any[],
  campIndex: number,
  nightMode: boolean
): { campaign: any | null; resolvedIndex: number } {
  const activePeriod = nightMode ? 'activeNight' : 'activeDay';
  const primary = allCampaigns[campIndex];

  if (primary?.status === 'running' && primary[activePeriod]) {
    return { campaign: primary, resolvedIndex: campIndex };
  }

  for (let offset = 1; offset < allCampaigns.length; offset++) {
    const tryIdx = (campIndex + offset) % allCampaigns.length;
    const candidate = allCampaigns[tryIdx];
    if (candidate?.status === 'running' && candidate[activePeriod]) {
      return { campaign: candidate, resolvedIndex: tryIdx };
    }
  }

  return { campaign: null, resolvedIndex: -1 };
}

/** Calcula o índice de ciclo sincronizado com a hora atual de Brasília */
export function syncCycleIndexWithCurrentHour(nightMode: boolean): number {
  const hour = getCurrentHour();
  const activeHours = nightMode ? ACTIVE_HOURS_NIGHT : ACTIVE_HOURS_DAY;
  const idx = activeHours.indexOf(hour);
  if (idx >= 0) {
    console.log(`🕐 [CycleMgr] Brasília: ${hour}h → Ciclo ${idx + 1}/10`);
    return idx;
  }
  console.log(`⏰ [CycleMgr] Fora do horário ativo (hora atual Brasília: ${hour}h)`);
  return 0;
}
