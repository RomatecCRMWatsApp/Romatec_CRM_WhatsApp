import { beforeEach, describe, expect, it } from 'vitest';

// Rede de Parceiros: busca no Google Maps (Places API, simulada), objetivo da prospecção, "virar parceira" e o Kit em PDF
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { getDb } = await import('./db');
const S = await import('../drizzle/schema');
const P = await import('./prospeccao/servico');
const G = await import('./prospeccao/googlePlaces');
const K = await import('./kitParceiro');
const { CARTAO_PADRAO } = await import('../shared/cartaoVendas');
const { PDFDocument } = await import('pdf-lib');

P.transporte.ia = async () => null; // sem IA: cai na mensagem-modelo

const lugar = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id, displayName: { text: nome }, formattedAddress: `Rua X, ${id}, Açailândia - MA, 65930-000, Brasil`, internationalPhoneNumber: '+55 99 99181-0000',
  rating: 4.5, userRatingCount: 10, googleMapsUri: `https://maps.google.com/?cid=${id}`, primaryTypeDisplayName: { text: 'Imobiliária' }, ...extra,
});
let pedidos: any[] = [];
function simularGoogle(paginas: Record<string, { places: any[]; nextPageToken?: string }>) {
  pedidos = [];
  G._usarFetch((async (_url: any, init: any) => {
    const corpo = JSON.parse(init.body);
    pedidos.push({ corpo, chave: init.headers['X-Goog-Api-Key'], campos: init.headers['X-Goog-FieldMask'] });
    const r = paginas[`${corpo.textQuery}|${corpo.pageToken ?? ''}`] ?? { places: [] };
    return new Response(JSON.stringify(r), { status: 200 });
  }) as any);
}

beforeEach(async () => {
  const db: any = await getDb();
  await db.delete(S.prospectos);
  await db.delete(S.imobiliariasParceiras);
  process.env.GOOGLE_PLACES_API_KEY = 'AIzaChaveDeTesteSintetica0123456789';
});

describe('busca no Google Maps (Places API)', () => {
  it('pagina, tira repetidos, fica só com a cidade, ignora fechadas e normaliza o telefone', async () => {
    simularGoogle({
      'imobiliária em Açailândia - MA|': { places: [lugar('p1', 'Stela Imóveis'), lugar('p2', 'Fechada', { businessStatus: 'CLOSED_PERMANENTLY' })], nextPageToken: 'pg2' },
      'imobiliária em Açailândia - MA|pg2': { places: [lugar('p3', 'Imob Imperatriz', { formattedAddress: 'Av. Y, Imperatriz - MA, Brasil' }), lugar('p4', 'Value Consultoria', { userRatingCount: 43 })] },
      'corretor de imóveis em Açailândia - MA|': { places: [lugar('p1', 'Stela Imóveis'), lugar('p5', 'Alysson Corretor', { internationalPhoneNumber: null, nationalPhoneNumber: '(99) 98495-6820' })] },
    });
    const r = await G.buscarNoMaps({ cidade: 'Açailândia', uf: 'ma', tipos: ['imobiliaria', 'corretor'] });
    expect(r.lugares.map(l => l.nome)).toEqual(['Value Consultoria', 'Alysson Corretor', 'Stela Imóveis']);
    expect(r.lugares.find(l => l.placeId === 'p5')?.telefone).toBe('5599984956820');
    expect(r.lugares.every(l => l.categoria === 'imobiliaria')).toBe(true);
    expect(pedidos[0].chave).toBe('AIzaChaveDeTesteSintetica0123456789');
    expect(pedidos[0].campos).toContain('places.internationalPhoneNumber');
    expect(pedidos[0].corpo).toMatchObject({ languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20 });
  });

  it('sem chave: erro claro, sem chamar o Google', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    simularGoogle({});
    await expect(G.buscarNoMaps({ cidade: 'Açailândia', uf: 'MA', tipos: ['imobiliaria'] })).rejects.toThrow(/chave da Places API/);
    expect(pedidos).toHaveLength(0);
  });

  it('chave recusada pelo Google vira mensagem explicativa', async () => {
    G._usarFetch((async () => new Response(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }), { status: 400 })) as any);
    await expect(G.buscarNoMaps({ cidade: 'Açailândia', uf: 'MA', tipos: ['imobiliaria'] })).rejects.toThrow(/Chave do Google inválida/);
  });
});

describe('importação com objetivo e "virar parceira"', () => {
  it('marca quem já está no CRM, importa como Parceria Bom Jardims e a mensagem-modelo é a da parceria', async () => {
    const db: any = await getDb();
    await db.insert(S.imobiliariasParceiras).values({ nome: 'Value Consultoria', telefone: '(99) 99101-0000', codigo: 'AAA111', token: 'a'.repeat(32), comissaoPct: '0.0200', ativo: true, criadoEm: new Date() } as any);
    const base = { categoria: 'imobiliaria' as const, tipoGoogle: 'Imobiliária', endereco: 'Açailândia - MA', site: null, nota: 4.7, avaliacoes: 30, mapsUrl: null, termo: 'imobiliária' };
    const lugares = [
      { ...base, placeId: 'p1', nome: 'Stela Imóveis', telefone: '5599988442230' },
      { ...base, placeId: 'p4', nome: 'Value Consultoria', telefone: '5599991019990' },
    ];
    const marcados = await P.marcarCadastrados(lugares, 'Açailândia');
    expect(marcados.map(m => m.jaCadastrado)).toEqual([null, 'parceira']);
    expect(await P.importarDoMaps([lugares[0]], { cidade: 'Açailândia', uf: 'MA', objetivo: 'parceria_bj' }, 1)).toMatchObject({ inseridos: 1 });
    expect((await P.marcarCadastrados(lugares, 'Açailândia'))[0].jaCadastrado).toBe('prospecto');
    expect(await P.importarDoMaps([lugares[0]], { cidade: 'Açailândia', uf: 'MA', objetivo: 'parceria_bj' }, 1)).toMatchObject({ inseridos: 0, repetidos: 1 });

    const [p] = await P.listar({ objetivo: 'parceria_bj' });
    expect(p).toMatchObject({ nome: 'Stela Imóveis', objetivo: 'parceria_bj', fonte: 'google', telefone: '5599988442230' });
    expect(await P.listar({ objetivo: 'avalieimob' })).toHaveLength(0);
    const m = await P.gerarMensagem(p.id, 'José Romário');
    expect(m.origem).toBe('modelo');
    expect(m.mensagem).toMatch(/Bom Jardims/);
    expect(m.mensagem).not.toMatch(/AvalieImob|PTAM/);
    expect(m.mensagem).toMatch(/SAIR/);

    const v = await P.virarParceira(p.id, 1);
    expect(v.codigo).toMatch(/^[0-9A-F]{6}$/);
    const [par]: any[] = await db.select().from(S.imobiliariasParceiras).where((await import('drizzle-orm')).eq(S.imobiliariasParceiras.codigo, v.codigo));
    expect(par).toMatchObject({ nome: 'Stela Imóveis', telefone: '99988442230' });
    expect(Number(par.comissaoPct)).toBe(0.02);
    expect((await P.listar({ objetivo: 'parceria_bj' }))[0].status).toBe('interessado');
    await expect(P.virarParceira(p.id, 1)).rejects.toThrow(/Já existe a parceira/);
  });

  it('prospecto antigo (sem objetivo) continua como AvalieImob', async () => {
    await P.importar([{ nome: 'Cartório X', categoria: 'cartorio', cidade: 'Açailândia' }], 1);
    expect((await P.listar())[0].objetivo).toBe('avalieimob');
    expect((await P.gerarMensagem((await P.listar())[0].id, 'José')).mensagem).toMatch(/AvalieImob/);
  });
});

describe('Kit do Parceiro (PDF)', () => {
  const emp = {
    nome: 'Condomínio de Chácaras Bom Jardims', municipio: 'Açailândia', uf: 'MA', endereco: 'Estrada do Piquiá dos Baianos', aVenda: 84, disponiveis: 80,
    areaMin: 1925.07, areaMax: 4172.55, licenca: 'Licença de Operação n.º 018/2026', sigef: true, parcelamentoRegistrado: false,
    tabela: null, condicoes: { entradaPct: 0.3, prazoMax: 120 },
  };
  it('parceira: capa, empreendimento e parceria (3 páginas); com preços ganha a tabela', async () => {
    const dest = { tipo: 'parceira' as const, nome: 'Imobiliária Exemplo', link: 'https://romateccrm.com/parceiro/' + 'b'.repeat(32), comissaoPct: 0.025, contato: CARTAO_PADRAO };
    expect((await PDFDocument.load(await K.gerarKit(dest, emp))).getPageCount()).toBe(3);
    const tabela = Array.from({ length: 70 }, (_, i) => ({ codigo: `A${String(i + 1).padStart(2, '0')}`, quadra: 'A', area: 3025.11, preco: 160000 }));
    expect((await PDFDocument.load(await K.gerarKit(dest, { ...emp, tabela }))).getPageCount()).toBe(5);
  });

  it('parceira do banco: link do portal e comissão dela; prospecto que pediu SAIR não gera kit', async () => {
    const db: any = await getDb();
    await db.insert(S.imobiliariasParceiras).values({ nome: 'Imob Y', codigo: 'BBB222', token: 'c'.repeat(32), comissaoPct: '0.0300', ativo: true, criadoEm: new Date() } as any);
    const [par]: any[] = await db.select().from(S.imobiliariasParceiras);
    const d = await K.destinatarioDe('parceira', Number(par.id));
    expect(d.link).toMatch(/\/parceiro\/c{32}$/);
    expect(d.comissaoPct).toBe(0.03);
    await P.importar([{ nome: 'Saiu Ltda', cidade: 'Açailândia', objetivo: 'parceria_bj' }], 1);
    const [pr] = await P.listar();
    await P.marcar(pr.id, 'optout');
    await expect(K.destinatarioDe('prospecto', pr.id)).rejects.toThrow(/não receber/);
  });
});
