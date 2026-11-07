import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { etapaDeHoje, textoAviso, rotuloParcelaAviso } = await import('../shared/reguaCobranca');
const R = await import('./financeiro/reguaCobranca');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

// Sábado, 07/11/2026, 10h em Brasília (13h UTC)
const HOJE_10H = Date.parse('2026-11-07T13:00:00Z');

describe('régua de cobrança: etapas', () => {
  it('3 dias antes, no dia, 3 e 10 dias depois, cada uma com janela de 2 dias', () => {
    expect(etapaDeHoje('2026-11-10', '2026-11-07')).toBe('antes');
    expect(etapaDeHoje('2026-11-09', '2026-11-07')).toBe('antes'); // D-2, ainda na janela
    expect(etapaDeHoje('2026-11-07', '2026-11-07')).toBe('dia');
    expect(etapaDeHoje('2026-11-04', '2026-11-07')).toBe('atraso');
    expect(etapaDeHoje('2026-10-28', '2026-11-07')).toBe('final');
    expect(etapaDeHoje('2026-11-20', '2026-11-07')).toBeNull();
    expect(etapaDeHoje('2026-10-01', '2026-11-07')).toBeNull(); // dívida antiga não recebe enxurrada
  });
  it('não manda "vence em 3 dias" depois do vencimento nem repete etapa já enviada', () => {
    expect(etapaDeHoje('2026-11-08', '2026-11-07', ['antes'])).toBeNull();
    expect(etapaDeHoje('2026-11-07', '2026-11-07', ['dia'])).toBeNull();
    expect(etapaDeHoje('data-ruim', '2026-11-07')).toBeNull();
  });
  it('texto: nome, parcela, valor, link de pagamento, portal e CRECI J', () => {
    const txt = textoAviso('antes', {
      nome: 'Maria Teste Silva', parcela: rotuloParcelaAviso({ tipo: 'saldo', numero: 5, total: 120 }), valor: 1234.51, vencimento: '2026-11-10',
      empreendimento: 'Bom Jardims', chacara: 'B13', linkPagamento: 'https://pag.exemplo/abc', linkPortal: 'https://crm.exemplo/c/XYZ', pixCopiaECola: '000201PIX',
    });
    expect(txt).toContain('Olá, Maria!');
    expect(txt).toContain('parcela 5/120');
    expect(txt).toContain('*10/11/2026*');
    expect(txt).toMatch(/R\$\s1\.234,51/);
    expect(txt).toContain('https://pag.exemplo/abc');
    expect(txt).toContain('000201PIX');
    expect(txt).toContain('https://crm.exemplo/c/XYZ');
    expect(txt).toContain('CRECI J-1234');
    const final = textoAviso('final', { nome: 'Maria', parcela: 'entrada', valor: 10, vencimento: '2026-10-28', empreendimento: 'Bom Jardims', chacara: 'B13', linkPagamento: 'x', linkPortal: 'p', pixCopiaECola: 'PIX' });
    expect(final).not.toContain('PIX');
    expect(final).toContain('Nossa equipe vai entrar em contato');
  });
});

describe('régua de cobrança: banco e envio', () => {
  beforeAll(async () => {
    const db: any = await getDb();
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'bom-jardims', 'Bom Jardims')`);
    db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, codigoVerificacao, status) VALUES
      (1, 'BJ-1', 1, 'B13', 1, '{}', '{}', 'AAAAAAAAAAA1', 'assinado'),
      (2, 'BJ-2', 1, 'C04', 1, '{}', '{}', 'AAAAAAAAAAA2', 'ativo'),
      (3, 'BJ-3', 1, 'D01', 1, '{}', '{}', 'AAAAAAAAAAA3', 'cancelado')`);
    db.run(sql`INSERT INTO pessoas (id, nome, cpfCnpj, telefone1) VALUES (1, 'Maria Teste', '00000000001', '(99) 99999-0001'), (2, 'João Sem Fone', '00000000002', NULL), (3, 'Ana Cancelada', '00000000003', '99999990003')`);
    db.run(sql`INSERT INTO contratoPessoas (contratoId, pessoaId, papel) VALUES (1, 1, 'comprador'), (2, 2, 'comprador'), (3, 3, 'comprador')`);
    db.run(sql`INSERT INTO cobrancas (id, contratoId, tipo, numero, total, vencimento, valor, status, bankSlipUrl, asaasPaymentId) VALUES
      (1, 1, 'saldo', 5, 120, '2026-11-10', '1234.51', 'emitida', 'https://pag.exemplo/1', 'pay_t1'),
      (2, 1, 'saldo', 4, 120, '2026-11-04', '1234.51', 'vencida', NULL, 'pay_t2'),
      (3, 1, 'saldo', 3, 120, '2026-11-07', '1234.51', 'paga', NULL, 'pay_t3'),
      (4, 2, 'saldo', 1, 120, '2026-11-07', '900.00', 'emitida', NULL, 'pay_t4'),
      (5, 3, 'saldo', 1, 120, '2026-11-07', '900.00', 'emitida', NULL, 'pay_t5'),
      (6, 1, 'saldo', 6, 120, '2026-11-07', '1234.51', 'prevista', NULL, NULL)`);
  });

  it('prévia: só contratos assinados/ativos e parcelas já emitidas no Asaas (prevista sem boleto fica de fora)', async () => {
    const av = await R.avisosDeHoje(HOJE_10H);
    expect(av.map(a => [a.cobrancaId, a.etapa])).toEqual([[2, 'atraso'], [4, 'dia'], [1, 'antes']]);
    expect(av.find(a => a.cobrancaId === 1)?.telefone).toMatch(/^55\d{10,11}$/);
    expect(av.find(a => a.cobrancaId === 4)?.telefone).toBeNull();
  });

  it('desligada ou fora do horário não envia', async () => {
    const enviar = async () => { throw new Error('não deveria enviar'); };
    expect(await R.processarRegua(HOJE_10H, enviar)).toMatchObject({ enviados: 0, motivo: 'desligada' });
    await R.definirReguaLigada(true, 1);
    expect(await R.processarRegua(Date.parse('2026-11-07T23:30:00Z'), enviar)).toMatchObject({ enviados: 0, motivo: 'fora do horário' });
  });

  it('ligada: envia uma vez por parcela e etapa e registra quem está sem telefone', async () => {
    const enviados: [string, string][] = [];
    const enviar = async (tel: string, txt: string) => { enviados.push([tel, txt]); };
    expect(await R.processarRegua(HOJE_10H, enviar)).toMatchObject({ enviados: 2, falhas: 1 });
    expect(enviados).toHaveLength(2);
    expect(enviados.every(([, t]) => t.includes('CRECI J-1234'))).toBe(true);
    // Segunda passada no mesmo dia: nada de novo
    expect(await R.processarRegua(HOJE_10H + 1800_000, enviar)).toMatchObject({ enviados: 0, falhas: 0 });
    expect(enviados).toHaveLength(2);
    const hist = await R.historicoAvisos();
    expect(hist).toHaveLength(3);
    expect(hist.find(h => h.contrato === 'BJ-2')).toMatchObject({ ok: false, erro: 'comprador sem telefone no cadastro' });
    expect(hist.filter(h => h.ok)).toHaveLength(2);
  });
});
