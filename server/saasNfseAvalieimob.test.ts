import { beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { jwtVerify } from 'jose';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
const SEGREDO = 'x'.repeat(40);

const S = await import('./saas/servico');
const N = await import('./saas/nfse');
const A = await import('./saas/avalieimob');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

const DIA = 86_400_000;
let db: any;
const usuario = (id: number) => db.all(sql`SELECT * FROM users WHERE id = ${id}`)[0];
const assinatura = (usuarioId: number) => db.all(sql`SELECT * FROM saasAssinaturas WHERE usuarioId = ${usuarioId}`)[0];
const enviados: any[] = [];
let falhar = false;

beforeAll(async () => {
  db = await getDb();
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil, cpf, email, telefone, enderecoCep, enderecoLogradouro, enderecoNumero, enderecoBairro, enderecoCidade, enderecoUf, ativo) VALUES
    (1, 'u1', 'José Admin', 'admin', NULL, '52998224725', 'jose@x.com', '99991811246', NULL, NULL, NULL, NULL, NULL, NULL, 1),
    (2, 'u2', 'Carlos Pro', 'user', 'corretor', '11144477735', 'Carlos@X.com', '99911112222', '65930000', 'Rua A', '10', 'Centro', 'Açailândia', 'MA', 1),
    (3, 'u3', 'Ana Essencial', 'user', 'corretor', NULL, 'ana@x.com', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1)`);
  S.envio.disponivel = () => false;
  A.avalieimob.provisionar = (async (corpo: any) => { enviados.push(corpo); return falhar ? { ok: false, erro: 'HTTP 503' } : { ok: true, acao: 'ativado' }; }) as any;
});

describe('NFS-e em fila', () => {
  it('pagamento registrado gera 1 nota pendente com o tomador congelado; idempotente; liga a fatura', async () => {
    await S.definirAssinatura({ usuarioId: 2, planoCodigo: 'CORRETOR_PRO', origem: 'PAGA', motivo: 'teste' }, 1);
    await S.registrarPagamentoManual(assinatura(2).id, { ciclo: 'MENSAL', valor: 159.9, observacao: 'pix' }, 1);
    await N.sincronizarFilaNfse();
    const notas = await N.listarNfse('PENDENTE');
    expect(notas).toHaveLength(1);
    expect(notas[0]).toMatchObject({ tomadorNome: 'Carlos Pro', tomadorDoc: '11144477735', valor: 159.9, itemServico: '1.05', metodo: 'MANUAL', faltaCadastro: false });
    expect(notas[0].tomadorEndereco).toContain('Açailândia/MA');
    expect(notas[0].discriminacao).toContain('Corretor Pro');
    const f = db.all(sql`SELECT * FROM saasFaturas WHERE assinaturaId = ${assinatura(2).id}`)[0];
    expect(f.nfseId).toBe(notas[0].id);
  });

  it('cadastro incompleto aparece sinalizado e é puxado depois; marcar emitida exige número; CSV sai com ;', async () => {
    await S.definirAssinatura({ usuarioId: 3, planoCodigo: 'CORRETOR_ESSENCIAL', origem: 'PAGA', motivo: 'teste' }, 1);
    await S.registrarPagamentoManual(assinatura(3).id, { ciclo: 'MENSAL', valor: 89.9, observacao: '' }, 1);
    let n = (await N.listarNfse('PENDENTE')).find(x => x.usuarioId === 3)!;
    expect(n.faltaCadastro).toBe(true);
    db.run(sql`UPDATE users SET cpf = '39053344705', enderecoLogradouro = 'Rua C', enderecoCidade = 'Imperatriz', enderecoUf = 'MA' WHERE id = 3`);
    await N.atualizarTomador(n.id);
    n = (await N.listarNfse()).find(x => x.id === n.id)!;
    expect(n).toMatchObject({ tomadorDoc: '39053344705', faltaCadastro: false });
    await expect(N.marcarEmitida(n.id, { numero: '  ' }, 1)).rejects.toMatchObject({ name: 'NfseErro' });
    await N.marcarEmitida(n.id, { numero: '2026/123', codigoVerificacao: 'AB12' }, 1);
    expect((await N.listarNfse('EMITIDA'))[0]).toMatchObject({ numero: '2026/123', codigoVerificacao: 'AB12', emitidaPor: 1 });
    await expect(N.marcarEmitida(n.id, { numero: '9' }, 1)).rejects.toThrow(/pendente/);
    const csv = await N.exportarCsv();
    expect(csv.split('\r\n')[0]).toContain('id;status;competencia;valor');
    expect(csv).toContain('"159,90"');
  });

  it('fatura estornada: nota pendente cancela sozinha; emitida fica sinalizada para cancelar na prefeitura', async () => {
    db.run(sql`UPDATE saasFaturas SET status = 'ESTORNADA'`);
    const r = await N.sincronizarFilaNfse();
    expect(r.canceladas).toBe(1);
    const todas = await N.listarNfse();
    expect(todas.find(x => x.usuarioId === 2)).toMatchObject({ status: 'CANCELADA' });
    expect(todas.find(x => x.usuarioId === 3)!.observacao).toMatch(/^ESTORNO/);
  });
});

describe('AvalieImob: provisionamento e SSO', () => {
  it('sem o segredo: integração desligada, rotina não faz nada e o SSO recusa', async () => {
    delete process.env.AVALIEIMOB_INTEGRACAO_SECRET;
    expect(await A.sincronizarAvalieimob()).toEqual({ ativados: 0, suspensos: 0, falhas: 0 });
    await expect(A.linkSso(usuario(2))).rejects.toMatchObject({ status: 412 });
    expect(enviados).toHaveLength(0);
  });

  it('assinatura do corpo: HMAC de "timestamp.corpo"', () => {
    const esperado = crypto.createHmac('sha256', SEGREDO).update('1700000000.{"a":1}').digest('hex');
    expect(A.assinarCorpo('1700000000', '{"a":1}', SEGREDO)).toBe(esperado);
  });

  it('rotina ativa só quem tem plano com AvalieImob liberado; falha fica registrada e repete; perdeu o direito → suspende', async () => {
    process.env.AVALIEIMOB_INTEGRACAO_SECRET = SEGREDO;
    // Carlos (Pro) foi estornado no teste anterior; volta a pagar
    db.run(sql`UPDATE saasAssinaturas SET status = 'ATIVA', origem = 'PAGA', periodoFim = ${new Date(Date.now() + 20 * DIA).toISOString().slice(0, 19).replace('T', ' ')} WHERE usuarioId = 2`);
    falhar = true;
    expect(await A.sincronizarAvalieimob()).toMatchObject({ ativados: 0, falhas: 1 });
    expect(assinatura(2).avalieimobErro).toMatch(/ativar: HTTP 503/);
    falhar = false;
    expect(await A.sincronizarAvalieimob()).toMatchObject({ ativados: 1, falhas: 0 });
    expect(enviados.at(-1)).toMatchObject({ evento: 'ativar', crm_usuario_id: 2, email: 'carlos@x.com', cpf: '11144477735', plano: 'Corretor Pro' });
    expect(assinatura(2)).toMatchObject({ avalieimobEstado: 'ATIVO', avalieimobErro: null });
    expect(enviados.some(e => e.crm_usuario_id === 3)).toBe(false); // Essencial não inclui
    expect(await A.sincronizarAvalieimob()).toMatchObject({ ativados: 0, suspensos: 0 }); // nada mudou
    db.run(sql`UPDATE saasAssinaturas SET status = 'BLOQUEADO' WHERE usuarioId = 2`);
    expect(await A.sincronizarAvalieimob()).toMatchObject({ suspensos: 1 });
    expect(enviados.at(-1)).toMatchObject({ evento: 'suspender', crm_usuario_id: 2 });
    db.run(sql`UPDATE saasAssinaturas SET status = 'ATIVA' WHERE usuarioId = 2`);
    expect(await A.sincronizarAvalieimob()).toMatchObject({ ativados: 1 });
    expect(enviados.at(-1).evento).toBe('reativar');
  });

  it('SSO: JWT HS256 de 60 s (iss/aud/jti) no fragmento da URL; sem direito → 403', async () => {
    const { url } = await A.linkSso(usuario(2));
    expect(url.startsWith('https://www.romatecavalieimob.com.br/sso#token=')).toBe(true);
    const token = url.split('#token=')[1];
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SEGREDO), { issuer: 'romatec-crm', audience: 'avalieimob' });
    expect(payload).toMatchObject({ sub: '2', email: 'carlos@x.com', nome: 'Carlos Pro' });
    expect(Number(payload.exp) - Number(payload.iat)).toBe(60);
    expect(typeof payload.jti).toBe('string');
    const outro = (await A.linkSso(usuario(2))).url.split('#token=')[1];
    expect((await jwtVerify(outro, new TextEncoder().encode(SEGREDO))).payload.jti).not.toBe(payload.jti);
    await expect(A.linkSso(usuario(3))).rejects.toMatchObject({ status: 403 });
    expect((await A.acessoDoUsuario(usuario(2))).liberado).toBe(true);
    expect((await A.acessoDoUsuario(usuario(3))).liberado).toBe(false);
  });
});
