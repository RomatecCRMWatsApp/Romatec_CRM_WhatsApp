import { describe, expect, it } from 'vitest';
import { ControleTentativas, estadoDaFalha, normalizarCodigo } from '../shared/codigoOtp';

describe('código de confirmação: entrada', () => {
  it('preserva zeros à esquerda e aceita colagem com separadores', () => {
    expect(normalizarCodigo('012345')).toEqual({ valor: '012345', aviso: null });
    expect(normalizarCodigo('000 001')).toEqual({ valor: '000001', aviso: null });
    expect(normalizarCodigo('012-345')).toEqual({ valor: '012345', aviso: null });
    expect(normalizarCodigo('01')).toEqual({ valor: '01', aviso: null });
  });
  it('não corta em silêncio: sobra de dígitos ou letras gera aviso', () => {
    expect(normalizarCodigo('01234567')).toEqual({ valor: '012345', aviso: expect.stringContaining('6 dígitos') });
    expect(normalizarCodigo('12a456').aviso).toBe('O código tem só números.');
  });
});

describe('código de confirmação: respostas do servidor', () => {
  it('traduz inválido, expirado, bloqueado, rede e já usado sem simular sucesso', () => {
    expect(estadoDaFalha({ codigo: 'OTP_INVALIDO', mensagem: 'Código incorreto (3 tentativa(s) restante(s))' })).toEqual({ estado: 'invalido', mensagem: 'Código incorreto (3 tentativa(s) restante(s))' });
    expect(estadoDaFalha({ codigo: 'OTP_EXPIRADO' }).estado).toBe('expirado');
    expect(estadoDaFalha({ codigo: 'OTP_BLOQUEADO' }).estado).toBe('bloqueado');
    expect(estadoDaFalha({ rede: true }).estado).toBe('sem_conexao');
    expect(estadoDaFalha({ status: 504 }).estado).toBe('sem_conexao');
    expect(estadoDaFalha({ codigo: 'OTP_USADO' }).estado).toBe('recarregar');
    expect(estadoDaFalha({ codigo: 'ASSINADO' }).estado).toBe('recarregar');
    expect(estadoDaFalha({ codigo: 'LEITURA', mensagem: 'Leia o contrato' })).toEqual({ estado: 'erro', mensagem: 'Leia o contrato' });
  });
});

describe('código de confirmação: concorrência', () => {
  it('duplo envio: a segunda tentativa não começa enquanto a primeira está em curso', () => {
    const c = new ControleTentativas();
    const t1 = c.iniciar()!;
    expect(c.iniciar()).toBeNull();
    c.terminar(t1);
    expect(c.iniciar()).not.toBeNull();
  });
  it('resposta fora de ordem: só a tentativa vigente muda a tela', () => {
    const c = new ControleTentativas();
    const t1 = c.iniciar()!; c.terminar(t1);
    const t2 = c.iniciar()!;
    expect(c.vale(t1)).toBe(false);
    expect(c.vale(t2)).toBe(true);
  });
  it('desafio trocado (reenvio): resposta do código anterior é ignorada', () => {
    const c = new ControleTentativas();
    const t = c.iniciar()!;
    c.novoDesafio();
    expect(c.vale(t)).toBe(false);
    expect(c.ocupado).toBe(false);
  });
  it('tela fechada: nenhuma resposta vale e nada novo começa', () => {
    const c = new ControleTentativas();
    const t = c.iniciar()!;
    c.desmontar();
    expect(c.vale(t)).toBe(false);
    expect(c.iniciar()).toBeNull();
  });
});
