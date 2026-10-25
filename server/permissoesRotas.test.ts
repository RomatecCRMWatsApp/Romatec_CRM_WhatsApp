import { describe, expect, it, vi } from 'vitest';
import type { PermissoesUsuario } from './permissoes';

// Permissões do corretor de teste: simulador desligado, só o empreendimento 1 habilitado
const PERM: PermissoesUsuario = {
  perfil: 'corretor',
  modulos: { empreendimentos: true, contratos: true, simulador: false, financeiro: true, materiais: true, imoveis: true, leads: true, contatos: true, campanhas: true, desempenho: true },
  acessos: [{ tipo: 'empreendimento', refId: 1 }],
};
vi.mock('./permissoes', async orig => ({ ...(await orig<typeof import('./permissoes')>()), carregarPermissoes: vi.fn(async () => PERM) }));

const { appRouter } = await import('./routers');
const { exigirAcesso } = await import('./permissoes');

const caller = (user: Record<string, unknown>) => appRouter.createCaller({ user: { ativo: true, ...user }, req: { headers: {} } as any, res: {} as any } as any);
const corretor = caller({ id: 5, role: 'user', perfil: 'corretor' });

describe('bloqueio no servidor (não confia no front)', () => {
  it('módulo desligado para o corretor: o procedimento recusa com FORBIDDEN', async () => {
    await expect(corretor.simulador.simular({ slug: 'bom-jardims', lote: 'A01', entrada: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('portal de permissões é só do admin', async () => {
    await expect(corretor.permissoes.definirAcesso({ usuarioId: 5, tipo: 'empreendimento', refId: 2, habilitado: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(corretor.permissoes.corretor({ usuarioId: 5 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('cadastro de usuários, documentos e prévia do contrato são só do admin', async () => {
    await expect(corretor.equipe.create({ dados: { nome: 'X Y' } } as any)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(corretor.equipe.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(corretor.equipe.credenciaisPendentes()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(corretor.equipe.intermediador({ id: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('cadastro: o corretor só mexe no próprio; busca por CPF é só do admin', async () => {
    await expect(corretor.cadastro.dados({ id: 9 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(corretor.cadastro.salvar({ id: 9, dados: {} })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(corretor.cadastro.documentos({ id: 9 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(corretor.cadastro.removerFoto({ id: 9 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(corretor.cadastro.pessoaPorCpf({ cpf: '52998224725' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('publicar/editar atualização é só do admin', async () => {
    const itens = { novo: ['x'], melhorias: [], correcoes: [], avisos: [] };
    await expect(corretor.novidades.publicar({ versao: '9.9.9', tipo: 'patch', titulo: 'X', itens } as any)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(corretor.novidades.todas()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(corretor.novidades.ativar({ id: 1, ativo: false })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(corretor.novidades.definirDescanso({ minutos: 7 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('notificação de teste é só do admin', async () => {
    await expect(corretor.notificacoes.testar({ tipo: 'reserva' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller({ id: 7, role: 'user', perfil: 'empreendedor' }).notificacoes.testar({ tipo: 'reserva' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('push: inscrição só com endpoint https e chaves válidas', async () => {
    await expect(corretor.notificacoes.inscreverPush({ endpoint: 'http://inseguro.exemplo/x', keys: { p256dh: 'p'.repeat(20), auth: 'a'.repeat(10) } })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(corretor.notificacoes.inscreverPush({ endpoint: 'https://push.exemplo/x', keys: { p256dh: 'curta', auth: 'a' } })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
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

  it('contratos (spec §9): corretor só cria a partir de lead dele; definitivo, ativação, cobrança e cancelamento não são dele', async () => {
    const pl = { modalidade: 'financiado' as const, entradaParcelas: 6, prazo: 120, dataPrimeiroPagamento: '2026-12-10' };
    await expect(corretor.contratos.criar({ slug: 'bom-jardims', lote: 'A01', plano: pl, comprador: { nome: 'X Y', cpf: '52998224725' } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(corretor.contratos.gerar({ id: 1, alvo: 'definitivo' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(corretor.contratos.registrarAssinado({ id: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(corretor.contratos.cancelar({ id: 1, motivo: 'teste', senha: 'qualquer' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(corretor.contratos.emitirCarne({ id: 1, bloco: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(corretor.contratos.linkComprador({ id: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller({ id: 7, role: 'user', perfil: 'empreendedor' }).contratos.listar()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('sem login: UNAUTHORIZED', async () => {
    const anon = appRouter.createCaller({ user: null, req: { headers: {} } as any, res: {} as any } as any);
    await expect(anon.financeiro.vendas()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
