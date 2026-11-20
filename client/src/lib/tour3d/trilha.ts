/**
 * Tour 3D a partir de fotos — trilha sonora.
 *
 * As trilhas "geradas" são compostas na hora (Web Audio, OfflineAudioContext): acordes, arpejo e
 * baixo sintetizados a partir de uma progressão. Por serem criadas pelo próprio sistema, não têm
 * direito autoral de terceiros — o vídeo pode ir para o Instagram sem ser bloqueado.
 * O corretor também pode usar uma música do aparelho (a responsabilidade pelo uso é dele).
 */

export type EstiloTrilha = "suave" | "animada" | "elegante";
export type EscolhaTrilha = EstiloTrilha | "arquivo" | "nenhuma";

export const TRILHAS: Record<EstiloTrilha, { rotulo: string; descricao: string }> = {
  suave: { rotulo: "Suave", descricao: "Piano e cordas calmas — casas, chácaras, natureza" },
  animada: { rotulo: "Animada", descricao: "Batida leve e alegre — lançamentos e ofertas" },
  elegante: { rotulo: "Elegante", descricao: "Acordes sofisticados — alto padrão e apresentações" },
};

const TAXA = 48000;

interface Receita {
  bpm: number;
  /** acordes em semitons a partir de C4 (MIDI 60) — cada acorde dura `compassosPorAcorde` compassos */
  acordes: number[][];
  compassosPorAcorde: number;
  arpejo: "colcheias" | "semicolcheias" | "lento";
  bateria: boolean;
  brilho: number;
}

const RECEITAS: Record<EstiloTrilha, Receita> = {
  // C – G – Am – F
  suave: { bpm: 76, acordes: [[0, 4, 7, 11], [-5, 2, 7, 11], [-3, 0, 4, 7], [-7, 0, 5, 9]], compassosPorAcorde: 1, arpejo: "colcheias", bateria: false, brilho: 2200 },
  // F – G – Em – Am
  animada: { bpm: 112, acordes: [[-7, 0, 5, 9], [-5, 2, 7, 11], [-8, -1, 4, 7], [-3, 0, 4, 9]], compassosPorAcorde: 1, arpejo: "semicolcheias", bateria: true, brilho: 3200 },
  // Dm9 – G13 – Cmaj9 – Am9
  elegante: { bpm: 68, acordes: [[2, 5, 9, 12, 16], [-5, 5, 9, 11, 16], [0, 4, 7, 11, 14], [-3, 0, 4, 7, 11]], compassosPorAcorde: 1, arpejo: "lento", bateria: false, brilho: 1800 },
};

const freq = (semitonsDeC4: number) => 261.6256 * Math.pow(2, semitonsDeC4 / 12);

function reverberacao(ctx: BaseAudioContext, segundos: number): ConvolverNode {
  const n = Math.floor(TAXA * segundos);
  const ir = ctx.createBuffer(2, n, TAXA);
  let semente = 12345;
  const aleatorio = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648 * 2 - 1; };
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = aleatorio() * Math.pow(1 - i / n, 2.6);
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  return conv;
}

/** Duração em segundos de um compasso (4 tempos). */
export function duracaoCompasso(estilo: EstiloTrilha): number {
  return (60 / RECEITAS[estilo].bpm) * 4;
}

/** Compõe a trilha com a duração exata do vídeo (com entrada e saída suaves). */
export async function gerarTrilha(estilo: EstiloTrilha, duracao: number): Promise<AudioBuffer> {
  const r = RECEITAS[estilo];
  const total = Math.max(1, duracao) + 0.2;
  const ctx = new OfflineAudioContext(2, Math.ceil(TAXA * total), TAXA);
  const mestre = ctx.createGain();
  mestre.gain.value = 0.9;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.ratio.value = 3;
  mestre.connect(compressor).connect(ctx.destination);
  const molhado = ctx.createGain();
  molhado.gain.value = 0.32;
  const rev = reverberacao(ctx, 2.4);
  rev.connect(molhado).connect(mestre);
  const filtro = ctx.createBiquadFilter();
  filtro.type = "lowpass";
  filtro.frequency.value = r.brilho;
  filtro.connect(mestre);
  filtro.connect(rev);

  const tempo = 60 / r.bpm;
  const compasso = tempo * 4;
  const durAcorde = compasso * r.compassosPorAcorde;
  const nAcordes = Math.ceil(total / durAcorde);

  const nota = (f: number, ini: number, dur: number, vol: number, tipo: OscillatorType, ataque: number, destino: AudioNode, pan = 0) => {
    if (ini >= total) return;
    const o = ctx.createOscillator();
    o.type = tipo;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ini);
    g.gain.linearRampToValueAtTime(vol, ini + ataque);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.25), ini + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, ini + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(destino);
    o.start(ini);
    o.stop(Math.min(total, ini + dur + 0.05));
  };

  for (let a = 0; a < nAcordes; a++) {
    const acorde = r.acordes[a % r.acordes.length];
    const ini = a * durAcorde;
    // pad: notas do acorde, ataque lento, levemente desafinadas para encorpar
    acorde.forEach((s, i) => {
      const pan = (i / Math.max(1, acorde.length - 1) - 0.5) * 0.6;
      nota(freq(s), ini, durAcorde + 0.4, 0.045, "triangle", 0.6, filtro, pan);
      nota(freq(s) * 1.003, ini, durAcorde + 0.4, 0.03, "sawtooth", 0.8, filtro, -pan);
    });
    // baixo: fundamental uma oitava abaixo
    const raiz = Math.min(...acorde);
    for (let t = 0; t < r.compassosPorAcorde * 4; t += r.bateria ? 1 : 2) {
      nota(freq(raiz - 12), ini + t * tempo, tempo * (r.bateria ? 0.9 : 1.8), 0.11, "sine", 0.02, mestre);
    }
    // arpejo tipo piano: subida pelas notas do acorde, uma oitava acima
    const passo = r.arpejo === "semicolcheias" ? tempo / 4 : r.arpejo === "colcheias" ? tempo / 2 : tempo;
    const sequencia = [...acorde, ...acorde.slice(1, -1).reverse()].map(s => s + 12);
    let k = 0;
    for (let t = 0; t < durAcorde - 0.001; t += passo, k++) {
      const s = sequencia[k % sequencia.length];
      nota(freq(s), ini + t, passo * 3.5, r.arpejo === "semicolcheias" ? 0.05 : 0.07, "sine", 0.005, filtro, k % 2 ? 0.25 : -0.25);
      nota(freq(s) * 2, ini + t, passo * 1.5, 0.012, "triangle", 0.005, filtro);
    }
    if (r.bateria) {
      for (let b = 0; b < r.compassosPorAcorde * 4; b++) {
        const tb = ini + b * tempo;
        if (tb >= total) break;
        // bumbo: senoide com queda de afinação
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.setValueAtTime(120, tb);
        o.frequency.exponentialRampToValueAtTime(42, tb + 0.12);
        g.gain.setValueAtTime(b % 2 === 0 ? 0.32 : 0.18, tb);
        g.gain.exponentialRampToValueAtTime(0.001, tb + 0.25);
        o.connect(g).connect(mestre);
        o.start(tb); o.stop(tb + 0.3);
        // chimbal no contratempo: ruído com passa-alta
        const th = tb + tempo / 2;
        if (th < total) {
          const n = Math.floor(TAXA * 0.06);
          const buf = ctx.createBuffer(1, n, TAXA);
          const d = buf.getChannelData(0);
          for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const hp = ctx.createBiquadFilter();
          hp.type = "highpass"; hp.frequency.value = 7000;
          const gh = ctx.createGain(); gh.gain.value = 0.05;
          src.connect(hp).connect(gh).connect(mestre);
          src.start(th);
        }
      }
    }
  }
  const buffer = await ctx.startRendering();
  normalizar(buffer, 0.8);
  aplicarFades(buffer, 1.2, 2.2);
  return buffer;
}

/** Leva o pico da trilha a `alvo` (0..1) para todas as trilhas saírem com o mesmo volume. */
export function normalizar(buffer: AudioBuffer, alvo: number): void {
  let pico = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pico) pico = v; }
  }
  if (pico < 1e-4) return;
  const g = alvo / pico;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= g;
  }
}

/** Música do aparelho: ajusta à duração do vídeo (corta ou repete) e suaviza o fim. */
export async function trilhaDeArquivo(arquivo: Blob, duracao: number): Promise<AudioBuffer> {
  const AC: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const original = await ctx.decodeAudioData(await arquivo.arrayBuffer());
    const n = Math.ceil(TAXA * Math.max(1, duracao));
    const off = new OfflineAudioContext(2, n, TAXA);
    const src = off.createBufferSource();
    src.buffer = original;
    src.loop = original.duration < duracao;
    src.connect(off.destination);
    src.start(0);
    const buffer = await off.startRendering();
    aplicarFades(buffer, 0.4, 2.2);
    return buffer;
  } finally {
    void ctx.close();
  }
}

export function aplicarFades(buffer: AudioBuffer, entrada: number, saida: number): void {
  const n = buffer.length, ne = Math.min(n, Math.floor(entrada * buffer.sampleRate)), ns = Math.min(n, Math.floor(saida * buffer.sampleRate));
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < ne; i++) d[i] *= i / ne;
    for (let i = 0; i < ns; i++) d[n - 1 - i] *= i / ns;
  }
}

/** Volume final (0..1) aplicado a uma cópia da trilha. */
export function comVolume(buffer: AudioBuffer, volume: number): AudioBuffer {
  const copia = new AudioBuffer({ length: buffer.length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const de = buffer.getChannelData(c), para = copia.getChannelData(c);
    for (let i = 0; i < de.length; i++) para[i] = de[i] * volume;
  }
  return copia;
}
