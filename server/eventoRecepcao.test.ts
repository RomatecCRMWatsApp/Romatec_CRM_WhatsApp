import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const mensagens: { fone: string; texto: string }[] = [];
vi.mock('./leads/zapiClient', () => ({ enviarTexto: vi.fn(async (fone: string, texto: string) => { mensagens.push({ fone, texto }); return 'id'; }) }));
vi.mock('./notificacoes', () => ({ notificarConfirmacaoReuniao: vi.fn(async () => {}) }));

const { getDb } = await import('./db');
const S = await import('../drizzle/schema');
const C = await import('./convites');
const { tokenDoQr } = await import('../shared/convites');
const { eq } = await import('drizzle-orm');

const ESCRITORIO = { perfil: 'secretario' as const, acessos: [] };
const CORRETOR_SEM_ACESSO = { perfil: 'corretor' as const, acessos: [] };
const daqui = (dias: number) => new Date(Date.now() + dias * 86400_000).toISOString().slice(0, 10);
const tokenDe = (link: string) => link.split('/reuniao/')[1];
let lancamento = 0, interna = 0;

async function leadsDe(fone: string) {
  const db: any = await getDb();
  return db.select().from(S.leadQualifications).where(eq(S.leadQualifications.phone, fone));
}

beforeAll(async () => {
  const db: any = await getDb();
  await db.insert(S.empreendimentos).values([{ slug: 'bom-jardims', nome: 'Bom Jardims' }] as any);
  const [emp]: any[] = await db.select().from(S.empreendimentos);
  lancamento = (await C.criarReuniao({ titulo: 'Lançamento Bom Jardims', empreendimentoId: emp.id, data: daqui(3), hora: '09:00', local: 'Stand B14' }, 1)).id;
  interna = (await C.criarReuniao({ titulo: 'Reunião da equipe', empreendimentoId: null, data: daqui(3), hora: '18:00' }, 1)).id;
  await C.adicionarConvidados(lancamento, [{ nome: 'Maria Teste', telefone: '(99) 99999-0001' }, { nome: 'Pedro Modelo', telefone: '(99) 99999-0002' }]);
  await C.adicionarConvidados(interna, [{ nome: 'Carla Equipe', telefone: '(99) 99999-0009' }]);
});

describe('QR de entrada', () => {
  it('reconhece o link do convite e o token puro, e recusa o resto', () => {
    expect(tokenDoQr('https://crm.exemplo/reuniao/AbCdEfGh12345678')).toBe('AbCdEfGh12345678');
    expect(tokenDoQr('https://crm.exemplo/reuniao/AbCdEfGh12345678/?utm=x')).toBe('AbCdEfGh12345678');
    expect(tokenDoQr('AbCdEfGh12345678')).toBe('AbCdEfGh12345678');
    expect(tokenDoQr('https://outro.site/qualquer')).toBeNull();
    expect(tokenDoQr('')).toBeNull();
  });
});

describe('evento: confirmação vira lead e recepção registra a entrada', () => {
  it('quem confirma presença num evento de empreendimento vira lead (origem evento), sem mensagem automática', async () => {
    const det = await C.detalheReuniao(lancamento, ESCRITORIO);
    const maria = det.convidados.find(c => c.nome === 'Maria Teste')!;
    const antes = mensagens.length;
    await C.responder(tokenDe(maria.link!), 'confirmado');
    const leads = await leadsDe('5599999990001');
    expect(leads).toHaveLength(1);
    expect(leads[0].origem).toBe('evento');
    expect(mensagens.length).toBe(antes);
  });

  it('reunião interna (sem empreendimento) não gera lead', async () => {
    const det = await C.detalheReuniao(interna, ESCRITORIO);
    await C.responder(tokenDe(det.convidados[0].link!), 'confirmado');
    expect(await leadsDe('5599999990009')).toHaveLength(0);
  });

  it('link geral devolve o token da pessoa para o QR', async () => {
    const det = await C.detalheReuniao(lancamento, ESCRITORIO);
    const r = await C.responder(tokenDe(det.linkGeral!), 'confirmado', { nome: 'Ana Geral', telefone: '99 99999-0003' });
    expect(r.token).toMatch(/^[A-Za-z0-9_-]{16}$/);
    const individual = await C.detalheReuniao(lancamento, ESCRITORIO);
    const maria = individual.convidados.find(c => c.nome === 'Maria Teste')!;
    expect((await C.responder(tokenDe(maria.link!), 'confirmado')).token).toBeNull();
  });

  it('QR na porta: registra uma vez, avisa se já entrou e recusa QR de outro evento ou o link geral', async () => {
    const det = await C.detalheReuniao(lancamento, ESCRITORIO);
    const maria = det.convidados.find(c => c.nome === 'Maria Teste')!;
    const r1 = await C.checkinPorQr(lancamento, maria.link!, ESCRITORIO);
    expect(r1).toMatchObject({ nome: 'Maria Teste', jaEntrou: false });
    expect(await C.checkinPorQr(lancamento, maria.link!, ESCRITORIO)).toMatchObject({ jaEntrou: true });
    await expect(C.checkinPorQr(interna, maria.link!, ESCRITORIO)).rejects.toThrow(/não é deste evento/);
    await expect(C.checkinPorQr(lancamento, det.linkGeral!, ESCRITORIO)).rejects.toThrow(/link geral/);
    await expect(C.checkinPorQr(lancamento, 'texto qualquer', ESCRITORIO)).rejects.toThrow(/não reconhecido/);
    const depois = await C.detalheReuniao(lancamento, ESCRITORIO);
    expect(depois.chegaram).toBe(1);
  });

  it('entrada pelo nome de quem não respondeu confirma e vira lead; desfazer limpa a entrada', async () => {
    const det = await C.detalheReuniao(lancamento, ESCRITORIO);
    const pedro = det.convidados.find(c => c.nome === 'Pedro Modelo')!;
    expect(pedro.status).toBe('pendente');
    await C.checkinConvidado(pedro.id, ESCRITORIO);
    const d2 = await C.detalheReuniao(lancamento, ESCRITORIO);
    expect(d2.convidados.find(c => c.id === pedro.id)).toMatchObject({ status: 'confirmado' });
    expect(await leadsDe('5599999990002')).toHaveLength(1);
    await C.desfazerCheckin(pedro.id, ESCRITORIO);
    expect((await C.detalheReuniao(lancamento, ESCRITORIO)).convidados.find(c => c.id === pedro.id)?.checkinEm).toBeNull();
  });

  it('chegou sem convite: cadastra com entrada e vira lead; o mesmo WhatsApp não duplica', async () => {
    const r = await C.cadastrarNaPorta(lancamento, { nome: 'Joana Porta', telefone: '(99) 99999-0004' }, ESCRITORIO);
    expect(r).toMatchObject({ nome: 'Joana Porta', jaEntrou: false });
    expect(await C.cadastrarNaPorta(lancamento, { nome: 'Joana P.', telefone: '99999990004' }, ESCRITORIO)).toMatchObject({ jaEntrou: true });
    const det = await C.detalheReuniao(lancamento, ESCRITORIO);
    expect(det.convidados.filter(c => c.telefone === '5599999990004')).toHaveLength(1);
    expect(det.convidados.find(c => c.telefone === '5599999990004')?.origem).toBe('porta');
    expect(await leadsDe('5599999990004')).toHaveLength(1);
  });

  it('corretor sem acesso ao empreendimento não registra entrada', async () => {
    await expect(C.cadastrarNaPorta(lancamento, { nome: 'X Y', telefone: '99999990005' }, CORRETOR_SEM_ACESSO)).rejects.toThrow(/fora do seu acesso/);
  });
});
