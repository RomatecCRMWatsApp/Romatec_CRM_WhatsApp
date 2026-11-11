import { beforeAll, describe, expect, it } from 'vitest';

// Via assinada para o comprador só depois da entrada paga
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const S = await import('./contratos/servico');
const L = await import('./contratos/liberacaoVia');
const A = await import('./assinatura/servico');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

const mensagens: { tel: string; msg: string }[] = [];
A.definirEnviador(async (tel, msg) => { mensagens.push({ tel, msg }); });
let db: any, id = 0;
beforeAll(async () => {
  db = await getDb();
  const q = (e: number, n: number) => JSON.stringify([[e, n], [e + 55, n], [e + 55, n - 55], [e, n - 55]]);
  db.run(sql`INSERT INTO users (id, openId, name, role, creci) VALUES (1, 'u1', 'Admin Teste', 'admin', '4705')`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Bom Jardims', 'Açailândia', 'MA')`);
  db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, quadra, numero, areaM2, perimetroM, situacao, verticesUtm) VALUES (1, 'D16', 'D', 16, '3025.11', '220.01', 'disponivel', ${q(236000, 9455000)})`);
  db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{}', '{"vend_nome":"PROPRIETARIA FICTICIA"}')`);
  db.run(sql`INSERT INTO condicoesPagamento (empreendimentoId, precoBase, areaBaseM2, toleranciaAreaM2, entradaPct, entradaMaxParcelas, descontoAvistaPct, jurosAaEfetivo, metodo, prazos, comissaoTotalPct, comissaoCorretorPct, comissao1aParcelaPct, vigenteDesde, ativo)
    VALUES (1, '160000', '3025.11', '1', '0.30', 6, '0.0625', '0.06', 'PRICE', '[12,24,36,60,120]', '0.05', '0.02', '0.5', '2026-10-23', 1)`);
  const r = await S.criarContrato({ empreendimentoSlug: 'bom-jardims', loteCodigo: 'D16', corretorUserId: 1,
    plano: { modalidade: 'financiado', entradaParcelas: 1, prazo: 120, dataPrimeiroPagamento: '2026-12-10' },
    comprador: { nome: 'Compradora Ficticia', cpf: '529.982.247-25', estadoCivil: 'solteiro', telefone1: '(99) 9 9123-4567', logradouro: 'Rua A', cidade: 'Açailândia', uf: 'MA' } }, 1);
  id = r.id;
  db.run(sql`INSERT INTO cobrancas (contratoId, tipo, numero, total, vencimento, valor, status) VALUES (${id}, 'entrada', 1, 1, '2026-12-10', '48000', 'emitida')`);
  db.run(sql`INSERT INTO assinaturaSignatarios (contratoId, papel, nome, cpf, whatsapp, metodo, ordem, status, token, expiraEm, revisaoManual) VALUES (${id}, 'comprador', 'Compradora Ficticia', '52998224725', '5599991234567', 'avancada', 1, 'assinado', 'tok1', '2030-01-01 00:00:00', 0)`);
});

describe('via assinada liberada só com a entrada paga', () => {
  it('antes do pagamento: bloqueada para a compradora que já assinou (os demais veem); sem envio', async () => {
    expect((await L.situacaoDaVia(id)).liberada).toBe(false);
    expect(await L.bloquearViaParaSignatario(id, { papel: 'comprador', status: 'assinado' })).toMatch(/depois da compensação do pagamento da entrada/);
    expect(await L.bloquearViaParaSignatario(id, { papel: 'comprador', status: 'pendente' })).toBeNull(); // lê para assinar
    expect(await L.bloquearViaParaSignatario(id, { papel: 'vendedora', status: 'assinado' })).toBeNull();
    db.run(sql`UPDATE contratos SET manifestoArquivo = 'contratos/x/manifesto.pdf' WHERE id = ${id}`);
    expect(await L.enviarViaAssinadaSeLiberada(id)).toMatchObject({ enviado: false, motivo: 'entrada não paga' });
  });

  it('paga a entrada: liberada e enviada pelo WhatsApp uma vez só', async () => {
    db.run(sql`UPDATE cobrancas SET status = 'paga' WHERE contratoId = ${id} AND tipo = 'entrada'`);
    expect((await L.situacaoDaVia(id)).liberada).toBe(true);
    expect(await L.enviarViaAssinadaSeLiberada(id)).toEqual({ enviado: true });
    expect(mensagens.at(-1)!.msg).toMatch(/Pagamento da entrada confirmado.*via assinada do contrato/s);
    expect(mensagens.at(-1)!.tel).toBe('5599991234567');
    expect(await L.enviarViaAssinadaSeLiberada(id)).toMatchObject({ enviado: false, motivo: 'já enviada' });
  });
});

describe('credenciais do corretor anexas ao contrato de intermediação', () => {
  it('puxa a carteira CRECI e a certidão do cadastro do corretor, com a validade no rótulo', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    db.run(sql`INSERT INTO usuarioDocumentos (usuarioId, tipo, nome, mime, conteudoBase64, validade, titular) VALUES (1, 'cartao_creci', 'creci.png', 'image/png', ${png}, '2027-12-31', 'usuario')`);
    db.run(sql`INSERT INTO usuarioDocumentos (usuarioId, tipo, nome, mime, conteudoBase64, validade, titular) VALUES (1, 'certidao_creci', 'certidao.png', 'image/png', ${png}, '2026-12-31', 'usuario')`);
    const r = await S.credenciaisAnexoDoContrato(id);
    expect(r.map(x => x.rotulo)).toEqual([
      'Carteira de identidade profissional (CRECI) — Admin Teste (válida até 31/12/2027)',
      'Certidão de regularidade do CRECI — Admin Teste (válida até 31/12/2026)',
    ]);
    const c = await S.credenciaisDoUsuario(1);
    expect(c.creciValidade).toBe('2027-12-31');
    expect(c.certidaoValidade).toBe('2026-12-31');
  });
});
