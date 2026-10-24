import { beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { simular } from '../shared/simulador';

// Banco local em memória (SQLite) — mesmas tabelas da produção (initSqlite)
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = 'segredo-de-teste';
delete process.env.ASAAS_API_KEY_BOMJARDIMS;
delete process.env.ASAAS_API_KEY;

const { gerarPlano } = await import('./financeiro/plano');
const { calcularEncargos, somarDiasUteis, diasEntre } = await import('./financeiro/encargos');
const { planoDoContrato } = await import('./contratos/plano');
const S = await import('./financeiro/servico');
const { gerarCobrancasDoPlano, splitDaComissao } = await import('./financeiro/emissao');
const { blocoDoCarne, dadosCarne, dadosLamina, dadosParcela } = await import('./financeiro/dados');
const { renderBoletoA4, renderCarneV2 } = await import('./financeiro/render/documentos');
const { verificarRecibo, tokenConfere, corpoDoEvento } = await import('./financeiro/rotas');
const { assinarLink, linkValido } = await import('./financeiro/links');
const { lerSidra, segundoDiaUtilDeMaio, situacaoDoAno } = await import('./financeiro/jobs');
const schema = await import('../drizzle/schema');
const { getDb } = await import('./db');

const C = {
  precoBase: 160000, areaBaseM2: 3025.11, toleranciaAreaM2: 1, entradaPct: 0.3, entradaMaxParcelas: 6, descontoAvistaPct: 0.0625,
  descontoAvistaTotal: 10000, jurosAaEfetivo: 0.06, metodo: 'PRICE' as const, prazos: [12, 24, 36, 60, 120],
  comissaoTotalPct: 0.05, comissaoCorretorPct: 0.02, comissao1aParcelaPct: 0.5,
};
const plano = planoDoContrato(simular(3025.11, 6, C), { modalidade: 'financiado', prazo: 120, dataPrimeiroPagamento: '2026-12-10' }, C, false);
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Dados de pagamento no formato do Asaas (fictícios, com DV válido) */
function snapAsaas(n: number) {
  const base = `4619${String(1000 + n).padStart(4, '0')}${String(100000 + n).padStart(10, '0')}${String(n).padStart(25, '0')}`;
  let s = 0, peso = 2;
  for (let i = base.length - 1; i >= 0; i--) { s += +base[i] * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = 11 - (s % 11);
  const cod = `${base.slice(0, 4)}${r === 0 || r > 9 ? 1 : r}${base.slice(4)}`;
  return { identificationField: `46190000${String(n).padStart(39, '0')}`.slice(0, 47), barCode: cod, nossoNumero: `NN${n}`, pixPayload: `PIX-${n}`, pixQrBase64: null };
}

/** fetch falso do Asaas: registra as chamadas */
function asaasFalso() {
  const chamadas: { method: string; url: string; body?: any }[] = [];
  const fetchFn = async (url: string, init: { method: string; body?: string }) => {
    chamadas.push({ method: init.method, url, body: init.body ? JSON.parse(init.body) : undefined });
    const corpo = url.endsWith('/identificationField') ? { identificationField: '4'.repeat(47), barCode: '9'.repeat(44), nossoNumero: 'NOVO123' }
      : url.endsWith('/pixQrCode') ? { payload: 'PIX-NOVO', encodedImage: null } : { id: 'pay_1', status: 'PENDING', value: 0, dueDate: '' };
    return { status: 200, text: async () => JSON.stringify(corpo) };
  };
  return { chamadas, fetchFn };
}
const CFG = { apiKey: '$aact_hmlg_x', baseUrl: 'https://sandbox.test/v3', ambiente: 'sandbox' as const, walletComissao: 'wallet-romatec' };

let db: any;
const AGORA = new Date('2026-10-24T12:00:00Z');
beforeAll(async () => {
  db = await getDb();
  const { sql } = await import('drizzle-orm');
  // Seeds em SQL puro: no SQLite o drizzle (schema MySQL) não envia booleanos dos defaults
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'bom-jardims', 'Bom Jardims')`);
  db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, quadra, numero, areaM2) VALUES (1, 'A01', 'A', 1, '3025.11')`);
  db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{}', ${JSON.stringify({ vend_nome: 'VALMA', vend_cpf: '364.274.623-34' })})`);
  db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, status, codigoVerificacao)
    VALUES (1, 'BJ-2026-0001', 1, 'A01', 1, ${JSON.stringify(plano)}, '{}', 'ativo', 'ABCDEFGHJKLM')`);
  db.run(sql`INSERT INTO pessoas (id, nome, cpfCnpj, telefone1) VALUES (1, 'Fulano de Tal', '52998224725', '99991234567')`);
  db.run(sql`INSERT INTO contratoPessoas (contratoId, pessoaId, papel) VALUES (1, 1, 'comprador')`);
  await gerarCobrancasDoPlano(1, plano);
});

const cobrancaDe = async (tipo: string, numero: number) => {
  const rs = await db.select().from(schema.cobrancas);
  return rs.find((r: any) => r.tipo === tipo && Number(r.numero) === numero);
};

describe('1. plano de amortização (Price)', () => {
  it('referência: saldo 112.000, 120×, 6% a.a. → PMT 1.234,51; saldo após a 12ª 103.502,78; amortizações = 112.000,00; saldo final 0', () => {
    const { pmt, linhas } = gerarPlano({ saldo: 112000, meses: 120, taxaAA: 0.06, primeiraSaldo: '2027-06-10' });
    expect(pmt).toBe(1234.51);
    expect(linhas[11].saldoApos).toBe(103502.78);
    expect(Math.abs(r2(linhas.reduce((s, l) => s + l.amortizacao, 0)) - 112000)).toBeLessThanOrEqual(0.01);
    expect(linhas.at(-1)!.saldoApos).toBe(0);
    expect(linhas.every(l => l.valor === 1234.51)).toBe(true);
  });

  it('entrada sem juros; cobranças gravadas com juros, amortização e saldo após; split 50/50 da comissão na entrada', async () => {
    const { linhas } = gerarPlano({ saldo: 112000, meses: 120, taxaAA: 0.06, primeiraSaldo: '2027-06-10', entrada: { parcelas: 6, valor: 8000, primeira: '2026-12-10' } });
    expect(linhas.slice(0, 6).every(l => l.juros === 0 && l.amortizacao === 8000)).toBe(true);
    expect(await db.select().from(schema.cobrancas)).toHaveLength(126);
    const s12 = await cobrancaDe('saldo', 12);
    expect(Number(s12.saldoDevedor)).toBe(103502.78);
    expect(Number(s12.jurosParcela)).toBe(507.34);
    expect(Number((await cobrancaDe('entrada', 1)).splitValor) + Number((await cobrancaDe('entrada', 2)).splitValor)).toBe(8000);
    expect(Number((await cobrancaDe('entrada', 3)).splitValor)).toBe(0);
    expect(await gerarCobrancasDoPlano(1, plano)).toBe(0); // idempotente
    const avista = planoDoContrato(simular(3025.11, 1, C), { modalidade: 'avista', dataPrimeiroPagamento: '2026-12-10' }, C, true);
    expect(splitDaComissao(avista).get('avista:1')).toBe(7500);
  });
});

describe('2. encargos da 2ª via', () => {
  it('18 dias sem IPCA: multa 2% e juros 0,6%; 0 dias sem encargos', () => {
    const e = calcularEncargos(1234.51, '2027-07-10', '2027-07-28');
    expect(e.dias).toBe(18);
    expect(e.semIpca).toBe(true);
    expect(e.multa).toBe(24.69);
    expect(e.juros).toBe(7.41);
    expect(e.total).toBe(1266.61);
    const zero = calcularEncargos(1234.51, '2027-07-10', '2027-07-10');
    expect(zero).toMatchObject({ dias: 0, multa: 0, juros: 0, total: 1234.51 });
  });

  it('IPCA pro rata die entra antes da multa e dos juros', () => {
    const e = calcularEncargos(1000, '2027-07-01', '2027-08-01', new Map([['2027-07', 0.5]]));
    expect(e.corrigido).toBe(1005);
    expect(e.multa).toBe(20.1);
  });

  it('novo vencimento = hoje + 2 dias úteis (pula fim de semana e feriado)', () => {
    expect(somarDiasUteis('2027-07-30', 2)).toBe('2027-08-03'); // sexta → terça
    expect(somarDiasUteis('2027-12-23', 2)).toBe('2027-12-27'); // pula o Natal
  });
});

describe('3. 2ª via atualizada', () => {
  it('vencida há mais de 59 dias → 409 negociacao_necessaria', async () => {
    const c = await cobrancaDe('entrada', 1);
    await db.update(schema.cobrancas).set({ status: 'vencida', asaasPaymentId: 'pay_e1', asaasSnapshot: snapAsaas(1) }).where((await import('drizzle-orm')).eq(schema.cobrancas.id, c.id));
    const hoje = somarDiasUteis(c.vencimento, 0);
    const d60 = new Date(Date.parse(`${hoje}T12:00:00Z`) + 60 * 86400000).toISOString().slice(0, 10);
    expect(diasEntre(c.vencimento, d60)).toBe(60);
    await expect(S.segundaVia(c.id, { hoje: d60, cfg: CFG })).rejects.toMatchObject({ codigo: 'negociacao_necessaria', status: 409 });
  });

  it('até 59 dias: PUT no Asaas com encargos embutidos e multa/juros zerados; guarda o original só na 1ª vez', async () => {
    const c = await cobrancaDe('entrada', 1);
    const { eq } = await import('drizzle-orm');
    const hoje = '2026-12-28';
    const { chamadas, fetchFn } = asaasFalso();
    const r = await S.segundaVia(c.id, { hoje, cfg: CFG, fetchFn, modelo: true });
    const put = chamadas.find(x => x.method === 'PUT')!;
    expect(put.url).toBe('https://sandbox.test/v3/payments/pay_e1');
    expect(put.body).toMatchObject({ value: r.total, dueDate: r.novoVencimento, fine: { value: 0 }, interest: { value: 0 } });
    expect(r.valorOriginal).toBe(8000);
    const [depois] = await db.select().from(schema.cobrancas).where(eq(schema.cobrancas.id, c.id));
    expect(Number(depois.valorOriginal)).toBe(8000);
    expect(depois.nossoNumero).toBe('NOVO123');
    expect((await PDFDocument.load(r.pdf)).getPageCount()).toBe(1);
    // 2ª via de novo: o original continua o primeiro
    await db.update(schema.cobrancas).set({ status: 'vencida', vencimento: '2026-12-30' }).where(eq(schema.cobrancas.id, c.id));
    await S.segundaVia(c.id, { hoje: '2027-01-05', cfg: CFG, fetchFn });
    const [outra] = await db.select().from(schema.cobrancas).where(eq(schema.cobrancas.id, c.id));
    expect(Number(outra.valorOriginal)).toBe(8000);
    expect(String(outra.vencimentoOriginal).slice(0, 10)).toBe('2026-12-10');
  });

  it('Asaas sem chave: 2ª via recusada (cobrança dormente)', async () => {
    const c = await cobrancaDe('entrada', 2);
    const { eq } = await import('drizzle-orm');
    await db.update(schema.cobrancas).set({ status: 'vencida', asaasPaymentId: 'pay_e2' }).where(eq(schema.cobrancas.id, c.id));
    await expect(S.segundaVia(c.id, { hoje: '2027-01-15', cfg: null })).rejects.toMatchObject({ codigo: 'ASAAS_NAO_CONFIGURADO', status: 503 });
  });
});

describe('4. webhook do Asaas → recibo', () => {
  it('evento repetido (e RECEIVED + CONFIRMED) gera um único recibo; envio fora do processamento', async () => {
    const c = await cobrancaDe('entrada', 3);
    const { eq } = await import('drizzle-orm');
    await db.update(schema.cobrancas).set({ status: 'emitida', asaasPaymentId: 'pay_e3', asaasSnapshot: snapAsaas(3) }).where(eq(schema.cobrancas.id, c.id));
    const enviados: number[] = [];
    const ev = { id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_e3', value: 8000, billingType: 'PIX', paymentDate: '2027-02-09' } };
    const a = await S.processarEventoAsaas(ev, { enviarDepois: id => enviados.push(id) });
    const b = await S.processarEventoAsaas(ev, { enviarDepois: id => enviados.push(id) });
    const c2 = await S.processarEventoAsaas({ ...ev, id: 'evt_2', event: 'PAYMENT_CONFIRMED' }, { enviarDepois: id => enviados.push(id) });
    expect(a.acao).toBe('pago:recibo_emitido');
    expect(b.acao).toBe('duplicado');
    expect(c2.acao).toBe('pago:recibo_ja_existia');
    const rs = await db.select().from(schema.recibos);
    expect(rs).toHaveLength(1);
    expect(rs[0].numero).toBe('REC-BJ-2027-000001');
    expect(rs[0].codigoVerif).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(enviados).toEqual([rs[0].id]);
    const [paga] = await db.select().from(schema.cobrancas).where(eq(schema.cobrancas.id, c.id));
    expect(paga).toMatchObject({ status: 'paga', formaPagamento: 'PIX' });
    expect(await S.enviarRecibo(rs[0].id)).toMatchObject({ enviado: false }); // Asaas sem chave: nada vai para o cliente
  });

  it('pagamento de cobrança que não é do CRM é ignorado; token do webhook comparado com segurança', async () => {
    expect((await S.processarEventoAsaas({ id: 'evt_x', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_outro' } })).acao).toBe('ignorado:nao_e_do_crm');
    expect(tokenConfere('abc', 'abc')).toBe(true);
    expect(tokenConfere('abd', 'abc')).toBe(false);
    expect(tokenConfere('', 'abc')).toBe(false);
    expect(corpoDoEvento('{"event":"PAYMENT_RECEIVED"}')).toEqual({ event: 'PAYMENT_RECEIVED' });
  });
});

describe('5. renders', () => {
  const ctx = {
    contrato: { id: 1, numero: 'BJ-2026-0001', modeloVersao: 'CPCV-BJ v2.0', codigoVerificacao: 'ABCDEFGHJKLM' },
    lote: { codigo: 'A01', quadra: 'A', areaM2: 3025.11 }, comprador: { nome: 'FULANO', cpfCnpj: '52998224725', endereco: 'Rua A' },
    beneficiario: 'VALMA', agenciaCodigo: '0001 / 0000000-0', urlPublica: 'https://romateccrm.com', plano,
  };
  const cobs = plano.parcelas.map((p, i) => ({ id: i + 1, ...p, asaas: snapAsaas(i), dataDocumento: '2026-10-24' }));

  it('carnê v2 com 18 cobranças → 9 páginas; boleto A4 → 1 página', async () => {
    const pdf = await renderCarneV2(dadosCarne(ctx, cobs.slice(0, 18), 1), { modelo: true });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(9);
    const a4 = await renderBoletoA4(dadosParcela(ctx, cobs[7], cobs), { modelo: true });
    expect((await PDFDocument.load(a4)).getPageCount()).toBe(1);
  });

  it('carnê anual: 12 parcelas por carnê, contadas do início; "completo" traz todas', () => {
    const b1 = blocoDoCarne(cobs, 1), b2 = blocoDoCarne(cobs, 2);
    expect(b1).toHaveLength(12);
    expect(b1.map(c => `${c.tipo}${c.numero}`)).toEqual(['entrada1', 'entrada2', 'entrada3', 'entrada4', 'entrada5', 'entrada6', 'saldo1', 'saldo2', 'saldo3', 'saldo4', 'saldo5', 'saldo6']);
    expect(b2[0]).toMatchObject({ tipo: 'saldo', numero: 7 });
    expect(blocoDoCarne(cobs, 'completo')).toHaveLength(126);
    expect(blocoDoCarne(cobs, 11)).toHaveLength(6);
  });
});

describe('6. fidelidade ao Asaas', () => {
  it('a lâmina usa exatamente linha digitável, código de barras, nosso número e PIX do Asaas (sem cálculo)', () => {
    const snap = snapAsaas(7);
    const l = dadosLamina({ contrato: { id: 1, numero: 'BJ-2026-0001', modeloVersao: 'x', codigoVerificacao: 'x' }, lote: { codigo: 'A01', quadra: 'A', areaM2: 1 },
      comprador: { nome: 'F', cpfCnpj: '', endereco: '' }, beneficiario: 'V', agenciaCodigo: '-', urlPublica: '', plano },
      { id: 8, tipo: 'saldo', numero: 2, total: 120, vencimento: '2027-07-10', valor: 1234.51, juros: 0, amortizacao: 0, saldoDevedor: 0, asaas: snap, dataDocumento: '2026-10-24' });
    expect({ linha: l.linhaDigitavel, cod: l.codigoBarras, nn: l.nossoNumero, pix: l.pixPayload })
      .toEqual({ linha: snap.identificationField, cod: snap.barCode, nn: snap.nossoNumero, pix: snap.pixPayload });
    expect(() => dadosLamina({ ...({} as any), contrato: { numero: 'x' }, lote: {}, comprador: {} } as any,
      { id: 1, tipo: 'saldo', numero: 1, total: 1, vencimento: '', valor: 1, juros: 0, amortizacao: 0, saldoDevedor: 0, asaas: null, dataDocumento: '' })).toThrow(/ainda não foi emitida no Asaas/);
  });
});

describe('7. verificação pública do recibo', () => {
  it('/r/:numero sem código não devolve PDF; código errado 403; código certo devolve o PDF sem CPF', async () => {
    const [r] = await db.select().from(schema.recibos);
    const sem = await verificarRecibo(r.numero);
    expect(sem.pdf).toBeUndefined();
    expect(sem.html).toContain(r.numero);
    expect(sem.html).not.toContain('529.982.247-25');
    expect((await verificarRecibo(r.numero, 'XXXX-XXXX-XXXX')).status).toBe(403);
    const ok = await verificarRecibo(r.numero, r.codigoVerif.toLowerCase());
    expect(ok.pdf && (await PDFDocument.load(ok.pdf)).getPageCount()).toBe(1);
    expect((await verificarRecibo('REC-BJ-1900-000001')).status).toBe(404);
  });
});

describe('links assinados e jobs', () => {
  it('link HMAC vale 7 dias e não aceita caminho alterado', () => {
    const agora = Date.parse('2027-01-01T00:00:00Z');
    const u = new URL(`https://x${assinarLink('/api/financeiro/cobrancas/5/boleto-a4.pdf', agora)}`);
    const [exp, sig] = [u.searchParams.get('exp'), u.searchParams.get('sig')];
    expect(linkValido('/api/financeiro/cobrancas/5/boleto-a4.pdf', exp, sig, agora + 6 * 86400000)).toBe(true);
    expect(linkValido('/api/financeiro/cobrancas/5/boleto-a4.pdf', exp, sig, agora + 8 * 86400000)).toBe(false);
    expect(linkValido('/api/financeiro/cobrancas/6/boleto-a4.pdf', exp, sig, agora)).toBe(false);
  });

  it('SIDRA/IBGE, 2º dia útil de maio e situação do ano (declaração retida com débito em aberto)', () => {
    expect(lerSidra([{ D3C: 'Mês (Código)', V: 'Valor' }, { D3C: '202709', V: '0.44' }, { D3C: '202710', V: '...' }])).toEqual([{ competencia: '2027-09', variacao: 0.44 }]);
    expect(segundoDiaUtilDeMaio(2028)).toBe('2028-05-03'); // 01/05 feriado, 02 terça? (1º útil) → 2º útil
    const s = situacaoDoAno([{ status: 'paga', vencimento: '2027-01-10' }, { status: 'vencida', vencimento: '2027-02-10' }, { status: 'emitida', vencimento: '2028-01-10' }], 2027, '2028-05-03');
    expect(s.pagas).toHaveLength(1);
    expect(s.pendentes).toHaveLength(1);
  });
});
