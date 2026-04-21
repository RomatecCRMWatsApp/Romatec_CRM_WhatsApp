/**
 * ROMATEC CRM v9.0 — Utilitários do scheduler
 */

import { ACTIVE_HOURS_DAY, ACTIVE_HOURS_NIGHT } from './constants';

/** Retorna a data/hora atual no fuso de Brasília */
export function getBrasiliaDate(): Date {
  const now = new Date();
  const brasiliaStr = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  return new Date(brasiliaStr);
}

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

/** Retorna o índice do ciclo atual (0-9) ou -1 se fora do horário */
export function getCurrentCycleIndex(nightMode: boolean): number {
  const hour = getCurrentHour();
  const activeHours = nightMode ? ACTIVE_HOURS_NIGHT : ACTIVE_HOURS_DAY;
  const idx = activeHours.indexOf(hour);
  return idx >= 0 ? idx : -1;
}

/** Detecta se o horário atual é noturno */
export function getAutoNightMode(): boolean {
  const h = getCurrentHour();
  return (h >= 20 || h < 6);
}

/** Limpa caracteres não numéricos de um telefone */
export function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Delay assíncrono */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Formata milissegundos em HH:MM:SS */
export function formatUptime(ms: number): string {
  const hours   = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const minutes = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const seconds = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}
