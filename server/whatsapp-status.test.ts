import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyZApiStatus, checkWhatsAppStatus, _resetWhatsAppStatusCache } from './whatsapp-status';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('WhatsApp status - classificação da resposta do Z-API', () => {
  it('conectado', () => {
    expect(classifyZApiStatus(200, { connected: true }).state).toBe('connected');
  });

  it('instância não encontrada (resposta real do Z-API: 400 "Instance not found")', () => {
    const s = classifyZApiStatus(400, { error: 'Instance not found' });
    expect(s.state).toBe('instance_not_found');
    expect(s.steps.join(' ')).toContain('app.z-api.io');
  });

  it('celular desconectado pede QR code', () => {
    const s = classifyZApiStatus(200, { connected: false, smartphoneConnected: true });
    expect(s.state).toBe('phone_disconnected');
    expect(s.steps.join(' ')).toContain('QR code');
  });

  it('client-token errado', () => {
    expect(classifyZApiStatus(400, { error: 'your client-token is not configured' }).state).toBe('unauthorized');
    expect(classifyZApiStatus(401, {}).state).toBe('unauthorized');
  });

  it('resposta estranha ou sem rede', () => {
    expect(classifyZApiStatus(500, {}).state).toBe('error');
    expect(classifyZApiStatus(0, { error: 'fetch failed' }).state).toBe('error');
  });
});

describe('WhatsApp status - consulta com cache', () => {
  beforeEach(() => _resetWhatsAppStatusCache());
  const creds = { instanceId: 'ID', token: 'TK', clientToken: 'CT' };

  it('sem credenciais não chama a API', async () => {
    const fetchImpl = vi.fn();
    const s = await checkWhatsAppStatus({ instanceId: '', token: '' }, { fetchImpl: fetchImpl as any });
    expect(s.state).toBe('not_configured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('manda o Client-Token e guarda o resultado por 1 minuto', async () => {
    const fetchImpl = vi.fn(async (..._a: any[]) => json({ connected: true }));
    const t0 = new Date('2026-10-17T20:00:00Z');
    await checkWhatsAppStatus(creds, { fetchImpl, now: t0 });
    await checkWhatsAppStatus(creds, { fetchImpl, now: new Date(t0.getTime() + 30_000) });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.z-api.io/instances/ID/token/TK/status');
    expect(fetchImpl.mock.calls[0][1]).toEqual({ headers: { 'Client-Token': 'CT' } });

    await checkWhatsAppStatus(creds, { fetchImpl, now: new Date(t0.getTime() + 61_000) });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('force ignora o cache', async () => {
    const fetchImpl = vi.fn(async () => json({ error: 'Instance not found' }, 400));
    await checkWhatsAppStatus(creds, { fetchImpl });
    const s = await checkWhatsAppStatus(creds, { fetchImpl, force: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(s.state).toBe('instance_not_found');
  });

  it('falha de rede vira estado de erro, sem exceção', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    expect((await checkWhatsAppStatus(creds, { fetchImpl })).state).toBe('error');
  });
});
