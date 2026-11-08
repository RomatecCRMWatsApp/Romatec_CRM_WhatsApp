import { describe, expect, it } from 'vitest';
import { textoLeadDevolvido, textoLeadPerdido } from './leads/prazoConfirmacao';
import { ROTULO_DESFECHO, PRAZO_CONFIRMACAO_HORAS } from '../shared/distribuicaoLeads';

describe('prazo de 6 h para confirmar o lead', () => {
  it('padrão de 6 horas e rótulo no relatório', () => {
    expect(PRAZO_CONFIRMACAO_HORAS).toBe(6);
    expect(ROTULO_DESFECHO.sem_confirmacao).toMatch(/6 h/);
  });
  it('mensagem ao corretor que perdeu o lead', () => {
    const t = textoLeadPerdido({ corretor: 'GLEIGLIA BARROS', cliente: 'Fernando Abreu' });
    expect(t).toContain('Gleiglia');
    expect(t).toContain('Fernando Abreu');
    expect(t).toMatch(/Que pena/);
    expect(t).toMatch(/6 horas/);
    expect(t).toContain('CRECI J-1234');
  });
  it('aviso ao escritório com o link da distribuição', () => {
    const t = textoLeadDevolvido({ corretor: 'Gleiglia Barros', cliente: 'Fernando Abreu', telefone: '5599991797079' });
    expect(t).toContain('Lead voltou para o CRM');
    expect(t).toContain('/leads/distribuicao');
  });
});
