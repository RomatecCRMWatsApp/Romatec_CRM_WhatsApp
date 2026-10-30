import { createHmac } from 'crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const Sp = await import('./saas/spedy');
const N = await import('./saas/nfse');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

// Chave e segredo FALSOS, só para o teste
const ENV = { SPEDY_API_KEY: 'chave-falsa-de-teste', SPEDY_AMBIENTE: 'sandbox', SPEDY_EMPRESA_ID: 'emp-1', APP_PUBLIC_URL: 'https://crm.exemplo.test' };
const SEGREDO = `whsec_${Buffer.from('segredo-falso-de-teste-123456').toString('base64')}`;
let db: any;
let chamadas: { metodo: string; url: string; corpo: any; chave: string | null }[] = [];
let ambienteNfse = 'simulation';
let respostaPost: any = { id: 'inv-1', status: 'enqueued', environmentType: 'simulation' };
let respostaGet: any = null;
const nota = (id: number) => db.all(sql`SELECT * FROM saasNfse WHERE id = ${id}`)[0];

function assinar(corpo: string, id = 'evt-1', ts = Math.floor(Date.now() / 1000)) {
  const chave = Buffer.from(SEGREDO.replace(/^whsec_/, ''), 'base64');
  return { 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': `v1,${createHmac('sha256', chave).update(`${id}.${ts}.${corpo}`).digest('base64')}` };
}

beforeAll(async () => {
  db = await getDb();
  Object.assign(process.env, { SPEDY_WEBHOOK_SECRET: SEGREDO });
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil, ativo, cpf, email, telefone, enderecoLogradouro, enderecoNumero, enderecoBairro, enderecoCidade, enderecoUf, enderecoCep)
    VALUES (77, 'u77', 'Giegilla Teste', 'user', 'corretor', 1, '52998224725', 'teste@exemplo.test', '99991234567', 'Rua das Flores', '10', 'Centro', 'Açailândia', 'MA', '65930000')`);
  db.run(sql`INSERT INTO saasPlanos (id, codigo, publico, nome, precoMensal) VALUES (91, 'TESTE-ESS', 'CORRETOR', 'Corretor Essencial', '49.90')`);
  db.run(sql`INSERT INTO saasAssinaturas (id, usuarioId, planoId, chave, origem, status) VALUES (5, 77, 91, '77:0', 'PAGA', 'ATIVA')`);
  db.run(sql`INSERT INTO saasFaturas (id, assinaturaId, competencia, valor, status, metodo, vencimento, pagoEm) VALUES (9, 5, '2026-10', '49.90', 'PAGA', 'PIX', '2026-10-30', '2026-10-26 12:00:00')`);
  await N.sincronizarFilaNfse();
  Sp.http.fetch = (async (url: string, init?: RequestInit) => {
    const h = (init?.headers ?? {}) as Record<string, string>;
    chamadas.push({ metodo: init?.method ?? 'GET', url, corpo: init?.body ? JSON.parse(String(init.body)) : null, chave: h['X-Api-Key'] ?? null });
    const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.endsWith('/companies/emp-1/settings')) return ok({ serviceInvoice: { environmentType: ambienteNfse } });
    if (url.includes('/service-invoices') && init?.method === 'POST') return ok(respostaPost);
    if (url.includes('/service-invoices/')) return ok(respostaGet);
    if (url.includes('/webhooks')) return ok({ items: [] });
    return new Response('{}', { status: 404 });
  }) as any;
});
beforeEach(() => { chamadas = []; });

describe('Spedy — configuração', () => {
  it('lê tudo de variável de ambiente; sandbox por padrão; host e ambiente precisam bater', () => {
    expect(Sp.configSpedy({})).toMatchObject({ configurada: false, erro: 'SPEDY_API_KEY não configurada', ambiente: 'sandbox' });
    expect(Sp.configSpedy({ SPEDY_API_KEY: 'x' })).toMatchObject({ configurada: true, baseUrl: 'https://sandbox-api.spedy.com.br/v1' });
    expect(Sp.configSpedy({ SPEDY_API_KEY: 'x', SPEDY_AMBIENTE: 'producao' }).baseUrl).toBe('https://api.spedy.com.br/v1');
    expect(Sp.configSpedy({ SPEDY_API_KEY: 'x', SPEDY_BASE_URL: 'https://api.spedy.com.br/v1' }).configurada).toBe(false); // sandbox apontando p/ produção
    expect(Sp.configSpedy({ SPEDY_API_KEY: 'x', SPEDY_ISS_ALIQUOTA: '2,5' }).issAliquota).toBe(2.5);
  });
});

describe('Spedy — emissão', () => {
  it('monta a NFS-e com o tomador do cadastro (endereço estruturado), item 1.05 e integrationId estável', async () => {
    const n = nota(1);
    expect(n).toMatchObject({ status: 'PENDENTE', faturaId: 9 });
    const corpo = Sp.montarNota(n, { cpf: '52998224725', enderecoLogradouro: 'Rua das Flores', enderecoNumero: '10', enderecoBairro: 'Centro', enderecoCidade: 'Açailândia', enderecoUf: 'MA', enderecoCep: '65930-000' }, { issAliquota: 2 });
    expect(corpo).toMatchObject({
      integrationId: 'romatec-nfse-1', federalServiceCode: '1.05', taxationType: 'taxationInMunicipality',
      receiver: { name: 'Giegilla Teste', federalTaxNumber: '52998224725', address: { street: 'Rua das Flores', number: '10', postalCode: '65930000', city: { name: 'Açailândia', state: 'MA' } } },
      total: { invoiceAmount: 49.9, issRate: 2 },
    });
  });

  it('recusa emitir em sandbox se a empresa na Spedy estiver com NFS-e em produção', async () => {
    ambienteNfse = 'production';
    await expect(Sp.emitirPelaSpedy(1, 1, Date.now(), ENV)).rejects.toThrow(/PRODUÇÃO dentro do sandbox/);
    expect(chamadas.some(c => c.metodo === 'POST')).toBe(false);
    expect(nota(1).status).toBe('PENDENTE');
    ambienteNfse = 'simulation';
  });

  it('emite: POST com a chave no header, nota fica ENVIADA; não deixa emitir de novo', async () => {
    const r = await Sp.emitirPelaSpedy(1, 1, Date.now(), ENV);
    expect(r).toMatchObject({ status: 'ENVIADA', externoId: 'inv-1', ambiente: 'sandbox', ambienteNfse: 'simulation' });
    const post = chamadas.find(c => c.metodo === 'POST')!;
    expect(post.url).toBe('https://sandbox-api.spedy.com.br/v1/service-invoices');
    expect(post.chave).toBe('chave-falsa-de-teste');
    expect(nota(1)).toMatchObject({ status: 'ENVIADA', provedor: 'spedy', externoId: 'inv-1', externoStatus: 'enqueued', ambiente: 'simulation' });
    await expect(Sp.emitirPelaSpedy(1, 1, Date.now(), ENV)).rejects.toThrow(/já foi enviada/);
    await expect(N.cancelarNfse(1, 'teste de cancelamento')).rejects.toThrow(/painel da Spedy/);
  });

  it('webhook assinado: autorizada → EMITIDA com número e links; repetido não reprocessa; assinatura errada é recusada', async () => {
    const corpo = JSON.stringify({ id: 'evt-1', event: 'invoice.status_changed', data: { id: 'inv-1', integrationId: 'romatec-nfse-1', model: 'serviceInvoice', status: 'authorized', environmentType: 'simulation', number: 123, rps: { number: 1, series: '1' }, authorization: { protocol: 'ABC123' }, processingDetail: { message: 'NFS-e autorizada pelo município.' } } });
    const falso = await Sp.receberWebhook(corpo, { ...assinar(corpo), 'webhook-signature': 'v1,AAAA' }, Date.now(), ENV);
    expect(falso).toMatchObject({ ok: false, status: 401 });
    expect(nota(1).status).toBe('ENVIADA');
    const r = await Sp.receberWebhook(corpo, assinar(corpo), Date.now(), ENV);
    expect(r).toMatchObject({ ok: true, motivo: 'aplicado', resultado: 'EMITIDA' });
    expect(nota(1)).toMatchObject({ status: 'EMITIDA', numero: '123', codigoVerificacao: 'ABC123', mensagem: 'NFS-e autorizada pelo município.',
      pdfUrl: 'https://sandbox-api.spedy.com.br/v1/service-invoices/inv-1/pdf', xmlUrl: 'https://sandbox-api.spedy.com.br/v1/service-invoices/inv-1/xml' });
    expect((await Sp.receberWebhook(corpo, assinar(corpo), Date.now(), ENV)).motivo).toBe('duplicado');
    // Evento atrasado de "enqueued" não faz a nota voltar
    const velho = JSON.stringify({ id: 'evt-0', event: 'invoice.status_changed', data: { id: 'inv-1', integrationId: 'romatec-nfse-1', status: 'enqueued' } });
    await Sp.receberWebhook(velho, assinar(velho, 'evt-0'), Date.now(), ENV);
    expect(nota(1).status).toBe('EMITIDA');
    // Rotina de reprocessar o Mercado Pago não pega eventos da Spedy
    expect(db.all(sql`SELECT provedor FROM saasEventosPagamento`).every((e: any) => e.provedor === 'spedy')).toBe(true);
  });

  it('rejeitada pela consulta: REJEITADA com a mensagem; o reenvio cria nota nova na Spedy e ignora aviso da tentativa antiga', async () => {
    db.run(sql`INSERT INTO saasFaturas (id, assinaturaId, competencia, valor, status, metodo, vencimento, pagoEm) VALUES (10, 5, '2026-11', '49.90', 'PAGA', 'PIX', '2026-11-30', '2026-11-26 12:00:00')`);
    await N.sincronizarFilaNfse();
    respostaPost = { id: 'inv-2', status: 'enqueued' };
    await Sp.emitirPelaSpedy(2, 1, Date.now(), ENV);
    respostaGet = { id: 'inv-2', status: 'rejected', processingDetail: { message: 'Código de serviço inválido' } };
    expect(await Sp.acompanharEnviadas(Date.now(), ENV)).toBe(1);
    expect(nota(2)).toMatchObject({ status: 'REJEITADA', mensagem: 'Código de serviço inválido' });
    chamadas = [];
    const agora = Date.now();
    respostaPost = { id: 'inv-3', status: 'enqueued' };
    await Sp.emitirPelaSpedy(2, 1, agora, ENV);
    expect(chamadas.find(c => c.metodo === 'POST')!.corpo.integrationId).toBe(`romatec-nfse-2-r${agora.toString(36)}`);
    expect(nota(2)).toMatchObject({ status: 'ENVIADA', externoId: 'inv-3' });
    expect(Sp.nfseIdDoIntegration(`romatec-nfse-2-r${agora.toString(36)}`)).toBe(2);
    // Aviso atrasado da tentativa rejeitada (inv-2) não derruba a nova
    const velho = JSON.stringify({ id: 'evt-r2', event: 'invoice.status_changed', data: { id: 'inv-2', integrationId: 'romatec-nfse-2', model: 'serviceInvoice', status: 'rejected' } });
    const r = await Sp.receberWebhook(velho, assinar(velho, 'evt-r2'), Date.now(), ENV);
    expect(r).toMatchObject({ ok: true, motivo: 'ignorado' });
    expect(nota(2)).toMatchObject({ status: 'ENVIADA', externoId: 'inv-3' });
  });

  it('sem chave configurada, nada é chamado e a tela mostra o que falta', async () => {
    await expect(Sp.emitirPelaSpedy(1, 1, Date.now(), {})).rejects.toThrow(/SPEDY_API_KEY/);
    const s = await Sp.situacaoSpedy({});
    expect(s).toMatchObject({ configurada: false, conectada: false });
    expect(JSON.stringify(s)).not.toContain('chave-falsa');
  });
});
