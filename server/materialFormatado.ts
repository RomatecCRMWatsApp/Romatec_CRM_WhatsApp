/**
 * Material de divulgação no formato escolhido (feed 4:5, stories/reels 9:16, quadrado, WhatsApp ou original),
 * SEM o contato do escritório gravado na peça e COM o contato de quem baixa:
 *  - corta a faixa de baixo da arte/vídeo onde fica o rodapé do escritório (recorteRodapePct);
 *  - no vídeo, corta o cartão final com telefone/QR do escritório (corteFinalMs) e põe o cartão do corretor;
 *  - encaixa a peça no formato (fundo desfocado da própria peça, sem esticar) e põe a faixa do corretor
 *    (nome, CRECI, WhatsApp, Instagram dele e QR do link com ?c=).
 * Imagem: sharp, na hora. Vídeo: ffmpeg em fila (um por vez), com cache em disco; o navegador pergunta até ficar pronto.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { layoutFormato, recorteRodapeEfetivo, type FormatoDownload } from '../shared/materiais';
import { linhasRodape, type CartaoVendas } from '../shared/cartaoVendas';
import { LINHA_PUBLICIDADE } from '../shared/escritorio';

export class FormatoErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'FormatoErro'; } }

const VERDE = '#0C3320', DOURADO = '#C9A84C', CREME = '#F3EEDF';
const FONTE = "'Liberation Sans', 'DejaVu Sans', Arial, sans-serif";
const MAX_BYTES = 150 * 1024 * 1024;
const FIM_MS = 3000; // cartão final do corretor no vídeo

export interface MaterialFonte { id: number; titulo: string; url: string; mime?: string | null; tipo?: string | null; recorteRodapePct?: number | null; corteFinalMs?: number | null }
export interface DadosCorretor { cartao: CartaoVendas; instagram: string | null; email?: string | null; link: string; empreendimento: string | null }

export const ehVideoMaterial = (m: { mime?: string | null; url: string }) => (m.mime || '').startsWith('video/') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(m.url);
export const ehPdfMaterial = (m: { mime?: string | null; url: string }) => m.mime === 'application/pdf' || /\.pdf(\?|$)/i.test(m.url);

// ─── Origem do arquivo (sem SSRF: só o próprio site e o Cloudinary) ─────────────────────────────────────────

const hostProprio = () => { try { return new URL(process.env.APP_PUBLIC_URL || 'https://romateccrm.com').host; } catch { return 'romateccrm.com'; } };
const RAIZES = () => [path.resolve(process.cwd(), 'dist', 'public'), path.resolve(process.cwd(), 'client', 'public')];

/** Arquivo do próprio site (client/public) → caminho local; null se não for daqui */
export function caminhoLocal(url: string, raizes = RAIZES()): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.host !== hostProprio() && u.host !== 'romateccrm.com' && u.host !== 'www.romateccrm.com') return null;
  const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
  for (const r of raizes) {
    const p = path.resolve(r, rel);
    if (p.startsWith(r + path.sep) && existsSync(p)) return p;
  }
  return null;
}

async function baixar(url: string): Promise<Buffer> {
  const local = caminhoLocal(url);
  if (local) return fs.readFile(local);
  let u: URL;
  try { u = new URL(url); } catch { throw new FormatoErro('Endereço do material inválido'); }
  if (u.protocol !== 'https:' || !/(^|\.)res\.cloudinary\.com$/.test(u.hostname)) throw new FormatoErro('Material fora do armazenamento do CRM', 422);
  const r = await fetch(u, { signal: AbortSignal.timeout(120_000), redirect: 'error' });
  if (!r.ok) throw new FormatoErro(`O armazenamento respondeu ${r.status}`, 502);
  const tam = Number(r.headers.get('content-length') || 0);
  if (tam > MAX_BYTES) throw new FormatoErro('Arquivo grande demais para converter', 413);
  const b = Buffer.from(await r.arrayBuffer());
  if (b.length > MAX_BYTES) throw new FormatoErro('Arquivo grande demais para converter', 413);
  return b;
}

// ─── Faixa e cartão final do corretor ───────────────────────────────────────────────────────────────────────

const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Tamanho de letra que cabe na largura (estimativa pela quantidade de caracteres) */
const caber = (texto: string, base: number, largura: number, fator = 0.56) => Math.max(10, Math.min(base, Math.floor(largura / Math.max(1, texto.length * fator))));

export function textosCorretor(d: DadosCorretor) {
  const { nome } = linhasRodape(d.cartao);
  const zap = d.cartao.telefones[0] ? `WhatsApp ${d.cartao.telefones[0]}` : null;
  const detalhe = [zap, d.instagram ? `@${d.instagram}` : null].filter(Boolean).join('  ·  ');
  return { nome, detalhe, email: d.email ?? null };
}

async function qr(link: string, lado: number): Promise<Buffer> {
  const url = await QRCode.toDataURL(link, { margin: 1, width: Math.max(64, lado), errorCorrectionLevel: 'M' });
  return sharp(Buffer.from(url.split(',')[1], 'base64')).resize(lado, lado).png().toBuffer();
}

/** Faixa verde com a linha dourada, "FALE COM O SEU CORRETOR", nome · CRECI, WhatsApp · Instagram e QR */
export async function faixaCorretor(w: number, h: number, d: DadosCorretor): Promise<Buffer> {
  const pad = Math.round(h * 0.12);
  const qrLado = h - pad * 2;
  const larg = w - pad * 3 - qrLado;
  const { nome, detalhe, email } = textosCorretor(d);
  const t1 = 'FALE COM O SEU CORRETOR';
  // Com e-mail a faixa ganha uma 4ª linha: as outras sobem um pouco e diminuem
  const k = email ? 0.86 : 1;
  const f1 = caber(t1, Math.round(h * 0.13 * k), larg, 0.62), f2 = caber(nome, Math.round(h * 0.22 * k), larg, 0.58), f3 = caber(detalhe, Math.round(h * 0.16 * k), larg, 0.52);
  const f4 = email ? caber(email, Math.round(h * 0.13), larg, 0.52) : 0;
  // Linha obrigatória da publicidade (imobiliária + CRECI J), no pé da faixa: as outras sobem um pouco
  const f5 = caber(LINHA_PUBLICIDADE, Math.round(h * 0.1), larg, 0.55);
  const yy = email ? [0.1, 0.31, 0.47, 0.61] : [0.13, 0.39, 0.6, 0];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${VERDE}"/><rect width="${w}" height="${Math.max(3, Math.round(h * 0.03))}" fill="${DOURADO}"/>
    <rect x="${w - pad - qrLado - 4}" y="${pad - 4}" width="${qrLado + 8}" height="${qrLado + 8}" fill="#fff"/>
    <text x="${pad}" y="${Math.round(pad + h * yy[0])}" font-family="${FONTE}" font-weight="700" font-size="${f1}" fill="${DOURADO}" letter-spacing="1">${xml(t1)}</text>
    <text x="${pad}" y="${Math.round(pad + h * yy[1])}" font-family="${FONTE}" font-weight="700" font-size="${f2}" fill="#fff">${xml(nome)}</text>
    <text x="${pad}" y="${Math.round(pad + h * yy[2])}" font-family="${FONTE}" font-size="${f3}" fill="${CREME}">${xml(detalhe)}</text>
    ${email ? `<text x="${pad}" y="${Math.round(pad + h * yy[3])}" font-family="${FONTE}" font-size="${f4}" fill="${CREME}">${xml(email)}</text>` : ''}
    <text x="${pad}" y="${h - Math.round(pad * 0.45)}" font-family="${FONTE}" font-weight="700" font-size="${f5}" fill="${DOURADO}">${xml(LINHA_PUBLICIDADE)}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).composite([{ input: await qr(d.link, qrLado), left: w - pad - qrLado, top: pad }]).png().toBuffer();
}

/** Cartão final do vídeo: no lugar do cartão do escritório, o do corretor com QR grande */
export async function cartaoFinalCorretor(w: number, h: number, d: DadosCorretor): Promise<Buffer> {
  const { nome, detalhe, email } = textosCorretor(d);
  const m = Math.round(w * 0.08), larg = w - m * 2;
  const qrLado = Math.round(Math.min(w * 0.42, h * 0.28));
  const titulo = d.empreendimento ?? 'Fale com o seu corretor';
  const y = (f: number) => Math.round(h * f);
  const linha = (txt: string, yy: number, tam: number, cor: string, peso = 400) =>
    `<text x="${w / 2}" y="${yy}" text-anchor="middle" font-family="${FONTE}" font-weight="${peso}" font-size="${tam}" fill="${cor}">${xml(txt)}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${VERDE}"/>
    <rect x="${m}" y="${y(0.2)}" width="${larg}" height="3" fill="${DOURADO}"/>
    ${linha(titulo, y(0.16), caber(titulo, Math.round(w * 0.06), larg, 0.56), DOURADO, 700)}
    ${linha('FALE COM O SEU CORRETOR', y(0.27), caber('FALE COM O SEU CORRETOR', Math.round(w * 0.045), larg, 0.62), CREME, 700)}
    ${linha(nome, y(0.34), caber(nome, Math.round(w * 0.07), larg, 0.58), '#fff', 700)}
    ${linha(detalhe, y(0.4), caber(detalhe, Math.round(w * 0.045), larg, 0.52), CREME)}
    ${email ? linha(email, y(0.435), caber(email, Math.round(w * 0.038), larg, 0.52), CREME) : ''}
    <rect x="${Math.round((w - qrLado) / 2) - 8}" y="${y(0.47) - 8}" width="${qrLado + 16}" height="${qrLado + 16}" fill="#fff"/>
    ${linha('Aponte a câmera e fale comigo', y(0.47) + qrLado + Math.round(w * 0.07), Math.round(w * 0.04), CREME)}
    ${linha(LINHA_PUBLICIDADE, y(0.95), caber(LINHA_PUBLICIDADE, Math.round(w * 0.04), larg, 0.55), DOURADO, 700)}
  </svg>`;
  return sharp(Buffer.from(svg)).composite([{ input: await qr(d.link, qrLado), left: Math.round((w - qrLado) / 2), top: y(0.47) }]).png().toBuffer();
}

// ─── Imagem ─────────────────────────────────────────────────────────────────────────────────────────────────

export async function imagemFormatada(original: Buffer, formato: FormatoDownload, recortePct: number, d: DadosCorretor): Promise<Buffer> {
  const base = sharp(original, { failOn: 'none' }).rotate();
  const meta = await base.metadata();
  const W0 = meta.width ?? 0, H0 = meta.height ?? 0;
  if (!W0 || !H0) throw new FormatoErro('Não consegui ler a imagem', 422);
  const util = Math.max(1, Math.round(H0 * (1 - recortePct / 100)));
  const semRodape = await base.extract({ left: 0, top: 0, width: W0, height: util }).toBuffer();
  const L = layoutFormato(formato, W0, util);
  // Fundo: a própria peça ampliada e desfocada (nada de faixa preta); por cima a peça inteira, sem cortar nem esticar
  const fundo = await sharp(semRodape).resize(L.w, L.areaH, { fit: 'cover' }).blur(28).modulate({ brightness: 0.8 }).toBuffer();
  const frente = await sharp(semRodape).resize(L.w, L.areaH, { fit: 'inside' }).toBuffer();
  const fm = await sharp(frente).metadata();
  const faixa = await faixaCorretor(L.w, L.faixaH, d);
  return sharp({ create: { width: L.w, height: L.h, channels: 3, background: VERDE } })
    .composite([
      { input: fundo, left: 0, top: 0 },
      { input: frente, left: Math.round((L.w - (fm.width ?? L.w)) / 2), top: Math.round((L.areaH - (fm.height ?? L.areaH)) / 2) },
      { input: faixa, left: 0, top: L.areaH },
    ])
    .jpeg({ quality: formato === 'whatsapp' ? 80 : 90, mozjpeg: true })
    .toBuffer();
}

// ─── Vídeo ──────────────────────────────────────────────────────────────────────────────────────────────────

function rodar(cmd: string, args: string[], limiteMs: number): Promise<string> {
  return new Promise((ok, erro) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', c => { out += c; });
    p.stderr.on('data', c => { err = (err + c).slice(-4000); });
    const t = setTimeout(() => { p.kill('SIGKILL'); erro(new FormatoErro('A conversão do vídeo demorou demais', 504)); }, limiteMs);
    p.on('error', e => { clearTimeout(t); erro(new FormatoErro(`ffmpeg indisponível no servidor (${e.message})`, 503)); });
    p.on('close', c => { clearTimeout(t); c === 0 ? ok(out) : erro(new FormatoErro(`Falha ao converter o vídeo: ${err.split('\n').filter(Boolean).slice(-2).join(' ')}`, 500)); });
  });
}

export async function sondarVideo(arquivo: string): Promise<{ w: number; h: number; duracao: number; audio: boolean }> {
  const j = JSON.parse(await rodar('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', arquivo], 30_000));
  const v = (j.streams ?? []).find((s: any) => s.codec_type === 'video');
  if (!v) throw new FormatoErro('Arquivo sem vídeo', 422);
  return { w: Number(v.width), h: Number(v.height), duracao: Number(j.format?.duration ?? 0), audio: (j.streams ?? []).some((s: any) => s.codec_type === 'audio') };
}

export async function videoFormatado(entrada: string, saida: string, formato: FormatoDownload, recortePct: number, corteFinalMs: number, d: DadosCorretor): Promise<void> {
  const info = await sondarVideo(entrada);
  const dur = Math.max(1, info.duracao - corteFinalMs / 1000);
  const cortaH = Math.max(2, Math.floor((info.h * (1 - recortePct / 100)) / 2) * 2);
  // WhatsApp: vertical leve (720×1280); os demais seguem o layout do formato
  const L = formato === 'whatsapp'
    ? (() => { const f = Math.round(1280 * 0.1 / 2) * 2; return { w: 720, h: 1280, areaH: 1280 - f, faixaH: f }; })()
    : layoutFormato(formato, Math.min(info.w, 1080), Math.round(cortaH * (Math.min(info.w, 1080) / info.w)));
  const tmp = `${saida}.parts`;
  mkdirSync(tmp, { recursive: true });
  const faixa = path.join(tmp, 'faixa.png'), fim = path.join(tmp, 'fim.png');
  await fs.writeFile(faixa, await faixaCorretor(L.w, L.faixaH, d));
  const comFim = corteFinalMs > 0;
  if (comFim) await fs.writeFile(fim, await cartaoFinalCorretor(L.w, L.h, d));
  const fimS = FIM_MS / 1000;
  const v = [
    `[0:v]trim=0:${dur.toFixed(3)},setpts=PTS-STARTPTS,crop=iw:${cortaH}:0:0,split[a][b]`,
    `[a]scale=${L.w}:${L.areaH}:force_original_aspect_ratio=increase,crop=${L.w}:${L.areaH},boxblur=20:2,eq=brightness=-0.12[bg]`,
    `[b]scale=${L.w}:${L.areaH}:force_original_aspect_ratio=decrease,setsar=1[fg]`,
    `[bg][fg]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2[c]`,
    `[c]pad=${L.w}:${L.h}:0:0:color=0x0C3320[p]`,
    `[p][1:v]overlay=0:${L.areaH}:shortest=1,fps=30,format=yuv420p,setsar=1${comFim ? '[m]' : '[v]'}`,
    ...(comFim ? [`[2:v]scale=${L.w}:${L.h},fps=30,format=yuv420p,setsar=1,trim=0:${fimS},setpts=PTS-STARTPTS[e]`, `[m][e]concat=n=2:v=1:a=0[v]`] : []),
    ...(info.audio ? [`[0:a]atrim=0:${dur.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=out:st=${Math.max(0, dur - 0.6).toFixed(3)}:d=0.6${comFim ? `,apad=pad_dur=${fimS}` : ''}[au]`] : []),
  ].join(';');
  const leve = formato === 'whatsapp';
  const args = ['-v', 'error', '-y', '-i', entrada, '-loop', '1', '-i', faixa, ...(comFim ? ['-loop', '1', '-t', String(fimS), '-i', fim] : []),
    '-filter_complex', v, '-map', '[v]', ...(info.audio ? ['-map', '[au]'] : []),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', leve ? '28' : '22', ...(leve ? ['-maxrate', '1800k', '-bufsize', '3600k'] : []),
    '-pix_fmt', 'yuv420p', '-r', '30', '-threads', '2', ...(info.audio ? ['-c:a', 'aac', '-b:a', leve ? '96k' : '128k'] : []),
    '-t', (dur + (comFim ? fimS : 0)).toFixed(3), '-movflags', '+faststart', saida];
  try { await rodar('ffmpeg', args, 8 * 60_000); }
  finally { await fs.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
}

// ─── Cache e fila ───────────────────────────────────────────────────────────────────────────────────────────

const PASTA = path.join(os.tmpdir(), 'romatec-materiais');
const jobs = new Map<string, { promessa: Promise<void>; erro?: string; inicio: number }>();
let fila: Promise<unknown> = Promise.resolve();

export function chaveCache(m: MaterialFonte, formato: FormatoDownload, d: DadosCorretor): string {
  const { nome, detalhe, email } = textosCorretor(d);
  return createHash('sha1').update(JSON.stringify([m.id, m.url, recorteRodapeEfetivo(m), m.corteFinalMs ?? 0, formato, nome, detalhe, email, d.link, d.empreendimento, 3])).digest('hex').slice(0, 24);
}

async function limparCache(manter = 40) {
  try {
    const nomes = (await fs.readdir(PASTA)).filter(n => n.endsWith('.mp4'));
    if (nomes.length <= manter) return;
    const st = await Promise.all(nomes.map(async n => ({ n, t: (await fs.stat(path.join(PASTA, n))).mtimeMs })));
    for (const { n } of st.sort((a, b) => a.t - b.t).slice(0, nomes.length - manter)) await fs.rm(path.join(PASTA, n), { force: true });
  } catch { /* cache é descartável */ }
}

export type ResultadoVideo = { status: 'pronto'; arquivo: string } | { status: 'gerando'; segundos: number } | { status: 'erro'; erro: string };

/** Vídeo no formato: devolve o arquivo se já existe; senão entra na fila e responde "gerando" */
export function pedirVideo(m: MaterialFonte, formato: FormatoDownload, d: DadosCorretor): ResultadoVideo {
  mkdirSync(PASTA, { recursive: true });
  const chave = chaveCache(m, formato, d);
  const arquivo = path.join(PASTA, `${chave}.mp4`);
  if (existsSync(arquivo)) return { status: 'pronto', arquivo };
  const j = jobs.get(chave);
  if (j?.erro) { if (Date.now() - j.inicio > 60_000) jobs.delete(chave); return { status: 'erro', erro: j.erro }; }
  if (j) return { status: 'gerando', segundos: Math.round((Date.now() - j.inicio) / 1000) };
  const job = { inicio: Date.now(), erro: undefined as string | undefined, promessa: Promise.resolve() };
  const tarefa = async () => {
    const entradaLocal = caminhoLocal(m.url);
    const entrada = entradaLocal ?? path.join(PASTA, `${chave}.src`);
    try {
      if (!entradaLocal) await fs.writeFile(entrada, await baixar(m.url));
      const tmp = path.join(PASTA, `${chave}.tmp.mp4`);
      await videoFormatado(entrada, tmp, formato, recorteRodapeEfetivo(m), Math.max(0, Number(m.corteFinalMs ?? 0)), d);
      await fs.rename(tmp, arquivo);
      jobs.delete(chave);
      await limparCache();
    } catch (e: any) {
      job.erro = e?.message ?? String(e);
      job.inicio = Date.now();
      console.warn('[Materiais] vídeo no formato:', job.erro);
    } finally {
      if (!entradaLocal) await fs.rm(entrada, { force: true }).catch(() => {});
    }
  };
  job.promessa = (fila = fila.then(tarefa, tarefa)) as Promise<void>;
  jobs.set(chave, job);
  return { status: 'gerando', segundos: 0 };
}

export async function imagemDoMaterial(m: MaterialFonte, formato: FormatoDownload, d: DadosCorretor): Promise<Buffer> {
  return imagemFormatada(await baixar(m.url), formato, recorteRodapeEfetivo(m), d);
}

/** "Reel Obras parte 2" + stories → "Reel_Obras_parte_2_stories.mp4" */
export function nomeDownload(titulo: string, formato: FormatoDownload, ext: string): string {
  const base = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'material';
  return `${base}_${formato}.${ext}`;
}
