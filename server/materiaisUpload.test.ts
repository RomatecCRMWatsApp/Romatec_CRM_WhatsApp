import { beforeAll, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

beforeAll(() => {
  process.env.CLOUDINARY_CLOUD_NAME = 'romatec-teste';
  process.env.CLOUDINARY_API_KEY = '123';
  process.env.CLOUDINARY_API_SECRET = 'segredo';
  // /ping do Cloudinary (conferência das credenciais) responde ok
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => (String(url).endsWith('/ping') ? new Response('{"status":"ok"}') : orig(url, init))) as any;
});

describe('upload de materiais direto para o Cloudinary (em partes)', () => {
  it('lê o limite real do plano (/usage) e assina os parâmetros', async () => {
    const M = await import('./materiaisUpload');
    const fetchFalso = vi.fn(async () => new Response(JSON.stringify({ plan: 'Plus', media_limits: { image_max_size_bytes: 20971520, video_max_size_bytes: 2147483648, raw_max_size_bytes: 20971520 } })));
    const l = await M.limitesDoPlano(fetchFalso as any);
    expect(l).toMatchObject({ video: 2147483648, plano: 'Plus', fonte: 'conta' });
    const a = await M.assinaturaUpload('Campanha Upgrade Mapa.mp4', 'video/mp4', 150 * 1048576);
    expect(a.url).toBe('https://api.cloudinary.com/v1_1/romatec-teste/video/upload');
    expect(a.resourceType).toBe('video');
    expect(a.parteBytes).toBe(20 * 1048576);
    const { signature, api_key, ...assinados } = a.campos as any;
    const esperado = crypto.createHash('sha256').update(Object.keys(assinados).sort().map(k => `${k}=${assinados[k]}`).join('&') + 'segredo').digest('hex');
    expect(signature).toBe(esperado);
    expect(assinados.access_mode).toBe('public');
    expect(assinados.public_id).toMatch(/^romatec_materiais\/\d+_Campanha_Upgrade_Mapa$/);
    await expect(M.assinaturaUpload('x.exe', 'application/x-msdownload', 10)).rejects.toMatchObject({ name: 'ErroUpload' });
    await expect(M.assinaturaUpload('enorme.mp4', 'video/mp4', 3 * 1073741824)).rejects.toMatchObject({ status: 413 });
  });

  it('o navegador envia em partes de 20 MB com Content-Range e o mesmo X-Unique-Upload-Id (arquivo real e 150 MB)', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { enviarParaCloudinary } = await import('../client/src/lib/uploadCloudinary');
    const real = 'C:/Users/Ronicley Pinto/AppData/Local/Claude-Data/claude_pzs8sxrjxfjjc/local-agent-mode-sessions/0396bff4-eb76-4ed2-9f78-25d8d533da8f/92b48843-55d4-4249-95cf-f5619b98ee3f/agent/local_ditto_92b48843-55d4-4249-95cf-f5619b98ee3f/uploads/6f347d4a-d8b3-486a-8464-901edd5c3c27-Condominio_de_Chacaras_Bom_Jardims_Campanha_Upgrade_Mapa.mp4';
    const arquivos = [
      ...(existsSync(real) ? [new File([readFileSync(real)], 'Condominio_de_Chacaras_Bom_Jardims_Campanha_Upgrade_Mapa.mp4', { type: 'video/mp4' })] : []),
      new File([new Uint8Array(150 * 1048576)], 'grande.mov', { type: '' }), // tipo vazio: deduz pela extensão
    ];
    for (const f of arquivos) {
      const partes: { range: string; id: string; bytes: number }[] = [];
      const fetchOrig = globalThis.fetch;
      globalThis.fetch = (async (url: any, init: any) => {
        if (String(url) === '/api/materiais/assinatura') {
          const b = JSON.parse(init.body);
          return new Response(JSON.stringify({ success: true, url: 'https://api.cloudinary.com/v1_1/x/video/upload', campos: { api_key: '1', timestamp: '1', public_id: 'p', access_mode: 'public', signature: 's' }, parteBytes: 20 * 1048576, resourceType: 'video', limite: 2147483648, _mime: b.mime }));
        }
        const fd = init.body as FormData;
        const blob = fd.get('file') as Blob;
        partes.push({ range: init.headers['Content-Range'], id: init.headers['X-Unique-Upload-Id'], bytes: blob.size });
        const [, , fim, total] = /bytes (\d+)-(\d+)\/(\d+)/.exec(init.headers['Content-Range'])!.map(Number);
        return new Response(JSON.stringify(fim + 1 === total ? { secure_url: 'https://res.cloudinary.com/x/video/upload/v1/p.mp4' } : { done: false }));
      }) as any;
      try {
        const pct: number[] = [];
        const r = await enviarParaCloudinary(f, p => pct.push(p));
        expect(r.url).toBe('https://res.cloudinary.com/x/video/upload/v1/p.mp4');
        expect(r.mime).toBe(f.name.endsWith('.mov') ? 'video/quicktime' : 'video/mp4');
        expect(partes.reduce((s, p) => s + p.bytes, 0)).toBe(f.size);
        expect(new Set(partes.map(p => p.id)).size).toBe(1);
        expect(partes[partes.length - 1].range).toBe(`bytes ${(partes.length - 1) * 20 * 1048576}-${f.size - 1}/${f.size}`);
        expect(partes.length).toBe(Math.ceil(f.size / (20 * 1048576)));
        expect(pct[pct.length - 1]).toBe(100);
      } finally { globalThis.fetch = fetchOrig; }
    }
  });

  it('erro do Cloudinary vira mensagem clara', async () => {
    const { enviarParaCloudinary } = await import('../client/src/lib/uploadCloudinary');
    const fetchOrig = globalThis.fetch;
    globalThis.fetch = (async (url: any) => String(url).startsWith('/api')
      ? new Response(JSON.stringify({ success: true, url: 'https://api.cloudinary.com/v1_1/x/video/upload', campos: {}, parteBytes: 20 * 1048576, resourceType: 'video', limite: 104857600 }))
      : new Response(JSON.stringify({ error: { message: 'File size too large. Got 120000000. Maximum is 104857600.' } }), { status: 400 })) as any;
    try {
      await expect(enviarParaCloudinary(new File([new Uint8Array(1000)], 'v.mp4', { type: 'video/mp4' }))).rejects.toThrow('acima do limite do plano de armazenamento (100 MB)');
    } finally { globalThis.fetch = fetchOrig; }
  });
});
