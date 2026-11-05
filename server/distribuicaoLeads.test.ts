import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
const avisos: any[] = [];
vi.mock('./leads/encaminhamento', () => ({ avisarEncaminhamento: async (o: any) => { avisos.push(o); } }));

const D = await import('./leads/distribuicao');
const { podeAbrir } = await import('../shared/equipe');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

describe('distribuição manual de leads', () => {
  let db: any;
  beforeAll(async () => {
    db = await getDb();
    db.run(sql`INSERT INTO users (id, openId, name, role, perfil) VALUES (1, 'a', 'José', 'admin', 'admin'), (2, 's', 'Secretária Bia', 'user', 'secretario'), (3, 'c', 'Corretor Caio', 'user', 'corretor'), (4, 'e', 'Empreendedor', 'user', 'empreendedor')`);
    db.run(sql`INSERT INTO leadQualifications (id, phone, nome) VALUES (10, '5599911110000', 'Ana Lead'), (11, '5599922220000', 'Beto Lead')`);
    db.run(sql`INSERT INTO leadQualifications (id, phone, nome, responsavelId) VALUES (12, '5599933330000', 'Carla Lead', 3)`);
  });

  it('só administrador e secretária abrem a tela', () => {
    expect(podeAbrir('secretario', '/leads/distribuicao')).toBe(true);
    expect(podeAbrir('admin', '/leads/distribuicao')).toBe(true);
    expect(podeAbrir('corretor', '/leads/distribuicao')).toBe(false);
  });

  it('lista os sem responsável e acha pela busca; equipe sem empreendedor', async () => {
    expect((await D.leadsParaDistribuir('sem_responsavel')).map(l => l.nome).sort()).toEqual(['Ana Lead', 'Beto Lead']);
    expect((await D.leadsParaDistribuir('sem_responsavel', '2222')).map(l => l.nome)).toEqual(['Beto Lead']);
    expect((await D.leadsParaDistribuir('sem_responsavel', 'ana')).map(l => l.nome)).toEqual(['Ana Lead']);
    expect((await D.equipe()).map(u => u.nome)).toEqual(['Corretor Caio', 'José', 'Secretária Bia']);
  });

  it('"não encaminhados": frio, morno e quente com dono = escritório ou sem dono; descartado e já encaminhado ficam fora', async () => {
    db.run(sql`INSERT INTO leadQualifications (id, phone, nome, responsavelId, score) VALUES (20, '5599944440000', 'Dora Fria', 1, 'frio'), (21, '5599955550000', 'Edu Morno', NULL, 'morno')`);
    db.run(sql`INSERT INTO leadQualifications (id, phone, nome, stage) VALUES (22, '5599966660000', 'Fabi Descartada', 'descartado')`);
    const nomes = (await D.leadsParaDistribuir('nao_encaminhados')).map(l => l.nome).sort();
    expect(nomes).toEqual(['Ana Lead', 'Beto Lead', 'Dora Fria', 'Edu Morno']);
    expect((await D.leadsParaDistribuir('todos')).map(l => l.nome)).toContain('Fabi Descartada');
  });

  it('modo da distribuição: automático por padrão; manual para a roleta (lead novo fica sem dono)', async () => {
    const Cfg = await import('./configSistema');
    expect(await Cfg.modoDistribuicao()).toBe('automatico');
    await Cfg.gravarConfig('distribuicao_modo', 'manual', 1);
    expect(await Cfg.modoDistribuicao()).toBe('manual');
    db.run(sql`UPDATE users SET recebeLeads = 1 WHERE id = 3`);
    db.run(sql`INSERT INTO leadQualifications (id, phone, nome) VALUES (23, '5599977770000', 'Gil Novo')`);
    const { garantirResponsavel } = await import('./leads/sla');
    expect(await garantirResponsavel(23)).toBeNull();
    expect(db.all(sql`SELECT responsavelId FROM leadQualifications WHERE id = 23`)[0].responsavelId).toBeNull();
    await Cfg.gravarConfig('distribuicao_modo', 'automatico', 1);
    expect((await garantirResponsavel(23))?.id).toBe(3);
    db.run(sql`DELETE FROM leadEncaminhamentos WHERE leadId = 23`);
    db.run(sql`DELETE FROM leadQualifications WHERE id IN (20, 21, 22, 23)`);
  });

  it('encaminha em lote e avisa; lead que já era dele (sem registro) entra no controle; com registro aberto não repete', async () => {
    const r = await D.encaminharManual([10, 11, 12], 3, { id: 2, nome: 'Secretária Bia' }, 'Cliente prefere manhã');
    expect(r).toEqual({ encaminhados: 3, jaEram: 0, naoEncontrados: 0, para: 'Corretor Caio' });
    expect(avisos.map(a => a.leadId).sort()).toEqual([10, 11, 12]);
    expect(await D.encaminharManual([12], 3, { id: 2, nome: 'Bia' })).toMatchObject({ encaminhados: 0, jaEram: 1 });
    const [l]: any[] = db.all(sql`SELECT responsavelId FROM leadQualifications WHERE id = 10`);
    expect(l.responsavelId).toBe(3);
    await expect(D.encaminharManual([10], 4, { id: 2, nome: 'Bia' })).rejects.toThrow(/não encontrado/);
  });

  it('relatório: quem encaminhou, de quem para quem, filtros e CSV', async () => {
    await D.registrarEncaminhamento({ leadId: 12, deId: 3, paraId: 1, origem: 'automatico', observacao: 'Roleta: sem atendimento em 15 min' });
    const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const todos = await D.relatorioEncaminhamentos({ de: hoje, ate: hoje });
    expect(todos.resumo).toMatchObject({ total: 4, manual: 3, automatico: 1, aguardando: 3 });
    const manual = await D.relatorioEncaminhamentos({ de: hoje, ate: hoje, origem: 'manual' });
    expect(manual.itens.map(i => [i.lead, i.de, i.para, i.por, i.observacao])).toEqual(expect.arrayContaining([
      ['Ana Lead', null, 'Corretor Caio', 'Secretária Bia', 'Cliente prefere manhã'], ['Beto Lead', null, 'Corretor Caio', 'Secretária Bia', 'Cliente prefere manhã'],
    ]));
    expect(manual.porCorretor).toMatchObject([{ corretor: 'Corretor Caio', total: 3, manual: 3, automatico: 0 }]);
    const auto = await D.relatorioEncaminhamentos({ de: hoje, ate: hoje, paraId: 1 });
    expect(auto.itens[0]).toMatchObject({ origem: 'automatico', por: 'Automático (roleta)', de: 'Corretor Caio', para: 'José', continuaCom: 'não' });
    const csv = D.csvRelatorio(manual.itens);
    expect(csv.startsWith('﻿Data e hora;Tipo;Lead')).toBe(true);
    expect(csv).toContain(';Manual;Ana Lead;+5599911110000;');
    await expect(D.relatorioEncaminhamentos({ de: hoje, ate: '2020-01-01' })).rejects.toThrow(/data final/);
  });

  it('corretor confirma o recebimento; só quem recebeu confirma', async () => {
    const meus = await D.meusEncaminhamentos(3);
    const ana = meus.find(m => m.lead === 'Ana Lead')!;
    expect(ana.situacao).toBe('aguardando_confirmacao');
    await expect(D.confirmarRecebimento(ana.id, 2)).rejects.toThrow(/outra pessoa/);
    await D.confirmarRecebimento(ana.id, 3);
    expect((await D.meusEncaminhamentos(3)).find(m => m.id === ana.id)!.situacao).toBe('em_atendimento');
    expect((await D.encaminhamentoAbertoDoLead(10, 3))!.recebidoEm).not.toBeNull();
  });

  it('corretor informa que o cliente desistiu: fecha e leva o lead para Perdido', async () => {
    const beto = (await D.meusEncaminhamentos(3)).find(m => m.lead === 'Beto Lead')!;
    await D.finalizarPeloCorretor(beto.id, { id: 3, escritorio: false }, 'desistiu', 'achou longe');
    const [l]: any[] = db.all(sql`SELECT etapa, motivoPerda FROM leadQualifications WHERE id = 11`);
    expect(l).toEqual({ etapa: 'perdido', motivoPerda: 'outro:Desistiu' });
    const b = (await D.meusEncaminhamentos(3)).find(m => m.id === beto.id)!;
    expect([b.situacao, b.desfecho, b.desfechoMotivo]).toEqual(['finalizado', 'desistiu', 'achou longe']);
    expect(b.recebidoEm).not.toBeNull();
    await expect(D.finalizarPeloCorretor(beto.id, { id: 3, escritorio: false }, 'sem_contato')).rejects.toThrow(/Já finalizado/);
  });

  it('reenviar aviso só para quem ainda não confirmou', async () => {
    const pend = (await D.meusEncaminhamentos(1)).filter(m => m.situacao === 'aguardando_confirmacao').map(m => m.id);
    const conf = (await D.meusEncaminhamentos(3)).filter(m => m.recebidoEm).map(m => m.id);
    avisos.length = 0;
    const r = await D.reenviarAvisos([...pend, ...conf], { id: 2, nome: 'Bia' });
    expect(r).toEqual({ reenviados: pend.length, ignorados: conf.length });
    expect(avisos.every(a => a.porNome === 'Bia (lembrete)')).toBe(true);
  });

  it('venda lançada finaliza sozinho; repassar fecha o anterior como repassado', async () => {
    expect(await D.finalizarPorEvento(10, 'vendido', 'Contrato BJ-001 · chácara A01')).toBe(1);
    const ana = (await D.meusEncaminhamentos(3)).find(m => m.lead === 'Ana Lead')!;
    expect([ana.situacao, ana.desfecho]).toEqual(['finalizado', 'vendido']);
    expect(await D.encaminhamentoAbertoDoLead(10, 3)).toBeNull();
    db.run(sql`INSERT INTO leadQualifications (id, phone, nome) VALUES (13, '5599944440000', 'Duda Lead')`);
    await D.encaminharManual([13], 3, { id: 2, nome: 'Bia' });
    await D.encaminharManual([13], 1, { id: 2, nome: 'Bia' });
    const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const r = await D.relatorioEncaminhamentos({ de: hoje, ate: hoje, origem: 'manual' });
    const duda = r.itens.filter(i => i.lead === 'Duda Lead');
    expect(duda.map(i => [i.para, i.desfecho])).toEqual(expect.arrayContaining([['Corretor Caio', 'repassado'], ['José', null]]));
    expect(r.resumo.vendidos).toBe(1);
    expect(D.csvRelatorio(r.itens)).toContain(';Finalizado;');
  });
});
