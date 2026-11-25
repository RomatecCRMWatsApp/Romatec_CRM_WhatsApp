/**
 * Monta as peças da fábrica de criativos (porta de scripts/montar_criativo.py):
 *  - Reels 9:16 (MP4): trechos dos vídeos + fotos com zoom lento, gancho fixo no topo, selo animado e cartão final;
 *  - Carrossel 4:5 / foto 9:16 (JPG): foto cobrindo o quadro, gancho e selo na 1ª, cartão final no carrossel.
 * Gancho, selo e cartão são desenhados em SVG pelo sharp (fontes Liberation do servidor); o vídeo sai pelo ffmpeg.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import type { Pauta } from '../../shared/pautaDiaria';
import { rodar } from '../materialFormatado';

const VERDE = '#092616', DOURADO = '#E8C46A', CREME = '#F6EED6', TXT_ESC = '#0B2E1C';
const SERIF = "'Liberation Serif', 'DejaVu Serif', serif";
const SANS = "'Liberation Sans', 'DejaVu Sans', sans-serif";
export const TAMANHOS: Record<Pauta['formato'], [number, number]> = { '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080] };
const FPS = 30;

const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Largura estimada do texto (sem medir a fonte): média de caracteres por em */
const largura = (t: string, tam: number, fator: number) => t.length * tam * fator;
const svg = (w: number, h: number, corpo: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${corpo}</svg>`);

/** Gancho: até 2 linhas em caixas brancas com serifa preta, abaixo da área do topo do app */
export function svgGancho(linhas: string[], W: number, H: number): Buffer {
  const k = W / 720;
  let tam = Math.round(40 * k);
  while (tam > 20 && Math.max(...linhas.map(l => largura(l, tam, 0.5))) > W * 0.86) tam -= 2;
  const padX = Math.round(16 * k), padY = Math.round(10 * k), alt = Math.round(tam * 1.18);
  let y = Math.round(H * (H / W > 1.5 ? 0.095 : 0.06));
  const partes: string[] = [];
  for (const l of linhas.filter(Boolean)) {
    const w = Math.min(W * 0.94, largura(l, tam, 0.5) + 2 * padX);
    partes.push(`<rect x="${(W - w) / 2}" y="${y}" width="${w}" height="${alt + 2 * padY}" rx="${10 * k}" fill="#FFFFFF" fill-opacity="0.96"/>`);
    partes.push(`<text x="${W / 2}" y="${y + padY + alt * 0.8}" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="${tam}" fill="#000000">${xml(l)}</text>`);
    y += alt + 2 * padY + Math.round(4 * k);
  }
  return svg(W, H, partes.join(''));
}

/** Selo verde com borda dourada, acima dos 30% de baixo (onde ficam legenda e botões do app) */
export function svgSelo(titulo: string, sub: string | undefined, W: number, H: number): Buffer {
  const k = W / 720, tt = Math.round(34 * k), ts = Math.round(20 * k);
  const bw = Math.min(W * 0.92, Math.max(largura(titulo, tt, 0.5), sub ? largura(sub, ts, 0.52) : 0) + 64 * k);
  const bh = Math.round((sub ? 104 : 70) * k), x0 = (W - bw) / 2, y0 = Math.round(H * 0.66) - bh;
  return svg(W, H, `<rect x="${x0}" y="${y0}" width="${bw}" height="${bh}" rx="${18 * k}" fill="${VERDE}" fill-opacity="0.93" stroke="${DOURADO}" stroke-width="${Math.max(2, 3 * k)}"/>`
    + `<text x="${W / 2}" y="${y0 + 48 * k}" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="${tt}" fill="${DOURADO}">${xml(titulo)}</text>`
    + (sub ? `<text x="${W / 2}" y="${y0 + 84 * k}" text-anchor="middle" font-family="${SANS}" font-weight="600" font-size="${ts}" fill="${CREME}">${xml(sub)}</text>` : ''));
}

/** Cartão final: "+ Seguir" (seguidores) ou a chamada para o formulário (leads) */
export function svgFinal(p: Pauta, W: number, H: number): Buffer {
  const k = W / 720, f = p.final!, cy = H / 2, m = 24 * k;
  const t = (y: number, texto: string, tam: number, cor: string, fonte = SANS, peso = 500) =>
    `<text x="${W / 2}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="${fonte}" font-weight="${peso}" font-size="${tam}" fill="${cor}">${xml(texto)}</text>`;
  const botao = (bw: number, texto: string, tam: number) => `<rect x="${(W - bw) / 2}" y="${cy + 30 * k}" width="${bw}" height="${78 * k}" rx="${16 * k}" fill="${DOURADO}"/>`
    + t(cy + 30 * k + 39 * k, texto, tam, TXT_ESC, SANS, 700);
  let meio: string, linha: string;
  if (p.objetivo === 'seguidores') {
    meio = t(cy - 30 * k, f.handle, Math.round(46 * k), CREME, SERIF, 700) + botao(300 * k, '+ Seguir', Math.round(34 * k));
    linha = f.chamada || 'Acompanhe a obra em primeira mão';
  } else {
    meio = t(cy - 30 * k, f.chamada || 'Agende sua visita', Math.round(44 * k), CREME, SERIF, 700) + botao(440 * k, f.whatsapp || 'Toque em Cadastre-se', Math.round(30 * k));
    linha = f.handle;
  }
  return svg(W, H, `<rect width="${W}" height="${H}" fill="${VERDE}"/>`
    + `<rect x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" fill="none" stroke="${DOURADO}" stroke-width="${Math.max(2, 3 * k)}"/>`
    + t(cy - 190 * k, 'Condomínio de Chácaras', Math.round(26 * k), CREME)
    + t(cy - 140 * k, 'Bom Jardims', Math.round(64 * k), DOURADO, SERIF, 700) + meio
    + t(cy + 160 * k, linha, Math.round(24 * k), CREME)
    + (f.rodape ? t(H - 70 * k, f.rodape, Math.round(18 * k), '#C8C8BE') : ''));
}

const png = (b: Buffer) => sharp(b).png().toBuffer();

/** Arquivo local de cada mídia da pauta (o chamador baixa; nos testes são arquivos gerados) */
export type ObterArquivo = (arquivo: string) => Promise<string>;

async function cobrir(arquivo: string, W: number, H: number): Promise<sharp.Sharp> {
  return sharp(arquivo).rotate().resize(W, H, { fit: 'cover', position: 'centre' });
}

/** Carrossel (1 JPG por foto + cartão final) ou foto única (Stories). Devolve os caminhos na ordem. */
export async function montarFotos(p: Pauta, obter: ObterArquivo, pasta: string): Promise<string[]> {
  const [W, H] = TAMANHOS[p.formato];
  const imgs = p.midias.filter(m => m.tipo === 'imagem').slice(0, p.tipo === 'foto' ? 1 : 10);
  if (!imgs.length) throw new Error('A pauta não tem fotos');
  const saidas: string[] = [];
  for (let i = 0; i < imgs.length; i++) {
    const camadas: sharp.OverlayOptions[] = [];
    if (i === 0) {
      camadas.push({ input: await png(svgGancho(p.gancho, W, H)) });
      if (p.selo) camadas.push({ input: await png(svgSelo(p.selo.titulo, p.selo.sub, W, H)) });
    }
    const out = path.join(pasta, `${p.nome}_${String(i + 1).padStart(2, '0')}.jpg`);
    await (await cobrir(await obter(imgs[i].arquivo), W, H)).composite(camadas).jpeg({ quality: 90 }).toFile(out);
    saidas.push(out);
  }
  if (p.tipo === 'carrossel' && p.final) {
    const out = path.join(pasta, `${p.nome}_${String(imgs.length + 1).padStart(2, '0')}.jpg`);
    await sharp(svgFinal(p, W, H)).jpeg({ quality: 90 }).toFile(out);
    saidas.push(out);
  }
  return saidas;
}

async function temAudio(arquivo: string): Promise<boolean> {
  const r = await rodar('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', arquivo], 30_000).catch(() => '');
  return Boolean(r.trim());
}

/** Reels 9:16 em MP4. `rapido` = prévia (preset veryfast, menor qualidade) */
export async function montarReels(p: Pauta, obter: ObterArquivo, pasta: string, rapido = false): Promise<string> {
  const [W, H] = TAMANHOS[p.formato];
  if (!p.final) throw new Error('A pauta de Reels precisa do cartão final');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'criativo-'));
  try {
    const camada = async (nome: string, b: Buffer) => { const c = path.join(tmp, `${nome}.png`); await fs.writeFile(c, await png(b)); return c; };
    const locais = await Promise.all(p.midias.map(m => obter(m.arquivo)));
    const audios = await Promise.all(p.midias.map((m, i) => (m.tipo === 'video' ? temAudio(locais[i]) : Promise.resolve(false))));
    const comAudio = audios.some(Boolean);
    const cobrirF = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;
    const inputs: string[] = [], fc: string[] = [], vs: string[] = [], auds: string[] = [];
    const Z = 1.5; // zoom lento sobre uma imagem maior que o quadro (menos serrilhado)
    p.midias.forEach((m, i) => {
      const dur = m.dur;
      if (m.tipo === 'imagem') {
        const n = Math.round(dur * FPS);
        inputs.push('-loop', '1', '-t', `${dur}`, '-i', locais[i]);
        fc.push(`[${i}:v]scale=${W * Z}:${H * Z}:force_original_aspect_ratio=increase,crop=${W * Z}:${H * Z},`
          + `zoompan=z='1+0.06*on/${n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${n}:s=${W}x${H}:fps=${FPS},setsar=1,trim=duration=${dur}[v${i}]`);
        if (comAudio) fc.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${dur}[a${i}]`);
      } else {
        inputs.push('-ss', `${m.ini ?? 0}`, '-t', `${dur}`, '-i', locais[i]);
        fc.push(`[${i}:v]${cobrirF},fps=${FPS},trim=duration=${dur},setpts=PTS-STARTPTS[v${i}]`);
        if (comAudio) {
          fc.push(audios[i]
            ? `[${i}:a]aresample=44100,aformat=channel_layouts=stereo,atrim=duration=${dur},asetpts=PTS-STARTPTS,afade=t=in:d=0.05,afade=t=out:st=${Math.max(0, dur - 0.08).toFixed(3)}:d=0.08[a${i}]`
            : `anullsrc=r=44100:cl=stereo,atrim=duration=${dur}[a${i}]`);
        }
      }
      vs.push(`[v${i}]`); auds.push(`[a${i}]`);
    });
    const n = p.midias.length, corpo = p.midias.reduce((s, m) => s + m.dur, 0);
    const fdur = p.final.dur || 3, total = corpo + fdur;
    inputs.push('-loop', '1', '-t', `${fdur}`, '-i', await camada('final', svgFinal(p, W, H)));
    fc.push(`[${n}:v]scale=${W}:${H},fps=${FPS},format=yuv420p,fade=t=in:d=0.3,setsar=1[vf]`);
    if (comAudio) {
      fc.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${fdur}[af]`);
      fc.push(vs.map((v, i) => v + auds[i]).join('') + `[vf][af]concat=n=${n + 1}:v=1:a=1[vc][ac]`);
    } else {
      fc.push(vs.join('') + `[vf]concat=n=${n + 1}:v=1:a=0[vc]`);
    }
    let ultimo = 'vc', idx = n + 1;
    inputs.push('-loop', '1', '-i', await camada('gancho', svgGancho(p.gancho, W, H)));
    fc.push(`[${ultimo}][${idx}:v]overlay=0:0:enable='between(t,0,${corpo})':shortest=1[g]`); ultimo = 'g'; idx++;
    if (p.selo) {
      const t0 = p.selo.ini ?? 1, t1 = Math.min(p.selo.fim ?? 7, corpo);
      inputs.push('-loop', '1', '-i', await camada('selo', svgSelo(p.selo.titulo, p.selo.sub, W, H)));
      fc.push(`[${idx}:v]format=rgba,fade=t=in:st=${t0}:d=0.4:alpha=1,fade=t=out:st=${Math.max(t0, t1 - 0.3)}:d=0.3:alpha=1[so]`);
      fc.push(`[${ultimo}][so]overlay=x=0:y='if(lt(t-${t0},0.4),36*(1-(t-${t0})/0.4),0)':enable='between(t,${t0},${t1})':shortest=1[s]`);
      ultimo = 's'; idx++;
    }
    fc.push(`[${ultimo}]format=yuv420p[vo]`);
    const out = path.join(pasta, `${p.nome}.mp4`);
    const args = ['-v', 'error', '-y', ...inputs, '-filter_complex', fc.join(';'), '-map', '[vo]', ...(comAudio ? ['-map', '[ac]'] : []),
      '-t', total.toFixed(3), '-r', String(FPS), '-c:v', 'libx264', '-preset', rapido ? 'veryfast' : 'medium', '-crf', rapido ? '28' : '21',
      ...(comAudio ? ['-c:a', 'aac', '-b:a', '160k'] : []), '-movflags', '+faststart', out];
    await rodar('ffmpeg', args, 15 * 60_000);
    return out;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

/** Monta a peça da pauta; devolve os arquivos gerados na ordem de publicação */
export async function montarPeca(p: Pauta, obter: ObterArquivo, pasta: string, rapido = false): Promise<string[]> {
  await fs.mkdir(pasta, { recursive: true });
  return p.tipo === 'reels' ? [await montarReels(p, obter, pasta, rapido)] : montarFotos(p, obter, pasta);
}
