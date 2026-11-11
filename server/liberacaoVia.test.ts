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
    // Certidão sem nº no cadastro (imagem): "constante da certidão anexa"; emissão = validade − 30 dias
    expect(c.certidaoCodigo).toBe('constante da certidão anexa');
    expect(c.certidaoEmissao).toBe('2026-12-01');
  });

  it('lê o nº/código no texto da certidão', () => {
    expect(S.numeroNaCertidao('CERTIDÃO DE REGULARIDADE Nº 12.345/2026 Certificamos que')).toBe('12.345/2026');
    expect(S.numeroNaCertidao('... Código de Controle: A1B2-C3D4-E5F6 ...')).toBe('A1B2-C3D4-E5F6');
    expect(S.numeroNaCertidao('Código de autenticidade 9F8E7D6C5B')).toBe('9F8E7D6C5B');
    expect(S.numeroNaCertidao('texto sem código')).toBeNull();
  });
});

describe('via oficial a todos os envolvidos', () => {
  it('proprietária recebe na hora; compradora só com a entrada paga; uma vez por pessoa', async () => {
    const q = (e: number, n: number) => JSON.stringify([[e, n], [e + 55, n], [e + 55, n - 55], [e, n - 55]]);
    db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, quadra, numero, areaM2, perimetroM, situacao, verticesUtm) VALUES (1, 'D17', 'D', 17, '3025.11', '220.01', 'disponivel', ${q(236100, 9455000)})`);
    const r2 = await S.criarContrato({ empreendimentoSlug: 'bom-jardims', loteCodigo: 'D17', corretorUserId: 1,
      plano: { modalidade: 'financiado', entradaParcelas: 1, prazo: 120, dataPrimeiroPagamento: '2026-12-10' },
      comprador: { nome: 'Outra Compradora Ficticia', cpf: '111.444.777-35', estadoCivil: 'solteiro', telefone1: '(99) 9 9222-3333', logradouro: 'Rua B', cidade: 'Açailândia', uf: 'MA' } }, 1);
    const id2 = r2.id;
    db.run(sql`INSERT INTO cobrancas (contratoId, tipo, numero, total, vencimento, valor, status) VALUES (${id2}, 'entrada', 1, 1, '2026-12-10', '48000', 'emitida')`);
    db.run(sql`INSERT INTO assinaturaSignatarios (contratoId, papel, nome, cpf, whatsapp, metodo, ordem, status, token, expiraEm, revisaoManual) VALUES (${id2}, 'comprador', 'Outra Compradora Ficticia', '11144477735', '5599992223333', 'avancada', 1, 'assinado', 'tok2', '2030-01-01 00:00:00', 0)`);
    db.run(sql`INSERT INTO assinaturaSignatarios (contratoId, papel, nome, cpf, whatsapp, metodo, ordem, status, token, expiraEm, revisaoManual) VALUES (${id2}, 'vendedora', 'Proprietaria Ficticia', '52998224725', '5599993334444', 'avancada', 2, 'assinado', 'tok3', '2030-01-01 00:00:00', 0)`);
    db.run(sql`UPDATE contratos SET manifestoArquivo = 'contratos/x/manifesto.pdf' WHERE id = ${id2}`);
    const r = await L.enviarViasAssinadas(id2);
    expect(r.enviados.map(x => x.papel)).toEqual(['vendedora']);
    expect(r.aguardando.map(x => x.papel)).toEqual(['comprador']);
    expect(mensagens.at(-1)!.msg).toMatch(/Todas as assinaturas do contrato/);
    expect((await L.enviarViasAssinadas(id2)).enviados).toEqual([]);
    db.run(sql`UPDATE cobrancas SET status = 'paga' WHERE contratoId = ${id2}`);
    expect((await L.enviarViasAssinadas(id2)).enviados.map(x => x.papel)).toEqual(['comprador']);
  });
});

describe('linha do tempo e resumo do contrato', () => {
  it('etapas com a data; feitas e pendentes; via enviada aparece', async () => {
    const T = await import('./contratos/linhaTempo');
    const etapas = await T.linhaDoTempo(id);
    expect(etapas[0]).toMatchObject({ chave: 'preenchido', feito: true });
    expect(etapas.find(e => e.chave === 'definitivo')!.feito).toBe(false);
    expect(etapas.find(e => e.chave === 'entrada')).toMatchObject({ feito: true });
    expect(etapas.some(e => e.chave.startsWith('via:') && e.feito && /WhatsApp/.test(e.titulo))).toBe(true);
    const lista = await S.listarContratos();
    const c = lista.find(x => x.id === id)!;
    expect(c.plano).toMatch(/120× de R\$/);
    expect(c.assinaturas).toEqual({ assinados: 1, total: 1 });
  });
  it('resumo: congelamento e condições específicas viram observação', async () => {
    const { resumoDoContrato } = await import('./contratos/linhaTempo');
    const r = resumoDoContrato({ simulacaoJson: { modalidade: 'financiado', condicao: 'C', complemento_ato: 10000, saldo_qtd: 120, saldo_parcela: 1234.51, total_pagar: 1, complemento_qtd: 12, complemento_parcela: 1055.56, complemento_modo: 'congelado', complemento_inicio_mes: 15 },
      dadosJson: { condicionantes: { ctr_condicoes_especificas: 'Liberação de uso após a 3ª parcela.' } } });
    expect(r.plano).toMatch(/^Plano C .*entrada R\$\s?10\.000,00 no ato \+ 120× de R\$\s?1\.234,51/);
    expect(r.observacoes[0]).toMatch(/congelado: 12× .* a partir do 15º mês, em carnê à parte/);
    expect(r.observacoes[1]).toMatch(/Condições específicas: Liberação de uso/);
  });
});
