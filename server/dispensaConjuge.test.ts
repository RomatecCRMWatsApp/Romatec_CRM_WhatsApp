import { beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';

// Dispensa da assinatura do(a) cônjuge do comprador no envio para assinatura (dados fictícios)
process.env.DATABASE_DRIVER = 'sqlite';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
process.env.SQLITE_PATH = ':memory:';

const A = await import('./assinatura/servico');
const C = await import('./contratos/servico');
const { linhaDoTempo } = await import('./contratos/linhaTempo');
const { salvarArquivo } = await import('./contratos/arquivos');
const schema = await import('../drizzle/schema');
const { getDb } = await import('./db');
const { sql, eq } = await import('drizzle-orm');

const mensagens: { tel: string; msg: string }[] = [];
A.definirEnviador(async (tel, msg) => { mensagens.push({ tel, msg }); });
let db: any, contratoId = 0;

beforeAll(async () => {
  db = await getDb();
  const q = (e: number, n: number) => JSON.stringify([[e, n], [e + 55, n], [e + 55, n - 55], [e, n - 55]]);
  db.run(sql`INSERT INTO users (id, openId, name, role, creci, telefone, email, cpf) VALUES (1, 'u1', 'Gestor Ficticio de Teste', 'admin', '4705', '99991811246', 'gestor@exemplo.com', '22233366638')`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
  db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, quadra, numero, areaM2, perimetroM, situacao, verticesUtm) VALUES (1, 'A01', 'A', 1, '3025.11', '220.01', 'disponivel', ${q(236000, 9455000)})`);
  db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{}', ${JSON.stringify({ vend_nome: 'MARIA SINTETICA DE TESTE', vend_cpf: '529.982.247-25', vend_telefone: '(99) 9 9000-0001' })})`);
  db.run(sql`INSERT INTO condicoesPagamento (empreendimentoId, precoBase, areaBaseM2, toleranciaAreaM2, entradaPct, entradaMaxParcelas, descontoAvistaPct, jurosAaEfetivo, metodo, prazos, comissaoTotalPct, comissaoCorretorPct, comissao1aParcelaPct, vigenteDesde, ativo)
    VALUES (1, '160000', '3025.11', '1', '0.30', 6, '0.0625', '0.06', 'PRICE', '[12,24,36,60,120]', '0.05', '0.02', '0.5', '2026-10-23', 1)`);
  // Cônjuge sem WhatsApp: com a dispensa, isso não pode travar o envio
  const r = await C.criarContrato({
    empreendimentoSlug: 'bom-jardims', loteCodigo: 'A01', corretorUserId: 1,
    plano: { modalidade: 'financiado', entradaParcelas: 6, prazo: 120, dataPrimeiroPagamento: '2026-12-10' },
    comprador: { nome: 'Carlos Eduardo Ficticio', cpf: '52998224725', estadoCivil: 'casado', regimeBens: 'comunhao_parcial', telefone1: '(99) 9 9123-4567', logradouro: 'Rua A', cidade: 'Açailândia', uf: 'MA' },
    conjuge: { nome: 'Ana Paula Ficticia', cpf: '11144477735', telefone1: '' },
  }, 1);
  contratoId = r.id;
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  d.addPage().drawText('Contrato de teste', { x: 50, y: 700, font: f });
  const pdf = Buffer.from(await d.save({ useObjectStreams: false }));
  await salvarArquivo(`contratos/${contratoId}/v001-definitivo.pdf`, pdf);
  await db.insert(schema.contratoVersoes).values({ contratoId, versao: 1, etapa: 'gerado', arquivo: `contratos/${contratoId}/v001-definitivo.pdf`, sha256: 'x'.repeat(64), bytes: pdf.length, criadoEm: new Date() });
  await db.update(schema.contratos).set({ status: 'apto_assinatura', pdfAtual: `contratos/${contratoId}/v001-definitivo.pdf` }).where(eq(schema.contratos.id, contratoId));
});

describe('dispensa da assinatura do(a) cônjuge', () => {
  it('exige motivo e cônjuge no contrato', async () => {
    await expect(A.enviarParaAssinatura(contratoId, {}, 1, { dispensaConjuge: { motivo: 'x' } })).rejects.toMatchObject({ codigo: 'DISPENSA' });
    await expect(A.enviarParaAssinatura(contratoId, {}, 1)).rejects.toMatchObject({ codigo: 'PENDENCIAS' }); // cônjuge sem WhatsApp
  });

  it('envia sem o(a) cônjuge, registra a dispensa e não convida quem foi dispensado', async () => {
    const r = await A.enviarParaAssinatura(contratoId, {}, 1, { dispensaConjuge: { motivo: 'Cônjuge em viagem; dispensada a pedido do comprador' } });
    expect(r.signatarios).toBe(3);
    const papeis = (await db.select().from(schema.assinaturaSignatarios)).map((s: any) => s.papel).sort();
    expect(papeis).toEqual(['comprador', 'intermediadora', 'vendedora']);
    expect(mensagens.some(m => /Ana Paula/.test(m.msg))).toBe(false);
    const ev = (await db.select().from(schema.assinaturaEventos)).find((e: any) => e.evento === 'conjuge_dispensado');
    expect(JSON.parse(typeof ev.detalhe === 'string' ? ev.detalhe : JSON.stringify(ev.detalhe))).toMatchObject({ nome: 'Ana Paula Ficticia', motivo: 'Cônjuge em viagem; dispensada a pedido do comprador' });
    const lt: any = await linhaDoTempo(contratoId);
    const itens = (lt.etapas ?? lt.itens ?? lt) as any[];
    expect(JSON.stringify(itens)).toContain('dispensada');
  });
});
