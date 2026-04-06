import { describe, it, expect, vi } from 'vitest';
import { sendMessageViaZAPI, validateZAPIConnection, MessageScheduler, parseWebhookPayload } from './zapi-integration';

describe('Z-API Integration', () => {
  describe('sendMessageViaZAPI', () => {
    it('deve retornar erro se telefone estiver vazio/inválido', async () => {
      const result = await sendMessageViaZAPI({
        instanceId: 'test-instance',
        token: 'test-token',
        phone: '',
        message: 'Teste',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Número inválido');
    });

    it('deve retornar erro se telefone curto', async () => {
      const result = await sendMessageViaZAPI({
        instanceId: 'test-instance',
        token: 'test-token',
        phone: '123',
        message: 'Teste',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('MessageScheduler', () => {
    it('deve criar instância com configurações corretas', () => {
      const scheduler = new MessageScheduler('test-instance', 'test-token');
      expect(scheduler).toBeDefined();
    });
    it('deve ter método sendMessagesWithDelay', () => {
      const scheduler = new MessageScheduler('test-instance', 'test-token');
      expect(typeof scheduler.sendMessagesWithDelay).toBe('function');
    });
  });

  describe('validateZAPIConnection', () => {
    it('deve retornar boolean', async () => {
      const result = await validateZAPIConnection('test-instance', 'test-token');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('parseWebhookPayload', () => {
    it('deve parsear payload válido', () => {
      const payload = parseWebhookPayload({
        phone: '5599991690178',
        text: { message: 'Olá, tenho interesse!' },
        messageId: 'msg123',
      });
      expect(payload).not.toBeNull();
      expect(payload!.phone).toBe('5599991690178');
      expect(payload!.message).toBe('Olá, tenho interesse!');
    });

    it('deve retornar null para payload sem telefone', () => {
      const payload = parseWebhookPayload({ message: 'teste' });
      expect(payload).toBeNull();
    });

    it('deve ignorar mensagens de grupo', () => {
      const payload = parseWebhookPayload({
        phone: '5599991690178',
        message: 'teste',
        isGroup: true,
      });
      expect(payload).toBeNull();
    });

    it('deve parsear formato alternativo Z-API', () => {
      const payload = parseWebhookPayload({
        from: '5599991690178',
        body: 'Quero saber mais sobre o imóvel',
        pushName: 'Cliente',
      });
      expect(payload).not.toBeNull();
      expect(payload!.message).toBe('Quero saber mais sobre o imóvel');
      expect(payload!.senderName).toBe('Cliente');
    });
  });
});
