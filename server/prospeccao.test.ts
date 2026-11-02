import { beforeEach, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
process.env.PROSPECCAO_LIMITE_DIA = '2';

const { getDb } = await import('./db');
const S = await import('../drizzle/schema');
const P = await import('./prospeccao/servico');
const Sh = await import('../shared/prospeccao');

const enviados: { fone: string; texto: string }[] = [];
P.transporte.enviarWhatsApp = async (fone, texto) => { enviados.push({ fone, texto }); };
P.transporte.ia = async () => null;
P.transporte.baixar = async url => (url.endsWith('/contato')
  ? '<a href="https://wa.me/5599991112233">Fale</a> contato@stela.com.br'
  : url.endsWith('/sobre') ? null : '<title>Stela Imóveis</title><meta name="description" content="Há 20 anos vendendo imóveis em Açailândia">');

beforeEach(async () => {
  const db: any = await getDb();
  await db.delete(S.prospectos);
  enviados.length = 0;
});

describe('funções puras', () => {
  it('normaliza telefone e reconhece celular', () => {
    expect(Sh.normalizarTelefone('(99) 9 9181-1246')).toBe('5599991811246');
    expect(Sh.normalizarTelefone('+55 99 3538-3205')).toBe('559935383205');
    expect(Sh.normalizarTelefone('123')).toBeNull();
    expect(Sh.pareceCelular('5599991811246')).toBe(true);
    expect(Sh.pareceCelular('559935383205')).toBe(false);
  });
  it('lê CSV com aspas e ponto e vírgula', () => {
    const r = Sh.lerCsv('nome;cidade\n"Imob ""A""";Açailândia\n\nB;Imperatriz');
    expect(r).toEqual([{ nome: 'Imob "A"', cidade: 'Açailândia' }, { nome: 'B', cidade: 'Imperatriz' }]);
  });
  it('extrai contatos do HTML sem pegar imagens como e-mail', () => {
    const c = Sh.extrairContatos('<title>X</title><a href="tel:+55 99 99111-2233">t</a> foto@2x.png ola@x.com.br <a href="https://instagram.com/ximoveis/">ig</a>');
    expect(c.emails).toEqual(['ola@x.com.br']);
    expect(c.telefones).toContain('5599991112233');
    expect(c.instagram).toBe('https://instagram.com/ximoveis');
  });
  it('opt-out e validação da mensagem', () => {
    expect(Sh.ehOptout('Sair')).toBe(true);
    expect(Sh.ehOptout('quero saber mais')).toBe(false);
    expect(Sh.validarMensagem('Olá, tudo bem? Quero apresentar o AvalieImob para vocês hoje.')).toMatch(/SAIR/);
    expect(Sh.validarMensagem(Sh.mensagemModelo({ nome: 'X', categoria: 'advocacia' }))).toBeNull();
  });
  it('bloqueia IPs internos', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '169.254.169.254', '172.20.0.1', '100.64.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1']) expect(P.ipBloqueado(ip)).toBe(true);
    expect(P.ipBloqueado('8.8.8.8')).toBe(false);
  });
  it('baixarSeguro recusa rede interna e esquemas estranhos', async () => {
    expect(await P.baixarSeguro('http://127.0.0.1/')).toBeNull();
    expect(await P.baixarSeguro('http://localhost:3000/')).toBeNull();
    expect(await P.baixarSeguro('file:///etc/passwd')).toBeNull();
    expect(await P.baixarSeguro('http://169.254.169.254/latest/meta-data')).toBeNull();
  });
});

describe('fluxo', () => {
  it('importa sem repetir (origem, telefone ou nome na cidade)', async () => {
    const r1 = await P.importar([
      { nome: 'Stela Imóveis', categoria: 'imobiliaria', cidade: 'Açailândia', telefone: '+5599988442238', site: 'stelaimoveis.com.br', fonte: 'overture', fonteId: 'a1' },
      { nome: 'Outra', categoria: 'Advocacia', cidade: 'Imperatriz', telefone: '(99) 98844-2238' },
      { nome: 'stela imoveis', cidade: 'Açailândia' },
      { nome: '' },
    ], 1);
    expect(r1).toEqual({ inseridos: 1, repetidos: 2, invalidos: 1 });
    const l = await P.listar();
    expect(l[0]).toMatchObject({ nome: 'Stela Imóveis', categoria: 'imobiliaria', telefone: '5599988442238', site: 'https://stelaimoveis.com.br/', status: 'novo', celular: true });
  });

  it('lê o site, escreve a mensagem (modelo sem IA), envia com aprovação e registra SAIR', async () => {
    await P.importar([{ nome: 'Stela Imóveis', categoria: 'imobiliaria', cidade: 'Açailândia', site: 'https://stelaimoveis.com.br' }], 1);
    const [p] = await P.listar();
    const e = await P.enriquecer(p.id);
    expect(e.achou).toMatchObject({ email: 'contato@stela.com.br', telefone: '5599991112233' });
    await expect(P.aprovarEEnviar(p.id, 1)).rejects.toThrow(/Gere ou escreva/);
    const g = await P.gerarMensagem(p.id, 'José Romário');
    expect(g.origem).toBe('modelo');
    expect(g.mensagem).toContain('Stela Imóveis');
    expect(g.mensagem).toContain('SAIR');
    const ok = await P.aprovarEEnviar(p.id, 1);
    expect(ok.enviadosHoje).toBe(1);
    expect(enviados).toHaveLength(1);
    await expect(P.aprovarEEnviar(p.id, 1)).rejects.toThrow(/já foi enviada/);

    expect(await P.registrarRespostaWhatsApp('559991112233', 'Oi, manda o exemplo')).toBe(true);
    expect((await P.listar())[0]).toMatchObject({ status: 'respondeu' });
    expect(await P.registrarRespostaWhatsApp('5599991112233', 'SAIR')).toBe(true);
    const [fim] = await P.listar();
    expect(fim.status).toBe('optout');
    expect(fim.ultimaResposta).toContain('manda o exemplo');
    expect(enviados.at(-1)?.texto).toMatch(/removemos/);
    expect(await P.registrarRespostaWhatsApp('5599900000000', 'oi')).toBe(false);
  });

  it('respeita o limite diário e devolve o prospecto se o WhatsApp falhar', async () => {
    await P.importar(['A', 'B', 'C'].map((n, i) => ({ nome: `Imob ${n}`, telefone: `9999111222${i}`, categoria: 'imobiliaria' })), 1);
    const ps = await P.listar();
    for (const p of ps) await P.gerarMensagem(p.id, 'José');
    const original = P.transporte.enviarWhatsApp;
    P.transporte.enviarWhatsApp = async () => { throw new Error('fora do ar'); };
    await expect(P.aprovarEEnviar(ps[0].id, 1)).rejects.toThrow(/não enviou/);
    expect((await P.listar()).find(x => x.id === ps[0].id)?.status).toBe('aprovado');
    P.transporte.enviarWhatsApp = original;
    await P.aprovarEEnviar(ps[0].id, 1);
    await P.aprovarEEnviar(ps[1].id, 1);
    await expect(P.aprovarEEnviar(ps[2].id, 1)).rejects.toThrow(/Limite de 2/);
  });

  it('não envia para telefone fixo nem para quem saiu', async () => {
    await P.importar([{ nome: 'Cartório', telefone: '559935383205', categoria: 'cartorio' }], 1);
    const [p] = await P.listar();
    await P.gerarMensagem(p.id, 'José');
    await expect(P.aprovarEEnviar(p.id, 1)).rejects.toThrow(/Sem celular/);
    await P.marcar(p.id, 'optout');
    await expect(P.gerarMensagem(p.id, 'José')).rejects.toThrow(/não receber/);
  });
});
