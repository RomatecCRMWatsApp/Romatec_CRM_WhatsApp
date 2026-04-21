// @module CampaignTypes — Todos os tipos e interfaces centralizados do scheduler

/**
 * ROMATEC CRM v9.0 — Tipos e interfaces do scheduler
 * Fonte única de verdade para todos os módulos do scheduler
 */

export interface SchedulerState {
  isRunning: boolean;
  currentHourKey: string;
  hourNumber: number;
  totalSent: number;
  totalFailed: number;
  totalBlocked: number;
  startedAt: number;
  campaignStates: CampaignHourState[];
  scheduledSlots: SlotInfo[];
  nightMode: boolean;
}

export interface CampaignHourState {
  campaignId: number;
  campaignName: string;
  sentThisHour: boolean;
  lastSentHourKey: string | null;
}

export interface SlotInfo {
  campaignId: number;
  campaignName: string;
  minuteLabel: number;
  sent: boolean;
}

export type SendResult = 'sent' | 'failed' | 'invalid';

export type SystemPhase = 'active_day' | 'active_night' | 'standby' | 'blocked';

export interface SchedulerStateSnapshot {
  isRunning: boolean;
  hourNumber: number;
  currentHourKey: string;
  nightMode: boolean;
  campaignStates: CampaignHourState[];
  scheduledSlots: SlotInfo[];
  secondsUntilNextCycle: number;
  cycleDurationSeconds: number;
  uptimeFormatted: string;
  startedAtFormatted: string;
  nextCycleFormatted: string;
  currentCycleIndex: number;
  totalCycles: number;
  brasiliaHour: number;
  systemPhase: SystemPhase;
}

export interface SchedulerStats {
  cycleNumber: number;
  currentCycleIndex: number;
  totalCycles: number;
  totalSent: number;
  totalFailed: number;
  totalBlocked: number;
  messagesThisHour: number;
  maxMessagesPerHour: number;
  maxMessagesThisCycle: number;
  scheduledSlots: SlotInfo[];
  cycleProgress: string;
}
