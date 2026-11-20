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
): Promise<VideoGerado> {
  const { largura, altura } = cena;
  const bitrate = Math.round(largura * altura * FPS * 0.13);
  const codec = await codecSuportado(largura, altura, bitrate);
  if (codec) return gerarWebCodecs(cena, roteiro, codec, bitrate, aoProgresso, cancelado);
  return gerarMediaRecorder(cena, roteiro, aoProgresso, cancelado);
}

async function gerarWebCodecs(
  cena: CenaTour3D, roteiro: Roteiro, codec: string, bitrate: number,
  aoProgresso: (pct: number) => void, cancelado: () => boolean,
): Promise<VideoGerado> {
  const { largura, altura } = cena;
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: "avc", width: largura, height: altura, frameRate: FPS }, fastStart: "in-memory" });
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
  muxer.finalize();
  aoProgresso(100);
  return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), extensao: "mp4", mime: "video/mp4" };
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
  cena: CenaTour3D, roteiro: Roteiro, aoProgresso: (pct: number) => void, cancelado: () => boolean,
): Promise<VideoGerado> {
  if (typeof MediaRecorder === "undefined") throw new Error("Este navegador não consegue gerar vídeo. Use o Chrome, Edge ou Safari atualizado.");
  const { mime, extensao } = mimeGravador();
  const stream = cena.saida.captureStream(FPS);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const partes: Blob[] = [];
  rec.ondataavailable = e => { if (e.data.size) partes.push(e.data); };
  const fim = new Promise<void>(r => { rec.onstop = () => r(); });
  cena.desenhar(roteiro, 0);
  rec.start(250);
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
  aoProgresso(100);
  return { blob: new Blob(partes, { type: mime }), extensao, mime: mime.split(";")[0] };
}
