import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  hashPassword, verifyPassword, checkLogin, passwordProblem,
  maskSecret, isMasked, publicCompanyConfig, stripMaskedFields,
} from './auth-security';

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

describe('Senha - hash scrypt', () => {
  it('confere a senha certa e recusa a errada', async () => {
    const h = await hashPassword('Romatec@2026');
    expect(h).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(await verifyPassword('Romatec@2026', h)).toBe(true);
    expect(await verifyPassword('romatec@2026', h)).toBe(false);
  });

  it('mesmo texto gera hashes diferentes (sal aleatório)', async () => {
    expect(await hashPassword('abcdefgh1')).not.toBe(await hashPassword('abcdefgh1'));
  });

  it('hash vazio ou malformado nunca confere', async () => {
    expect(await verifyPassword('x', null)).toBe(false);
    expect(await verifyPassword('x', 'md5$aa$bb')).toBe(false);
    expect(await verifyPassword('x', 'qualquercoisa')).toBe(false);
  });

  it('regras mínimas da senha nova', () => {
    expect(passwordProblem('curta1')).toMatch(/8 caracteres/);
    expect(passwordProblem('12345678')).toMatch(/números/);
    expect(passwordProblem('Romatec2026')).toBeNull();
  });
});

describe('Login - checkLogin', () => {
  it('usuário com scrypt: só a senha certa entra', async () => {
    const scryptHash = await hashPassword('SenhaBoa2026');
    expect(await checkLogin('SenhaBoa2026', { scryptHash })).toEqual({ ok: true });
    expect(await checkLogin('outra-senha', { scryptHash })).toEqual({ ok: false, reason: 'wrong_password' });
  });

  it('hash antigo SHA-256 continua valendo e é convertido para scrypt', async () => {
    const r = await checkLogin('MinhaSenhaAntiga', { legacySha256: sha256('MinhaSenhaAntiga') });
    expect(r.ok).toBe(true);
    const novo = (r as any).setPasswordHash as string;
    expect(await verifyPassword('MinhaSenhaAntiga', novo)).toBe(true);
    expect(await checkLogin('errada123', { legacySha256: sha256('MinhaSenhaAntiga') })).toEqual({ ok: false, reason: 'wrong_password' });
  });

  it('scrypt tem prioridade sobre o hash antigo', async () => {
    const scryptHash = await hashPassword('SenhaNova2026');
    const r = await checkLogin('SenhaVelha2025', { scryptHash, legacySha256: sha256('SenhaVelha2025') });
    expect(r.ok).toBe(false);
  });

  it('sem senha cadastrada: entra só com CRM_INITIAL_PASSWORD, que vira a senha do usuário', async () => {
    expect(await checkLogin('qualquer', {}, undefined)).toEqual({ ok: false, reason: 'no_password_set' });
    expect(await checkLogin('qualquer', {}, 'curta')).toEqual({ ok: false, reason: 'no_password_set' });
    expect(await checkLogin('errada-123', {}, 'Inicial-2026')).toEqual({ ok: false, reason: 'wrong_password' });
    const r = await checkLogin('Inicial-2026', {}, 'Inicial-2026');
    expect(r.ok).toBe(true);
    expect(await verifyPassword('Inicial-2026', (r as any).setPasswordHash)).toBe(true);
  });

  it('senha vazia nunca entra', async () => {
    expect((await checkLogin('', {}, 'Inicial-2026')).ok).toBe(false);
    expect((await checkLogin('', { legacySha256: sha256('x') })).ok).toBe(false);
  });
});

describe('Configuração da empresa - tokens não vazam', () => {
  const config = {
    id: 1, companyName: 'Romatec', phone: '99991263738', address: 'Açailândia',
    zApiInstanceId: '3F0D313A38C952B7106F6A1199C38405', zApiToken: 'TOKEN-SECRETO-1234567890',
    zApiClientToken: 'CLIENT-SECRETO-abcdef', telegramBotToken: '123456:ABC-telegram-xyz',
    telegramChatId: '-100200300', openAiApiKey: 'sk-proj-segredo-9999', zApiConnected: false,
  };

  it('a versão para o navegador não contém nenhum segredo inteiro', () => {
    const pub = publicCompanyConfig(config)!;
    const json = JSON.stringify(pub);
    for (const secret of [config.zApiInstanceId, config.zApiToken, config.zApiClientToken, config.telegramBotToken, config.openAiApiKey]) {
      expect(json).not.toContain(secret);
    }
    expect(pub.zApiToken).toBe('••••••7890');
    expect(pub.companyName).toBe('Romatec');
    expect(pub.telegramChatId).toBe('-100200300');
    expect(publicCompanyConfig(null)).toBeNull();
  });

  it('máscara não mostra nada de segredo curto e vazio continua vazio', () => {
    expect(maskSecret('abc123')).toBe('••••••');
    expect(maskSecret('')).toBe('');
    expect(maskSecret(null)).toBe('');
    expect(isMasked('••••••7890')).toBe(true);
    expect(isMasked('novo-token')).toBe(false);
  });

  it('update ignora o que voltou mascarado e grava o que o usuário trocou', () => {
    expect(stripMaskedFields({
      companyName: 'Romatec Imóveis', zApiToken: '••••••7890', zApiClientToken: 'NOVO-CLIENT-TOKEN', openAiApiKey: '',
    })).toEqual({ companyName: 'Romatec Imóveis', zApiClientToken: 'NOVO-CLIENT-TOKEN', openAiApiKey: '' });
  });
});
