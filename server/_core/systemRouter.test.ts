import { describe, it, expect, afterEach } from 'vitest';
import { infoVersao } from './systemRouter';

describe('system.versao', () => {
  afterEach(() => { delete process.env.RAILWAY_GIT_COMMIT_SHA; });

  it('versão do package.json, commit curto do Railway e hora em que o servidor subiu', () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = '55039c0abcdef1234567890';
    const v = infoVersao();
    expect(v.versao).toMatch(/^\d+\.\d+\.\d+$/);
    expect(v.commit).toBe('55039c0');
    expect(new Date(v.deployAt).getTime()).toBeLessThanOrEqual(new Date(v.agora).getTime());
  });

  it('fora do Railway não há commit', () => {
    expect(infoVersao().commit).toBeNull();
  });
});
