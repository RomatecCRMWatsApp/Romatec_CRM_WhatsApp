/** Série de leads por dia (fuso do Maranhão, UTC-3) para o gráfico do painel do empreendedor */
export function serieLeadsPorDia(datas: (Date | string | null | undefined)[], dias: number, agora = Date.now()): { dia: string; leads: number }[] {
  const OFFSET = 3 * 3600_000;
  const chave = (t: number) => new Date(t - OFFSET).toISOString().slice(0, 10);
  const serie = new Map<string, number>();
  for (let i = dias - 1; i >= 0; i--) serie.set(chave(agora - i * 24 * 3600_000), 0);
  for (const d of datas) {
    if (!d) continue;
    const t = new Date(d).getTime();
    if (!Number.isFinite(t)) continue;
    const k = chave(t);
    if (serie.has(k)) serie.set(k, (serie.get(k) || 0) + 1);
  }
  return Array.from(serie, ([dia, leads]) => ({ dia, leads }));
}
