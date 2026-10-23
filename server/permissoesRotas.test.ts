import { describe, expect, it, vi } from 'vitest';
import type { PermissoesUsuario } from './permissoes';

// Permissões do corretor de teste: simulador desligado, só o empreendimento 1 habilitado
const PERM: PermissoesUsuario = {
  perfil: 'equipe',
  modulos: { empreendimentos: true, simulador: false, financeiro: true, materiais: true, imoveis: true, leads: true, contatos: true, campanhas: true, desempenho: true },
  acessos: [{ tipo: 'empreendimento', refId: 1 }],
};
vi.mock('./permissoes', async orig => ({ ...(await orig<typeof import('./permissoes')>()), carregarPermissoes: vi.fn(async () => PERM) }));

const { appRouter } = await import('./routers');
const { exigirAcesso } = await import('./permissoes');

const caller = (user: Record<string, unknown>) => appRouter.createCaller({ user: { ativo: true, ...user }, req: { headers: {} } as any, res: {} as any } as any);
const corretor = caller({ id: 5, role: 'user', perfil: 'equipe' });

describe('bloqueio no servidor (não confia no front)', () => {
  it('módulo desligado para o corretor: o procedimento recusa com FORBIDDEN', async () => {
    await expect(corretor.simulador.simular({ slug: 'bom-jardims', lote: 'A01', entrada: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('portal de permissões é só do admin', async () => {
    await expect(corretor.permissoes.definirAcesso({ usuarioId: 5, tipo: 'empreendimento', refId: 2, habilitado: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(corretor.permissoes.corretor({ usuarioId: 5 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('empreendedor não chega ao financeiro nem ao simulador', async () => {
    const emp = caller({ id: 7, role: 'user', perfil: 'empreendedor' });
    await expect(emp.financeiro.vendas()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(emp.simulador.simular({ slug: 'bom-jardims', lote: 'A01', entrada: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('empreendimento/imóvel não habilitado: FORBIDDEN; habilitado passa; admin passa sempre', () => {
    expect(() => exigirAcesso(PERM, 'empreendimento', 2)).toThrow(/não está habilitado/);
    expect(() => exigirAcesso(PERM, 'imovel', 7)).toThrow(/não está habilitado/);
    expect(() => exigirAcesso(PERM, 'empreendimento', 1)).not.toThrow();
    expect(() => exigirAcesso({ perfil: 'admin', modulos: null, acessos: [] }, 'empreendimento', 2)).not.toThrow();
  });

  it('sem login: UNAUTHORIZED', async () => {
    const anon = appRouter.createCaller({ user: null, req: { headers: {} } as any, res: {} as any } as any);
    await expect(anon.financeiro.vendas()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
