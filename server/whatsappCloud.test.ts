import crypto from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assinaturaCloudValida, converterEntradaCloud, enviarModeloCloud, enviarTextoCloud, paramModelo, resumoStatusCloud, verificarWebhookCloud,
  type CloudConfig,
} from './leads/whatsappCloud';

// WhatsApp oficial (Cloud API da Meta): envio, janela de 24 h, webhook e status — sem rede (fetch falso)

const config: CloudConfig = { token: 'tk', phoneNumberId: '123', versao: 'v23.0', templateRetomada: 'retomada_bj', templatePadrao: 'aviso_romatec', idioma: 'pt_BR' };

function fetchFalso(respostas: Array<{ status: number; body: unknown }>) {
  const chamadas: { url: string; body: any; headers: any }[] = [];
  const f = (async (url: string, init: any) => {
    chamadas.push({ url, body: init?.body ? JSON.parse(init.body) : null, headers: init?.headers });
    const r = respostas.shift() ?? { status: 200, body: { messages: [{ id: 'wamid.ok' }] } };
    return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response;
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

const foraDaJanela = { status: 400, body: { error: { code: 131047, message: 'Re-engagement message', error_data: { details: 'More than 24 hours have passed' } } } };

describe('WhatsApp oficial — envio', () => {
  it('manda texto com o número em +55 e o token no cabeçalho', async () => {
    const { f, chamadas } = fetchFalso([]);
    expect(await enviarTextoCloud('(99) 99181-1246', 'Olá', { config, fetchImpl: f })).toBe('wamid.ok');
    expect(chamadas[0].url).toBe('https://graph.facebook.com/v23.0/123/messages');
    expect(chamadas[0].headers.Authorization).toBe('Bearer tk');
    expect(chamadas[0].body).toMatchObject({ messaging_product: 'whatsapp', to: '5599991811246', type: 'text', text: { body: 'Olá' } });
  });

  it('fora da janela de 24 h, reenvia o mesmo texto no modelo padrão (numa linha só)', async () => {
    const { f, chamadas } = fetchFalso([foraDaJanela]);
    await enviarTextoCloud('5599991811246', 'Lead quente:\nMaria quer visita', { config, fetchImpl: f });
    expect(chamadas).toHaveLength(2);
    expect(chamadas[1].body.template).toEqual({
      name: 'aviso_romatec', language: { code: 'pt_BR' },
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'Lead quente: · Maria quer visita' }] }],
    });
  });

  it('disparo de campanha não cai no modelo padrão: avisa que está fora da janela', async () => {
    const { f, chamadas } = fetchFalso([foraDaJanela]);
    await expect(enviarTextoCloud('5599991811246', 'Oferta', { config, fetchImpl: f, semModeloPadrao: true })).rejects.toMatchObject({ codigo: 'FORA_DA_JANELA' });
    expect(chamadas).toHaveLength(1);
  });

  it('modelo com o nome no {{1}}', async () => {
    const { f, chamadas } = fetchFalso([]);
    await enviarModeloCloud('5599991811246', 'retomada_bj', ['Josué'], { config, fetchImpl: f });
    expect(chamadas[0].body.template.components[0].parameters[0].text).toBe('Josué');
  });

  it('parâmetro de modelo sem quebra de linha, tab ou espaços repetidos e com limite', () => {
    expect(paramModelo('a\n\nb\tc     d')).toBe('a · b · c d');
    expect(paramModelo('x'.repeat(2000))).toHaveLength(1000);
  });
});

describe('WhatsApp oficial — webhook', () => {
  const corpo = {
    object: 'whatsapp_business_account',
    entry: [{ id: '1', changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: '123' },
      contacts: [{ wa_id: '5599991112222', profile: { name: 'Maria' } }],
      messages: [
        { from: '5599991112222', id: 'wamid.A', timestamp: '1758254144', type: 'text', text: { body: 'Quero saber o preço' } },
        { from: '5599991112222', id: 'wamid.B', timestamp: '1758254150', type: 'button', button: { text: 'Quero agendar uma visita' } },
        { from: '5599991112222', id: 'wamid.C', timestamp: '1758254160', type: 'audio', audio: { id: 'media1' } },
      ],
    } }, { field: 'messages', value: { statuses: [{ id: 'wamid.X', status: 'read' }] } }] }],
  };

  it('converte as mensagens recebidas no formato da Z-API e ignora status de leitura', () => {
    const m = converterEntradaCloud(corpo);
    expect(m.map(x => x.messageId)).toEqual(['wamid.A', 'wamid.B', 'wamid.C']);
    expect(m[0]).toMatchObject({ phone: '5599991112222', senderName: 'Maria', fromMe: false, text: { message: 'Quero saber o preço' } });
    expect(m[1].text?.message).toBe('Quero agendar uma visita');
    expect(m[2].midiaCloud).toEqual({ tipo: 'audio', id: 'media1' });
    expect(converterEntradaCloud({ object: 'instagram' })).toEqual([]);
  });

  it('confere a assinatura X-Hub-Signature-256 com o App Secret', () => {
    const raw = Buffer.from(JSON.stringify(corpo));
    const ok = `sha256=${crypto.createHmac('sha256', 'segredo').update(raw).digest('hex')}`;
    expect(assinaturaCloudValida(raw, ok, 'segredo')).toBe(true);
    expect(assinaturaCloudValida(raw, ok, 'outro')).toBe(false);
    expect(assinaturaCloudValida(raw, undefined, 'segredo')).toBe(false);
    expect(assinaturaCloudValida(raw, ok, '')).toBe(false);
  });

  it('verificação do webhook só com o token certo', () => {
    expect(verificarWebhookCloud({ 'hub.mode': 'subscribe', 'hub.verify_token': 'abc', 'hub.challenge': '42' }, 'abc')).toBe('42');
    expect(verificarWebhookCloud({ 'hub.mode': 'subscribe', 'hub.verify_token': 'x', 'hub.challenge': '42' }, 'abc')).toBeNull();
    expect(verificarWebhookCloud({ 'hub.mode': 'subscribe', 'hub.verify_token': 'abc' }, undefined)).toBeNull();
  });
});

describe('WhatsApp oficial — status e desvio do envio', () => {
  const envAntigo = { ...process.env };
  afterEach(() => { process.env = { ...envAntigo }; });

  it('resume a situação do número em português', () => {
    const s = resumoStatusCloud({ display_phone_number: '+55 99 3000-0000', status: 'CONNECTED', quality_rating: 'GREEN', messaging_limit_tier: 'TIER_250', name_status: 'APPROVED' });
    expect(s.ok).toBe(true);
    expect(s.resumo).toBe('Conectado · qualidade alta · limite de 250 clientes novos por dia');
    expect(resumoStatusCloud({ status: 'FLAGGED', quality_rating: 'RED' }).resumo).toContain('qualidade baixa');
  });

  it('com WHATSAPP_PROVIDER=cloud o cliente de envio usa a API oficial; com credenciais Z-API explícitas, segue na Z-API', async () => {
    Object.assign(process.env, { WHATSAPP_PROVIDER: 'cloud', WHATSAPP_CLOUD_TOKEN: 'tk', WHATSAPP_CLOUD_PHONE_NUMBER_ID: '123' });
    const { enviarTexto } = await import('./leads/zapiClient');
    const { f, chamadas } = fetchFalso([{ status: 200, body: { messages: [{ id: 'wamid.z' }] } }]);
    const original = globalThis.fetch;
    globalThis.fetch = f;
    try {
      expect(await enviarTexto('5599991811246', 'oi')).toBe('wamid.z');
      expect(chamadas[0].url).toContain('graph.facebook.com');
      const z = fetchFalso([{ status: 200, body: { messageId: 'zap1' } }]);
      expect(await enviarTexto('5599991811246', 'oi', { creds: { instanceId: 'i', token: 't' }, fetchImpl: z.f })).toBe('zap1');
      expect(z.chamadas[0].url).toContain('api.z-api.io');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('a retomada dos leads importados sai no modelo aprovado, com o primeiro nome', async () => {
    Object.assign(process.env, { WHATSAPP_PROVIDER: 'cloud', WHATSAPP_CLOUD_TOKEN: 'tk', WHATSAPP_CLOUD_PHONE_NUMBER_ID: '123', WHATSAPP_CLOUD_TEMPLATE_RETOMADA: 'retomada_bj' });
    process.env.DATABASE_DRIVER = 'sqlite'; process.env.SQLITE_PATH = ':memory:';
    const { transporteRetomada } = await import('./leads/importacaoContatos');
    const { f, chamadas } = fetchFalso([]);
    const original = globalThis.fetch;
    globalThis.fetch = f;
    try {
      await transporteRetomada.texto('5599991112222', 'texto da Z-API', 'Maria Elza Sousa');
      await transporteRetomada.texto('5599991113333', 'texto', 'mesquitadeidson');
    } finally {
      globalThis.fetch = original;
    }
    expect(chamadas[0].body.template).toMatchObject({ name: 'retomada_bj', components: [{ parameters: [{ text: 'Maria' }] }] });
    expect(chamadas[1].body.template.components[0].parameters[0].text).toBe('tudo bem');
    delete process.env.WHATSAPP_CLOUD_TEMPLATE_RETOMADA;
    await expect(transporteRetomada.texto('5599991112222', 'x', 'Ana')).rejects.toThrow('WHATSAPP_CLOUD_TEMPLATE_RETOMADA');
  });
});
