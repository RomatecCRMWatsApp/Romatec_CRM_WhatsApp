import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = 'segredo-de-teste';
process.env.ASAAS_API_KEY = '$aact_hmlg_teste_ficticio';

const E = await import('./financeiro/emissaoAuto');
const S = await import('../drizzle/schema');
const { getDb } = await import('./db');
const { sql, eq } = await import('drizzle-orm');

const HOJE = '2026-11-10';
const AGORA = Date.parse(`${HOJE}T13:00:00Z`); // 10h em Brasília
const mes = (n: number, dia = 10) => { const d = new Date(Date.UTC(2026, 10 + n, dia)); return d.toISOString().slice(0, 10); };

/** Asaas falso: cada cobrança com id próprio */
function asaasFalso() {
  let n = 0;
  const criadas: any[] = [];
  const fetchFn = async (url: string, init: { method: string; body?: string }) => {
    let corpo: any;
    if (url.includes('/customers')) corpo = init.method === 'GET' ? { data: [] } : { id: 'cus_1' };
    else if (url.endsWith('/identificationField')) corpo = { identificationField: '4'.repeat(47), barCode: '9'.repeat(44), nossoNumero: 'NN' };
    else if (url.endsWith('/pixQrCode')) corpo = { payload: 'PIX', encodedImage: null };
    else { n++; corpo = { id: `pay_${n}`, status: 'PENDING', bankSlipUrl: `https://boleto.teste/${n}` }; if (init.body) criadas.push(JSON.parse(init.body)); }
    return { status: 200, text: async () => JSON.stringify(corpo) };
  };
  return { fetchFn, criadas };
}

describe('planejarEmissao (regras)', () => {
  const linhas = [
    { id: 1, tipo: 'entrada', numero: 1, vencimento: HOJE, status: 'prevista' },
    ...Array.from({ length: 23 }, (_, k) => ({ id: k + 2, tipo: 'saldo', numero: k + 1, vencimento: mes(k + 1), status: 'prevista' })),
  ];
  it('na assinatura sai o carnê 1 inteiro (entrada + 11 parcelas); o carnê 2 espera', () => {
    const p = E.planejarEmissao(linhas, HOJE, false);
    expect(p.blocos).toEqual([{ bloco: 1, ids: Array.from({ length: 12 }, (_, k) => k + 1) }]);
  });
  it('entrada paga no ato não vira boleto', () => {
    const p = E.planejarEmissao(linhas, HOJE, true);
    expect(p.entradaNoAto).toBe(1);
    expect(p.blocos[0].ids).not.toContain(1);
    expect(p.blocos[0].ids).toHaveLength(11);
  });
  it('o carnê 2 sai quando a 1ª parcela dele vence em até 45 dias', () => {
    const emitidas = linhas.map(l => (l.id <= 12 ? { ...l, status: 'emitida' } : l));
    expect(E.planejarEmissao(emitidas, mes(10, 1), false).blocos).toEqual([]); // 1ª do carnê 2 vence ~70 dias depois
    expect(E.planejarEmissao(emitidas, mes(11, 1), false).blocos.map(b => b.bloco)).toEqual([2]);
  });
  it('parcela prevista já vencida nunca sai sozinha (conta para o aviso)', () => {
    const p = E.planejarEmissao(linhas, mes(2), false); // dois meses depois, nada emitido
    expect(p.vencidasSemBoleto).toBe(2); // entrada e parcela 1
    expect(p.blocos[0].ids).not.toContain(1);
    expect(p.blocos[0].ids).not.toContain(2);
  });
  it('cadastro: aponta o que falta', () => {
    expect(E.faltasDoCadastro({ cpfCnpj: '123', cep: null, telefone1: '' })).toEqual(['CPF/CNPJ', 'endereço completo (CEP, rua, cidade e UF)', 'telefone']);
    expect(E.faltasDoCadastro({ cpfCnpj: '000.000.001-91', cep: '65930000', logradouro: 'Rua A', cidade: 'Açailândia', uf: 'MA', telefone1: '99999990001' })).toEqual([]);
  });
});

describe('emissão automática (banco e Asaas falso)', () => {
  beforeAll(async () => {
    const db: any = await getDb();
    db.run(sql`INSERT INTO users (id, openId, name, role, perfil, ativo) VALUES (1, 'a', 'Admin Teste', 'admin', NULL, 1)`);
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'bom-jardims', 'Bom Jardims')`);
    db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, codigoVerificacao, status) VALUES
      (1, 'BJ-T1', 1, 'B13', 1, '{"parcelas":[]}', '{}', 'COD000000001', 'ativo'),
      (2, 'BJ-T2', 1, 'C04', 1, '{"parcelas":[]}', '{}', 'COD000000002', 'ativo')`);
    // Titular da conta Asaas já lido (o fetch falso não responde a essa consulta)
    const chave = createHash('sha256').update(process.env.ASAAS_API_KEY!).digest('hex').slice(0, 16);
    const benef = JSON.stringify({ nome: 'Empresa Fictícia Ltda', cpfCnpj: '00000000000191', agenciaConta: '0001/1', atualizadoEm: new Date().toISOString(), chave });
    db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson, asaasBeneficiario) VALUES (1, '{}', '{}', ${benef})`);
    db.run(sql`INSERT INTO pessoas (id, nome, cpfCnpj, telefone1, cep, logradouro, numero, bairro, cidade, uf) VALUES
      (1, 'Maria Teste', '00000000191', '99999990001', '65930000', 'Rua A', '10', 'Centro', 'Açailândia', 'MA'),
      (2, 'João Sem Endereço', '00000000272', '99999990002', NULL, NULL, NULL, NULL, NULL, NULL)`);
    db.run(sql`INSERT INTO contratoPessoas (contratoId, pessoaId, papel) VALUES (1, 1, 'comprador'), (2, 2, 'comprador')`);
    for (const cid of [1, 2]) {
      db.run(sql`INSERT INTO cobrancas (contratoId, tipo, numero, total, vencimento, valor, status) VALUES (${cid}, 'entrada', 1, 1, ${HOJE}, '8000.00', 'prevista')`);
      for (let k = 1; k <= 23; k++) db.run(sql`INSERT INTO cobrancas (contratoId, tipo, numero, total, vencimento, valor, status) VALUES (${cid}, 'saldo', ${k}, 120, ${mes(k)}, '1200.00', 'prevista')`);
    }
  });

  it('desligada não emite nada', async () => {
    expect(await E.emitirAutomatico(1, { agora: AGORA, fetchFn: asaasFalso().fetchFn })).toMatchObject({ emitidas: 0, motivo: 'desligada' });
  });

  it('ligada: entrada paga no ato fica de fora; sai o resto do carnê 1 com boleto', async () => {
    await E.definirEmissaoAuto(true, 1);
    const db: any = await getDb();
    await db.update(S.contratos).set({ entradaPagaNoAto: true } as any).where(eq(S.contratos.id, 1));
    const a = asaasFalso();
    const r = await E.emitirAutomatico(1, { agora: AGORA, fetchFn: a.fetchFn });
    expect(r).toMatchObject({ emitidas: 11, motivo: null });
    const linhas: any[] = await db.select().from(S.cobrancas).where(eq(S.cobrancas.contratoId, 1));
    expect(linhas.find(l => l.tipo === 'entrada').status).toBe('prevista');
    expect(linhas.filter(l => l.status === 'emitida')).toHaveLength(11);
    expect(linhas.filter(l => l.status === 'emitida').every(l => l.asaasPaymentId && l.bankSlipUrl)).toBe(true);
    // Rodar de novo no mesmo dia não duplica
    expect((await E.emitirAutomatico(1, { agora: AGORA, fetchFn: a.fetchFn })).emitidas).toBe(0);
  });

  it('cadastro incompleto: não emite e avisa o escritório no sino', async () => {
    const r = await E.emitirAutomatico(2, { agora: AGORA, fetchFn: asaasFalso().fetchFn });
    expect(r.emitidas).toBe(0);
    expect(r.motivo).toMatch(/cadastro incompleto: endereço/);
    const db: any = await getDb();
    const avisos: any[] = await db.select().from(S.notificacoes).where(eq(S.notificacoes.tipo, 'cobranca_emissao'));
    expect(avisos.some(a => /BJ-T2/.test(a.mensagem) && /endereço/.test(a.mensagem))).toBe(true);
  });

  it('a prévia mostra o que falta e o que está pronto', async () => {
    const p = await E.previaEmissao(AGORA);
    expect(p.find(x => x.contratoId === 2)).toMatchObject({ carnes: [1], parcelas: 12 });
    expect(p.find(x => x.contratoId === 2)?.faltas.length).toBeGreaterThan(0);
  });
});
