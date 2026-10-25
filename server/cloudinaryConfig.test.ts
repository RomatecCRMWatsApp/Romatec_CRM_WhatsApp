import { describe, expect, it, vi } from 'vitest';
import { candidatos, credenciais, diagnostico, limparCacheCredenciais } from './cloudinaryConfig';

// Cloudinary falso: só a combinação (cloud "romatec", key 111) é válida
const ping = vi.fn(async (url: string, init: any) => {
  const cloud = /v1_1\/([^/]+)\/ping/.exec(url)?.[1];
  const [key] = Buffer.from(String(init.headers.Authorization).slice(6), 'base64').toString().split(':');
  if (cloud === 'romatec' && key === '111') return new Response('{"status":"ok"}');
  return new Response(JSON.stringify({ error: { message: `Invalid api_key ${key}` } }), { status: 401 });
}) as any;

describe('credenciais do Cloudinary (uma fonte para todo upload)', () => {
  it('lê CLOUDINARY_URL e as variáveis separadas, sem espaços nem aspas', () => {
    const c = candidatos({ CLOUDINARY_URL: 'cloudinary://111:sss@romatec', CLOUDINARY_CLOUD_NAME: ' "romatec" ', CLOUDINARY_API_KEY: '846459254227374 ', CLOUDINARY_API_SECRET: 'x' });
    expect(c).toEqual([
      { cloud: 'romatec', key: '111', secret: 'sss', origem: 'CLOUDINARY_URL' },
      { cloud: 'romatec', key: '846459254227374', secret: 'x', origem: 'CLOUDINARY_*' },
    ]);
  });

  it('usa o conjunto que o Cloudinary aceita (api_key inválida é ignorada)', async () => {
    limparCacheCredenciais();
    const env = { CLOUDINARY_CLOUD_NAME: 'romatec', CLOUDINARY_API_KEY: '846459254227374', CLOUDINARY_API_SECRET: 'x', CLOUDINARY_URL: 'cloudinary://111:sss@romatec' };
    expect(await credenciais(ping, env)).toMatchObject({ key: '111', origem: 'CLOUDINARY_URL' });
  });

  it('nenhum válido: erro dizendo qual variável e qual api_key; diagnóstico sem segredo', async () => {
    limparCacheCredenciais();
    const env = { CLOUDINARY_CLOUD_NAME: 'romatec', CLOUDINARY_API_KEY: '846459254227374', CLOUDINARY_API_SECRET: 'segredo' };
    await expect(credenciais(ping, env)).rejects.toThrow(/CLOUDINARY_\* \(cloud "romatec", api_key …7374\): Invalid api_key 846459254227374/);
    const d = await diagnostico(ping, env);
    expect(d.conjuntos).toEqual([{ origem: 'CLOUDINARY_*', cloud: 'romatec', apiKeyFinal: '7374', valido: false, status: 401, erro: 'Invalid api_key 846459254227374' }]);
    expect(JSON.stringify(d)).not.toContain('segredo');
  });
});
