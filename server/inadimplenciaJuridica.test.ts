import { beforeAll, describe, expect, it } from 'vitest';

// Inadimplência no portal jurídico + assinatura com certificado digital guardado (cifrado; senha nunca guardada)
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste-com-mais-de-16-caracteres';

const S = await import('./contratos/servico');
const C = await import('./certificado/servico');
const J = await import('./juridico/inadimplencia');
const { pfxDeTeste } = await import('./assinatura/testeCertificado');
const { extrairUltimaAssinatura } = await import('./assinatura/icp');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

let db: any, contratoId = 0;
const dia = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const HOJE = dia(0);

beforeAll(async () => {
  db = await getDb();
  const q = (e: number, n: number) => JSON.stringify([[e, n], [e + 55, n], [e + 55, n - 55], [e, n - 55]]);
  db.run(sql`INSERT INTO users (id, openId, name, role, cpf) VALUES (1, 'adm', 'Admin Teste', 'admin', '22233366638')`);
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil, empreendimentoSlug, cpf, oab, oabUf) VALUES (2, 'adv', 'Advogada Ficticia', 'user', 'juridico', 'bom-jardims', '52998224725', '12345', 'MA')`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Bom Jardims', 'Açailândia', 'MA')`);
  db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, quadra, numero, areaM2, perimetroM, situacao, verticesUtm) VALUES (1, 'D16', 'D', 16, '3025.11', '220.01', 'disponivel', ${q(236000, 9455000)})`);
  db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{}', '{"vend_nome":"PROPRIETARIA FICTICIA","vend_cpf":"11144477735"}')`);
  db.run(sql`INSERT INTO condicoesPagamento (empreendimentoId, precoBase, areaBaseM2, toleranciaAreaM2, entradaPct, entradaMaxParcelas, descontoAvistaPct, jurosAaEfetivo, metodo, prazos, comissaoTotalPct, comissaoCorretorPct, comissao1aParcelaPct, vigenteDesde, ativo)
    VALUES (1, '160000', '3025.11', '1', '0.30', 6, '0.0625', '0.06', 'PRICE', '[12,24,36,60,120]', '0.05', '0.02', '0.5', '2026-10-23', 1)`);
  const r = await S.criarContrato({ empreendimentoSlug: 'bom-jardims', loteCodigo: 'D16', corretorUserId: 1,
    plano: { modalidade: 'financiado', entradaParcelas: 1, prazo: 120, dataPrimeiroPagamento: '2026-12-10' },
    comprador: { nome: 'Compradora Ficticia', cpf: '529.982.247-25', estadoCivil: 'solteiro', telefone1: '(99) 9 9123-4567', logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Açailândia', uf: 'MA' } }, 1);
  contratoId = r.id;
  db.run(sql`UPDATE contratos SET status = 'ativo' WHERE id = ${contratoId}`);
  for (const [n, venc] of [[1, dia(-95)], [2, dia(-65)], [3, dia(-35)]] as const) {
    db.run(sql`INSERT INTO cobrancas (contratoId, tipo, numero, total, vencimento, valor, status) VALUES (${contratoId}, 'saldo', ${n}, 120, ${venc}, '1287.81', 'emitida')`);
  }
  db.run(sql`INSERT INTO cobrancas (contratoId, tipo, numero, total, vencimento, valor, status) VALUES (${contratoId}, 'saldo', 4, 120, ${dia(25)}, '1287.81', 'prevista')`);
});

describe('certificado digital guardado', () => {
  it('guarda só o .pfx cifrado; recusa certificado de outra pessoa', async () => {
    await expect(C.guardarCertificado(2, pfxDeTeste({ nome: 'OUTRA PESSOA', cpf: '11144477735', senha: 's' }), 's')).rejects.toThrow(/outra pessoa/);
    await expect(C.guardarCertificado(2, pfxDeTeste({ nome: 'ADVOGADA FICTICIA', cpf: '52998224725', senha: 's' }), 'errada')).rejects.toThrow(/Senha incorreta/);
    const r = await C.guardarCertificado(2, pfxDeTeste({ nome: 'ADVOGADA FICTICIA', cpf: '52998224725', senha: 's' }), 's');
    expect(r).toMatchObject({ titular: 'ADVOGADA FICTICIA', cpf: '529.***.***-25', vencido: false });
    const [linha]: any[] = db.all(sql`SELECT * FROM certificadosUsuario WHERE usuarioId = 2`);
    expect(linha.pfxCifrado).not.toContain('ADVOGADA');
    expect(Object.values(linha).join(' ')).not.toContain('"s"');
    expect(C.decifrar(linha).length).toBeGreaterThan(500);
  });
});

describe('inadimplência', () => {
  it('parcela vencida: alerta já a partir da primeira, valores atualizados pela Cláusula 7ª', async () => {
    const lista = await J.inadimplentes(1, HOJE);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ contratoId, qtd: 3, alerta: true, comprador: 'Compradora Ficticia' });
    expect(lista[0].atualizado).toBeGreaterThan(lista[0].valor);
    expect(lista[0].maiorAtraso).toBeGreaterThanOrEqual(95);
    expect((await J.inadimplentes(1, HOJE, 4))[0].alerta).toBe(false);
  });

  it('gera notificação, requerimento (Títulos e Documentos sem registro) e a ata só depois dos 30 dias', async () => {
    const n = await J.gerarDocumento(contratoId, 'notificacao', 2, HOJE);
    const rq = await J.gerarDocumento(contratoId, 'requerimento', 2, HOJE);
    expect(n.id).toBeGreaterThan(0);
    if (process.env.SALVAR_DOCS) {
      const { writeFileSync } = await import('node:fs');
      for (const [t, o] of [['notificacao', {}], ['requerimento', {}], ['ata', { dataIntimacao: dia(-40), protocolo: 'RTD 1234' }]] as const) writeFileSync(`${process.env.SALVAR_DOCS}/${t}.pdf`, (await J.pdfDocumento(contratoId, t, HOJE, o as any)).pdf);
    }
    const docs = await J.documentosDo(1);
    expect(docs.map(d => d.tipo).sort()).toEqual(['notificacao', 'requerimento']);
    expect(docs.find(d => d.id === rq.id)!.titulo).toMatch(/Requerimento de notificação/);
    await expect(J.gerarDocumento(contratoId, 'ata', 2, HOJE)).rejects.toThrow(/data em que/);
    await expect(J.gerarDocumento(contratoId, 'ata', 2, HOJE, { dataIntimacao: dia(-10) })).rejects.toThrow(/só termina/);
    const ata = await J.gerarDocumento(contratoId, 'ata', 2, HOJE, { dataIntimacao: dia(-40), protocolo: 'RTD 1234' });
    expect(ata.id).toBeGreaterThan(rq.id);
  });

  it('memorial de cálculo do débito, restituição pelos tetos do art. 32-A e cancelamento só com registro no RI', async () => {
    const m = await J.pdfDocumento(contratoId, 'memorial', HOJE);
    expect(m.dados.parcelas).toBe(3);
    expect(m.dados.totalAtualizado).toBeGreaterThan(m.dados.totalOriginal);
    db.run(sql`UPDATE cobrancas SET status = 'paga', valorPago = '1300', valorOriginal = '1287.81' WHERE contratoId = ${contratoId} AND numero = 4`);
    db.run(sql`UPDATE contratos SET usoLiberadoEm = ${dia(-100) + ' 12:00:00'} WHERE id = ${contratoId}`);
    const r = await J.pdfDocumento(contratoId, 'restituicao', HOJE, { outrosDebitos: 50 });
    expect(r.dados.pago).toBe(1300);
    expect(r.dados.encargos).toBeCloseTo(12.19, 2);
    expect(r.dados.multa).toBeCloseTo(r.dados.valorContrato * 0.1, 2);
    expect(r.dados.saldo).toBe(Math.max(0, Math.round((1300 - r.dados.deducoes) * 100) / 100));
    db.run(sql`UPDATE cobrancas SET status = 'prevista', valorPago = NULL WHERE contratoId = ${contratoId} AND numero = 4`);
    await expect(J.pdfDocumento(contratoId, 'cancelamento', HOJE, { via: 'rtd', dataIntimacao: dia(-40), protocolo: 'C1' })).rejects.toThrow(/não há o que cancelar/);
    await expect(J.pdfDocumento(contratoId, 'cancelamento', HOJE, { via: 'ri', dataIntimacao: dia(-40) })).rejects.toThrow(/certidão/);
    const c = await J.pdfDocumento(contratoId, 'cancelamento', HOJE, { via: 'ri', dataIntimacao: dia(-40), protocolo: 'C-77' });
    expect(c.dados.certidao).toBe('C-77');
    if (process.env.SALVAR_DOCS) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(`${process.env.SALVAR_DOCS}/memorial.pdf`, m.pdf); writeFileSync(`${process.env.SALVAR_DOCS}/restituicao.pdf`, r.pdf); writeFileSync(`${process.env.SALVAR_DOCS}/cancelamento.pdf`, c.pdf);
    }
  });

  it('advogado assina com o certificado guardado e o administrador com o .pfx enviado agora: duas assinaturas no mesmo PDF', async () => {
    const [doc] = (await J.documentosDo(1)).filter(d => d.tipo === 'notificacao');
    await expect(J.assinarDocumento(doc.id, { id: 2 }, 'errada')).rejects.toThrow(/Senha incorreta/);
    expect(await J.assinarDocumento(doc.id, { id: 2 }, 's')).toMatchObject({ assinaturas: 1, nome: 'ADVOGADA FICTICIA' });
    await expect(J.assinarDocumento(doc.id, { id: 2 }, 's')).rejects.toThrow(/já assinou/);
    await expect(J.assinarDocumento(doc.id, { id: 1 }, 's')).rejects.toThrow(/ainda não guardou/);
    const pfxAdm = pfxDeTeste({ nome: 'ADMIN TESTE', cpf: '22233366638', senha: 'a' });
    expect(await J.assinarDocumento(doc.id, { id: 1 }, 'a', pfxAdm)).toMatchObject({ assinaturas: 2 });
    expect(pfxAdm.every(b => b === 0)).toBe(true); // .pfx enviado agora não fica na memória nem no banco
    const { buf } = await J.pdfDoDocumento(doc.id);
    expect(buf.toString('latin1').split('/ByteRange').length - 1).toBe(2);
    expect(extrairUltimaAssinatura(buf)).toMatchObject({ nome: 'ADMIN TESTE', cobreAteOFim: true });
    expect((await J.documentosDo(1)).find(d => d.id === doc.id)!.assinaturas.map(a => a.nome)).toEqual(['ADVOGADA FICTICIA', 'ADMIN TESTE']);
  });

  it('documento avulso: só PDF', async () => {
    await expect(J.salvarAvulso(1, 'Ofício ao cartório', Buffer.from('nao e pdf'), 2)).rejects.toThrow(/PDF/);
    const { PDFDocument } = await import('pdf-lib');
    const p = await PDFDocument.create(); p.addPage();
    const r = await J.salvarAvulso(1, 'Ofício ao cartório', Buffer.from(await p.save()), 2);
    expect(r.id).toBeGreaterThan(0);
  });

  it('avulso com xref compactada (Word, navegador, celular) é assinado: regrava com xref clássica antes da 1ª assinatura', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const p = await PDFDocument.create(); p.addPage();
    const bytes = Buffer.from(await p.save({ useObjectStreams: true }));
    expect(bytes.toString('latin1')).toContain('/XRef');
    const r = await J.salvarAvulso(1, 'Notificação avulsa', bytes, 2);
    expect(await J.assinarDocumento(r.id, { id: 2 }, 's')).toMatchObject({ assinaturas: 1 });
    const { buf } = await J.pdfDoDocumento(r.id);
    expect(extrairUltimaAssinatura(buf)).toMatchObject({ nome: 'ADVOGADA FICTICIA', cobreAteOFim: true });
  });
});
