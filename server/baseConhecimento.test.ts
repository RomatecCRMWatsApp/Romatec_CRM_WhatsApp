import { describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const B = await import('./baseConhecimento');
const Sh = await import('../shared/baseConhecimento');

describe('funções puras', () => {
  it('slug sem acento', () => {
    expect(Sh.slugDe('Formas de Pagamento: Plano C!')).toBe('formas-de-pagamento-plano-c');
  });
  it('busca sem acento por todas as palavras, título pesa mais', () => {
    const r = Sh.buscarArtigos(Sh.ARTIGOS_INICIAIS, 'plano c');
    expect(r[0].slug).toBe('formas-de-pagamento');
    expect(Sh.buscarArtigos(Sh.ARTIGOS_INICIAIS, 'DIMOB').map(a => a.slug)).toContain('cobranca-e-inadimplencia');
    expect(Sh.buscarArtigos(Sh.ARTIGOS_INICIAIS, 'xyzinexistente')).toEqual([]);
    expect(Sh.buscarArtigos(Sh.ARTIGOS_INICIAIS, ' ')).toHaveLength(Sh.ARTIGOS_INICIAIS.length);
  });
  it('artigos iniciais respeitam as regras de anúncio', () => {
    const tudo = Sh.ARTIGOS_INICIAIS.map(a => a.conteudo).join('\n');
    expect(tudo).toContain('R$ 5.162,97');
    expect(tudo).not.toMatch(/R\$ 10 mil \+ 120× de R\$ 1\.234,51(?! \+)/);
    expect(new Set(Sh.ARTIGOS_INICIAIS.map(a => a.slug)).size).toBe(Sh.ARTIGOS_INICIAIS.length);
  });
});

describe('serviço', () => {
  it('semeia uma vez e filtra o que é só do escritório', async () => {
    const corretor = await B.listarArtigos('corretor');
    const admin = await B.listarArtigos('admin');
    expect(admin).toHaveLength(Sh.ARTIGOS_INICIAIS.length);
    expect(corretor.some(a => a.publico === 'escritorio')).toBe(false);
    expect(corretor.length).toBeLessThan(admin.length);
    B._reiniciarSemente();
    expect(await B.listarArtigos('admin')).toHaveLength(Sh.ARTIGOS_INICIAIS.length);
  });
  it('cria com slug único, edita, rascunho some para a equipe, exclui', async () => {
    const dados = { titulo: 'Ficha do Condomínio de Chácaras Bom Jardims', categoria: 'empreendimento', publico: 'todos', conteudo: 'Texto novo do artigo.' };
    const primeiro = await B.salvarArtigo(null, dados, 1);
    const { id } = await B.salvarArtigo(null, dados, 1);
    const lista = await B.listarArtigos('admin');
    expect(lista.find(a => a.id === primeiro.id)!.slug).toBe('ficha-do-condominio-de-chacaras-bom-jardims');
    expect(lista.find(a => a.id === id)!.slug).toBe('ficha-do-condominio-de-chacaras-bom-jardims-2');
    await B.salvarArtigo(id, { ...dados, conteudo: 'Rascunho em revisão.', ativo: false }, 1);
    expect((await B.listarArtigos('corretor')).some(a => a.id === id)).toBe(false);
    expect((await B.listarArtigos('admin', true)).find(a => a.id === id)).toMatchObject({ ativo: false, conteudo: 'Rascunho em revisão.' });
    await expect(B.salvarArtigo(null, { ...dados, titulo: 'x' }, 1)).rejects.toThrow(/título/);
    await expect(B.salvarArtigo(null, { ...dados, categoria: 'outra' }, 1)).rejects.toThrow(/Categoria/);
    await B.excluirArtigo(id);
    expect((await B.listarArtigos('admin', true)).some(a => a.id === id)).toBe(false);
  });
});
