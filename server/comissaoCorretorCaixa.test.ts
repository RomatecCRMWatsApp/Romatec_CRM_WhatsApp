import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
const Rep = await import('./financeiro/comissoesRepasse');
const G = await import('./financeiro/saldoProprietaria');
const Ren = await import('./financeiro/renegociacao');
const C = await import('./financeiro/despesaCiencia');
const F = await import('./financeiro/relatorios');
const S = await import('./financeiro/saidaComissao');
const Dem = await import('./financeiro/demonstrativoComissao');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

const ADMIN = { perfil: 'admin', acessos: {} } as any;
const plano = (extra: Record<string, unknown> = {}) => JSON.stringify({
  modalidade: 'financiado', condicao: 'A', entrada_qtd: 1, preco_tabela: 166230, entrada_valor: 10000, entrada_venc1: '2026-11-20',
  saldo_valor: 156230, saldo_qtd: 180, saldo_parcela: 1250.5, saldo_venc1: '2026-12-20', total_pagar: 235090,
  comissao_total: 8311.5, comissao_corretor: 3324.6, comissao_romatec: 4986.9,
  parcelas: [{ tipo: 'entrada', numero: 1, vencimento: '2026-11-20' }, ...[1, 2, 3, 4].map(n => ({ tipo: 'saldo', numero: n, vencimento: `2027-0${n}-20` }))],
  ...extra,
});
const textoPdf = (b64: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'dem-'));
  writeFileSync(join(dir, 'a.pdf'), Buffer.from(b64, 'base64'));
  return execFileSync('pdftotext', ['-layout', join(dir, 'a.pdf'), '-']).toString();
};

describe('comissão do corretor: sai do caixa da proprietária, com ciência e demonstrativo', () => {
  const aoCorretor: { tel: string; texto: string; mime: string | null; b64: string | null }[] = [];
  const aProprietaria: string[] = [];
  const guardados = new Map<string, Buffer>();
  let db: any;
  beforeAll(async () => {
    db = await getDb();
    Ren.definirEnviador(async (_t, m) => { aProprietaria.push(m); });
    C.definirEnviadorPdf(async () => {});
    Rep.definirAvisoRepasse(async (tel, texto, comp) => { aoCorretor.push({ tel, texto, mime: comp?.mime ?? null, b64: comp?.base64 ?? null }); });
    // Assinatura e guarda trocadas: o "assinado" é o próprio PDF, guardado em memória
    Rep.demonstrativoIO.assinar = async (_u, pdf, senha) => { if (senha !== 'certo') throw new Error('Senha do certificado incorreta'); return { pdf, titular: 'JOSE ROMARIO PINTO BEZERRA' }; };
    Rep.demonstrativoIO.guardar = async (pdf, nome) => { guardados.set(`mem://${nome}`, pdf); return `mem://${nome}`; };
    Rep.demonstrativoIO.ler = async url => guardados.get(url)!;
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
    db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{}', ${JSON.stringify({ vend_nome: 'VERA PROPRIETARIA FICTICIA', vend_cpf: '111.444.777-35', vend_telefone: '(99) 9 9000-0001' })})`);
    db.run(sql`INSERT INTO users (id, openId, name, role, creci, telefone) VALUES (7, 'u7', 'Lidiany Corretora Ficticia', 'user', '9999', '99988887777')`);
    const dados = JSON.stringify({ comp_nome: 'COMPRADOR FICTICIO', vend_nome: 'VERA PROPRIETARIA FICTICIA' });
    db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, status, codigoVerificacao) VALUES
      (1, 'BJ-2026-0003', 1, 0, 'C13', 7, ${plano()}, ${dados}, 'assinado', 'V1'), (2, 'BJ-2026-0004', 1, 0, 'C14', 7, ${plano()}, ${dados}, 'assinado', 'V2')`);
    db.run(sql`INSERT INTO cobrancas (contratoId, tipo, numero, total, vencimento, valor, status, pagoEm) VALUES
      (1, 'entrada', 1, 1, '2026-11-20', '10000', 'paga', '2026-11-20'), (2, 'entrada', 1, 1, '2026-11-20', '10000', 'paga', '2026-11-20')`);
  });

  it('a parte é dividida: escritório e corretor, somando a comissão da parte', async () => {
    const [p] = (await G.comissoesDeGestao(1, '2026-11-25')).filter(x => x.contratoId === 1 && x.chave === 'entrada-1');
    expect(p).toMatchObject({ valor: 4155.75, valorCorretor: 1662.3, valorEscritorio: 2493.45, devida: true, pendente: 4155.75, corretorDebitadoEm: null });
  });

  it('pagar o corretor lança a saída no caixa e pede a ciência; o demonstrativo só vai depois da assinatura do administrador', async () => {
    const r = await Rep.registrarRepasse(ADMIN, 1, { contratoId: 1, chave: 'entrada-1', pagoEm: '2026-11-25', forma: 'Pix' });
    expect(r).toMatchObject({ valor: 1662.3, aguardandoAssinatura: true });
    expect(r.despesaId).toBeTruthy();
    // Ciência da proprietária com a base da comissão
    const ciencia = aProprietaria.at(-1)!;
    for (const t of ['Lidiany', 'Base da comissão', 'valor de venda R$ 166.230,00', 'R$ 8.311,50', 'escritório R$ 4.986,90', 'R$ 3.324,60',
      'Esta parte', 'R$ 4.155,75 = escritório R$ 2.493,45 + corretor(a) R$ 1.662,30', 'Condições do comprador', '180 parcelas fixas de R$ 1.250,50']) expect(ciencia).toContain(t);
    const comunicado = await C.pdfDaCiencia(r.despesaId!);
    const tc = textoPdf(comunicado!.buf.toString('base64'));
    for (const t of ['BASE DA COMISSÃO', 'Valor de venda (base da comissão)', 'R$ 166.230,00', 'Comissão total', 'Parte paga agora', 'Condições assumidas']) expect(tc).toContain(t);
    // Nada foi ao corretor ainda; ele não baixa a prévia
    expect(aoCorretor).toHaveLength(0);
    await expect(Rep.reenviarDemonstrativo(ADMIN, { contratoId: 1, chave: 'entrada-1' })).rejects.toThrow(/assinado/);
    await expect(Rep.demonstrativoPdf({ perfil: 'corretor', acessos: [{ tipo: 'empreendimento', refId: 1 }] } as any, 7, { contratoId: 1, chave: 'entrada-1' })).rejects.toThrow(/assinado/);
    // Só o administrador assina; senha errada não envia
    await expect(Rep.assinarDemonstrativo({ perfil: 'secretario', acessos: {} } as any, 2, { contratoId: 1, chave: 'entrada-1', senha: 'certo' })).rejects.toThrow(/administrador/);
    await expect(Rep.assinarDemonstrativo(ADMIN, 1, { contratoId: 1, chave: 'entrada-1', senha: 'errada' })).rejects.toThrow(/Senha/);
    expect(aoCorretor).toHaveLength(0);
    const a = await Rep.assinarDemonstrativo(ADMIN, 1, { contratoId: 1, chave: 'entrada-1', senha: 'certo' });
    expect(a).toMatchObject({ avisado: true, titular: 'JOSE ROMARIO PINTO BEZERRA' });
    const env = aoCorretor.at(-1)!;
    expect(env).toMatchObject({ tel: '5599988887777', mime: 'application/pdf' });
    expect(env.texto).toMatch(/R\$ 1\.662,30/);
    const t = textoPdf(env.b64!);
    for (const trecho of ['DEMONSTRATIVO DE PAGAMENTO DE COMISSÃO', 'BJ-2026-0003', 'Chácara C13 · ', 'VERA PROPRIETARIA FICTICIA', 'COMPRADOR FICTICIO',
      'Entrada de R$ 10.000,00', '180 parcelas fixas de R$ 1.250,50', '50% da sua comissão', 'R$ 3.324,60', '1ª parcela do saldo', 'cinco']) expect(t).toContain(trecho);

    let [p] = (await G.comissoesDeGestao(1, '2026-11-25')).filter(x => x.contratoId === 1 && x.chave === 'entrada-1');
    expect(p).toMatchObject({ corretorDebitadoEm: '2026-11-25', pendente: 2493.45 });
    await expect(Rep.debitarRepasse(ADMIN, 1, { contratoId: 1, chave: 'entrada-1' })).rejects.toThrow(/já saiu/);

    // A parte do escritório: só a dela sai do caixa
    const g = await G.registrarRecebimentoGestao(1, { contratoId: 1, chave: 'entrada-1', pagoEm: '2026-11-25', forma: 'Pix' }, '2026-11-25');
    expect(g.valor).toBe(2493.45);
    [p] = (await G.comissoesDeGestao(1, '2026-11-25')).filter(x => x.contratoId === 1 && x.chave === 'entrada-1');
    expect(p.pendente).toBe(0);
    const f = await F.fluxoCaixa('2026-11-25', '2026-11-25', 'dia', '2026-11-25', 1);
    expect(f.totalSaidas).toBe(4155.75);
    const vendas = await G.receitasGestaoVendas('2026-11-25');
    expect(vendas.itens.find(x => x.contratoId === 1 && x.chave === 'entrada-1')).toMatchObject({ valor: 2493.45, recebidaEm: '2026-11-25' });
  });

  it('repasse registrado antes (sem caixa): o botão debita agora; recebimento antigo com a parte inteira é corrigido', async () => {
    // Recebimento da gestão no modelo antigo: despesa com a parte inteira (escritório + corretor)
    const antiga = await S.lancarSaidaComissao({ empreendimentoId: 1, descricao: 'Comissão de gestão — C14', valor: 4155.75, pagoEm: '2026-11-24', forma: 'Pix', autorId: 1 });
    db.run(sql`INSERT INTO comissaoRepasses (contratoId, corretorUserId, chave, valor, pagoEm, observacao, registradoPor) VALUES (2, 7, 'g:entrada-1', '4155.75', '2026-11-24', ${`Recebido · despesa:#${antiga}`}, 1)`);
    await Rep.registrarRepasse(ADMIN, 1, { contratoId: 2, chave: 'entrada-1', pagoEm: '2026-11-25', forma: 'Pix', doCaixa: false, avisar: false });
    let [p] = (await G.comissoesDeGestao(1, '2026-11-25')).filter(x => x.contratoId === 2);
    expect(p.corretorDebitadoEm).toBeNull();
    const d = await Rep.debitarRepasse(ADMIN, 1, { contratoId: 2, chave: 'entrada-1' });
    expect(d.despesaId).toBeTruthy();
    [p] = (await G.comissoesDeGestao(1, '2026-11-25')).filter(x => x.contratoId === 2);
    expect(p.pendente).toBe(0);
    const v: any[] = db.all(sql`SELECT valor FROM financeiroDespesas WHERE id = ${antiga}`);
    expect(Number(v[0].valor)).toBe(2493.45);
    const f = await F.fluxoCaixa('2026-11-24', '2026-11-25', 'mes', '2026-11-25', 1);
    expect(f.totalSaidas).toBe(4155.75 * 2);
  });

  it('o corretor baixa só o demonstrativo dele; desfazer cancela a saída do caixa', async () => {
    const pdf = await Rep.demonstrativoPdf({ perfil: 'corretor', acessos: [{ tipo: 'empreendimento', refId: 1 }] } as any, 7, { contratoId: 1, chave: 'entrada-1' });
    expect(Buffer.from(pdf.base64, 'base64').subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.assinado).toBe(true);
    await expect(Rep.demonstrativoPdf({ perfil: 'corretor', acessos: [{ tipo: 'empreendimento', refId: 1 }] } as any, 99, { contratoId: 1, chave: 'entrada-1' })).rejects.toThrow();
    await Rep.desfazerRepasse(ADMIN, { contratoId: 1, chave: 'entrada-1' });
    const [p] = (await G.comissoesDeGestao(1, '2026-11-25')).filter(x => x.contratoId === 1 && x.chave === 'entrada-1');
    expect(p).toMatchObject({ corretorDebitadoEm: null, pendente: 1662.3 });
  });

  it('comprovante com valor diferente da parte bloqueia; o certo passa; dá para remover', async () => {
    const Cp = await import('./financeiro/comprovante');
    let valorLido = 1662.57;
    Cp.definirLeitorIa(async () => ({ valor: valorLido, data: null, recebedor: null, documentoRecebedor: null, instituicaoRecebedor: null, pagador: null, forma: null, idTransacao: null }));
    const img = { base64: Buffer.from('imagem-falsa-do-comprovante').toString('base64'), mime: 'image/png' as const, nomeArquivo: 'c.png' };
    await expect(Rep.registrarRepasse(ADMIN, 1, { contratoId: 1, chave: 'entrada-1', pagoEm: '2026-11-25', forma: 'Pix', comprovante: img }))
      .rejects.toThrow(/R\$\s?1\.662,57.*R\$\s?1\.662,30/);
    await expect(Rep.trocarComprovante(ADMIN, 1, { contratoId: 2, chave: 'entrada-1', comprovante: img })).rejects.toThrow(/não foi feito/);
    valorLido = 1662.3;
    expect(await Rep.conferirValorComprovante(img, 1662.3)).toEqual({ conferido: true, lido: 1662.3 });
    const r = await Rep.trocarComprovante(ADMIN, 1, { contratoId: 2, chave: 'entrada-1', comprovante: null });
    expect(r).toMatchObject({ comprovanteUrl: null });
    Cp.definirLeitorIa(null);
  });

  it('condições do comprador em frases', () => {
    expect(Dem.condicoesDoComprador({ modalidade: 'avista', total_pagar: 150000, avista_vencimento: '2026-12-01' })).toEqual(['Pagamento à vista: R$ 150.000,00, com vencimento em 01/12/2026.']);
  });
});
