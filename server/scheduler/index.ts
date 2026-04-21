// @module Index — Exportações centralizadas do scheduler

/**
 * ROMATEC CRM v9.0 — Ponto de entrada público do scheduler
 *
 * Importar daqui garante acesso à instância singleton e a todos
 * os tipos e utilitários sem dependências circulares.
 */

// Orquestrador principal (singleton)
export { CampaignScheduler, campaignScheduler } from './campaignScheduler';

// Tipos centralizados
export type {
  SchedulerState,
  CampaignHourState,
  SlotInfo,
  SendResult,
  SystemPhase,
  SchedulerStateSnapshot,
  SchedulerStats,
} from './types/campaign.types';

// Constantes
export {
  HOUR_TO_CAMP_INDEX,
  ACTIVE_HOURS_DAY,
  ACTIVE_HOURS_NIGHT,
  SEND_WINDOW_END_MIN,
  MAX_ATTEMPTS_NO_RESPONSE,
  MAX_HOURS_PER_CYCLE,
  MAX_ZAPI_FAILS,
  CHECK_INTERVAL_MS,
} from './constants';

// Módulos (acesso direto para roteamento, webhooks, etc.)
export { detectIntent, isLeadReply, isPositiveIntent, isObjectionIntent } from './modules/intentDetector';
export type { IntentType } from './modules/intentDetector';
export { processFollowUps } from './modules/qualificationBot';
export {
  getNextContact,
  assignContactsToCampaign,
  assignNewContactsForShiftReset,
  unblockContactByReply,
  updateContactHistory,
} from './modules/contactManager';
export { getSystemPhase } from './modules/shiftManager';
export { getCurrentHour, getCurrentHourKey, isActiveHour, getCurrentCycleIndex, getAutoNightMode } from './modules/cycleManager';

// Persistência de estado
export { saveStateToDB, loadStateFromDB, getDBStatus, setZApiAutopausedFlag } from './stateManager';

// Envio de mensagens (acesso direto para webhooks)
export { sendViaZAPI, personalizeMessage } from './messageDispatcher';

// Scheduler diário
export { dailyScheduler } from './dailyScheduler';
