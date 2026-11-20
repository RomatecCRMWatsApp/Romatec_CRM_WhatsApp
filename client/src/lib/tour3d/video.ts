/**
 * Tour 3D a partir de fotos — gravação do vídeo.
 *
 * Caminho principal: WebCodecs (H.264) + mp4-muxer, quadro a quadro — o vídeo sai liso mesmo em
 * aparelho lento, porque cada quadro é desenhado no seu tempo exato, não em tempo real.
 * Sem WebCodecs (navegador antigo): grava em tempo real com MediaRecorder.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import type { CenaTour3D } from "./cena";
import { FPS, totalDeQuadros, type Roteiro } from "./roteiro";

export interface VideoGerado {
  blob: Blob;
  extensao: "mp4" | "webm";
  mime: string;
  /** havia trilha, mas este navegador não conseguiu codificar o áudio */
  semAudio: boolean;
  /** codec do áudio gravado (null = sem áudio) — Opus/WebM precisam do ajuste para o WhatsApp */
  audio: "aac" | "opus" | "webm" | null;
}

/** O WhatsApp descarta áudio Opus em MP4 e não aceita WebM: esses passam pelo ajuste no servidor. */
export function precisaAjuste(v: Pick<VideoGerado, "audio" | "extensao">): boolean {
  return v.extensao === "webm" || v.audio === "opus" || v.audio === "webm";
}

/** Trilha em WAV (PCM 16 bits) — vai separada para o servidor juntar ao vídeo em AAC. */
export function trilhaEmWav(buf: AudioBuffer): Blob {
  const canais = buf.numberOfChannels, taxa = buf.sampleRate, n = buf.length;
  const dados = new DataView(new ArrayBuffer(44 + n * canais * 2));
  const txt = (o: number, t: string) => { for (let i = 0; i < t.length; i++) dados.setUint8(o + i, t.charCodeAt(i)); };
  txt(0, "RIFF"); dados.setUint32(4, 36 + n * canais * 2, true); txt(8, "WAVE");
  txt(12, "fmt "); dados.setUint32(16, 16, true); dados.setUint16(20, 1, true); dados.setUint16(22, canais, true);
  dados.setUint32(24, taxa, true); dados.setUint32(28, taxa * canais * 2, true); dados.setUint16(32, canais * 2, true); dados.setUint16(34, 16, true);
  txt(36, "data"); dados.setUint32(40, n * canais * 2, true);
  const ch = Array.from({ length: canais }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < canais; c++) {
    const v = Math.max(-1, Math.min(1, ch[c][i]));
    dados.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    o += 2;
  }
  return new Blob([dados.buffer], { type: "audio/wav" });
}

/**
 * Versão final para WhatsApp/Instagram, feita no servidor: imagem copiada sem perda (WebM vira MP4) e,
 * com trilha, a música entra a partir do WAV, em AAC — não depende do celular saber gravar áudio.
 * O vídeo e a música são apagados do servidor em seguida.
 */
export async function ajustarParaWhatsApp(v: VideoGerado, trilha: AudioBuffer | null = null): Promise<VideoGerado> {
  const wav = trilha ? trilhaEmWav(trilha) : null;
  const corpo = wav ? new Blob([v.blob, wav]) : v.blob;
  const r = await fetch("/api/tour3d/converter", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/octet-stream",
      "x-file-type": v.mime,
      ...(wav ? { "x-video-bytes": String(v.blob.size) } : {}),
    },
    body: corpo,
  });
  if (!r.ok) {
    const j = await r.json().catch(() => null) as { error?: string } | null;
    throw new Error(j?.error || `Falha ao ajustar o vídeo (${r.status})`);
  }
  const blob = await r.blob();
  return { blob: new Blob([blob], { type: "video/mp4" }), extensao: "mp4", mime: "video/mp4", semAudio: false, audio: wav || v.audio ? "aac" : null };
}

const CODECS_AUDIO: { codec: string; mux: "aac" | "opus" }[] = [
  { codec: "mp4a.40.2", mux: "aac" },
  { codec: "opus", mux: "opus" },
];

async function codecAudio(taxa: number, canais: number): Promise<{ codec: string; mux: "aac" | "opus" } | null> {
  if (typeof AudioEncoder === "undefined") return null;
  for (const c of CODECS_AUDIO) {
    try {
      const r = await AudioEncoder.isConfigSupported({ codec: c.codec, sampleRate: taxa, numberOfChannels: canais, bitrate: 160_000 });
      if (r.supported) return c;
    } catch { /* tenta o próximo */ }
  }
  return null;
}

async function codificarAudio(muxer: Muxer<ArrayBufferTarget>, trilha: AudioBuffer, codec: string): Promise<void> {
  let erro: unknown = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: e => { erro = e; },
  });
  const canais = trilha.numberOfChannels, taxa = trilha.sampleRate;
  enc.configure({ codec, sampleRate: taxa, numberOfChannels: canais, bitrate: 160_000 });
  const BLOCO = 4800;
  const dados = Array.from({ length: canais }, (_, c) => trilha.getChannelData(c));
  try {
    for (let ini = 0; ini < trilha.length; ini += BLOCO) {
      if (erro) throw erro;
      const n = Math.min(BLOCO, trilha.length - ini);
      const planar = new Float32Array(n * canais);
      for (let c = 0; c < canais; c++) planar.set(dados[c].subarray(ini, ini + n), c * n);
      const ad = new AudioData({ format: "f32-planar", sampleRate: taxa, numberOfFrames: n, numberOfChannels: canais, timestamp: Math.round((ini / taxa) * 1_000_000), data: planar });
      enc.encode(ad);
      ad.close();
      if (enc.encodeQueueSize > 20) await new Promise(r => setTimeout(r, 2));
    }
    await enc.flush();
    if (erro) throw erro;
  } finally {
    if (enc.state !== "closed") enc.close();
  }
}

const CODECS_AVC = ["avc1.640034", "avc1.640028", "avc1.4d0028", "avc1.42e028", "avc1.42001f"];

async function codecSuportado(largura: number, altura: number, bitrate: number): Promise<string | null> {
  if (typeof VideoEncoder === "undefined") return null;
  for (const codec of CODECS_AVC) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec, width: largura, height: altura, bitrate, framerate: FPS });
      if (r.supported) return codec;
    } catch { /* tenta o próximo */ }
  }
  return null;
}

const esperar = () => new Promise<void>(r => setTimeout(r, 0));

export async function gerarVideo(
  cena: CenaTour3D,
  roteiro: Roteiro,
  aoProgresso: (pct: number) => void,
  cancelado: () => boolean,
  trilha: AudioBuffer | null = null,
): Promise<VideoGerado> {
  const { largura, altura } = cena;
  const bitrate = Math.round(largura * altura * FPS * 0.13);
  const codec = await codecSuportado(largura, altura, bitrate);
  if (codec) return gerarWebCodecs(cena, roteiro, codec, bitrate, aoProgresso, cancelado, trilha);
  return gerarMediaRecorder(cena, roteiro, aoProgresso, cancelado, trilha);
}

async function gerarWebCodecs(
  cena: CenaTour3D, roteiro: Roteiro, codec: string, bitrate: number,
  aoProgresso: (pct: number) => void, cancelado: () => boolean, trilha: AudioBuffer | null,
): Promise<VideoGerado> {
  const { largura, altura } = cena;
  const audio = trilha ? await codecAudio(trilha.sampleRate, trilha.numberOfChannels) : null;
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: largura, height: altura, frameRate: FPS },
    ...(audio && trilha ? { audio: { codec: audio.mux, numberOfChannels: trilha.numberOfChannels, sampleRate: trilha.sampleRate } } : {}),
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });
  let erro: unknown = null;
  const enc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => { erro = e; },
  });
  enc.configure({ codec, width: largura, height: altura, bitrate, framerate: FPS, avc: { format: "avc" } });
  const total = totalDeQuadros(roteiro);
  const dur = 1_000_000 / FPS;
  try {
    for (let i = 0; i < total; i++) {
      if (cancelado()) throw new Error("cancelado");
      if (erro) throw erro;
      const canvas = cena.desenhar(roteiro, i / FPS);
      const quadro = new VideoFrame(canvas, { timestamp: Math.round(i * dur), duration: Math.round(dur) });
      enc.encode(quadro, { keyFrame: i % (FPS * 2) === 0 });
      quadro.close();
      while (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
      if (i % 5 === 0) { aoProgresso(Math.round((i / total) * 100)); await esperar(); }
    }
    await enc.flush();
    if (erro) throw erro;
  } finally {
    if (enc.state !== "closed") enc.close();
  }
  if (audio && trilha) await codificarAudio(muxer, trilha, audio.codec);
  muxer.finalize();
  aoProgresso(100);
  return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), extensao: "mp4", mime: "video/mp4", semAudio: !!trilha && !audio, audio: audio ? audio.mux : null };
}

function mimeGravador(): { mime: string; extensao: "mp4" | "webm" } {
  const opcoes: { mime: string; extensao: "mp4" | "webm" }[] = [
    { mime: "video/mp4;codecs=avc1", extensao: "mp4" },
    { mime: "video/mp4", extensao: "mp4" },
    { mime: "video/webm;codecs=vp9", extensao: "webm" },
    { mime: "video/webm", extensao: "webm" },
  ];
  return opcoes.find(o => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(o.mime)) ?? { mime: "video/webm", extensao: "webm" };
}

async function gerarMediaRecorder(
  cena: CenaTour3D, roteiro: Roteiro, aoProgresso: (pct: number) => void, cancelado: () => boolean, trilha: AudioBuffer | null,
): Promise<VideoGerado> {
  if (typeof MediaRecorder === "undefined") throw new Error("Este navegador não consegue gerar vídeo. Use o Chrome, Edge ou Safari atualizado.");
  const { mime, extensao } = mimeGravador();
  const stream = cena.saida.captureStream(FPS);
  let actx: AudioContext | null = null;
  let fonte: AudioBufferSourceNode | null = null;
  if (trilha) {
    actx = new AudioContext({ sampleRate: trilha.sampleRate });
    const destino = actx.createMediaStreamDestination();
    fonte = actx.createBufferSource();
    fonte.buffer = trilha;
    fonte.connect(destino);
    destino.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  }
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const partes: Blob[] = [];
  rec.ondataavailable = e => { if (e.data.size) partes.push(e.data); };
  const fim = new Promise<void>(r => { rec.onstop = () => r(); });
  cena.desenhar(roteiro, 0);
  rec.start(250);
  fonte?.start();
  const inicio = performance.now();
  await new Promise<void>((resolver, rejeitar) => {
    const passo = () => {
      if (cancelado()) { rec.stop(); rejeitar(new Error("cancelado")); return; }
      const t = (performance.now() - inicio) / 1000;
      if (t >= roteiro.duracaoTotal) { resolver(); return; }
      cena.desenhar(roteiro, t);
      aoProgresso(Math.round((t / roteiro.duracaoTotal) * 100));
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  });
  rec.stop();
  await fim;
  stream.getTracks().forEach(t => t.stop());
  void actx?.close();
  aoProgresso(100);
  return { blob: new Blob(partes, { type: mime }), extensao, mime: mime.split(";")[0], semAudio: false, audio: trilha ? (extensao === "webm" ? "webm" : "opus") : null };
}
