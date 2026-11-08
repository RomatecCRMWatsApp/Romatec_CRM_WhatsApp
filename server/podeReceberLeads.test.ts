import { describe, expect, it, vi } from 'vitest';

vi.mock('./saas/servico', () => ({
  resumoLicenca: async (u: any) => ({ liberado: u.id !== 7 }),
}));
import { podeReceberLeads } from './leads/podeReceber';

describe('corretor sem acesso não recebe lead', () => {
  it('licença bloqueada ou sem pagamento: não recebe', async () => {
    expect(await podeReceberLeads({ id: 7, perfil: 'corretor', ativo: 1 })).toBe(false);
  });
  it('licença liberada: recebe', async () => {
    expect(await podeReceberLeads({ id: 8, perfil: 'corretor', ativo: 1 })).toBe(true);
  });
  it('login desativado: não recebe', async () => {
    expect(await podeReceberLeads({ id: 8, perfil: 'corretor', ativo: 0 })).toBe(false);
    expect(await podeReceberLeads(null)).toBe(false);
  });
});
