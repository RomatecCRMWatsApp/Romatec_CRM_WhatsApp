import { beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
process.env.MP_WEBHOOK_SECRET = 'segredo-de-teste';

const S = await import('./saas/servico');
const C = await import('./saas/cobranca');
const M = await import('./saas/mercadopago');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

const DIA = 86_400_000;
let db: any;
const chamadas: { metodo: string; caminho: string; corpo?: any }[] = [];
/** Mercado Pago simulado: pagamentos e preapprovals guardados em memória */
const pagamentosMp = new Map<string, any>();
let proximoId = 1000;
let proximoPre = 0;
/** Assinaturas do cartão (preapproval) que o cliente já autorizou no MP */
const preAutorizadas = new Set<string>();
let falharGet = false;

const usuario = (id: number) => db.all(sql`SELECT * FROM users WHERE id = ${id}`)[0];
const assinatura = (usuarioId: number) => db.all(sql`SELECT * FROM saasAssinaturas WHERE usuarioId = ${usuarioId}`)[0];
const faturas = (assinaturaId: number) => db.all(sql`SELECT * FROM saasFaturas WHERE assinaturaId = ${assinaturaId} ORDER BY id`);
const assinar = (dataId: string, requestId = 'req-1', ts = '1700000000') => {
  const v1 = crypto.createHmac('sha256', 'segredo-de-teste').update(M.montarManifest(dataId, requestId, ts)).digest('hex');
  return { xSignature: `ts=${ts},v1=${v1}`, xRequestId: requestId };
};
const avisar = async (tipo: string, id: string, action = 'payment.updated') => {
  const r = await C.registrarEvento(assinar(id), id, { type: tipo, action, data: { id } });
  return r.novo ? C.processarEvento(r.eventoId) : { ok: true, acao: 'duplicado' };
};

beforeAll(async () => {
  db = await getDb();
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil, cpf, email, telefone, enderecoCep, enderecoLogradouro, enderecoNumero, enderecoBairro, enderecoCidade, enderecoUf, ativo, empreendimentoSlug) VALUES
    (1, 'u1', 'José Admin', 'admin', NULL, '52998224725', 'jose@x.com', '99991811246', NULL, NULL, NULL, NULL, NULL, NULL, 1, NULL),
    (2, 'u2', 'Carlos Corretor Silva', 'user', 'corretor', '11144477735', 'carlos@x.com', '99911112222', '65930000', 'Rua A', '10', 'Centro', 'Açailândia', 'MA', 1, NULL),
    (3, 'u3', 'Dona Empreendedora', 'user', 'empreendedor', '39053344705', 'dona@x.com', '99933334444', '65930000', 'Rua B', '20', 'Centro', 'Açailândia', 'MA', 1, 'bom-jardims'),
    (4, 'u4', 'Paula Cartão', 'user', 'corretor', '86288366757', 'paula@x.com', '99944445555', NULL, NULL, NULL, NULL, NULL, NULL, 1, NULL)`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'bom-jardims', 'Bom Jardims')`);
  await S.definirLicenciamento(true, null, 1);
  S.envio.disponivel = () => false;
  M.mp.req = (async (modo: string, metodo: string, caminho: string, corpo?: any) => {
    chamadas.push({ metodo, caminho, corpo });
    if (metodo === 'POST' && caminho === '/v1/payments') {
      const id = String(proximoId++);
      pagamentosMp.set(id, { id, status: 'pending', external_reference: corpo.external_reference, transaction_amount: corpo.transaction_amount });
      return { id, point_of_interaction: { transaction_data: { qr_code: `00020126PIX${id}`, qr_code_base64: 'iVBORw0K', ticket_url: `https://mp.test/pix/${id}` } }, transaction_details: { external_resource_url: `https://mp.test/boleto/${id}` } };
    }
    if (metodo === 'POST' && caminho === '/preapproval') return { id: `pre-${++proximoPre}`, init_point: 'https://mp.test/assinar', sandbox_init_point: 'https://sandbox.mp.test/assinar' };
    if (metodo === 'GET' && caminho.startsWith('/preapproval/')) return { id: caminho.split('/').pop(), status: preAutorizadas.has(caminho.split('/').pop()!) ? 'authorized' : 'pending' };
    if (metodo === 'PUT') return { ok: true };
    if (metodo === 'GET' && caminho.startsWith('/v1/payments/')) {
      if (falharGet) throw new M.MpErro('Mercado Pago indisponível', 502);
      const p = pagamentosMp.get(caminho.split('/').pop()!);
      if (!p) throw new M.MpErro('Mercado Pago recusou (404): not found', 400, { status: 404 });
      return { ...p, date_approved: new Date().toISOString() };
    }
    throw new Error(`chamada inesperada ${metodo} ${caminho}`);
  }) as any;
});

describe('assinatura do webhook (portada do AvalieImob)', () => {
  it('confere o HMAC do manifest; recusa assinatura errada, ausente ou sem segredo; id alfanumérico em minúsculas', () => {
    const h = assinar('123');
    expect(M.assinaturaValida(h.xSignature, h.xRequestId, '123', 'segredo-de-teste')).toBe(true);
    expect(M.assinaturaValida(h.xSignature, h.xRequestId, '124', 'segredo-de-teste')).toBe(false);
    expect(M.assinaturaValida(undefined, 'r', '123', 'segredo-de-teste')).toBe(false);
    expect(M.assinaturaValida(h.xSignature, h.xRequestId, '123', '')).toBe(false);
    expect(M.montarManifest('AbC', null, '9')).toBe('id:abc;ts:9;');
  });
});

describe('Pix: checkout → webhook → desbloqueio', () => {
  it('gera a fatura Pix; aprovado libera na hora; aviso repetido não estende duas vezes; cupom FUNDADOR conta 1 uso', async () => {
    await S.criarCupom({ codigo: 'FUNDADOR', tipo: 'PRECO_FIXO', precosFixos: { CORRETOR_ESSENCIAL: 69.9, CORRETOR_PRO: 129.9 }, limiteUsos: 20, duracaoCiclos: 12 }, 1);
    const r = await C.iniciarCheckout(usuario(2), { plano: 'CORRETOR_ESSENCIAL', ciclo: 'MENSAL', metodo: 'PIX', cupom: 'fundador' });
    expect(r).toMatchObject({ tipo: 'pix', valor: 69.9, modo: 'teste', copiaCola: expect.stringContaining('PIX') });
    const a = assinatura(2);
    // A escolha fica na fatura; a assinatura só muda quando o pagamento for aprovado
    expect(a).toMatchObject({ status: 'BLOQUEADO', metodo: null, cupomId: null });
    const [f] = faturas(a.id);
    expect(f).toMatchObject({ status: 'ABERTA', metodo: 'PIX', valor: '69.90' });
    expect(JSON.parse(f.escolhaJson)).toMatchObject({ ciclo: 'MENSAL', metodo: 'PIX' });
    // Pendente: nada muda
    expect(await avisar('payment', f.mpPaymentId)).toMatchObject({ ok: true, acao: 'pagamento_pending' });
    // Aprovado
    pagamentosMp.get(f.mpPaymentId).status = 'approved';
    expect(await avisar('payment', f.mpPaymentId, 'payment.created')).toMatchObject({ ok: true, acao: 'aprovado' });
    const depois = assinatura(2);
    expect(depois).toMatchObject({ status: 'ATIVA', origem: 'PAGA', metodo: 'PIX', ciclosCupomRestantes: 11 });
    expect(depois.cupomId).toBeTruthy();
    const fim1 = depois.periodoFim;
    expect(faturas(a.id)[0].status).toBe('PAGA');
    S.limparCaches();
    expect(await S.resumoLicenca(usuario(2))).toMatchObject({ liberado: true, origem: 'PAGA' });
    // O mesmo aviso de novo (idêntico) é reprocessado sem efeito; outro aviso do mesmo pagamento aprovado não estende de novo
    expect(await avisar('payment', f.mpPaymentId, 'payment.created')).toMatchObject({ acao: 'ja_aplicado' });
    expect(await avisar('payment', f.mpPaymentId, 'payment.updated2')).toMatchObject({ acao: 'ja_aplicado' });
    expect(assinatura(2).periodoFim).toBe(fim1);
    expect(db.all(sql`SELECT usosRealizados FROM saasCupons WHERE codigo = 'FUNDADOR'`)[0].usosRealizados).toBe(1);
  });

  it('checkout não pago não troca nada: abrir o Pro anual sem pagar mantém Essencial mensal (sem AvalieImob de graça)', async () => {
    const antes = assinatura(2);
    const essencial = antes.planoId;
    await C.iniciarCheckout(usuario(2), { plano: 'CORRETOR_PRO', ciclo: 'ANUAL', metodo: 'PIX' });
    expect(assinatura(2)).toMatchObject({ planoId: essencial, ciclo: 'MENSAL', metodo: 'PIX', status: 'ATIVA', periodoFim: antes.periodoFim });
  });

  it('aviso com assinatura inválida é recusado (401) e nada é gravado', async () => {
    await expect(C.registrarEvento({ xSignature: 'ts=1,v1=' + 'a'.repeat(64), xRequestId: 'r' }, '999', { type: 'payment' })).rejects.toMatchObject({ status: 401 });
    expect(db.all(sql`SELECT COUNT(*) AS n FROM saasEventosPagamento WHERE recursoId = '999'`)[0].n).toBe(0);
  });

  it('pagamento de outro sistema na mesma conta MP é ignorado', async () => {
    pagamentosMp.set('777', { id: '777', status: 'approved', external_reference: 'avalieimob|mensal', transaction_amount: 89.9 });
    expect(await avisar('payment', '777')).toMatchObject({ ok: true, acao: 'nao_e_do_crm' });
  });

  it('falha ao consultar o MP: evento fica pendente e o retry processa depois', async () => {
    const id = String(proximoId);
    await C.iniciarCheckout(usuario(2), { plano: 'CORRETOR_ESSENCIAL', ciclo: 'MENSAL', metodo: 'PIX' }); // fatura da competência seguinte
    pagamentosMp.get(id).status = 'approved';
    falharGet = true;
    expect(await avisar('payment', id)).toMatchObject({ ok: false });
    falharGet = false;
    const r = await C.retryEventos(Date.now() + 5 * 60_000);
    expect(r).toMatchObject({ pendentes: 1, ok: 1 });
    expect(faturas(assinatura(2).id).filter((f: any) => f.status === 'PAGA')).toHaveLength(2);
  });
});

describe('cartão recorrente, estorno e cancelamento', () => {
  it('cartão: link do MP (sandbox no modo teste); cobrança aprovada cria a fatura e ativa', async () => {
    const r = await C.iniciarCheckout(usuario(4), { plano: 'CORRETOR_PRO', ciclo: 'ANUAL', metodo: 'CARTAO_RECORRENTE' });
    expect(r).toMatchObject({ tipo: 'redirecionar', url: 'https://sandbox.mp.test/assinar', valor: 1599 });
    const pre = chamadas.find(c => c.caminho === '/preapproval')!.corpo;
    expect(pre).toMatchObject({ payer_email: 'paula@x.com', auto_recurring: { frequency: 12, frequency_type: 'months', transaction_amount: 1599 } });
    const a = assinatura(4);
    // Até o 1º pagamento, a assinatura do cartão fica pendente (não troca nada)
    expect(a.mpPreapprovalId).toBeNull();
    expect(JSON.parse(a.checkoutPendenteJson)).toMatchObject({ preapprovalId: 'pre-1', ciclo: 'ANUAL', metodo: 'CARTAO_RECORRENTE' });
    preAutorizadas.add('pre-1');
    pagamentosMp.set('5001', { id: '5001', status: 'approved', external_reference: `saas:${a.id}`, transaction_amount: 1599 });
    expect(await avisar('payment', '5001')).toMatchObject({ acao: 'aprovado' });
    expect(faturas(a.id)).toEqual([expect.objectContaining({ metodo: 'CARTAO_RECORRENTE', status: 'PAGA', mpPaymentId: '5001' })]);
    expect(assinatura(4)).toMatchObject({ mpPreapprovalId: 'pre-1', checkoutPendenteJson: null, ciclo: 'ANUAL', metodo: 'CARTAO_RECORRENTE' });
    const fim = new Date(assinatura(4).periodoFim.replace(' ', 'T') + 'Z').getTime();
    expect(fim - Date.now()).toBeGreaterThan(360 * DIA);
  });

  it('estorno sem pagamento posterior derruba (inadimplente); cancelar mantém até o fim e depois vira CANCELADA', async () => {
    // O MP manda o estorno com o MESMO id e ação da aprovação ("payment.updated") — não pode ser descartado como repetido
    pagamentosMp.get('5001').status = 'refunded';
    expect(await avisar('payment', '5001')).toMatchObject({ acao: 'estornado' });
    expect(assinatura(4)).toMatchObject({ status: 'INADIMPLENTE' });
    expect(faturas(assinatura(4).id)[0].status).toBe('ESTORNADA');
    // Aviso do estorno repetido: não aplica de novo (o fim do período e a auditoria ficam como estão)
    const fimEstorno = assinatura(4).periodoFim;
    expect(await avisar('payment', '5001')).toMatchObject({ acao: 'ja_estornado' });
    expect(assinatura(4).periodoFim).toBe(fimEstorno);
    expect(db.all(sql`SELECT COUNT(*) AS n FROM auditoriaAcesso WHERE evento = 'PAGAMENTO_ESTORNADO'`)[0].n).toBe(1);
    // Corretor 2 (pago): cancela a renovação
    await C.cancelarAssinatura(usuario(2));
    const a = assinatura(2);
    expect(a.cancelarNoFim).toBe(1);
    const fim = new Date(a.periodoFim.replace(' ', 'T') + 'Z').getTime();
    await S.rotinaSaas(fim + 1000);
    expect(assinatura(2).status).toBe('CANCELADA');
  });

  it('troca de cartão: cobrança da assinatura antiga não aplica a escolha nova; a nova paga, vale e cancela a antiga', async () => {
    const id = assinatura(4).id;
    await C.iniciarCheckout(usuario(4), { plano: 'CORRETOR_ESSENCIAL', ciclo: 'MENSAL', metodo: 'CARTAO_RECORRENTE' });
    const pendente = JSON.parse(assinatura(4).checkoutPendenteJson);
    const proPlanoId = assinatura(4).planoId;
    // Cobrança da assinatura antiga (pre-1) chega antes de autorizar a nova
    pagamentosMp.set('5002', { id: '5002', status: 'approved', external_reference: `saas:${id}`, transaction_amount: 1599 });
    expect(await avisar('payment', '5002')).toMatchObject({ acao: 'aprovado' });
    expect(assinatura(4)).toMatchObject({ planoId: proPlanoId, ciclo: 'ANUAL', mpPreapprovalId: 'pre-1' });
    // Autorizou a nova e ela cobrou
    preAutorizadas.add(pendente.preapprovalId);
    chamadas.length = 0;
    pagamentosMp.set('5003', { id: '5003', status: 'approved', external_reference: `saas:${id}`, transaction_amount: 149.9 });
    expect(await avisar('payment', '5003')).toMatchObject({ acao: 'aprovado' });
    expect(assinatura(4)).toMatchObject({ ciclo: 'MENSAL', mpPreapprovalId: pendente.preapprovalId, checkoutPendenteJson: null });
    expect(assinatura(4).planoId).not.toBe(proPlanoId);
    expect(chamadas).toContainEqual(expect.objectContaining({ metodo: 'PUT', caminho: '/preapproval/pre-1', corpo: { status: 'cancelled' } }));
  });
});

describe('empreendedor avulso: implantação na 1ª fatura', () => {
  it('1ª fatura soma a implantação (só Pix/boleto); cartão é recusado nessa primeira', async () => {
    await expect(C.iniciarCheckout(usuario(3), { plano: 'EMPREENDEDOR_AVULSO', ciclo: 'MENSAL', metodo: 'CARTAO_RECORRENTE' })).rejects.toThrow(/implantação/);
    const r = await C.iniciarCheckout(usuario(3), { plano: 'EMPREENDEDOR_AVULSO', ciclo: 'MENSAL', metodo: 'BOLETO' });
    expect(r).toMatchObject({ tipo: 'boleto', valor: 397 + 990, url: expect.stringContaining('boleto') });
    const corpo = chamadas.filter(c => c.caminho === '/v1/payments').at(-1)!.corpo;
    expect(corpo).toMatchObject({ payment_method_id: 'bolbradesco', payer: { identification: { number: '39053344705' }, address: { zip_code: '65930000' } } });
    // Plano de corretor não serve para empreendedor
    await expect(C.iniciarCheckout(usuario(3), { plano: 'CORRETOR_PRO', ciclo: 'MENSAL', metodo: 'PIX' })).rejects.toThrow(/indisponível/);
  });

  it('webhook perdido: a conciliação consulta o MP e aplica o pagamento da fatura aberta (uma vez só)', async () => {
    const a = assinatura(3);
    const f = faturas(a.id).find((x: any) => x.status === 'ABERTA')!;
    pagamentosMp.get(f.mpPaymentId).status = 'approved';
    expect(await C.conciliarFaturasAbertas()).toMatchObject({ aplicadas: 1, erros: [] });
    expect(faturas(a.id).find((x: any) => x.id === f.id).status).toBe('PAGA');
    expect(assinatura(3)).toMatchObject({ status: 'ATIVA', origem: 'PAGA' });
    expect(await C.conciliarFaturasAbertas()).toMatchObject({ conferidas: 0, aplicadas: 0 });
  });

  it('estorno de fatura já paga sem aviso do MP: a conferência de estornos acha e aplica (uma vez só)', async () => {
    const a = assinatura(3);
    const f = faturas(a.id).find((x: any) => x.status === 'PAGA')!;
    pagamentosMp.get(f.mpPaymentId).status = 'charged_back';
    expect(await C.conferirEstornos()).toMatchObject({ estornadas: 1, erros: [] });
    expect(faturas(a.id).find((x: any) => x.id === f.id).status).toBe('ESTORNADA');
    expect(assinatura(3).status).toBe('INADIMPLENTE');
    expect((await C.conferirEstornos()).estornadas).toBe(0);
  });
});

describe('upgrade Essencial → Pro com a diferença proporcional', () => {
  it('cálculo: diferença do ciclo × dias que faltam ÷ 30 (anual ÷ 365); sem dias ou sem diferença = null', async () => {
    const { valorUpgrade } = await import('../shared/saas');
    const agora = Date.parse('2026-10-27T12:00:00Z');
    expect(valorUpgrade({ precoAtual: 89.9, precoNovo: 159.9, ciclo: 'MENSAL', periodoFim: '2026-11-11T12:00:00Z', agora })).toMatchObject({ valor: 35, diasRestantes: 15, diasCiclo: 30, diferenca: 70 });
    expect(valorUpgrade({ precoAtual: 899, precoNovo: 1599, ciclo: 'ANUAL', periodoFim: '2027-04-27T12:00:00Z', agora })!.diasRestantes).toBe(182);
    expect(valorUpgrade({ precoAtual: 69.9, precoNovo: 129.9, ciclo: 'MENSAL', periodoFim: '2026-11-26T12:00:00Z', agora })!.valor).toBe(60);
    expect(valorUpgrade({ precoAtual: 89.9, precoNovo: 159.9, ciclo: 'MENSAL', periodoFim: '2026-10-20T12:00:00Z', agora })).toBeNull();
    expect(valorUpgrade({ precoAtual: 159.9, precoNovo: 159.9, ciclo: 'MENSAL', periodoFim: '2026-11-11T12:00:00Z', agora })).toBeNull();
  });

  it('Pix do upgrade aprovado: plano vira Pro sem mudar o vencimento; fatura marcada; nova prévia some; NFS-e de upgrade', async () => {
    db.run(sql`INSERT INTO users (id, openId, name, role, perfil, cpf, email, telefone, ativo) VALUES (5, 'u5', 'Rita Essencial', 'user', 'corretor', '74682489070', 'rita@x.com', '99955556666', 1)`);
    const fim = new Date(Date.now() + 15 * DIA).toISOString().slice(0, 10);
    await S.definirAssinatura({ usuarioId: 5, planoCodigo: 'CORRETOR_ESSENCIAL', origem: 'PAGA', periodoFim: fim, motivo: 'teste upgrade' }, 1);
    const antes = assinatura(5);
    const prev = await C.previaUpgrade(usuario(5));
    expect(prev).toMatchObject({ de: 'Corretor Essencial', para: 'Corretor Pro', diferenca: 70 });
    expect(prev!.valor).toBeGreaterThan(30);
    expect(prev!.valor).toBeLessThan(40);
    const r = await C.iniciarUpgrade(usuario(5), { metodo: 'PIX' });
    expect(r).toMatchObject({ tipo: 'pix', valor: prev!.valor });
    const f = faturas(antes.id).find((x: any) => x.upgradePlanoId);
    expect(f).toMatchObject({ status: 'ABERTA', competencia: expect.stringMatching(/^U\d{6}$/) });
    pagamentosMp.get(f.mpPaymentId).status = 'approved';
    expect(await avisar('payment', f.mpPaymentId)).toMatchObject({ ok: true, acao: 'upgrade' });
    const depois = assinatura(5);
    const pro = db.all(sql`SELECT id FROM saasPlanos WHERE codigo = 'CORRETOR_PRO'`)[0].id;
    expect(depois.planoId).toBe(pro);
    expect(depois.periodoFim).toBe(antes.periodoFim);
    expect(faturas(antes.id).find((x: any) => x.id === f.id).status).toBe('PAGA');
    expect(await C.previaUpgrade(usuario(5))).toBeNull();
    const N = await import('./saas/nfse');
    await N.sincronizarFilaNfse();
    expect((await N.listarNfse()).find(n => n.faturaId === f.id)!.discriminacao).toMatch(/upgrade para o plano Corretor Pro/);
  });

  it('sem plano pago ativo (teste grátis, cortesia, bloqueado) não há upgrade', async () => {
    expect(await C.previaUpgrade(usuario(3))).toBeNull(); // empreendedor (sem plano superior com AvalieImob)
    await expect(C.iniciarUpgrade({ id: 999, perfil: 'corretor' }, { metodo: 'PIX' })).rejects.toThrow(/Upgrade indisponível/);
  });
});

describe('preço do plano mudou: cartão recorrente acompanha', () => {
  it('cada assinatura no cartão passa a cobrar o preço novo; preço negociado fica; cancelada e Pix ficam de fora', async () => {
    const plano = (await S.listarPlanos()).find(p => p.codigo === 'CORRETOR_ESSENCIAL')!;
    db.run(sql`INSERT INTO users (id, openId, name, role, perfil, ativo) VALUES (40, 'u40', 'R1', 'user', 'corretor', 1), (41, 'u41', 'R2', 'user', 'corretor', 1), (42, 'u42', 'R3', 'user', 'corretor', 1), (43, 'u43', 'R4', 'user', 'corretor', 1)`);
    db.run(sql`INSERT INTO saasAssinaturas (usuarioId, planoId, chave, origem, ciclo, status, precoOverride, mpPreapprovalId) VALUES
      (40, ${plano.id}, '40:0', 'PAGA', 'MENSAL', 'ATIVA', NULL, 'pre-reaj'),
      (41, ${plano.id}, '41:0', 'PAGA', 'MENSAL', 'ATIVA', '79.90', 'pre-neg'),
      (42, ${plano.id}, '42:0', 'PAGA', 'MENSAL', 'CANCELADA', NULL, 'pre-canc'),
      (43, ${plano.id}, '43:0', 'PAGA', 'MENSAL', 'ATIVA', NULL, NULL)`);
    await S.atualizarPlano(plano.id, { precoMensal: 149.9 });
    chamadas.length = 0;
    const r = await C.reajustarRecorrencias(plano.id, 1);
    const puts = Object.fromEntries(chamadas.filter(c => c.metodo === 'PUT').map(c => [c.caminho, c.corpo.auto_recurring.transaction_amount]));
    expect(puts['/preapproval/pre-reaj']).toBe(149.9);
    expect(puts['/preapproval/pre-neg']).toBe(79.9);
    expect(puts['/preapproval/pre-canc']).toBeUndefined();
    expect(r.falhas).toEqual([]);
    expect(r.atualizadas).toBeGreaterThanOrEqual(2);
  });
});
