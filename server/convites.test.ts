import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const mensagens: { fone: string; texto: string }[] = [];
vi.mock('./leads/zapiClient', () => ({ enviarTexto: vi.fn(async (fone: string, texto: string) => { mensagens.push({ fone, texto }); return 'id'; }) }));
const notificadas: any[] = [];
vi.mock('./notificacoes', () => ({ notificarConfirmacaoReuniao: vi.fn(async (p: any) => { notificadas.push(p); }) }));

const { getDb } = await import('./db');
const S = await import('../drizzle/schema');
const C = await import('./convites');
const { contagem, telefoneConvite, instanteDaReuniao } = await import('../shared/convites');

const ESCRITORIO = { perfil: 'secretario' as const, acessos: [] };
const tokenDe = (link: string) => link.split('/reuniao/')[1];
let empA = 0, empB = 0;

beforeAll(async () => {
  const db: any = await getDb();
  await db.insert(S.empreendimentos).values([{ slug: 'bom-jardims', nome: 'Bom Jardims' }, { slug: 'outro', nome: 'Outro' }] as any);
  const e: any[] = await db.select().from(S.empreendimentos);
  empA = e.find(x => x.slug === 'bom-jardims').id;
  empB = e.find(x => x.slug === 'outro').id;
});

const daqui = (dias: number) => new Date(Date.now() + dias * 86400_000).toISOString().slice(0, 10);

describe('regras', () => {
  it('telefone com DDI 55, horário do Maranhão e contagem', () => {
    expect(telefoneConvite('(99) 9 9101-1970')).toBe('5599991011970');
    expect(telefoneConvite('+55 99 99101-1970')).toBe('5599991011970');
    expect(telefoneConvite('123')).toBeNull();
    expect(instanteDaReuniao('2026-11-05', '09:00').toISOString()).toBe('2026-11-05T12:00:00.000Z');
    expect(contagem([{ status: 'confirmado' }, { status: 'confirmado' }, { status: 'recusado' }, { status: 'pendente' }]))
      .toEqual({ confirmado: 2, recusado: 1, pendente: 1, total: 4 });
  });

  it('a notificação de presença confirmada vai só para administrador e secretária ativos', async () => {
    const { destinatarios, urlDaNotificacao } = await import('../shared/notificacoes');
    const { perfilDe } = await import('../shared/equipe');
    const us = [{ id: 1, role: 'admin' }, { id: 2, perfil: 'secretario' }, { id: 3, perfil: 'corretor' }, { id: 4, perfil: 'empreendedor' }, { id: 5, perfil: 'secretario', ativo: false }];
    expect(destinatarios('confirmacao_reuniao', us, [], perfilDe as any)).toEqual([1, 2]);
    expect(urlDaNotificacao('confirmacao_reuniao', { reuniaoId: 7 })).toBe('/convites/7');
  });

  it('lista colada: "nome, WhatsApp" por linha; linha sem número válido vai para erros', async () => {
    const { lerLista } = await import('../shared/convites');
    const r = lerLista('Maria Souza, (99) 99111-0001\nJoão Lima; 99 99111-0002\nAna Paula - +55 99 99111-0003\n\nSó nome\nPedro, 1234');
    expect(r.ok).toEqual([
      { nome: 'Maria Souza', telefone: '(99) 99111-0001' }, { nome: 'João Lima', telefone: '99 99111-0002' }, { nome: 'Ana Paula', telefone: '+55 99 99111-0003' },
    ]);
    expect(r.erros).toEqual(['Só nome', 'Pedro, 1234']);
  });
});

describe('convite com link individual', () => {
  it('cria → convida → envia pelo WhatsApp → confirma → aparece nos confirmados e notifica o escritório', async () => {
    const { id } = await C.criarReuniao({ titulo: 'Apresentação das chácaras', empreendimentoId: empA, data: daqui(3), hora: '09:00', local: 'Escritório Romatec' }, 1);
    const r = await C.adicionarConvidados(id, [{ nome: 'Maria Souza', telefone: '99 99111-0001' }, { nome: 'João Lima', telefone: '(99) 99111-0002' }, { nome: 'Maria de novo', telefone: '5599991110001' }]);
    expect(r).toEqual({ adicionados: 2, repetidos: 1 });

    const env = await C.enviarConvites(id);
    expect(env).toEqual({ enviados: 2, falhas: [] });
    expect(mensagens.map(m => m.fone).sort()).toEqual(['5599991110001', '5599991110002']);
    expect(mensagens[0].texto).toContain('/reuniao/');

    let det = await C.detalheReuniao(id, ESCRITORIO);
    const maria = det.convidados.find(c => c.nome === 'Maria Souza')!;
    const pub = await C.paginaPublica(tokenDe(maria.link!));
    expect(pub).toMatchObject({ titulo: 'Apresentação das chácaras', empreendimento: 'Bom Jardims', geral: false, convidado: { nome: 'Maria Souza', status: 'pendente' } });

    await C.responder(tokenDe(maria.link!), 'confirmado');
    await C.responder(tokenDe(det.convidados.find(c => c.nome === 'João Lima')!.link!), 'recusado');
    await new Promise(r => setTimeout(r, 10));
    det = await C.detalheReuniao(id, ESCRITORIO);
    expect(det.contagem).toMatchObject({ confirmado: 1, recusado: 1, pendente: 0, total: 2 });
    expect(det.convidados.find(c => c.status === 'confirmado')?.nome).toBe('Maria Souza');
    expect(notificadas).toHaveLength(1);
    expect(notificadas[0]).toMatchObject({ reuniaoId: id, convidado: 'Maria Souza' });

    // Confirmar de novo não repete a notificação
    await C.responder(tokenDe(maria.link!), 'confirmado');
    expect(notificadas).toHaveLength(1);
  });
});

describe('link geral (grupo)', () => {
  it('pede nome e telefone; mesmo telefone atualiza a resposta; quem já estava na lista é reconhecido', async () => {
    const { id } = await C.criarReuniao({ titulo: 'Reunião de corretores', empreendimentoId: empA, data: daqui(2), hora: '09:00' }, 1);
    await C.adicionarConvidados(id, [{ nome: 'Ana Lista', telefone: '99 99222-0001' }]);
    const geral = tokenDe((await C.detalheReuniao(id, ESCRITORIO)).linkGeral!);
    expect((await C.paginaPublica(geral)).geral).toBe(true);

    await expect(C.responder(geral, 'confirmado', { nome: '', telefone: '99 99222-0009' })).rejects.toThrow(/nome/);
    await expect(C.responder(geral, 'confirmado', { nome: 'Pedro', telefone: '12' })).rejects.toThrow(/WhatsApp/);
    await C.responder(geral, 'confirmado', { nome: 'Pedro Grupo', telefone: '99 99222-0009' });
    await C.responder(geral, 'recusado', { nome: 'Pedro Grupo', telefone: '(99) 99222-0009' });
    await C.responder(geral, 'confirmado', { nome: 'Ana', telefone: '5599992220001' });

    const det = await C.detalheReuniao(id, ESCRITORIO);
    expect(det.contagem).toMatchObject({ confirmado: 1, recusado: 1, pendente: 0, total: 2 });
    expect(det.convidados.find(c => c.nome === 'Pedro Grupo')).toMatchObject({ origem: 'link_geral', status: 'recusado' });
    expect(det.convidados.find(c => c.nome === 'Ana Lista')).toMatchObject({ origem: 'lista', status: 'confirmado' });
  });

  it('reunião cancelada ou já passada não aceita resposta', async () => {
    const { id } = await C.criarReuniao({ titulo: 'Passada', empreendimentoId: empA, data: daqui(-1), hora: '09:00' }, 1);
    const geral = tokenDe((await C.detalheReuniao(id, ESCRITORIO)).linkGeral!);
    expect((await C.paginaPublica(geral)).encerrada).toBe(true);
    await expect(C.responder(geral, 'confirmado', { nome: 'X Y', telefone: '99 99333-0001' })).rejects.toThrow(/prazo/);
    const { id: id2 } = await C.criarReuniao({ titulo: 'Cancelada', empreendimentoId: empA, data: daqui(5), hora: '10:00' }, 1);
    await C.cancelarReuniao(id2);
    const g2 = tokenDe((await C.detalheReuniao(id2, ESCRITORIO)).linkGeral!);
    await expect(C.responder(g2, 'confirmado', { nome: 'X Y', telefone: '99 99333-0001' })).rejects.toThrow(/cancelada/);
    await expect(C.paginaPublica('tokeninexistente')).rejects.toThrow(/inválido/);
  });
});

describe('escopo', () => {
  it('corretor/empreendedor só veem as reuniões dos empreendimentos deles, sem os links', async () => {
    const { id: idB } = await C.criarReuniao({ titulo: 'Só do Outro', empreendimentoId: empB, data: daqui(4), hora: '15:00' }, 1);
    const corretorA = { perfil: 'corretor' as const, acessos: [{ tipo: 'empreendimento' as const, refId: empA }] };
    const lista = await C.listarReunioes(corretorA);
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every(r => r.empreendimentoId === empA)).toBe(true);
    await expect(C.detalheReuniao(idB, corretorA)).rejects.toThrow(/fora do seu acesso/);
    const doA = await C.detalheReuniao(lista[0].id, corretorA);
    expect(doA.podeEditar).toBe(false);
    expect(doA.linkGeral).toBeNull();
    expect(doA.convidados.every(c => c.link === null)).toBe(true);
    expect((await C.listarReunioes(ESCRITORIO, { empreendimentoId: empB })).map(r => r.id)).toEqual([idB]);
  });
});
