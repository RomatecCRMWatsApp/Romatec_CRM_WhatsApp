/**
 * ROMATEC CRM v9.0 — Constantes do scheduler
 */

// Mapeamento: hora do dia → índice da campanha (0-4)
// Dia: 08-17h (10 horas), Noite: 20-05h (10 horas)
// Cada hora aponta para uma campanha diferente (índice 0-4)
// Camp1=índice 0, Camp2=índice 1, ..., Camp5=índice 4
// 10h de turno = cada campanha aparece 2x por turno (08h+13h = Camp1, etc.)
export const HOUR_TO_CAMP_INDEX: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4,
  13: 0, 14: 1, 15: 2, 16: 3, 17: 4,
  // Modo noite
  20: 0, 21: 1, 22: 2, 23: 3, 0: 4,
  1: 0, 2: 1, 3: 2, 4: 3, 5: 4,
};

export const ACTIVE_HOURS_DAY = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
export const ACTIVE_HOURS_NIGHT = [20, 21, 22, 23, 0, 1, 2, 3, 4, 5];

// Janela de envio dentro da hora (minutos 0-15)
export const SEND_WINDOW_END_MIN = 15;

// Limites
export const MAX_ATTEMPTS_NO_RESPONSE = 3;
export const MAX_HOURS_PER_CYCLE = 10;
export const MAX_ZAPI_FAILS = 3;
export const CONTACTS_PER_CAMPAIGN = 2;

// Intervalos
export const CHECK_INTERVAL_MS = 60 * 1000;
export const FOLLOW_UP_INTERVAL_MS = 60 * 1000;
export const MIN_GAP_MS = 3 * 60 * 1000;
export const MARGIN_MS = 2 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
