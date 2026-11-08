import { describe, expect, it } from 'vitest';
import { linkAtendido, linkWhatsAppAtendido, tokenAtendido, tokenAtendidoValido } from './leads/sla';

describe('links do aviso amarrados a quem recebeu', () => {
  it('o token de um corretor não vale para outro', () => {
    const t = tokenAtendido(42, 5);
    expect(tokenAtendidoValido(42, t, 5)).toBe(true);
    expect(tokenAtendidoValido(42, t, 6)).toBe(false);
    expect(tokenAtendidoValido(42, t, null)).toBe(false);
  });
  it('os links levam o destinatário', () => {
    expect(linkAtendido(42, 5)).toMatch(/\/a\/42\/[0-9a-f]{20}\?u=5$/);
    expect(linkWhatsAppAtendido(42, 5)).toMatch(/\/w\/42\/[0-9a-f]{20}\?u=5$/);
    expect(linkAtendido(42)).not.toContain('?u=');
  });
});
