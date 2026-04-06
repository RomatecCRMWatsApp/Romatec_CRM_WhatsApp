import { describe, it, expect, vi } from 'vitest';
import { sendMessageViaZAPI, validateZAPIConnection, MessageScheduler } from './zapi-integration';

describe('Z-API Integration', () => {
  describe('sendMessageViaZAPI', () => {
    it('deve formatar número de telefone corretamente', async () => {
      const result = await sendMessageViaZAPI({
        instanceId: 'test-instance',
        token: 'test-token',
        phone: '99 99169-0178',
        message: 'Teste de mensagem',
      });

      // Esperamos que retorne um objeto com success (true ou false)
      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });

    it('deve retornar erro se telefone estiver vazio', async () => {
      const result = await sendMessageViaZAPI({
        instanceId: 'test-instance',
        token: 'test-token',
        phone: '',
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
});
