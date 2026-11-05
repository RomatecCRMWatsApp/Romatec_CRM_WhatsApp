import { describe, it, expect } from 'vitest';
import { tipoDoAudio } from './_core/voiceTranscription';

describe('tipoDoAudio (áudio do WhatsApp para a transcrição)', () => {
  it('tira os parâmetros do content-type do WhatsApp', () => {
    expect(tipoDoAudio('audio/ogg; codecs=opus')).toBe('audio/ogg');
    expect(tipoDoAudio('Audio/MPEG')).toBe('audio/mpeg');
  });
  it('octet-stream usa a extensão da URL e, sem ela, ogg', () => {
    expect(tipoDoAudio('application/octet-stream', 'https://x.z-api.io/a/123.mp3?t=1')).toBe('audio/mpeg');
    expect(tipoDoAudio('application/octet-stream', 'https://x.z-api.io/a/123.opus')).toBe('audio/ogg');
    expect(tipoDoAudio(null, 'https://x/sem-extensao')).toBe('audio/ogg');
  });
});

import { avisoFalhaAudio } from './imoveis/agenteCadastro';
describe('avisoFalhaAudio', () => {
  it('sem créditos pede texto; sem motivo pede de novo', () => {
    expect(avisoFalhaAudio('sem_creditos')).toMatch(/sem créditos/);
    expect(avisoFalhaAudio(null)).toMatch(/Não consegui entender/);
  });
});

import { tipoDe } from '../shared/cadastroImovelAgente';
describe('tipoDe', () => {
  it('aceita variações faladas', () => {
    expect(tipoDe('Casa residencial térrea')).toBe('casa');
    expect(tipoDe('sobrado')).toBe('casa');
    expect(tipoDe('casa com área gourmet')).toBe('casa');
    expect(tipoDe('Apto duplex')).toBe('apartamento');
    expect(tipoDe('chácara de lazer')).toBe('chacara');
    expect(tipoDe('sala_comercial')).toBe('sala_comercial');
    expect(tipoDe('lote em condomínio')).toBe('lote');
    expect(tipoDe('imóvel')).toBeNull();
  });
});

import { mensagemCredencial } from './saas/mercadopago';
describe('mensagemCredencial (MP 401)', () => {
  it('orienta o assinante e diz ao escritório o que ajustar', () => {
    expect(mensagemCredencial('teste', 'Unauthorized use of live credentials')).toMatch(/modo TESTE.*Admin › SaaS/);
    expect(mensagemCredencial('producao', 'Unauthorized use of live credentials')).toMatch(/Credenciais de produção não ativadas/);
    expect(mensagemCredencial('producao', 'invalid token')).toMatch(/MP_ACCESS_TOKEN/);
  });
});
