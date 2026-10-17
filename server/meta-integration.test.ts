import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import {
  verifyMetaSignature,
  verifyMetaWebhook,
  mapLeadFields,
  extractLeadgenEvents,
  fetchMetaLead,
  processMetaWebhook,
} from './meta-integration';

const SECRET = 'app-secret-teste';
const sign = (body: string, secret = SECRET) =>
  'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const webhookBody = (leadgenId = '444', formId = '777') => ({
  object: 'page',
  entry: [{
    id: '123',
    time: 1760000000,
    changes: [{ field: 'leadgen', value: { leadgen_id: leadgenId, form_id: formId, ad_id: '555', page_id: '123' } }],
  }],
});

describe('Meta - assinatura X-Hub-Signature-256', () => {
  const raw = JSON.stringify(webhookBody());

  it('aceita assinatura válida do corpo cru', () => {
    expect(verifyMetaSignature(Buffer.from(raw), sign(raw), SECRET)).toBe(true);
    expect(verifyMetaSignature(raw, sign(raw), SECRET)).toBe(true);
  });

  it('rejeita secret errado, corpo alterado e cabeçalho ausente/malformado', () => {
    expect(verifyMetaSignature(raw, sign(raw, 'outro'), SECRET)).toBe(false);
    expect(verifyMetaSignature(raw + ' ', sign(raw), SECRET)).toBe(false);
    expect(verifyMetaSignature(raw, undefined, SECRET)).toBe(false);
    expect(verifyMetaSignature(raw, 'sha1=abc', SECRET)).toBe(false);
    expect(verifyMetaSignature(raw, 'sha256=curto', SECRET)).toBe(false);
  });

  it('rejeita quando não há secret ou corpo cru', () => {
    expect(verifyMetaSignature(raw, sign(raw), '')).toBe(false);
    expect(verifyMetaSignature(undefined, sign(raw), SECRET)).toBe(false);
  });
});

describe('Meta - verificação do webhook (hub.challenge)', () => {
  const q = { 'hub.mode': 'subscribe', 'hub.verify_token': 'meu-token', 'hub.challenge': '1158201444' };

  it('devolve o challenge quando o token confere', () => {
    expect(verifyMetaWebhook(q, 'meu-token')).toBe('1158201444');
  });

  it('recusa token errado, modo errado, sem challenge ou sem token configurado', () => {
    expect(verifyMetaWebhook(q, 'outro-token')).toBeNull();
    expect(verifyMetaWebhook({ ...q, 'hub.mode': 'unsubscribe' }, 'meu-token')).toBeNull();
    expect(verifyMetaWebhook({ 'hub.mode': 'subscribe', 'hub.verify_token': 'meu-token' }, 'meu-token')).toBeNull();
    expect(verifyMetaWebhook(q, '')).toBeNull();
  });
});

describe('Meta - mapeamento dos campos do formulário', () => {
  it('campos padrão da Meta (full_name, phone_number)', () => {
    expect(mapLeadFields([
      { name: 'full_name', values: ['Maria das Graças'] },
      { name: 'phone_number', values: ['+5599991811246'] },
      { name: 'email', values: ['maria@exemplo.com'] },
    ])).toEqual({ nome: 'Maria das Graças', phone: '+5599991811246', email: 'maria@exemplo.com' });
  });

  it('first_name + last_name quando não há nome completo', () => {
    expect(mapLeadFields([
      { name: 'first_name', values: ['João'] },
      { name: 'last_name', values: ['Silva'] },
      { name: 'phone_number', values: ['99991811246'] },
    ]).nome).toBe('João Silva');
  });

  it('perguntas personalizadas em português, com acento e espaço', () => {
    const m = mapLeadFields([
      { name: 'Nome', values: ['Ana'] },
      { name: 'Número do WhatsApp', values: ['(99) 9 9181-1246'] },
    ]);
    expect(m).toMatchObject({ nome: 'Ana', phone: '(99) 9 9181-1246' });
  });

  it('prefere o WhatsApp ao phone_number', () => {
    expect(mapLeadFields([
      { name: 'phone_number', values: ['99988887777'] },
      { name: 'whatsapp', values: ['99991811246'] },
    ]).phone).toBe('99991811246');
  });

  it('pula telefone inválido e usa o próximo candidato válido', () => {
    expect(mapLeadFields([
      { name: 'whatsapp', values: ['123'] },
      { name: 'phone_number', values: ['99991811246'] },
    ]).phone).toBe('99991811246');
  });

  it('sem campos: nada mapeado', () => {
    expect(mapLeadFields([])).toEqual({ nome: undefined, phone: undefined, email: undefined });
    expect(mapLeadFields(undefined)).toEqual({ nome: undefined, phone: undefined, email: undefined });
  });
});

describe('Meta - eventos do webhook', () => {
  it('extrai só eventos leadgen de object=page', () => {
    const body = webhookBody();
    body.entry[0].changes.push({ field: 'feed', value: {} as any });
    expect(extractLeadgenEvents(body)).toEqual([{ leadgenId: '444', formId: '777', adId: '555', pageId: '123' }]);
    expect(extractLeadgenEvents({ object: 'instagram', entry: [] })).toEqual([]);
    expect(extractLeadgenEvents(null)).toEqual([]);
  });
});

describe('Meta - Graph API (simulada)', () => {
  it('GET /{leadgen_id} com token e campos', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: '444', field_data: [] }));
    await fetchMetaLead('444', { accessToken: 'tok', graphVersion: 'v21.0', fetchImpl });
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://graph.facebook.com/v21.0/444');
    expect(url.searchParams.get('access_token')).toBe('tok');
    expect(url.searchParams.get('fields')).toContain('field_data');
  });

  it('erro da Graph API vira exceção', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'Invalid OAuth access token' } }, 400));
    await expect(fetchMetaLead('444', { accessToken: 'tok', fetchImpl })).rejects.toThrow('Invalid OAuth');
  });

  it('sem token nem chama a API', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchMetaLead('444', { accessToken: '', fetchImpl })).rejects.toThrow('META_PAGE_ACCESS_TOKEN');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('Meta - processamento do leadgen até o ingestLead', () => {
  const okResult = { ok: true as const, created: true, messageSent: true, phone: '5599991811246' };
  const leadFields = [
    { name: 'full_name', values: ['Maria Souza'] },
    { name: 'phone_number', values: ['+55 99 99181-1246'] },
  ];

  it('chama ingestLead com origem instagram_ads, metaLeadId e nome do anúncio', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      id: '444', ad_name: 'Loteamento Jardim Romatec - Lead', form_id: '777', field_data: leadFields,
    }));
    const ingest = vi.fn().mockResolvedValue(okResult);
    const out = await processMetaWebhook(webhookBody(), { accessToken: 'tok', fetchImpl, ingest });

    expect(ingest).toHaveBeenCalledWith({
      nome: 'Maria Souza',
      phone: '+55 99 99181-1246',
      origem: 'instagram_ads',
      metaLeadId: '444',
      campanha: 'Loteamento Jardim Romatec - Lead',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // com ad_name não busca o formulário
    expect(out).toEqual([{ leadgenId: '444', status: 'ingested', result: okResult }]);
  });

  it('sem nome do anúncio usa o nome do formulário (GET /{form_id})', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/444')) return jsonResponse({ id: '444', form_id: '777', field_data: leadFields });
      if (path.endsWith('/777')) return jsonResponse({ id: '777', name: 'Form Chácaras Açailândia' });
      return jsonResponse({}, 404);
    });
    const ingest = vi.fn().mockResolvedValue(okResult);
    await processMetaWebhook(webhookBody(), { accessToken: 'tok', fetchImpl: fetchImpl as any, ingest });
    expect(ingest.mock.calls[0][0].campanha).toBe('Form Chácaras Açailândia');
  });

  it('falha ao buscar o formulário não derruba o lead (cai no nome da campanha)', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (new URL(url).pathname.endsWith('/444')) {
        return jsonResponse({ id: '444', form_id: '777', campaign_name: 'Campanha Outubro', field_data: leadFields });
      }
      return jsonResponse({ error: { message: 'sem permissão' } }, 403);
    });
    const ingest = vi.fn().mockResolvedValue(okResult);
    await processMetaWebhook(webhookBody(), { accessToken: 'tok', fetchImpl: fetchImpl as any, ingest });
    expect(ingest.mock.calls[0][0].campanha).toBe('Campanha Outubro');
  });

  it('lead sem telefone não chama ingestLead', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      id: '444', ad_name: 'X', field_data: [{ name: 'full_name', values: ['Sem Fone'] }],
    }));
    const ingest = vi.fn();
    const out = await processMetaWebhook(webhookBody(), { accessToken: 'tok', fetchImpl, ingest });
    expect(ingest).not.toHaveBeenCalled();
    expect(out[0].status).toBe('missing_phone');
  });

  it('erro na Graph API é reportado como fetch_error (rota responde 500 pra Meta reenviar)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const ingest = vi.fn();
    const out = await processMetaWebhook(webhookBody(), { accessToken: 'tok', fetchImpl, ingest });
    expect(ingest).not.toHaveBeenCalled();
    expect(out[0]).toMatchObject({ leadgenId: '444', status: 'fetch_error' });
  });
});
