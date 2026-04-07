import { describe, it, expect, vi } from 'vitest';
import { parseWebhookPayload } from './zapi-integration';

describe('Webhook Z-API - parseWebhookPayload', () => {
  it('deve parsear mensagem de texto padrão', () => {
    const body = {
      phone: '5575988310407',
      text: { message: 'Olá, quero saber sobre imóveis' },
      messageId: 'msg123',
      pushName: 'João',
    };
    const result = parseWebhookPayload(body);
    expect(result).not.toBeNull();
    expect(result!.phone).toBe('5575988310407');
    expect(result!.message).toBe('Olá, quero saber sobre imóveis');
    expect(result!.senderName).toBe('João');
  });

  it('deve parsear mensagem com formato alternativo (body)', () => {
    const body = {
      from: '5575991949818@c.us',
      body: 'Oi',
      id: 'msg456',
      senderName: 'Maria',
    };
    const result = parseWebhookPayload(body);
    expect(result).not.toBeNull();
    expect(result!.phone).toBe('5575991949818');
    expect(result!.message).toBe('Oi');
  });

  it('deve ignorar mensagens de grupo', () => {
    const body = {
      phone: '5575988310407',
      message: 'Mensagem no grupo',
      isGroup: true,
    };
    const result = parseWebhookPayload(body);
    expect(result).toBeNull();
  });

  it('deve retornar null sem telefone', () => {
    const body = { message: 'Sem telefone' };
    const result = parseWebhookPayload(body);
    expect(result).toBeNull();
  });

  it('deve detectar áudio na mensagem', () => {
    const body = {
      phone: '5575988310407',
      type: 'audio',
      audioUrl: 'https://cdn.z-api.io/audio/123.ogg',
      pushName: 'Carlos',
    };
    const result = parseWebhookPayload(body);
    expect(result).not.toBeNull();
    expect(result!.isAudio).toBe(true);
    expect(result!.audioUrl).toBe('https://cdn.z-api.io/audio/123.ogg');
  });

  it('deve detectar áudio PTT (push-to-talk)', () => {
    const body = {
      phone: '5575988310407',
      type: 'ptt',
      mediaUrl: 'https://cdn.z-api.io/ptt/456.ogg',
      pushName: 'Ana',
    };
    const result = parseWebhookPayload(body);
    expect(result).not.toBeNull();
    expect(result!.isAudio).toBe(true);
    expect(result!.audioUrl).toBe('https://cdn.z-api.io/ptt/456.ogg');
  });

  it('deve limpar caracteres não numéricos do telefone', () => {
    const body = {
      phone: '+55 (75) 98831-0407',
      message: 'Oi',
    };
    const result = parseWebhookPayload(body);
    expect(result).not.toBeNull();
    expect(result!.phone).toBe('5575988310407');
  });
});
