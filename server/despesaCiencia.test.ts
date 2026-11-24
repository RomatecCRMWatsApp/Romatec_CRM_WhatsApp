import { beforeAll, describe, expect, it } from 'vitest';

// Ciência da proprietária numa saída de recursos: pedido com o resumo no WhatsApp, confirmação com código pela
// mesma página das autorizações (/aditivo/:token), manifesto no PDF e situação na lista de despesas. Banco em memória.
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const R = await import('./financeiro/renegociacao');
const C = await import('./financeiro/despesaCiencia');
const D = await import('./financeiro/despesas');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

describe('ciência da proprietária nas despesas', () => {
  let db: any;
  const msgs: [string, string][] = [];
  let despesaId = 0;
  beforeAll(async () => {
    db = await getDb();
    R.definirEnviador(async (t, m) => { msgs.push([t, m]); });
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
    db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{}', ${JSON.stringify({ vend_nome: 'VERA PROPRIETARIA FICTICIA', vend_cpf: '111.444.777-35', vend_telefone: '(99) 9 9000-0001' })})`);
    const r = await D.lancarDespesa({ descricao: 'Abertura das Ruas CCBJ', categoria: 'obras', empreendimentoId: 1, fornecedor: 'Construsul', valor: 12000, vencimento: '2026-11-24', meses: 1, pagoEm: '2026-11-24', formaPagamento: 'PIX', observacao: 'Pix ID E195' } as any, 1);
    despesaId = r.ids[0];
  });

  it('o texto do WhatsApp traz valor, destino, o que é e o link', () => {
    const t = C.mensagemCiencia({
      proprietaria: { nome: 'VERA PROPRIETARIA', documento: '', empresa: '', telefone: '' }, empreendimento: 'Bom Jardims', link: 'https://x/aditivo/abc',
      despesa: { id: 9, descricao: 'Abertura das Ruas', categoria: 'obras', fornecedor: 'Construsul', valor: 12000, valorPago: 12000, vencimento: '2026-11-24', pagoEm: '2026-11-24', forma: 'PIX', observacao: null, comprovanteUrl: 'u', status: 'paga' },
    });
    expect(t).toContain('Olá, VERA!');
    expect(t).toContain('Valor: R$ 12.000,00');
    expect(t).toContain('Destino: Construsul');
    expect(t).toContain('Abertura das Ruas (Obras e infraestrutura)');
    expect(t).toContain('Pago em 24/11/2026 por Pix');
    expect(t).toContain('https://x/aditivo/abc');
  });

  it('pede a ciência: vai ao WhatsApp da proprietária e a lista mostra "aguardando"', async () => {
    const r = await C.pedirCiencia(despesaId, 1);
    expect(r).toMatchObject({ ok: true, enviado: true, proprietaria: 'VERA PROPRIETARIA FICTICIA' });
    expect(msgs.at(-1)![0]).toBe('5599990000001');
    expect(msgs.at(-1)![1]).toMatch(/R\$ 12\.000,00[\s\S]*Construsul/);
    const lista = await D.listarDespesas({ situacao: 'todas' } as any);
    expect(lista.linhas.find(l => l.id === despesaId)!.ciencia).toMatchObject({ status: 'aguardando' });
  });

  it('novo pedido substitui o anterior: o link antigo não serve mais', async () => {
    const antigo = db.all(sql`SELECT token FROM despesaCiencias WHERE despesaId = ${despesaId} ORDER BY id`)[0].token;
    await C.pedirCiencia(despesaId, 1);
    const c = await C.porToken(antigo);
    expect((await C.paginaPublica(c)).status).toBe('cancelado');
    await expect(C.enviarCodigoPublico(c)).rejects.toThrow(/substituído/);
  });

  it('a proprietária confirma com o código: fica ciente, com manifesto no PDF, e a lista mostra a data', async () => {
    const token = db.all(sql`SELECT token FROM despesaCiencias WHERE despesaId = ${despesaId} AND status = 'aguardando'`)[0].token;
    const c = await C.porToken(token);
    const pagina = await C.paginaPublica(c);
    expect(pagina).toMatchObject({ tipo: 'ciencia_despesa', comprador: 'VERA', status: 'aguardando' });
    expect(pagina.pontos[0]).toBe('Valor: R$ 12.000,00');
    await C.enviarCodigoPublico(c);
    const codigo = msgs.at(-1)![1].match(/(\d{6})/)![1];
    await expect(C.assinarPublico(await C.porToken(token), '000000', { aceite: true, ip: '1.2.3.4', ua: 't' })).rejects.toThrow(/incorreto/);
    await C.assinarPublico(await C.porToken(token), codigo, { aceite: true, ip: '1.2.3.4', ua: 'teste' });
    const lista = await D.listarDespesas({ situacao: 'todas' } as any);
    const ci = lista.linhas.find(l => l.id === despesaId)!.ciencia!;
    expect(ci.status).toBe('ciente');
    expect(ci.em).toBeTruthy();
    const pdf = await C.pdfDaCiencia(despesaId);
    expect(pdf!.nome).toMatch(/confirmada/);
    await expect(C.assinarPublico(await C.porToken(token), codigo, { aceite: true, ip: '1.2.3.4', ua: 't' })).rejects.toThrow(/já foi confirmada/);
  });

  it('despesa do escritório (sem empreendimento) não tem proprietária para dar ciência', async () => {
    const r = await D.lancarDespesa({ descricao: 'Aluguel do escritório', categoria: 'administrativo', empreendimentoId: null, fornecedor: null, valor: 900, vencimento: '2026-12-05', meses: 1, observacao: null } as any, 1);
    await expect(C.pedirCiencia(r.ids[0], 1)).rejects.toThrow(/sem empreendimento/);
  });
});
