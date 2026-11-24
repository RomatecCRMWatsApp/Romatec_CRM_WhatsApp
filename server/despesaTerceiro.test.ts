import { beforeAll, describe, expect, it } from 'vitest';
import { resumoTerceiros } from '../shared/despesas';

// Despesa bancada por terceiro (empréstimo, permuta…): dívida do empreendimento, devolução e ciência. Banco em memória.
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { dividirComissaoConcessao } = await import('./financeiro/comissoesConcessao');
const { saldoLivre } = await import('./financeiro/saldoProprietaria');
const R = await import('./financeiro/renegociacao');
const C = await import('./financeiro/despesaCiencia');
const D = await import('./financeiro/despesas');
const F = await import('./financeiro/relatorios');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

describe('comissão das concessões: 5% = 3% escritório + 2% corretor', () => {
  it('corretor de fora fica com 2%, o escritório com 3%', () => {
    expect(dividirComissaoConcessao(7500, 0.05, 0.02, false)).toMatchObject({ escritorio: 4500, corretor: 3000, pctEscritorio: 3, pctCorretor: 2 });
  });
  it('corretor do escritório (o administrador): valor integral do escritório', () => {
    expect(dividirComissaoConcessao(7843.23, 0.05, 0.02, true)).toMatchObject({ escritorio: 7843.23, corretor: 0, pctEscritorio: 5 });
  });
});

describe('dívida com terceiros', () => {
  it('só despesa paga com recurso de terceiro vira dívida; devolução abate', () => {
    const r = resumoTerceiros([
      { status: 'paga', origemRecurso: 'terceiro', terceiroNome: 'José Romário', valor: 13000, valorPago: 13000 },
      { status: 'paga', origemRecurso: 'terceiro', terceiroNome: 'José Romário', valor: 12000, valorPago: 12000, reembolsadoEm: '2026-12-10', reembolsoValor: 12000 },
      { status: 'paga', origemRecurso: 'caixa', terceiroNome: null, valor: 12000 },
      { status: 'aberta', origemRecurso: 'terceiro', terceiroNome: 'Outro', valor: 500 },
    ]);
    expect(r.porTerceiro).toEqual([{ terceiro: 'José Romário', bancado: 25000, devolvido: 12000, emAberto: 13000 }]);
    expect(r.emAberto).toBe(13000);
  });
  it('saldo livre da proprietária desconta comissões e dívida', () => {
    expect(saldoLivre({ saldoCaixa: 18000, comissoesDevidas: 1000, concessoesAPagar: 7500, dividaTerceiros: 13000 })).toMatchObject({ descontos: 21500, saldo: -3500 });
  });
});

describe('despesa bancada por terceiro', () => {
  let db: any;
  const msgs: [string, string][] = [];
  beforeAll(async () => {
    db = await getDb();
    R.definirEnviador(async (t, m) => { msgs.push([t, m]); });
    C.definirEnviadorPdf(async () => {});
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
    db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{}', ${JSON.stringify({ vend_nome: 'VERA PROPRIETARIA FICTICIA', vend_cpf: '111.444.777-35', vend_telefone: '(99) 9 9000-0001' })})`);
  });

  it('recurso de terceiro exige empreendimento e quem pagou', async () => {
    const base = { descricao: 'Abertura das ruas', categoria: 'obras', valor: 13000, vencimento: '2026-11-20' } as any;
    await expect(D.lancarDespesa({ ...base, origemRecurso: 'terceiro', terceiroNome: 'José' }, 1)).rejects.toThrow(/empreendimento/);
    await expect(D.lancarDespesa({ ...base, empreendimentoId: 1, origemRecurso: 'terceiro' }, 1)).rejects.toThrow(/quem pagou/);
  });

  it('não sai do caixa; vira dívida; a devolução sai do caixa na data; a ciência reconhece o débito', async () => {
    const caixa = await D.lancarDespesa({ descricao: 'Abertura das ruas (caixa)', categoria: 'obras', empreendimentoId: 1, fornecedor: 'Construsul', valor: 12000, vencimento: '2026-11-24', pagoEm: '2026-11-24', formaPagamento: 'PIX' } as any, 1);
    const terc = await D.lancarDespesa({ descricao: 'Abertura das ruas (empréstimo)', categoria: 'obras', empreendimentoId: 1, fornecedor: 'Construsul', valor: 13000, vencimento: '2026-11-20', pagoEm: '2026-11-20', formaPagamento: 'PIX',
      origemRecurso: 'terceiro', terceiroNome: 'José Romário Pinto Bezerra', terceiroModalidade: 'emprestimo', terceiroFinalidade: 'Pagar a abertura das ruas' } as any, 1);
    let f = await F.fluxoCaixa('2026-11-01', '2026-11-30', 'mes', '2026-11-30', 1);
    expect(f.totalSaidas).toBe(12000);
    expect(f.bancadoNoPeriodo).toBe(13000);
    expect(f.terceiros.emAberto).toBe(13000);

    const lista = await D.listarDespesas({ empreendimentoId: 1, situacao: 'todas' });
    expect(lista.terceiros.emAberto).toBe(13000);
    expect(lista.linhas.find(l => l.id === terc.ids[0])).toMatchObject({ origemRecurso: 'terceiro', rotuloModalidade: 'Empréstimo', terceiroNome: 'José Romário Pinto Bezerra' });

    await C.pedirCiencia(terc.ids[0], 1);
    expect(msgs.at(-1)![1]).toMatch(/Não saiu do caixa do empreendimento: foi pago com recurso de José Romário Pinto Bezerra \(empréstimo: Pagar a abertura das ruas\)/);

    await expect(D.registrarReembolso(caixa.ids[0], { em: '2026-12-05', forma: 'PIX' }, 1, '2026-12-31')).rejects.toThrow(/caixa/);
    await D.registrarReembolso(terc.ids[0], { em: '2026-12-05', forma: 'PIX' }, 1, '2026-12-31');
    f = await F.fluxoCaixa('2026-12-01', '2026-12-31', 'mes', '2026-12-31', 1);
    expect(f.totalSaidas).toBe(13000);
    expect(f.terceiros.emAberto).toBe(0);
    expect(f.porCategoria[0].categoria).toMatch(/Devolução a terceiros/);
  });

  it('corrige a origem de uma despesa já paga (caixa → terceiro)', async () => {
    const r = await D.lancarDespesa({ descricao: 'Cascalho', categoria: 'obras', empreendimentoId: 1, valor: 500, vencimento: '2026-11-10', pagoEm: '2026-11-10', formaPagamento: 'PIX' } as any, 1);
    await D.definirOrigem(r.ids[0], { origemRecurso: 'terceiro', terceiroNome: 'Romatec Consultoria Total', terceiroModalidade: 'adiantamento' }, 1);
    const l = (await D.listarDespesas({ empreendimentoId: 1, situacao: 'todas' })).linhas.find(x => x.id === r.ids[0])!;
    expect(l).toMatchObject({ origemRecurso: 'terceiro', rotuloModalidade: 'Adiantamento' });
  });
});

describe('comissão paga pela proprietária sai do caixa', () => {
  it('lança a despesa Comissões já paga e o desfazer cancela', async () => {
    const S = await import('./financeiro/saidaComissao');
    const id = await S.lancarSaidaComissao({ empreendimentoId: 1, descricao: 'Comissão de gestão — B06', valor: 7500, pagoEm: '2026-11-25', forma: 'Pix', autorId: 1 });
    expect(id).toBeTruthy();
    let f = await F.fluxoCaixa('2026-11-25', '2026-11-25', 'dia', '2026-11-25', 1);
    expect(f.totalSaidas).toBe(7500);
    expect(f.porCategoria[0].categoria).toBe('Comissões');
    await S.cancelarSaidaComissao(`Recebido · despesa:#${id}`, 1);
    f = await F.fluxoCaixa('2026-11-25', '2026-11-25', 'dia', '2026-11-25', 1);
    expect(f.totalSaidas).toBe(0);
    expect(S.formaDespesa('Transferência')).toBe('TRANSFERENCIA');
  });
});
