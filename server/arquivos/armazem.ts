/**
 * Armazém de arquivos fora do banco (Cloudinary, entrega PRIVADA).
 *
 * Por quê: documentos e páginas guardados em base64 no MySQL ocupavam ~200 MB e eram lidos inteiros nas consultas.
 * Como: cada arquivo vai para o Cloudinary como "raw" do tipo "private" (sem URL pública); só o servidor baixa,
 * pela API assinada, depois de o CRM conferir a permissão. No banco fica só a referência ("cld:raw/private/<id>").
 *
 * Segurança operacional:
 * - Antes de qualquer gravação o armazém faz um teste de ida e volta (envia, baixa, compara o sha256 e apaga).
 *   Sem o teste aprovado, tudo continua no banco, como antes.
 * - O nome no Cloudinary é aleatório (sem nome de pessoa nem tipo de documento).
 * - Leituras recentes ficam num cache em memória limitado (páginas exibidas em sequência).
 */
import { createHash, randomUUID } from 'node:crypto';
import { credenciais } from '../cloudinaryConfig';

export const PREFIXO_REF = 'cld:raw/private/';
const PASTA = 'romatec_privado';
const TEMPO_LIMITE_MS = 60_000;

let fetchArmazem: typeof fetch = (...a) => fetch(...a);
/** Testes: troca o fetch (Cloudinary simulado) */
export function _usarFetch(f: typeof fetch) { fetchArmazem = f; estado = null; cache.clear(); bytesCache = 0; }

export const ehRef = (v: unknown): v is string => typeof v === 'string' && v.startsWith(PREFIXO_REF);
const idDaRef = (ref: string) => ref.slice(PREFIXO_REF.length);
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Assinatura da API do Cloudinary (mesmo algoritmo dos uploads que já funcionam: sha256 dos parâmetros ordenados + segredo) */
export function assinar(params: Record<string, string>, segredo: string): string {
  const base = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  return createHash('sha256').update(base + segredo).digest('hex');
}

async function cred() { return credenciais(); }

// ─── Operações básicas ────────────────────────────────────────────────────────

async function enviar(buf: Buffer, sub: string): Promise<string> {
  const { cloud, key, secret } = await cred();
  const publicId = `${PASTA}/${sub}/${randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const assinados = { public_id: publicId, timestamp, type: 'private' };
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buf)]), 'arquivo.bin');
  form.append('api_key', key);
  for (const [k, v] of Object.entries(assinados)) form.append(k, v);
  form.append('signature', assinar(assinados, secret));
  const r = await fetchArmazem(`https://api.cloudinary.com/v1_1/${cloud}/raw/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
  if (!r.ok) throw new Error(`envio recusado (${r.status}): ${(await r.text().catch(() => '')).slice(0, 200)}`);
  const j: any = await r.json();
  if (!j?.public_id) throw new Error('envio sem public_id na resposta');
  return `${PREFIXO_REF}${j.public_id}`;
}

async function baixar(ref: string): Promise<Buffer> {
  const { cloud, key, secret } = await cred();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const assinados = { public_id: idDaRef(ref), timestamp, type: 'private' };
  const q = new URLSearchParams({ ...assinados, api_key: key, signature: assinar(assinados, secret) });
  const r = await fetchArmazem(`https://api.cloudinary.com/v1_1/${cloud}/raw/download?${q}`, { signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
  if (!r.ok) throw new Error(`download recusado (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

/** Apaga no Cloudinary (API administrativa, até 100 por chamada). Erros não interrompem quem chamou */
export async function apagarArquivos(refs: string[]): Promise<number> {
  const ids = refs.filter(ehRef).map(idDaRef);
  if (!ids.length) return 0;
  const { cloud, key, secret } = await cred();
  let apagados = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const q = new URLSearchParams();
    for (const id of ids.slice(i, i + 100)) q.append('public_ids[]', id);
    const r = await fetchArmazem(`https://api.cloudinary.com/v1_1/${cloud}/resources/raw/private?${q}`, {
      method: 'DELETE', headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` }, signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (r.ok) apagados += ids.slice(i, i + 100).length;
    else console.warn(`[Armazém] apagar recusado (${r.status})`);
  }
  for (const ref of refs) esquecer(ref);
  return apagados;
}

/** Todos os arquivos do CRM no Cloudinary (para achar órfãos) */
export async function listarArquivos(): Promise<{ ref: string; criadoEm: string }[]> {
  const { cloud, key, secret } = await cred();
  const out: { ref: string; criadoEm: string }[] = [];
  let cursor = '';
  for (let pagina = 0; pagina < 50; pagina++) {
    const q = new URLSearchParams({ prefix: `${PASTA}/`, max_results: '500', ...(cursor ? { next_cursor: cursor } : {}) });
    const r = await fetchArmazem(`https://api.cloudinary.com/v1_1/${cloud}/resources/raw/private?${q}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` }, signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (!r.ok) throw new Error(`listagem recusada (${r.status})`);
    const j: any = await r.json();
    for (const x of j?.resources ?? []) out.push({ ref: `${PREFIXO_REF}${x.public_id}`, criadoEm: String(x.created_at ?? '') });
    cursor = j?.next_cursor ?? '';
    if (!cursor) break;
  }
  return out;
}

// ─── Teste de ida e volta (libera o uso do armazém) ──────────────────────────

let estado: { pronto: boolean; erro: string | null; em: number } | null = null;
const RETESTE_FALHA_MS = 30 * 60_000;

/** O armazém só é usado depois de um envio + download + comparação + exclusão bem-sucedidos */
export async function armazemPronto(): Promise<boolean> {
  if (process.env.ARQUIVOS_NO_BANCO === '1') return false;
  if (estado && (estado.pronto || Date.now() - estado.em < RETESTE_FALHA_MS)) return estado.pronto;
  try {
    const amostra = Buffer.from(`teste do armazém ${randomUUID()}`);
    const ref = await enviar(amostra, 'teste');
    const volta = await baixar(ref);
    await apagarArquivos([ref]).catch(() => 0);
    if (sha256(volta) !== sha256(amostra)) throw new Error('o arquivo baixado não confere com o enviado');
    estado = { pronto: true, erro: null, em: Date.now() };
  } catch (e: any) {
    estado = { pronto: false, erro: String(e?.message ?? e).slice(0, 300), em: Date.now() };
    console.warn('[Armazém] indisponível, arquivos continuam no banco:', estado.erro);
  }
  return estado.pronto;
}

export function situacaoTeste() { return estado ? { pronto: estado.pronto, erro: estado.erro, testadoEm: new Date(estado.em).toISOString() } : null; }

// ─── Cache de leitura ─────────────────────────────────────────────────────────

const LIMITE_CACHE = 40 * 1024 * 1024;
const cache = new Map<string, Buffer>();
let bytesCache = 0;
function lembrar(ref: string, buf: Buffer) {
  if (buf.length > LIMITE_CACHE / 4) return;
  esquecer(ref);
  cache.set(ref, buf); bytesCache += buf.length;
  for (const [k, v] of Array.from(cache.entries())) { if (bytesCache <= LIMITE_CACHE) break; cache.delete(k); bytesCache -= v.length; }
}
function esquecer(ref: string) { const v = cache.get(ref); if (v) { cache.delete(ref); bytesCache -= v.length; } }

// ─── Uso pelo CRM ─────────────────────────────────────────────────────────────

/** Guarda e confere (baixa de volta e compara): só devolve a referência de um arquivo íntegro */
export async function guardarConferido(buf: Buffer, sub: string): Promise<string> {
  const ref = await enviar(buf, sub);
  try {
    const volta = await baixar(ref);
    if (sha256(volta) !== sha256(buf)) throw new Error('conferência falhou: arquivo diferente do enviado');
  } catch (e) {
    await apagarArquivos([ref]).catch(() => 0);
    throw e;
  }
  lembrar(ref, buf);
  return ref;
}

/** Conteúdo para gravar: no armazém (se pronto) ou em base64 no banco, como antes */
export async function paraGravar(buf: Buffer, sub: string): Promise<{ base64: string; ref: string | null }> {
  if (await armazemPronto()) {
    try { return { base64: '', ref: await guardarConferido(buf, sub) }; }
    catch (e: any) { console.warn('[Armazém] gravação caiu para o banco:', e?.message); }
  }
  return { base64: buf.toString('base64'), ref: null };
}

/** Lê o arquivo: pela referência (armazém) ou pelo base64 do banco (ainda não migrado) */
export async function lerConteudo(base64: string | null | undefined, ref: string | null | undefined): Promise<Buffer> {
  if (ehRef(ref)) {
    const c = cache.get(ref);
    if (c) { cache.delete(ref); cache.set(ref, c); return c; }
    const buf = await baixar(ref);
    lembrar(ref, buf);
    return buf;
  }
  return Buffer.from(String(base64 ?? ''), 'base64');
}

export const _interno = { enviar, baixar, sha256 };
