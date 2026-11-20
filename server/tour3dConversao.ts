/**
 * Tour 3D a partir de fotos — ajuste final do vídeo para WhatsApp/Instagram.
 *
 * O vídeo é montado no aparelho do corretor. Alguns aparelhos (Chrome Android/Linux) não sabem
 * gravar áudio AAC e gravam Opus, que o WhatsApp descarta ao reenviar (o vídeo chega mudo). Aqui o
 * ffmpeg regrava só o áudio em AAC (a imagem é copiada, sem perda) — ou converte o WebM do
 * gravador de reserva em MP4 H.264. Os arquivos temporários são apagados em seguida; nada é guardado.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const LIMITE_BYTES_TOUR3D = 200 * 1024 * 1024;
const LIMITE_MS = 4 * 60_000;

export class ConversaoErro extends Error {
  constructor(message: string, public status = 500) { super(message); }
}

/** Argumentos do ffmpeg: MP4 só regrava o áudio; WebM vira MP4 H.264 + AAC. */
export function argumentosConversao(entrada: string, saida: string, ehWebm: boolean): string[] {
  const video = ehWebm ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p'] : ['-c:v', 'copy'];
  return ['-hide_banner', '-loglevel', 'error', '-y', '-i', entrada, '-map', '0:v:0', '-map', '0:a:0?', ...video, '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', saida];
}

function rodarFfmpeg(args: string[]): Promise<void> {
  return new Promise((ok, erro) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', c => { err = (err + c).slice(-3000); });
    const t = setTimeout(() => { p.kill('SIGKILL'); erro(new ConversaoErro('O ajuste do vídeo demorou demais', 504)); }, LIMITE_MS);
    p.on('error', e => { clearTimeout(t); erro(new ConversaoErro(`ffmpeg indisponível no servidor (${e.message})`, 503)); });
    p.on('close', c => { clearTimeout(t); c === 0 ? ok() : erro(new ConversaoErro(`Falha ao ajustar o vídeo: ${err.split('\n').filter(Boolean).slice(-2).join(' ')}`)); });
  });
}

// um ajuste por vez: o servidor é compartilhado com o resto do CRM
let fila: Promise<unknown> = Promise.resolve();

export async function converterParaWhatsApp(dados: Buffer, tipo: string): Promise<Buffer> {
  if (!dados?.length) throw new ConversaoErro('Vídeo vazio', 400);
  if (dados.length > LIMITE_BYTES_TOUR3D) throw new ConversaoErro('Vídeo grande demais (limite 200 MB)', 413);
  const ehWebm = /webm/i.test(tipo);
  if (!ehWebm && !/mp4/i.test(tipo)) throw new ConversaoErro('Envie o vídeo MP4 ou WebM gerado pelo Tour 3D', 400);
  const tarefa = fila.then(async () => {
    const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'tour3d-'));
    const entrada = path.join(pasta, `${randomUUID()}.${ehWebm ? 'webm' : 'mp4'}`);
    const saida = path.join(pasta, 'saida.mp4');
    try {
      await fs.writeFile(entrada, dados);
      await rodarFfmpeg(argumentosConversao(entrada, saida, ehWebm));
      return await fs.readFile(saida);
    } finally {
      await fs.rm(pasta, { recursive: true, force: true }).catch(() => undefined);
    }
  });
  fila = tarefa.catch(() => undefined);
  return tarefa;
}
