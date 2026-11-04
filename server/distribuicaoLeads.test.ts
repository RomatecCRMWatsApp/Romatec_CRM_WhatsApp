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

  it('encaminha em lote, avisa o corretor e não conta de novo quem já era dele', async () => {
    const r = await D.encaminharManual([10, 11, 12], 3, { id: 2, nome: 'Secretária Bia' }, 'Cliente prefere manhã');
    expect(r).toEqual({ encaminhados: 2, jaEram: 1, naoEncontrados: 0, para: 'Corretor Caio' });
    expect(avisos.map(a => a.leadId).sort()).toEqual([10, 11]);
    const [l]: any[] = db.all(sql`SELECT responsavelId FROM leadQualifications WHERE id = 10`);
    expect(l.responsavelId).toBe(3);
    await expect(D.encaminharManual([10], 4, { id: 2, nome: 'Bia' })).rejects.toThrow(/não encontrado/);
  });

  it('relatório: quem encaminhou, de quem para quem, filtros e CSV', async () => {
    await D.registrarEncaminhamento({ leadId: 12, deId: 3, paraId: 1, origem: 'automatico', observacao: 'Roleta: sem atendimento em 15 min' });
    const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const todos = await D.relatorioEncaminhamentos({ de: hoje, ate: hoje });
    expect(todos.resumo).toEqual({ total: 3, manual: 2, automatico: 1 });
    const manual = await D.relatorioEncaminhamentos({ de: hoje, ate: hoje, origem: 'manual' });
    expect(manual.itens.map(i => [i.lead, i.de, i.para, i.por, i.observacao])).toEqual(expect.arrayContaining([
      ['Ana Lead', null, 'Corretor Caio', 'Secretária Bia', 'Cliente prefere manhã'], ['Beto Lead', null, 'Corretor Caio', 'Secretária Bia', 'Cliente prefere manhã'],
    ]));
    expect(manual.porCorretor).toEqual([{ corretor: 'Corretor Caio', total: 2, manual: 2, automatico: 0 }]);
    const auto = await D.relatorioEncaminhamentos({ de: hoje, ate: hoje, paraId: 1 });
    expect(auto.itens[0]).toMatchObject({ origem: 'automatico', por: 'Automático (roleta)', de: 'Corretor Caio', para: 'José', continuaCom: 'não' });
    const csv = D.csvRelatorio(manual.itens);
    expect(csv.startsWith('﻿Data e hora;Tipo;Lead')).toBe(true);
    expect(csv).toContain(';Manual;Ana Lead;+5599911110000;');
    await expect(D.relatorioEncaminhamentos({ de: hoje, ate: '2020-01-01' })).rejects.toThrow(/data final/);
  });
});
