// @module FollowUpManager — Sequência de follow-up de persuasão (T+5/15/30/35/44min)

/**
 * ROMATEC CRM v9.0 — Gerenciamento de follow-ups de persuasão
 *
 * Responsabilidades:
 * - Iniciar/parar o loop de verificação de follow-ups (intervalo 1 min)
 * - Processar follow-ups pendentes via botQualifier
 * - Expor controle do timer para o orquestrador
 */

import { processFollowUps } from '../botQualifier';

let followUpTimer: NodeJS.Timeout | null = null;

const FOLLOW_UP_INTERVAL_MS = 60 * 1000;

/**
 * Inicia o loop de follow-up.
 * Verifica e envia follow-ups pendentes a cada minuto.
 * @param isRunning função que retorna se o scheduler está ativo
 */
export function startFollowUpLoop(isRunning: () => boolean): void {
  if (followUpTimer) {
    clearInterval(followUpTimer);
    followUpTimer = null;
  }

  followUpTimer = setInterval(async () => {
    if (!isRunning()) return;
    await processFollowUps();
  }, FOLLOW_UP_INTERVAL_MS);

  console.log(`🔄 [FollowUpMgr] Loop de follow-up iniciado (intervalo: ${FOLLOW_UP_INTERVAL_MS / 1000}s)`);
}

/** Para o loop de follow-up e limpa o timer */
export function stopFollowUpLoop(): void {
  if (followUpTimer) {
    clearInterval(followUpTimer);
    followUpTimer = null;
    console.log(`⏹️ [FollowUpMgr] Loop de follow-up parado`);
  }
}

/** Retorna true se o loop de follow-up está ativo */
export function isFollowUpLoopRunning(): boolean {
  return followUpTimer !== null;
}
