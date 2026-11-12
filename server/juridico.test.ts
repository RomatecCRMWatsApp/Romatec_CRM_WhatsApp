import { beforeAll, describe, expect, it, vi } from 'vitest';

// Portal do corpo jurídico: escopo do empreendimento, procedimentos permitidos e pontuações
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
const { appRouter } = await import('./routers');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
const { podeAbrir, podeChamar, perfilDe, telaInicial } = await import('../shared/equipe');
const { documentosDoPerfil } = await import('../shared/recrutamento');
const { juridicoDoSlug } = await import('./juridico/acesso');
const { precisaLicenca } = await import('../shared/saas');

const ctx = (user: any) => ({ user, req: { protocol: 'https', headers: {} }, res: { clearCookie: vi.fn() } } as any);
const advogado = { id: 2, openId: 'adv', name: 'Advogada Ficticia', role: 'user', perfil: 'juridico', empreendimentoSlug: 'bom-jardims', ativo: 1 };
const admin = { id: 1, openId: 'adm', name: 'Admin Teste', role: 'admin', ativo: 1 };

beforeAll(async () => {
  const db: any = await getDb();
  db.run(sql`INSERT INTO users (id, openId, name, role) VALUES (1, 'adm', 'Admin Teste', 'admin')`);
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil, empreendimentoSlug, oab, oabUf) VALUES (2, 'adv', 'Advogada Ficticia', 'user', 'juridico', 'bom-jardims', '12345', 'MA')`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Bom Jardims', 'Açailândia', 'MA')`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (2, 'outro', 'Outro Empreendimento', 'Imperatriz', 'MA')`);
});

describe('perfil jurídico: regras', () => {
  it('só o portal jurídico; nada do resto do CRM; sem licença paga', () => {
    expect(perfilDe(advogado)).toBe('juridico');
    expect(telaInicial('juridico')).toBe('/juridico');
    expect(podeAbrir('juridico', '/juridico')).toBe(true);
    expect(podeAbrir('juridico', '/contratos')).toBe(false);
    expect(podeAbrir('juridico', '/dashboard')).toBe(false);
    expect(podeAbrir('corretor', '/juridico')).toBe(false);
    expect(podeChamar('juridico', 'juridico.painel')).toBe(true);
    expect(podeChamar('juridico', 'contratos.listar')).toBe(false);
    expect(podeChamar('juridico', 'financeiro.vendas')).toBe(false);
    expect(precisaLicenca('juridico' as any)).toBe(false);
    expect(documentosDoPerfil('juridico').filter(d => d.obrigatorio).map(d => d.tipo)).toEqual(['foto', 'carteira_oab']);
  });
  it('escopo: só o empreendimento do login, e bloqueado não vê', () => {
    expect(juridicoDoSlug(advogado, 'bom-jardims')).toBe(true);
    expect(juridicoDoSlug(advogado, 'outro')).toBe(false);
    expect(juridicoDoSlug({ ...advogado, ativo: 0 }, 'bom-jardims')).toBe(false);
    expect(juridicoDoSlug({ ...advogado, perfil: 'corretor' }, 'bom-jardims')).toBe(false);
  });
});

describe('portal jurídico (tRPC)', () => {
  it('advogado vê o empreendimento dele mesmo pedindo outro; registra pontuação; só o escritório responde', async () => {
    const adv = appRouter.createCaller(ctx(advogado));
    const p = await adv.juridico.painel({ slug: 'outro' });
    expect(p.empreendimento.slug).toBe('bom-jardims');
    expect(p.admin).toBe(false);
    expect(p.documentos.map(d => d.chave)).toContain('estatuto');
    expect(p.advogados[0]).toMatchObject({ nome: 'Advogada Ficticia', oab: 'OAB/MA 12345' });
    await adv.juridico.pontuar({ documento: 'estatuto', documentoRotulo: 'Estatuto da associação', trecho: 'Art. 22', tipo: 'alteracao', texto: 'Ajustar o quórum de 2/3 para a destituição da administradora.' });
    const lista = await adv.juridico.pontuacoes();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ status: 'aberto', autor: 'Advogada Ficticia', trecho: 'Art. 22' });
    await expect(adv.juridico.responder({ id: lista[0].id, resposta: 'ok', status: 'respondido' })).rejects.toThrow(/Só o escritório/);
    const adm = appRouter.createCaller(ctx(admin));
    await adm.juridico.responder({ id: lista[0].id, resposta: 'Aceito: entra na v1.6 do estatuto.', status: 'respondido' });
    expect((await adv.juridico.pontuacoes())[0]).toMatchObject({ status: 'respondido', resposta: 'Aceito: entra na v1.6 do estatuto.', respondidoPor: 'Admin Teste' });
    await adv.juridico.responder({ id: lista[0].id, status: 'resolvido' });
    expect((await adm.juridico.painel({ slug: 'bom-jardims' })).pontuacoes).toEqual({ abertas: 0, respondidas: 0, resolvidas: 1 });
    // Outro empreendimento: o admin vê vazio; o advogado nem chega lá
    expect(await adm.juridico.pontuacoes({ slug: 'outro' })).toEqual([]);
  });
  it('corretor não abre o portal jurídico', async () => {
    const cor = appRouter.createCaller(ctx({ id: 3, openId: 'c', name: 'Corretor', role: 'user', perfil: 'corretor', ativo: 1 }));
    await expect(cor.juridico.painel()).rejects.toThrow();
  });
});
