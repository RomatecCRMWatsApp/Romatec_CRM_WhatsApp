import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const Q = await import('./leads/qualificacaoService');
const { mensagemNossaDoWebhook } = await import('./zapi-integration');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

describe('Caixa de entrada: histórico completo do WhatsApp', () => {
  let db: any;
  beforeAll(async () => {
    db = await getDb();
    db.run(sql`INSERT INTO leadQualifications (id, phone, nome) VALUES (50, '5599911112233', 'Fernando')`);
  });
  const msgs = () => db.all(sql`SELECT direcao, autor, texto FROM leadMensagens WHERE leadId = 50 ORDER BY id`);

  it('grava a mensagem do cliente e a do robô; a mesma por dois caminhos não duplica', async () => {
    await Q.registrarMensagemPorTelefone('5599911112233', 'in', 'lead', '4');
    await Q.registrarMensagemPorTelefone('5599911112233', 'in', 'lead', '4');
    await Q.registrarMensagemPorTelefone('5599911112233', 'out', 'bot', 'Ótimo, Fernando!');
    expect(msgs()).toEqual([{ direcao: 'in', autor: 'lead', texto: '4' }, { direcao: 'out', autor: 'bot', texto: 'Ótimo, Fernando!' }]);
  });

  it('eco do WhatsApp antes da gravação do robô: fica uma só, com o autor do robô', async () => {
    await Q.registrarMensagemPorTelefone('5599911112233', 'out', 'corretor', 'Qual região?');
    await Q.registrarMensagemPorTelefone('5599911112233', 'out', 'bot', 'Qual região?');
    expect(msgs().filter((m: any) => m.texto === 'Qual região?')).toEqual([{ direcao: 'out', autor: 'bot', texto: 'Qual região?' }]);
  });

  it('mensagem nossa do webhook (fromMe) vira histórico; grupo e status não', () => {
    expect(mensagemNossaDoWebhook({ fromMe: true, phone: '5599911112233', type: 'ReceivedCallback', text: { message: 'Oi, sou a Mayara' } })).toEqual({ phone: '5599911112233', texto: 'Oi, sou a Mayara' });
    expect(mensagemNossaDoWebhook({ fromMe: true, isGroup: true, phone: '5599911112233', text: { message: 'x' } })).toBeNull();
    expect(mensagemNossaDoWebhook({ fromMe: true, phone: '5599911112233', type: 'MessageStatusCallback' })).toBeNull();
    expect(mensagemNossaDoWebhook({ fromMe: false, phone: '5599911112233', text: { message: 'oi' } })).toBeNull();
  });
});
