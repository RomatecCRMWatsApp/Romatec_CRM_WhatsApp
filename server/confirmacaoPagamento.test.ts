import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { simular } from '../shared/simulador';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = 'segredo-de-teste';
process.env.ASAAS_API_KEY = '$aact_hmlg_teste_ficticio';
delete process.env.AVISO_PAGAMENTO_WHATSAPP;

const { textoConfirmacao, versiculoDo, VERSICULOS, saudacao } = await import('../shared/confirmacaoPagamento');
const CP = await import('./financeiro/confirmacaoPagamento');
const S = await import('./financeiro/servico');
const { compensarPagamento } = await import('./financeiro/compensacao');
const { tokenPix, cobrancaDoTokenPix } = await import('./financeiro/links');
const { paginaPix } = await import('./financeiro/pixPublico');
const { planoDoContrato } = await import('./contratos/plano');
const schema = await import('../drizzle/schema');
const { getDb } = await import('./db');
const { sql, eq } = await import('drizzle-orm');

const C = {
  precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625,
  descontoAvistaTotal: 10000, jurosAaEfetivo: 0.06, metodo: 'PRICE' as const, prazos: [12, 24, 36, 60, 120],
  comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5,
};
const plano = planoDoContrato(simular(3025.11, 6, C), { modalidade: 'financiado', prazo: 120, dataPrimeiroPagamento: '2026-12-10' }, C, false);

const msgs: { tel: string; tipo: 'texto' | 'doc'; txt: string }[] = [];
let falhar = false;
let db: any;

beforeAll(async () => {
  CP.definirEnviadorConfirmacao({
    texto: async (tel, txt) => { if (falhar) throw new Error('Z-API fora do ar'); msgs.push({ tel, tipo: 'texto', txt }); },
    documento: async (tel, d) => { if (falhar) throw new Error('Z-API fora do ar'); msgs.push({ tel, tipo: 'doc', txt: d.legenda ?? '' }); },
  });
  db = await getDb();
  db.run(sql`INSERT INTO users (id, openId, name, role, telefone, ativo) VALUES (1, 'a', 'Admin Exemplo', 'admin', '99999990099', 1)`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
  db.run(sql`INSERT INTO lotes (id, empreendimentoId, codigo, quadra, numero, areaM2, situacao) VALUES (5, 1, 'A05', 'A', 5, '3025.11', 'vendido_parcelado')`);
  const chave = createHash('sha256').update(process.env.ASAAS_API_KEY!).digest('hex').slice(0, 16);
  const benef = JSON.stringify({ nome: 'Vendedora Exemplo', cpfCnpj: '00000000191', agenciaConta: '0001/1', atualizadoEm: new Date().toISOString(), chave });
  db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson, asaasBeneficiario) VALUES (1, '{}', '{"vend_nome":"Vendedora Exemplo"}', ${benef})`);
  db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, status, codigoVerificacao)
    VALUES (1, 'BJ-2026-0001', 1, 5, 'A05', 1, ${JSON.stringify(plano)}, '{}', 'assinado', 'COD00000001A')`);
  db.run(sql`INSERT INTO pessoas (id, nome, cpfCnpj, telefone1) VALUES (1, 'Maria Exemplo da Silva', '52998224725', '99999990001')`);
  db.run(sql`INSERT INTO contratoPessoas (contratoId, pessoaId, papel) VALUES (1, 1, 'comprador')`);
  db.run(sql`INSERT INTO cobrancas (id, contratoId, tipo, numero, total, vencimento, valor, status, asaasPaymentId, bankSlipUrl, pixPayload) VALUES
    (11, 1, 'saldo', 1, 120, '2026-12-10', '1500.00', 'emitida', 'pay_1', 'https://boleto.exemplo/1', 'PIX-1'),
    (12, 1, 'saldo', 2, 120, '2027-01-10', '1500.00', 'emitida', 'pay_2', 'https://boleto.exemplo/2', 'PIX-2'),
    (13, 1, 'saldo', 3, 120, '2027-02-10', '1500.00', 'prevista', NULL, NULL, NULL)`);
});

describe('mensagem de confirmação (regras)', () => {
  it('versículo em rodízio (nº do pagamento módulo 11) e saudação pelo horário', () => {
    expect(VERSICULOS).toHaveLength(11);
    expect(versiculoDo(1).ref).toBe('Salmos 107:1');
    expect(versiculoDo(11).ref).toBe('1 Tessalonicenses 5:18');
    expect(saudacao(Date.parse('2026-11-07T12:00:00Z'), 2)).toBe('Bom dia'); // 9h em Brasília
    expect(saudacao(Date.parse('2026-11-07T12:00:00Z'), 0)).toBe('Olá');
  });
  it('quitação total muda a linha das parcelas em aberto', () => {
    const base = { numeroPagamento: 11, comprador: 'MARIA EXEMPLO', contrato: 'BJ-1', lote: 'A05', empreendimento: 'Bom Jardims', parcelas: [{ rotulo: 'Saldo 120/120', vencimento: '2036-11-10', valor: 1500, quitada: true }], valorRecebido: 1500, pagoEm: '2036-11-07', forma: 'Pix', reciboNumero: 'REC-1', assinatura: 'Romatec Consultoria Total · CRECI J-1234' };
    expect(textoConfirmacao({ ...base, abertas: { qtd: 0, valor: 0 } })).toMatch(/todas as suas parcelas estão quitadas/);
    const t = textoConfirmacao({ ...base, abertas: { qtd: 2, valor: 3000 } });
    expect(t).toMatch(/Parcelas em aberto: 2/);
    expect(t).toMatch(/Em tudo dai graças/);
    expect(t).toMatch(/CRECI J-1234/);
  });
});

describe('confirmação no WhatsApp (pagamento pelo Asaas)', () => {
  let reciboId = 0;
  it('o pagamento confirmado manda a gratidão + recibo ao comprador e o aviso ao administrador, uma vez só', async () => {
    const r = await S.processarEventoAsaas({ id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', value: 1500, billingType: 'PIX', paymentDate: '2026-11-07' } }, { enviarDepois: id => { reciboId = id; } });
    expect(r.acao).toBe('pago:recibo_emitido');
    const env = await S.enviarRecibo(reciboId);
    expect(env.enviado).toBe(true);
    const doComprador = msgs.filter(m => m.tel === '5599999990001');
    expect(doComprador.map(m => m.tipo)).toEqual(['texto', 'doc']);
    expect(doComprador[0].txt).toMatch(/Recebemos o seu pagamento/);
    expect(doComprador[0].txt).toMatch(/Parcelas em aberto: 2/);
    const admin = msgs.filter(m => m.tel === '5599999990099');
    expect(admin).toHaveLength(1);
    expect(admin[0].txt).toMatch(/Pagamento recebido/);
    expect(admin[0].txt).toMatch(/avisado\(a\) no WhatsApp/);
    // Webhook repetido ou vigia: não manda de novo
    await S.enviarRecibo(reciboId);
    await CP.vigiaConfirmacoes();
    expect(msgs).toHaveLength(3);
  });

  it('WhatsApp fora do ar: fica pendente e o vigia completa depois, sem repetir', async () => {
    const r = await S.processarEventoAsaas({ id: 'evt_2', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_2', value: 1500, billingType: 'BOLETO', paymentDate: '2026-11-08' } }, { enviarDepois: () => {} });
    falhar = true;
    const env = await S.enviarRecibo(r.reciboId!);
    expect(env.enviado).toBe(false);
    falhar = false;
    const antes = msgs.length;
    const v = await CP.vigiaConfirmacoes();
    expect(v.enviados).toBe(1);
    expect(msgs.length - antes).toBe(3); // texto + recibo ao comprador + aviso ao administrador
  });
});

describe('Pix pelo link do boleto', () => {
  it('token assinado: abre só a sua cobrança', () => {
    const t = tokenPix(13);
    expect(cobrancaDoTokenPix(t)).toBe(13);
    expect(cobrancaDoTokenPix(t.replace(/^13\./, '12.'))).toBeNull();
    expect(cobrancaDoTokenPix('lixo')).toBeNull();
  });
  it('página: primeiro nome, parcela e Pix; boleto pago avisa', async () => {
    const paga = await paginaPix(tokenPix(11));
    expect(paga).toMatchObject({ situacao: 'paga', nome: 'Maria', lote: 'A05' });
    const sem = await paginaPix(tokenPix(13));
    expect(sem?.situacao).toBe('sem_pix');
  });
});

describe('compensação em outra parcela', () => {
  it('recusa origem igual ao destino e destino já pago', async () => {
    await expect(compensarPagamento({ deId: 12, paraId: 12 }, 1)).rejects.toThrow(/mesma/);
    await expect(compensarPagamento({ deId: 12, paraId: 11 }, 1)).rejects.toThrow(/quitada/);
  });
  it('pagou a parcela 2 no lugar da 3: o pagamento e o recibo passam para a 3, a 2 reabre', async () => {
    await db.update(schema.cobrancas).set({ status: 'emitida', asaasPaymentId: 'pay_3', bankSlipUrl: 'https://boleto.exemplo/3' } as any).where(eq(schema.cobrancas.id, 13));
    const chamadas: string[] = [];
    const fetchFn = async (url: string, init: { method: string }) => { chamadas.push(`${init.method} ${url}`); return { status: 200, text: async () => '{"deleted":true}' }; };
    const r = await compensarPagamento({ deId: 12, paraId: 13, cancelarBoleto: true, emitirBoleto: true }, 1, { fetchFn: fetchFn as any });
    expect(r).toMatchObject({ ok: true, de: 'Saldo 2/120', para: 'Saldo 3/120' });
    expect(chamadas.some(c => c.startsWith('DELETE') && c.includes('pay_3'))).toBe(true);
    expect(r.avisos.join(' ')).toMatch(/não ativo/); // contrato de teste está "assinado": boleto novo fica para depois
    const [de]: any[] = await db.select().from(schema.cobrancas).where(eq(schema.cobrancas.id, 12));
    const [para]: any[] = await db.select().from(schema.cobrancas).where(eq(schema.cobrancas.id, 13));
    expect(de).toMatchObject({ status: 'prevista', asaasPaymentId: null });
    expect(para).toMatchObject({ status: 'paga', asaasPaymentId: 'pay_2' });
    const [rec]: any[] = await db.select().from(schema.recibos).where(eq(schema.recibos.cobrancaId, 13));
    expect(rec).toBeTruthy();
  });
});
