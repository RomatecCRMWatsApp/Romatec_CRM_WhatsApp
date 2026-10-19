/**
 * Lead "desativado": descartado, sem interesse ou bloqueado (pediu SAIR / descartado
 * pelo corretor). Sai da lista de Leads; continua no banco e aparece no filtro "Descartados".
 */
export function leadInativo(l: { stage?: string | null; etapa?: string | null; blockedUntil?: Date | string | null }, agora = Date.now()): boolean {
  if (['descartado', 'sem_interesse'].includes(String(l.stage))) return true;
  if (l.etapa === 'perdido') return true;
  return !!l.blockedUntil && new Date(l.blockedUntil).getTime() > agora;
}
