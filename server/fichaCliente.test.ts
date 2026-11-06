import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { resumoParcelas, ordenarLinhaDoTempo, foneComparavel } = await import('../shared/fichaCliente');
const { fichaDoCliente } = await import('./fichaCliente');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

const ADMIN = { id: 1, perfil: null, role: 'admin' };
const CARLA = { id: 3, perfil: 'corretor', role: 'user' };
const MARCOS = { id: 4, perfil: 'corretor', role: 'user' };
const pAdmin = { perfil: 'admin' as const, modulos: null, acessos: [] };
const pCor = { perfil: 'corretor' as const, modulos: null, acessos: [] };
const t = (d: string) => `${d} 12:00:00`;

describe('ficha do cliente: regras', () => {
  it('resumo das parcelas: recebido, em aberto, vencido, atraso e próxima', () => {
    const r = resumoParcelas([
      { valor: 1000, vencimento: '2026-10-05', status: 'paga', valorPago: 1000, pagoEm: '2026-10-05' },
      { valor: 1000, vencimento: '2026-10-20', status: 'vencida' },
      { valor: 1000, vencimento: '2026-11-20', status: 'emitida' },
      { valor: 999, vencimento: '2026-12-20', status: 'cancelada' },
    ], '2026-11-06');
    expect(r).toMatchObject({ total: 3, pagas: 1, contratado: 3000, recebido: 1000, emAberto: 2000, vencido: 1000, parcelasVencidas: 1, diasAtraso: 17, situacao: 'em_atraso' });
    expect(r.proxima).toEqual({ vencimento: '2026-11-20', valor: 1000 });
    expect(resumoParcelas([{ valor: 5, vencimento: '2026-01-01', status: 'paga' }], '2026-11-06').situacao).toBe('quitado');
    expect(resumoParcelas([], '2026-11-06').situacao).toBe('sem_parcelas');
  });
  it('linha do tempo: mais recente primeiro, sem datas inválidas', () => {
    const l = ordenarLinhaDoTempo([
      { tipo: 'lead', quando: '2026-10-01T10:00:00Z', titulo: 'a' }, { tipo: 'visita', quando: 'x', titulo: 'b' }, { tipo: 'contrato', quando: '2026-11-01T10:00:00Z', titulo: 'c' },
    ]);
    expect(l.map(e => e.titulo)).toEqual(['c', 'a']);
  });
  it('telefone comparável sem o 55', () => {
    expect(foneComparavel('+55 (99) 9 1111-2222')).toBe('99911112222');
  });
});

describe('ficha do cliente: junta lead, comprador e contrato', () => {
  beforeAll(async () => {
    const db: any = await getDb();
    db.run(sql`INSERT INTO users (id, openId, name, role, perfil, ativo) VALUES (1,'a','Admin Teste','admin',NULL,1), (3,'c','Carla Fictícia','user','corretor',1), (4,'m','Marcos Exemplo','user','corretor',1)`);
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims')`);
    // Lead da Carla, com conversa, visita e encaminhamento
    db.run(sql`INSERT INTO leadQualifications (id, phone, nome, score, responsavelId, origem, createdAt, updatedAt) VALUES (10, '5599911112222', 'João Cliente', 'quente', 3, 'instagram_ads', ${t('2026-10-01')}, ${t('2026-10-02')})`);
    db.run(sql`INSERT INTO leadMensagens (leadId, direcao, autor, texto, createdAt) VALUES (10, 'in', 'lead', 'Quero conhecer a chácara', ${t('2026-10-01')}), (10, 'out', 'ia', 'Claro! Vou te passar para a Carla', ${t('2026-10-01')})`);
    db.run(sql`INSERT INTO leadVisitas (leadId, quando, local, status, responsavelId) VALUES (10, ${t('2026-10-10')}, 'Portal do Bom Jardims', 'realizada', 3)`);
    db.run(sql`INSERT INTO leadEncaminhamentos (leadId, paraId, origem, criadoEm) VALUES (10, 3, 'automatico', ${t('2026-10-01')})`);
    // Comprador cadastrado no contrato, sem leadId: liga pelo telefone
    db.run(sql`INSERT INTO pessoas (id, nome, cpfCnpj, telefone1, cidade, uf) VALUES (20, 'João Cliente da Silva', '11144477735', '(99) 9 1111-2222', 'Açailândia', 'MA')`);
    db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, codigoVerificacao, status, criadoEm) VALUES (30, 'BJ-0042', 1, 'B13', 3, '{}', '{}', 'AAAABBBBCCCC', 'assinado', ${t('2026-10-15')})`);
    db.run(sql`INSERT INTO contratoPessoas (contratoId, pessoaId, papel) VALUES (30, 20, 'comprador')`);
    db.run(sql`INSERT INTO cobrancas (contratoId, tipo, numero, total, vencimento, valor, status, pagoEm, valorPago) VALUES
      (30, 'entrada', 1, 1, '2026-10-15', '8000.00', 'paga', '2026-10-15', '8000.00'),
      (30, 'saldo', 1, 120, '2026-10-30', '1234.51', 'vencida', NULL, NULL),
      (30, 'saldo', 2, 120, '2099-11-30', '1234.51', 'emitida', NULL, NULL)`);
  });

  it('pelo lead: acha o comprador pelo telefone, o contrato, as parcelas e monta a linha do tempo', async () => {
    const f = await fichaDoCliente({ leadId: 10 }, ADMIN, pAdmin);
    expect(f.nome).toBe('João Cliente da Silva');
    expect(f).toMatchObject({ leadId: 10, pessoaId: 20 });
    expect(f.contato.documento).toBe('11144477735');
    expect(f.contratos.map(c => c.numero)).toEqual(['BJ-0042']);
    expect(f.resumo).toMatchObject({ contratos: 1, recebido: 8000, parcelasVencidas: 1, situacao: 'em_atraso' });
    expect(f.conversa.map(m => m.texto)).toContain('Quero conhecer a chácara');
    expect(f.visitas[0]).toMatchObject({ rotulo: 'realizada', com: 'Carla Fictícia' });
    const tipos = f.linhaDoTempo.map(e => e.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['lead', 'visita', 'encaminhamento', 'contrato', 'pagamento']));
    expect(f.documentos).toEqual([]);
  });

  it('pelo comprador chega ao mesmo cliente (e ao lead pelo telefone)', async () => {
    const f = await fichaDoCliente({ pessoaId: 20 }, ADMIN, pAdmin);
    expect(f).toMatchObject({ leadId: 10, pessoaId: 20 });
    expect(f.lead?.responsavel).toBe('Carla Fictícia');
  });

  it('corretor responsável abre, com o CPF mascarado; outro corretor não abre', async () => {
    const f = await fichaDoCliente({ leadId: 10 }, CARLA, pCor);
    expect(f.contato.documento).toBe('***444777**');
    expect(f.contratos).toHaveLength(1);
    await expect(fichaDoCliente({ leadId: 10 }, MARCOS, pCor)).rejects.toThrow(/não está com você/);
    await expect(fichaDoCliente({ leadId: 10 }, { id: 9, perfil: 'empreendedor' }, { perfil: 'empreendedor', modulos: null, acessos: [] })).rejects.toThrow(/equipe de vendas/);
  });

  it('cliente que não existe', async () => {
    await expect(fichaDoCliente({ leadId: 999 }, ADMIN, pAdmin)).rejects.toThrow(/não encontrado/);
  });
});
