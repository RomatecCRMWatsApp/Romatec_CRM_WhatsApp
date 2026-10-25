/**
 * Credenciais do Cloudinary — uma fonte só para todo upload (servidor e envio direto do navegador).
 * Aceita CLOUDINARY_URL (cloudinary://<key>:<secret>@<cloud>) e as variáveis separadas
 * CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET (sem espaços nem aspas).
 * Cada conjunto é conferido no Cloudinary (GET /ping, autenticado) e o primeiro VÁLIDO é usado; o resultado
 * fica em cache por 10 min. Nada disso vai para o navegador além do cloud_name e da api_key (pública).
 */
export interface CredCloudinary { cloud: string; key: string; secret: string; origem: 'CLOUDINARY_URL' | 'CLOUDINARY_*' }

const limpar = (v: string | undefined) => String(v ?? '').trim().replace(/^['"]|['"]$/g, '').trim();

export function candidatos(env: NodeJS.ProcessEnv = process.env): CredCloudinary[] {
  const out: CredCloudinary[] = [];
  const url = limpar(env.CLOUDINARY_URL);
  const m = /^cloudinary:\/\/([^:]+):([^@]+)@([^/?#\s]+)/.exec(url);
  if (m) out.push({ key: decodeURIComponent(m[1]), secret: decodeURIComponent(m[2]), cloud: m[3], origem: 'CLOUDINARY_URL' });
  const cloud = limpar(env.CLOUDINARY_CLOUD_NAME), key = limpar(env.CLOUDINARY_API_KEY), secret = limpar(env.CLOUDINARY_API_SECRET);
  if (cloud && key && secret && !out.some(c => c.cloud === cloud && c.key === key && c.secret === secret)) out.push({ cloud, key, secret, origem: 'CLOUDINARY_*' });
  return out;
}

export interface Conferencia { cred: CredCloudinary; ok: boolean; status: number | null; erro: string | null }

/** Confere um conjunto no Cloudinary: 200 = válido; 401 = api_key/secret não pertencem a esse cloud_name */
export async function conferir(cred: CredCloudinary, fetchFn: typeof fetch = fetch): Promise<Conferencia> {
  try {
    const r = await fetchFn(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cred.cloud)}/ping`, {
      headers: { Authorization: `Basic ${Buffer.from(`${cred.key}:${cred.secret}`).toString('base64')}` }, signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return { cred, ok: true, status: r.status, erro: null };
    const j: any = await r.json().catch(() => null);
    return { cred, ok: false, status: r.status, erro: j?.error?.message ?? `HTTP ${r.status}` };
  } catch (e: any) {
    // Sem rede para conferir: não descarta (o upload dirá se vale)
    return { cred, ok: false, status: null, erro: e?.message ?? 'sem resposta' };
  }
}

let cache: { em: number; cred: CredCloudinary; conferencias: Conferencia[] } | null = null;

export class CredencialCloudinaryErro extends Error {
  constructor(public conferencias: Conferencia[]) {
    super(conferencias.length
      ? `Credenciais do Cloudinary inválidas: ${conferencias.map(c => `${c.cred.origem} (cloud "${c.cred.cloud}", api_key …${c.cred.key.slice(-4)}): ${c.erro}`).join('; ')}`
      : 'Cloudinary não configurado (defina CLOUDINARY_URL ou CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET)');
    this.name = 'CredencialCloudinaryErro';
  }
}

/** Primeiro conjunto válido (com cache). Sem nenhum válido: usa o que não deu para conferir (rede) ou lança o erro detalhado */
export async function credenciais(fetchFn: typeof fetch = fetch, env: NodeJS.ProcessEnv = process.env): Promise<CredCloudinary> {
  if (cache && Date.now() - cache.em < 10 * 60_000) return cache.cred;
  const lista = candidatos(env);
  const conferencias: Conferencia[] = [];
  for (const c of lista) {
    const r = await conferir(c, fetchFn);
    conferencias.push(r);
    if (r.ok) { cache = { em: Date.now(), cred: c, conferencias }; return c; }
  }
  const semResposta = conferencias.find(c => c.status === null);
  if (semResposta) return semResposta.cred;
  console.error('[Cloudinary]', new CredencialCloudinaryErro(conferencias).message);
  throw new CredencialCloudinaryErro(conferencias);
}

export function limparCacheCredenciais() { cache = null; }

/** Diagnóstico para o administrador (sem expor segredo) */
export async function diagnostico(fetchFn: typeof fetch = fetch, env: NodeJS.ProcessEnv = process.env) {
  const lista = candidatos(env);
  const conferencias = await Promise.all(lista.map(c => conferir(c, fetchFn)));
  return {
    variaveis: {
      CLOUDINARY_URL: !!limpar(env.CLOUDINARY_URL), CLOUDINARY_CLOUD_NAME: limpar(env.CLOUDINARY_CLOUD_NAME) || null,
      CLOUDINARY_API_KEY: limpar(env.CLOUDINARY_API_KEY) ? `…${limpar(env.CLOUDINARY_API_KEY).slice(-4)}` : null,
      CLOUDINARY_API_SECRET: limpar(env.CLOUDINARY_API_SECRET) ? 'definido' : null,
      espacosOuAspas: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].filter(k => env[k] != null && env[k] !== limpar(env[k])),
    },
    conjuntos: conferencias.map(c => ({ origem: c.cred.origem, cloud: c.cred.cloud, apiKeyFinal: c.cred.key.slice(-4), valido: c.ok, status: c.status, erro: c.erro })),
  };
}
