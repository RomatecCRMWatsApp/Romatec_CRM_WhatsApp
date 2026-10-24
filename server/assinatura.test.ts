import { beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';

// Banco local em memória (SQLite) com as mesmas tabelas da produção
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const A = await import('./assinatura/servico');
const C = await import('./contratos/servico');
const { pfxDeTeste } = await import('./assinatura/testeCertificado');
const { assinarICP, extrairUltimaAssinatura, temAssinaturaDigital } = await import('./assinatura/icp');
const { salvarArquivo } = await import('./contratos/arquivos');
const schema = await import('../drizzle/schema');
const { getDb } = await import('./db');
const { sql, eq } = await import('drizzle-orm');

const mensagens: { tel: string; msg: string }[] = [];
A.definirEnviador(async (tel, msg) => { mensagens.push({ tel, msg }); });
const ultimoCodigo = () => mensagens.filter(m => /Código para assinar/.test(m.msg)).at(-1)!.msg.match(/(\d{6})/)![1];

let db: any, contratoId = 0;
const sig = async (papel: string) => (await db.select().from(schema.assinaturaSignatarios)).find((s: any) => s.papel === papel);
const versoes = async () => (await db.select().from(schema.contratoVersoes)).filter((v: any) => v.contratoId === contratoId).sort((a: any, b: any) => a.versao - b.versao);

beforeAll(async () => {
  db = await getDb();
  const q = (e: number, n: number) => JSON.stringify([[e, n], [e + 55, n], [e + 55, n - 55], [e, n - 55]]);
  db.run(sql`INSERT INTO users (id, openId, name, role, creci, telefone, email) VALUES (1, 'u1', 'José Romário Pinto Bezerra', 'admin', '4705', '99991811246', 'jose@exemplo.com')`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
  db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, quadra, numero, areaM2, perimetroM, situacao, verticesUtm) VALUES (1, 'A01', 'A', 1, '3025.11', '220.01', 'disponivel', ${q(236000, 9455000)})`);
  db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{}', ${JSON.stringify({ vend_nome: 'VALMA MARILDA BONJARDIM FIGUEREDO', vend_cpf: '364.274.623-34', vend_telefone: '(99) 9 9101-1970' })})`);
  db.run(sql`INSERT INTO condicoesPagamento (empreendimentoId, precoBase, areaBaseM2, toleranciaAreaM2, entradaPct, entradaMaxParcelas, descontoAvistaPct, jurosAaEfetivo, metodo, prazos, comissaoTotalPct, comissaoCorretorPct, comissao1aParcelaPct, vigenteDesde, ativo)
    VALUES (1, '160000', '3025.11', '1', '0.30', 6, '0.0625', '0.06', 'PRICE', '[12,24,36,60,120]', '0.05', '0.02', '0.5', '2026-10-23', 1)`);
  const r = await C.criarContrato({
    empreendimentoSlug: 'bom-jardims', loteCodigo: 'A01', corretorUserId: 1,
    plano: { modalidade: 'financiado', entradaParcelas: 6, prazo: 120, dataPrimeiroPagamento: '2026-12-10' },
    comprador: { nome: 'Carlos Eduardo Mendes', cpf: '52998224725', estadoCivil: 'casado', regimeBens: 'comunhao_parcial', telefone1: '(99) 9 9123-4567', logradouro: 'Rua A', cidade: 'Açailândia', uf: 'MA' },
    conjuge: { nome: 'Ana Paula Ribeiro Mendes', cpf: '11144477735', telefone1: '(99) 9 9765-4321' },
  }, 1);
  contratoId = r.id;
  // "Definitivo" de teste (a geração real usa o LibreOffice): um PDF simples como versão atual
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i++) d.addPage().drawText(`Contrato de teste — página ${i + 1}`, { x: 50, y: 700, font: f });
  const pdf = Buffer.from(await d.save({ useObjectStreams: false }));
  await salvarArquivo(`contratos/${contratoId}/v001-definitivo.pdf`, pdf);
  await db.insert(schema.contratoVersoes).values({ contratoId, versao: 1, etapa: 'gerado', arquivo: `contratos/${contratoId}/v001-definitivo.pdf`, sha256: 'x'.repeat(64), bytes: pdf.length, criadoEm: new Date() });
  await db.update(schema.contratos).set({ status: 'apto_assinatura', pdfAtual: `contratos/${contratoId}/v001-definitivo.pdf` }).where(eq(schema.contratos.id, contratoId));
});

describe('assinatura eletrônica — fluxo completo', () => {
  it('signatários previstos; pendência de CPF impede o envio', async () => {
    const prev = await A.signatariosPrevistos(contratoId);
    expect(prev.map(s => s.papel)).toEqual(['comprador', 'conjuge', 'vendedora', 'intermediadora']);
    expect(A.pendenciasSignatarios(prev)).toEqual(['intermediadora: CPF']);
    await expect(A.enviarParaAssinatura(contratoId, {}, 1)).rejects.toMatchObject({ codigo: 'PENDENCIAS' });
    db.run(sql`UPDATE users SET cpf = '22233366638' WHERE id = 1`);
  });

  it('envio: página de assinaturas, caixas ICP/gov.br marcadas, links individuais e convites por WhatsApp', async () => {
    const r = await A.enviarParaAssinatura(contratoId, { vendedora: 'icp_a1', intermediadora: 'govbr' }, 1);
    expect(r.signatarios).toBe(4);
    expect(r.convites.every(c => c.enviado)).toBe(true);
    expect(mensagens.filter(m => /está pronto para a sua assinatura/.test(m.msg)).map(m => m.tel)).toEqual(['5599991234567', '5599997654321', '5599991011970', '5599991811246']);
    expect((await C.contratoPorId(contratoId)).status).toBe('em_assinatura');
    const pdf = await A.pdfAtual(contratoId);
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(4); // + quadro de assinaturas
    expect((await A.posicoesDe(contratoId, 'x')).map(c => c.papel).sort()).toEqual(['comprador', 'conjuge', 'intermediadora', 'vendedora']);
    expect((await sig('comprador')).token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('ICP/gov.br esperam as avançadas; link inválido não abre', async () => {
    const v = await sig('vendedora');
    await expect(A.assinarComCertificado(v.token, pfxDeTeste({ nome: 'VALMA', cpf: '36427462334', senha: 'x' }), 'x', { ip: '1.1.1.1' })).rejects.toMatchObject({ codigo: 'AGUARDE' });
    await expect(A.signatarioPorToken('a'.repeat(43))).rejects.toMatchObject({ status: 404 });
  });

  it('avançada: exige leitura e aceite; código errado conta tentativa; código certo carimba e assina', async () => {
    const c = await sig('comprador');
    await A.solicitarOtp(c.token, { ip: '10.0.0.1' });
    await expect(A.solicitarOtp(c.token)).rejects.toMatchObject({ codigo: 'AGUARDE' }); // 1 código por minuto
    await expect(A.confirmarAvancada(c.token, ultimoCodigo(), { ip: '10.0.0.1', leuAteOFim: false, aceite: true })).rejects.toMatchObject({ codigo: 'LEITURA' });
    await expect(A.confirmarAvancada(c.token, '000000' === ultimoCodigo() ? '111111' : '000000', { ip: '10.0.0.1', leuAteOFim: true, aceite: true })).rejects.toMatchObject({ codigo: 'OTP_INVALIDO' });
    const r = await A.confirmarAvancada(c.token, ultimoCodigo(), { ip: '10.0.0.1', ua: 'teste', leuAteOFim: true, aceite: true });
    expect(r.concluido).toBe(false);
    const depois = await sig('comprador');
    expect(depois.status).toBe('assinado');
    expect((await versoes()).at(-1).etapa).toBe(`carimbo_avancada:${c.id}`);
    expect(JSON.parse(depois.evidenciasJson)).toMatchObject({ ip: '10.0.0.1', otpCanal: 'whatsapp', carimbado: true });
    const j = await sig('conjuge');
    await A.solicitarOtp(j.token);
    await A.confirmarAvancada(j.token, ultimoCodigo(), { ip: '10.0.0.2', leuAteOFim: true, aceite: true });
    await expect(A.confirmarAvancada(j.token, '123456', { ip: '10.0.0.2', leuAteOFim: true, aceite: true })).rejects.toMatchObject({ codigo: 'ASSINADO' });
  });

  it('ICP A1: CPF do certificado tem de conferir; assina incremental e zera o .pfx', async () => {
    const v = await sig('vendedora');
    await expect(A.assinarComCertificado(v.token, pfxDeTeste({ nome: 'OUTRA PESSOA', cpf: '52998224725', senha: 's' }), 's', { ip: '1.1.1.1' })).rejects.toMatchObject({ codigo: 'CPF' });
    await expect(A.assinarComCertificado(v.token, pfxDeTeste({ nome: 'VALMA', cpf: '36427462334', senha: 's' }), 'errada', { ip: '1.1.1.1' })).rejects.toMatchObject({ codigo: 'CERTIFICADO' });
    const antes = await A.pdfAtual(contratoId);
    const pfx = pfxDeTeste({ nome: 'VALMA MARILDA BONJARDIM FIGUEREDO', cpf: '36427462334', senha: 's' });
    await A.assinarComCertificado(v.token, pfx, 's', { ip: '1.1.1.1' });
    expect(pfx.every(b => b === 0)).toBe(true);
    const depois = await A.pdfAtual(contratoId);
    expect(depois.subarray(0, antes.length).equals(antes)).toBe(true);
    expect(extrairUltimaAssinatura(depois)?.cpf).toBe('36427462334');
  });

  it('gov.br: só aceita a versão atual assinada pelo próprio titular; conclui com manifesto e contrato ativo', async () => {
    const g = await sig('intermediadora');
    const atual = await A.pdfAtual(contratoId);
    await expect(A.receberGovbr(g.token, Buffer.from('%PDF-1.7 outro arquivo'), { ip: '2.2.2.2' })).rejects.toMatchObject({ codigo: 'ARQUIVO' });
    const deOutro = await assinarICP(atual, pfxDeTeste({ nome: 'INTRUSO', cpf: '52998224725', senha: 's' }), 's', { motivo: 'x', nome: 'INTRUSO' });
    await expect(A.receberGovbr(g.token, deOutro, { ip: '2.2.2.2' })).rejects.toMatchObject({ codigo: 'TITULAR' });
    const doTitular = await assinarICP(atual, pfxDeTeste({ nome: 'JOSE ROMARIO PINTO BEZERRA', cpf: '22233366638', senha: 's' }), 's', { motivo: 'gov.br', nome: 'JOSE' });
    const r = await A.receberGovbr(g.token, doTitular, { ip: '2.2.2.2' });
    expect(r.concluido).toBe(true);
    const c = await C.contratoPorId(contratoId);
    expect(c.status).toBe('ativo');
    expect(c.manifestoArquivo).toMatch(/manifesto/);
    expect(temAssinaturaDigital(await A.pdfAtual(contratoId))).toBe(true);
    expect((await db.select().from(schema.cobrancas)).length).toBe(126);
    expect((await db.select().from(schema.lotes))[0].situacao).toBe('vendido_parcelado');
  });

  it('verificação pública mascara dados e confere o arquivo final pelo SHA-256', async () => {
    const c = await C.contratoPorId(contratoId);
    const v = await A.verificacaoPublica(c.codigoVerificacao);
    expect(v.status).toBe('ativo');
    expect(v.signatarios.every(s => s.status === 'assinado')).toBe(true);
    expect(v.signatarios[0]).toMatchObject({ nome: 'Carlos E. M.', cpf: '529.***.***-25' });
    expect(await A.conferirArquivo(c.codigoVerificacao, c.hashAtual)).toMatchObject({ confere: true, versaoFinal: true });
    expect(await A.conferirArquivo(c.codigoVerificacao, 'a'.repeat(64))).toMatchObject({ confere: false });
  });
});
