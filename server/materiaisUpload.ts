/**
 * Upload de materiais DIRETO do navegador para o Cloudinary (assinado pelo servidor), em partes (chunked).
 * O arquivo não passa pelo servidor do Railway: sem limite de corpo, sem timeout de 5 min e sem estourar a
 * memória com vídeo grande. O servidor só confere quem envia, o tipo e o tamanho, e assina os parâmetros.
 *
 * Limites: os do plano da conta (Admin API /usage → media_limits), com cache de 1 h; sem resposta, os padrões.
 */
import crypto from 'node:crypto';
import { TIPOS_ARQUIVO_ACEITOS, resourceTypeDe } from '../shared/materiais';
import { credenciais } from './cloudinaryConfig';

const MB = 1024 * 1024;
const PADRAO = { imagem: 10 * MB, video: 100 * MB, raw: 10 * MB };
/** Tamanho de cada parte (o Cloudinary pede ≥ 5 MB, exceto a última) */
export const PARTE_BYTES = 20 * MB;

const cfg = (fetchFn: typeof fetch = fetch) => credenciais(fetchFn);

export interface LimitesUpload { imagem: number; video: number; raw: number; plano: string | null; fonte: 'conta' | 'padrao' }
let cache: { em: number; v: LimitesUpload } | null = null;

/** Limites reais do plano do Cloudinary (máximo por arquivo) */
export async function limitesDoPlano(fetchFn: typeof fetch = fetch): Promise<LimitesUpload> {
  if (cache && Date.now() - cache.em < 3600_000) return cache.v;
  let v: LimitesUpload = { ...PADRAO, plano: null, fonte: 'padrao' };
  try {
    const { cloud, key, secret } = await cfg(fetchFn);
    const r = await fetchFn(`https://api.cloudinary.com/v1_1/${cloud}/usage`, {
      headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` }, signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const u: any = await r.json();
      const m = u?.media_limits ?? {};
      const n = (x: unknown, d: number) => (Number(x) > 0 ? Number(x) : d);
      v = { imagem: n(m.image_max_size_bytes, PADRAO.imagem), video: n(m.video_max_size_bytes, PADRAO.video), raw: n(m.raw_max_size_bytes, PADRAO.raw), plano: u?.plan ?? null, fonte: 'conta' };
    } else console.warn(`[Materiais] /usage do Cloudinary: ${r.status}`);
  } catch (e: any) { console.warn('[Materiais] limites do Cloudinary:', e?.message); }
  cache = { em: Date.now(), v };
  return v;
}

export function limiteDoTipo(l: LimitesUpload, mime: string): number {
  const rt = resourceTypeDe(mime);
  return rt === 'video' ? l.video : rt === 'raw' ? l.raw : l.imagem;
}

const assinar = (params: Record<string, string>, secret: string) =>
  crypto.createHash('sha256').update(Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&') + secret).digest('hex');

/** Valida o arquivo e devolve os parâmetros assinados para o navegador enviar direto ao Cloudinary */
export async function assinaturaUpload(nome: string, mime: string, tamanho: number) {
  if (!TIPOS_ARQUIVO_ACEITOS.includes(mime)) throw new ErroUpload('Tipo não aceito. Use JPG, PNG, WEBP, GIF, MP4, MOV, WEBM ou PDF.');
  if (!(tamanho > 0)) throw new ErroUpload('Arquivo vazio.');
  const limites = await limitesDoPlano();
  const limite = limiteDoTipo(limites, mime);
  if (tamanho > limite) {
    throw new ErroUpload(`Arquivo de ${(tamanho / MB).toFixed(0)} MB acima do limite do plano de armazenamento (${Math.floor(limite / MB)} MB por ${resourceTypeDe(mime) === 'video' ? 'vídeo' : 'arquivo'}).`, 413);
  }
  const { cloud, key, secret } = await cfg();
  const resourceType = resourceTypeDe(mime);
  const ext = resourceType === 'raw' ? (nome.match(/\.[^/.]+$/)?.[0] ?? '') : '';
  const seguro = nome.replace(/\.[^/.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 60);
  const publicId = `romatec_materiais/${Date.now()}_${seguro}${ext}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params = { access_mode: 'public', public_id: publicId, timestamp };
  return {
    url: `https://api.cloudinary.com/v1_1/${cloud}/${resourceType}/upload`,
    campos: { ...params, api_key: key, signature: assinar(params, secret) },
    parteBytes: PARTE_BYTES, resourceType, limite,
  };
}

export class ErroUpload extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'ErroUpload'; } }

/** O material só aceita arquivo da nossa conta do Cloudinary */
export function urlDaConta(url: string): boolean {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  return !!cloud && url.startsWith(`https://res.cloudinary.com/${cloud}/`);
}
