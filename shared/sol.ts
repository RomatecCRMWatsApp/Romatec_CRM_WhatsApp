/**
 * Posição do sol (azimute e altura) para o Passeio no Mapa — algoritmo do SunCalc (V. Agafonkin, BSD-2), reescrito aqui
 * para não precisar de dependência. Azimute em graus a partir do NORTE, sentido horário (90 = leste, 270 = oeste).
 * A hora é a do LOCAL do empreendimento (fuso fixo, ex.: -03:00 no Maranhão), nunca a do aparelho do cliente.
 */
const RAD = Math.PI / 180;
const DIA_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUIDADE = RAD * 23.4397;

const diasDesdeJ2000 = (d: Date) => d.getTime() / DIA_MS - 0.5 + J1970 - J2000;
const anomaliaMedia = (d: number) => RAD * (357.5291 + 0.98560028 * d);
function longitudeEcliptica(M: number) {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + RAD * 102.9372 + Math.PI;
}

/** Altura (graus acima do horizonte) e azimute (graus a partir do norte, horário) do sol no instante e no lugar */
export function posicaoSol(instante: Date, lat: number, lon: number): { altura: number; azimute: number } {
  const lw = RAD * -lon, phi = RAD * lat, d = diasDesdeJ2000(instante);
  const L = longitudeEcliptica(anomaliaMedia(d));
  const dec = Math.asin(Math.sin(0) * Math.cos(OBLIQUIDADE) + Math.cos(0) * Math.sin(OBLIQUIDADE) * Math.sin(L));
  const ra = Math.atan2(Math.sin(L) * Math.cos(OBLIQUIDADE), Math.cos(L));
  const H = RAD * (280.16 + 360.9856235 * d) - lw - ra;
  const azSul = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  return { altura: alt / RAD, azimute: ((azSul / RAD + 180) % 360 + 360) % 360 };
}

/** Instante de "AAAA-MM-DD" às `minutos` do dia no fuso fixo do local (ex.: -180 para -03:00) */
export function instanteLocal(data: string, minutos: number, offsetMin = -180): Date {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 0, 0) + (minutos - offsetMin) * 60_000);
}

/** Nascer e pôr do sol (minutos do dia, hora local), pela altura -0,833° (borda do disco com a refração) */
export function nascerEPor(data: string, lat: number, lon: number, offsetMin = -180): { nascer: number; por: number } | null {
  const alt = (min: number) => posicaoSol(instanteLocal(data, min, offsetMin), lat, lon).altura + 0.833;
  const cruza = (de: number, ate: number, passo: number): number | null => {
    let a = alt(de);
    for (let t = de + passo; passo > 0 ? t <= ate : t >= ate; t += passo) {
      const b = alt(t);
      if (Math.sign(a) !== Math.sign(b)) {
        // Refina por bissecção
        let x = t - passo, y = t;
        for (let k = 0; k < 20; k++) { const mid = (x + y) / 2; if (Math.sign(alt(mid)) === Math.sign(alt(x))) x = mid; else y = mid; }
        return Math.round((x + y) / 2);
      }
      a = b;
    }
    return null;
  };
  const nascer = cruza(0, 720, 10), por = cruza(720, 1439, 10);
  return nascer != null && por != null ? { nascer, por } : null;
}

export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;

/** Frase do sol para a hora (mostrada sob o slider) */
export function fraseDoSol(min: number, nascer: number, por: number, altura: number): string {
  if (min <= nascer + 10) return `nascer do sol ${hhmm(nascer)}`;
  if (min >= por - 10) return `pôr do sol ${hhmm(por)}`;
  if (altura >= 70) return 'sol a pino, quase sem sombra';
  const meio = (nascer + por) / 2;
  return min < meio ? 'sol vindo do leste' : 'sol se pondo no oeste';
}

/** Data de hoje no fuso do local (AAAA-MM-DD) */
export const hojeLocal = (agora = Date.now(), offsetMin = -180) => new Date(agora + offsetMin * 60_000).toISOString().slice(0, 10);
