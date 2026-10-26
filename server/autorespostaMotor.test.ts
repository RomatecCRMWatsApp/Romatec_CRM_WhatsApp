import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const avisos: any[] = [];
vi.mock('./notificacoes', () => ({ notificarAtendimento: async (p: any) => { avisos.push(p); } }));

const M = await import('./autoresposta/motor');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

const DENTRO = Date.parse('2026-10-27T14:00:00Z'); // 11:00 em Açailândia
const FORA = Date.parse('2026-10-27T02:00:00Z');   // 23:00
let db: any;
let enviados: { phone: string; tipo: string; conteudo: string }[] = [];
const lead = (phone: string) => db.all(sql`SELECT * FROM leadQualifications WHERE phone = ${phone}`)[0];
const eventos = (leadId: number) => db.all(sql`SELECT tipo, dados FROM leadEventos WHERE leadId = ${leadId}`).map((e: any) => e.tipo);
const novoLead = (phone: string, extra: { humano?: number; blockedUntil?: number; responsavelId?: number } = {}) =>
  db.run(sql`INSERT INTO leadQualifications (phone, nome, empreendimentoSlug, humano, blockedUntil, responsavelId)
    VALUES (${phone}, 'Maria Souza', 'bom-jardims', ${extra.humano ?? 0}, ${extra.blockedUntil ?? null}, ${extra.responsavelId ?? null})`);

beforeAll(async () => {
  db = await getDb();
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil, ativo, creci, telefone) VALUES (2, 'u2', 'Ana Corretora Lima', 'user', 'corretor', 1, '12345', '99999990000')`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'bom-jardims', 'Bom Jardims')`);
  db.run(sql`INSERT INTO condicoesPagamento (empreendimentoId, precoBase, areaBaseM2, entradaPct, entradaMaxParcelas, descontoAvistaPct, descontoAvistaTotal,
    jurosAaEfetivo, prazos, comissaoTotalPct, comissaoCorretorPct, comissao1aParcelaPct, vigenteDesde)
    VALUES (1, '160000', '3025.11', '0.3', 6, '0.0625', '10000', '0.06', '[12,24,36,60,120]', '0.05', '0.02', '0.5', '2026-01-01')`);
  const ins = (codigo: string, situacao: string, area: string, lon: number, lat: number) =>
    db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, situacao, areaM2, lonCentro, latCentro) VALUES (1, ${codigo}, ${situacao}, ${area}, ${String(lon)}, ${String(lat)})`);
  ins('A11', 'disponivel', '3025.11', 0, 0);
  ins('A12', 'disponivel', '3500.00', 0.001, 0);
  ins('A13', 'reservado', '3025.11', 0.002, 0);
  ins('A14', 'disponivel', '3025.11', 0.003, 0);
  ins('C09', 'disponivel', '3025.11', 0.05, 0.05);
  // Robô desligado no começo
  db.run(sql`INSERT INTO autoRespostaConfig (empreendimentoId, ativo) VALUES (1, 0)`);
  M.transporte.texto = async (phone: string, texto: string) => { enviados.push({ phone, tipo: 'texto', conteudo: texto }); };
  M.transporte.midia = async (phone: string, m: any) => { enviados.push({ phone, tipo: m.tipo, conteudo: m.codigo }); };
  M.classificador.claude = async () => 'outra';
});

beforeEach(() => { enviados = []; avisos.length = 0; });

describe('respostas automáticas — motor', () => {
  it('robô desligado: não trata (segue o fluxo antigo)', async () => {
    novoLead('5599900000001');
    expect(await M.processarMensagem({ phone: '5599900000001', texto: 'quanto fica a parcela?', agora: DENTRO })).toEqual({ tratado: false });
    expect(enviados).toHaveLength(0);
    expect(await M.roboAtivo('bom-jardims')).toBe(false);
    db.run(sql`UPDATE autoRespostaConfig SET ativo = 1 WHERE empreendimentoId = 1`);
    expect(await M.roboAtivo('bom-jardims')).toBe(true);
  });

  it('valores: texto com os números do simulador + aviso legal + mídia de condições; registra evento', async () => {
    const r = await M.processarMensagem({ phone: '5599900000001', texto: 'quanto fica a parcela?', agora: DENTRO });
    expect(r).toMatchObject({ tratado: true, intencao: 'valores' });
    const [txt, ...midias] = enviados;
    expect(txt.tipo).toBe('texto');
    expect(txt.conteudo).toMatch(/120× R\$\s1\.234,51/); // números do folder (3.025,11 m²)
    expect(txt.conteudo).toMatch(/6× R\$\s8\.000,00/);
    expect(txt.conteudo).toMatch(/\(CDC, art\. 52\)\._$/);
    expect(midias.map(m => m.conteudo)).toContain('CONDICOES');
    expect(eventos(lead('5599900000001').id)).toContain('auto_resposta');
  });

  it('chácara específica: usa a área dela; reservada → oferece as livres mais perto', async () => {
    novoLead('5599900000002');
    await M.processarMensagem({ phone: '5599900000002', texto: 'tem a a12?', agora: DENTRO });
    expect(enviados[0].conteudo).toContain('A12');
    enviados = [];
    await M.processarMensagem({ phone: '5599900000002', texto: 'e a a13?', agora: DENTRO });
    expect(enviados).toHaveLength(1);
    expect(enviados[0].conteudo).toMatch(/A13\* já foi reservada/);
    expect(enviados[0].conteudo).toContain('A12, A14, A11');
  });

  it('opt-out: responde a confirmação uma vez e descadastra; depois fica calado', async () => {
    novoLead('5599900000003');
    await M.processarMensagem({ phone: '5599900000003', texto: 'quero sair da lista', agora: DENTRO });
    expect(enviados).toHaveLength(1);
    expect(lead('5599900000003').blockedUntil).toBeTruthy();
    enviados = [];
    expect(await M.processarMensagem({ phone: '5599900000003', texto: 'quanto custa?', agora: DENTRO })).toMatchObject({ tratado: true, motivo: 'optout' });
    expect(enviados).toHaveLength(0);
  });

  it('atendimento humano: o robô não responde', async () => {
    novoLead('5599900000004', { humano: 1 });
    expect(await M.processarMensagem({ phone: '5599900000004', texto: 'quanto fica a parcela?', agora: DENTRO })).toMatchObject({ tratado: true, motivo: 'humano' });
    expect(enviados).toHaveLength(0);
  });

  it('fora do horário: só o primeiro contato (com aviso do horário); o resto espera o corretor', async () => {
    novoLead('5599900000005');
    expect(await M.processarMensagem({ phone: '5599900000005', texto: 'quanto fica a parcela?', agora: FORA })).toMatchObject({ motivo: 'fora_horario' });
    expect(enviados).toHaveLength(0);
    await M.processarMensagem({ phone: '5599900000005', texto: 'Boa noite!', primeira: true, agora: FORA });
    expect(enviados[0].conteudo).toMatch(/das 8 h às 20 h/);
  });

  it('mensagem fora do roteiro: passa para o corretor do lead (atendimento humano + aviso)', async () => {
    novoLead('5599900000006', { responsavelId: 2 });
    expect(await M.processarMensagem({ phone: '5599900000006', texto: 'meu cachorro fugiu', agora: DENTRO })).toMatchObject({ intencao: 'outra', motivo: 'handoff' });
    expect(enviados).toHaveLength(0);
    expect(lead('5599900000006').humano).toBe(1);
    expect(avisos[0]).toMatchObject({ responsavelId: 2, empreendimentoSlug: 'bom-jardims' });
  });

  it('chácara livre pedida: manda também o folder dela, gerado na hora', async () => {
    novoLead('5599900000010');
    await M.processarMensagem({ phone: '5599900000010', texto: 'quanto fica a a14?', agora: DENTRO });
    expect(enviados.map(e => e.conteudo)).toContain('FOLDER_CHACARA');
  });

  it('quer fechar: responde com a chácara pedida e passa para o corretor do lead', async () => {
    novoLead('5599900000007', { responsavelId: 2 });
    await M.processarMensagem({ phone: '5599900000007', texto: 'quero a c09', agora: DENTRO });
    expect(enviados[0].conteudo).toContain('*C09*');
    expect(lead('5599900000007').humano).toBe(1);
    expect(avisos[0].motivo).toMatch(/C09/);
  });
});

describe('régua do robô, link de oferta e folder', () => {
  const H = 3_600_000;
  // Data crua do SQLite ('AAAA-MM-DD HH:MM:SS', em UTC)
  const utc = (s: string) => Date.parse(`${s.replace(' ', 'T')}Z`);
  const doLead = (phone: string) => enviados.filter(e => e.phone === phone);
  const regua = (phone: string) => db.all(sql`SELECT * FROM autoRespostaRegua WHERE leadId = ${lead(phone).id}`)[0];

  it('régua: 24 h escassez + story, 72 h follow-up, 7 dias três livres; depois para', async () => {
    novoLead('5599900000008');
    await M.processarMensagem({ phone: '5599900000008', texto: 'quanto é a entrada?', agora: DENTRO });
    expect(regua('5599900000008')).toMatchObject({ passo: 0, seguidas: 0 });
    enviados = [];
    await M.processarRegua(DENTRO + 23 * H);
    expect(doLead('5599900000008')).toHaveLength(0); // ainda não venceu
    await M.processarRegua(DENTRO + 24 * H + 60_000);
    expect(doLead('5599900000008')[0].conteudo).toMatch(/restam \*somente \d+ chácaras\*/);
    expect(doLead('5599900000008').map(e => e.conteudo)).toContain('STORY_ESCASSEZ');
    enviados = [];
    await M.processarRegua(DENTRO + 30 * H);
    expect(doLead('5599900000008')).toHaveLength(0); // não repete o passo
    await M.processarRegua(DENTRO + 72 * H + 60_000);
    expect(doLead('5599900000008')[0].conteudo).toMatch(/Ficou alguma dúvida/);
    enviados = [];
    await M.processarRegua(DENTRO + 168 * H + 60_000);
    expect(doLead('5599900000008')[0].conteudo).toMatch(/3 chácaras que ainda estão livres\* e são ótimas posições: \*A11, A12, A14\*/);
    expect(doLead('5599900000008')[0].conteudo).toMatch(/\/o\/bom-jardims\?l=/);
    expect(regua('5599900000008')).toMatchObject({ passo: 3, seguidas: 3, proximoAt: null });
    enviados = [];
    await M.processarRegua(DENTRO + 400 * H);
    expect(doLead('5599900000008')).toHaveLength(0);
  });

  it('régua: fora do horário espera a janela; o lead respondendo recomeça; corretor assumindo para', async () => {
    expect(await M.processarRegua(FORA)).toBe(0);
    novoLead('5599900000011', { responsavelId: 2 });
    await M.processarMensagem({ phone: '5599900000011', texto: 'tem desconto à vista?', agora: DENTRO });
    await M.processarMensagem({ phone: '5599900000011', texto: 'e onde fica?', agora: DENTRO + 10 * H });
    expect(utc(regua('5599900000011').proximoAt)).toBeGreaterThan(DENTRO + 30 * H);
    db.run(sql`UPDATE leadQualifications SET humano = 1 WHERE phone = '5599900000011'`);
    enviados = [];
    // Venceria às 21 h (fora da janela) → 08 h do dia seguinte; o corretor assumiu antes
    expect(utc(regua('5599900000011').proximoAt)).toBe(DENTRO + 45 * H);
    await M.processarRegua(DENTRO + 45 * H + 60_000);
    expect(doLead('5599900000011')).toHaveLength(0);
    expect(regua('5599900000011')).toBeUndefined();
    expect(regua('5599900000006')).toBeUndefined(); // passou para o corretor no teste anterior
  });

  it('link pessoal da oferta: conta a abertura, mostra o corretor do lead e não expõe comissão', async () => {
    novoLead('5599900000009', { responsavelId: 2 });
    await M.processarMensagem({ phone: '5599900000009', texto: 'Oi', primeira: true, agora: DENTRO });
    const token = /\/o\/bom-jardims\?l=([\w-]+)/.exec(enviados[0].conteudo)?.[1];
    expect(token).toBeTruthy();
    const { dadosDaOferta } = await import('./autoresposta/oferta');
    const o = await dadosDaOferta('bom-jardims', token!, DENTRO);
    expect(o).toMatchObject({ nome: 'Maria', disponiveis: 4 });
    expect(o.contato.nome).toMatch(/Ana/);
    expect(o.condicoes.comissaoCorretorPct).toBe(0);
    expect(o.condicoes.comissaoTotalPct).toBe(0);
    expect(o.lotes.map(l => l.codigo)).not.toContain('A13');
    await dadosDaOferta('bom-jardims', token!, DENTRO);
    expect(db.all(sql`SELECT aberturas FROM linksOferta WHERE token = ${token}`)[0].aberturas).toBe(2);
    expect(eventos(lead('5599900000009').id).filter((t: string) => t === 'abriu_oferta')).toHaveLength(2);
    // Token de outro empreendimento ou inválido: página abre, sem contar nada
    expect((await dadosDaOferta('bom-jardims', 'xx', DENTRO)).nome).toBeNull();
  });

  it('folder da chácara: PNG para a livre, recusa a reservada', async () => {
    const { folderDaChacara, svgDoFolder } = await import('./autoresposta/folderChacara');
    const png = await folderDaChacara('bom-jardims', 'a12');
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    await expect(folderDaChacara('bom-jardims', 'A13')).rejects.toThrow(/indisponível/);
    const svg = svgDoFolder({ empreendimento: 'Bom Jardims', codigo: 'A11', vars: { area: '3.025,11', preco: 'R$ 160.000,00', tabela_prazos: '• 120× R$ 1.234,51 ⭐ o mais escolhido', disponiveis: '4' } as any, aviso: 'Aviso <legal>', temLogo: false });
    expect(svg).toContain('Chácara A11');
    expect(svg).toContain('Aviso &lt;legal&gt;');
  });

  it('página de oferta fora do Google e sem preço na meta', async () => {
    const { metaDaRota } = await import('./seo');
    const m = metaDaRota('/o/bom-jardims') as any;
    expect(m.indexavel).toBe(false);
    expect(`${m.title} ${m.description}`).not.toMatch(/R\$/);
  });
});
