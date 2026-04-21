/**
 * ROMATEC CRM v9.0 — Tipos compartilhados do scheduler
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
