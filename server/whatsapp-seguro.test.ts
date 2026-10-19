import { describe, it, expect } from 'vitest';
import { motivoRecusaWebhook } from './zapiWebhookGuard';
import { dentroDoHorario, motivoBloqueio, inicioDoDia } from './scheduler/ritmoEnvio';

describe('Trava do webhook da Z-API', () => {
  const inst = ['3F1A2B3C4D5E'];
  it('aceita aviso da instância do CRM', () => {
    expect(motivoRecusaWebhook({ instanceId: '3F1A2B3C4D5E', phone: '5599' }, { instancias: inst })).toBeNull();
  });
  it('recusa outra instância ou aviso sem instância', () => {
    expect(motivoRecusaWebhook({ instanceId: 'OUTRA' }, { instancias: inst })).toBe('instancia_desconhecida');
    expect(motivoRecusaWebhook({ phone: '5599' }, { instancias: inst })).toBe('instancia_ausente');
  });
  it('aceita se bater com qualquer uma das configuradas (banco ou env)', () => {
    expect(motivoRecusaWebhook({ instanceId: 'B' }, { instancias: [null, 'A', 'B'] })).toBeNull();
  });
  it('sem Z-API configurada, ou conferência desligada, não bloqueia', () => {
    expect(motivoRecusaWebhook({}, { instancias: [null, undefined, ''] })).toBeNull();
    expect(motivoRecusaWebhook({ instanceId: 'X' }, { instancias: inst, checarInstancia: false })).toBeNull();
  });
  it('com ZAPI_WEBHOOK_TOKEN, exige ?k= certo', () => {
    const b = { instanceId: '3F1A2B3C4D5E' };
    expect(motivoRecusaWebhook(b, { instancias: inst, token: 'segredo123', tokenRecebido: 'segredo123' })).toBeNull();
    expect(motivoRecusaWebhook(b, { instancias: inst, token: 'segredo123', tokenRecebido: 'errado' })).toBe('token_invalido');
    expect(motivoRecusaWebhook(b, { instancias: inst, token: 'segredo123' })).toBe('token_invalido');
    expect(motivoRecusaWebhook(b, { instancias: inst, token: 'segredo123', tokenRecebido: ['segredo123'] })).toBe('token_invalido');
  });
});

describe('Ritmo seguro dos Disparos', () => {
  // 2026-10-19 é segunda-feira; horas em UTC (local = UTC-3)
  const seg = (hLocal: number) => Date.UTC(2026, 9, 19, hLocal + 3);
  it('só seg–sáb, das 8h às 20h', () => {
    expect(dentroDoHorario(seg(8))).toBe(true);
    expect(dentroDoHorario(seg(19))).toBe(true);
    expect(dentroDoHorario(seg(20))).toBe(false);
    expect(dentroDoHorario(seg(7))).toBe(false);
    expect(dentroDoHorario(Date.UTC(2026, 9, 21, 2))).toBe(false); // terça 23h — o antigo "modo noite"
    expect(dentroDoHorario(Date.UTC(2026, 9, 25, 13))).toBe(false); // domingo 10h
  });
  it('limite diário', () => {
    expect(motivoBloqueio(29, seg(10), 30)).toBeNull();
    expect(motivoBloqueio(30, seg(10), 30)).toBe('limite_diario');
    expect(motivoBloqueio(0, seg(22), 30)).toBe('fora_do_horario');
  });
  it('o dia começa à 0h do Maranhão', () => {
    expect(inicioDoDia(seg(10)).toISOString()).toBe('2026-10-19T03:00:00.000Z');
    expect(inicioDoDia(Date.UTC(2026, 9, 20, 1)).toISOString()).toBe('2026-10-19T03:00:00.000Z'); // segunda 22h
  });
});
