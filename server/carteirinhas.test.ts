import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { pendenciasDependentes, pendenciasCarteirinhaDependente, MAX_DEPENDENTES } = await import('../shared/contratos');
const S = await import('./contratos/servico');
const K = await import('./contratos/carteirinhas');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
const sharp = (await import('sharp')).default;

const dep = (x: Record<string, unknown> = {}) => ({
  nome: 'Pedro Mendes Silva', parentesco: 'filho', cpf: '935.411.347-80', nascimento: '2010-04-10', telefone1: '(99) 9 8877-6655', email: 'pedro@exemplo.com', ...x,
}) as any;

describe('dependentes: cadastro completo', () => {
  it('nome, parentesco, CPF (dígito), telefone e e-mail obrigatórios; nascimento opcional; no máximo 6', () => {
    expect(pendenciasDependentes([dep()])).toEqual({});
    expect(pendenciasDependentes([dep({ nascimento: '' })])).toEqual({});
    expect(pendenciasDependentes([dep({ nome: 'Pedro', parentesco: '', cpf: '111.111.111-11', telefone1: '9988', email: 'pedro@', nascimento: '2999-01-01' })])).toEqual({
      'dependentes.0.nome': 'Nome completo', 'dependentes.0.parentesco': 'Grau de parentesco', 'dependentes.0.cpf': 'CPF inválido',
      'dependentes.0.telefone1': 'Telefone/WhatsApp com DDD', 'dependentes.0.email': 'E-mail inválido', 'dependentes.0.nascimento': 'Data de nascimento',
    });
    expect(pendenciasDependentes([dep({ cpf: '' })])['dependentes.0.cpf']).toBe('CPF inválido');
    expect(pendenciasDependentes([dep(), dep({ nome: 'Ana Mendes Silva' })])['dependentes.1.cpf']).toBe('CPF repetido');
    expect(pendenciasDependentes(Array.from({ length: MAX_DEPENDENTES + 1 }, () => dep())).dependentes).toBe('No máximo 6 dependentes por chácara');
  });
  it('gate da carteirinha: nome, CPF, telefone, e-mail válidos + foto', () => {
    expect(pendenciasCarteirinhaDependente({ ...dep(), temFoto: true })).toEqual([]);
    expect(pendenciasCarteirinhaDependente({ ...dep({ email: '', cpf: '123' }), temFoto: false })).toEqual(['CPF válido', 'e-mail válido', 'foto']);
  });
});

describe('carteirinhas (chacaraDependentes + carteiras + /p/c/:qrToken)', () => {
  let db: any;
  const foto = async (cor: string) => sharp({ create: { width: 300, height: 400, channels: 3, background: cor } }).jpeg().toBuffer();
  beforeAll(async () => {
    db = await getDb();
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
    db.run(sql`INSERT INTO lotes (id, empreendimentoId, codigo, quadra, numero, areaM2, situacao) VALUES (5, 1, 'A05', 'A', 5, '3025.11', 'vendido_parcelado')`);
    db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{"validade_carteira_meses":24}', '{}')`);
    db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, status, codigoVerificacao)
      VALUES (1, 'BJ-2026-0001', 1, 5, 'A05', 1, '{}', '{}', 'ativo', 'EX7K2M9P4Q1R')`);
    db.run(sql`INSERT INTO pessoas (id, nome, cpfCnpj) VALUES (1, 'Carlos Eduardo Mendes da Silva', '52998224725'), (2, 'Ana Paula Ribeiro Mendes', '11144477735')`);
    db.run(sql`INSERT INTO contratoPessoas (contratoId, pessoaId, papel) VALUES (1, 1, 'comprador'), (1, 2, 'conjuge')`);
  });

  it('grava em chacaraDependentes (atualiza por id; quem sai fica inativo)', async () => {
    await S.salvarDependentes(1, [dep(), dep({ nome: 'Maria Mendes Silva', parentesco: 'filha', cpf: '529.982.247-25', email: 'maria@exemplo.com' })]);
    const [a, b] = await S.dependentesDo(1);
    expect(a).toMatchObject({ nome: 'Pedro Mendes Silva', cpf: '93541134780', telefone1: '99988776655', email: 'pedro@exemplo.com', temFoto: false });
    await S.salvarDependentes(1, [{ ...a, telefone1: '(99) 9 1111-2222' }, b]);
    expect((await S.dependentesDo(1)).map(d => [d.id, d.telefone1])).toEqual([[a.id, '99911112222'], [b.id, b.telefone1]]);
    expect(db.all(sql`SELECT COUNT(*) AS n FROM chacaraDependentes`)[0].n).toBe(2);
  });

  it('emite só quem passa no gate: dependente sem foto fica bloqueado com o motivo', async () => {
    const [pedro, maria] = await S.dependentesDo(1);
    await K.salvarFoto(1, 'dependente', pedro.id, await foto('#aa6633'), 1);
    await K.salvarFoto(1, 'comprador', 1, await foto('#336699'), 1);
    const sit = await K.situacaoCarteirinhas(1);
    expect(sit.pessoas.map(p => [p.vinculo, p.temFoto, p.pendencias])).toEqual([
      ['Titular', true, []], ['Cônjuge', false, []], ['Dependente · Filho', true, []], ['Dependente · Filha', false, ['foto']],
    ]);
    const { pdf, bloqueadas } = await K.carteirinhasPdf(1);
    expect(bloqueadas.map(b => b.nome)).toEqual(['Maria Mendes Silva']);
    const { PDFDocument } = await import('pdf-lib');
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(6); // 3 pessoas × frente e verso
    const cart: any[] = db.all(sql`SELECT * FROM carteiras ORDER BY id`);
    expect(cart.map(c => c.numero)).toEqual(['BJ-A05-01', 'BJ-A05-02', 'BJ-A05-03']);
    expect(cart.every(c => /^[a-f0-9]{32}$/.test(c.qrToken))).toBe(true);
    // Validade: 24 meses (validade_carteira_meses do empreendimento)
    expect(cart[0].validade.slice(0, 4)).toBe(String(new Date().getUTCFullYear() + 2));
    // Reemitir não cria carteira nova (mesmo número e QR)
    await K.carteirinhasPdf(1);
    expect(db.all(sql`SELECT COUNT(*) AS n FROM carteiras`)[0].n).toBe(3);
    if (process.env.CARTEIRINHA_SAIDA) (await import('node:fs')).writeFileSync(`${process.env.CARTEIRINHA_SAIDA}/CARTEIRINHAS-BJ-2026-0001.pdf`, pdf);
    void maria;
  });

  it('automática: em contrato assinado, a foto que faltava já registra a carteira do dependente (sem PDF)', async () => {
    const antes = db.all(sql`SELECT COUNT(*) AS n FROM carteiras`)[0].n;
    const maria = (await S.dependentesDo(1)).find(d => d.nome === 'Maria Mendes Silva')!;
    await K.salvarFoto(1, 'dependente', maria.id, await foto('#884488'), 1);
    const nova: any[] = db.all(sql`SELECT * FROM carteiras WHERE titularTipo = 'dependente' AND titularId = ${maria.id}`);
    expect(nova).toHaveLength(1);
    expect(nova[0].numero).toBe('BJ-A05-04');
    expect(db.all(sql`SELECT COUNT(*) AS n FROM carteiras`)[0].n).toBe(antes + 1);
    expect(await K.emitirCarteirasAuto(1)).toBe(4); // titular, cônjuge e os 2 dependentes; nada duplicado
    expect(db.all(sql`SELECT COUNT(*) AS n FROM carteiras`)[0].n).toBe(antes + 1);
  });

  it('tela de Carteirinhas: lista com a situação e PDF A4 (4 por folha) das marcadas; quem não pode sai fora', async () => {
    const lista = await K.listaCarteirinhas([1]);
    expect(lista.map(l => [l.nome, !!l.carteira])).toEqual([
      ['Carlos Eduardo Mendes da Silva', true], ['Ana Paula Ribeiro Mendes', true], ['Pedro Mendes Silva', true], ['Maria Mendes Silva', true],
    ]);
    expect(lista[0]).toMatchObject({ contratoNumero: 'BJ-2026-0001', loteCodigo: 'A05', liberado: true });
    const itens = lista.map(l => ({ contratoId: 1, tipo: l.tipo, ref: l.ref }));
    const a4 = await K.carteirinhasSelecaoPdf([...itens, { contratoId: 99, tipo: 'comprador', ref: 1 }], 'a4');
    expect(a4).toMatchObject({ quantidade: 4, foraDoPdf: 1 });
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(a4.pdf);
    expect(doc.getPageCount()).toBe(1); // 4 carteirinhas = 1 folha A4
    expect(Math.round(doc.getPage(0).getSize().width)).toBe(595);
    const cr80 = await K.carteirinhasSelecaoPdf(itens.slice(0, 1), 'cr80');
    expect((await PDFDocument.load(cr80.pdf)).getPageCount()).toBe(2); // frente e verso
    if (process.env.CARTEIRINHA_SAIDA) (await import('node:fs')).writeFileSync(`${process.env.CARTEIRINHA_SAIDA}/CARTEIRINHAS-A4.pdf`, a4.pdf);
  });

  it('/p/c/:qrToken: válida com foto e sem CPF; dependente removido → cancelada; contrato cancelado → inválida', async () => {
    const [titular, , pedro] = db.all(sql`SELECT * FROM carteiras ORDER BY id`);
    const ok = await K.conferirCarteirinha(pedro.qrToken);
    expect(ok.html).toContain('Carteirinha válida');
    expect(ok.html).toContain('Pedro Mendes Silva');
    expect(ok.html).toContain(`/p/c/${pedro.qrToken}/foto`);
    expect(ok.html).not.toContain('93541134780');
    expect(await K.fotoDaCarteirinha(pedro.qrToken)).toBeInstanceOf(Buffer);
    expect((await K.conferirCarteirinha('0'.repeat(32))).status).toBe(404);
    // Pedro sai da lista: fica inativo e a carteira dele é cancelada
    const [, maria] = await S.dependentesDo(1);
    await S.salvarDependentes(1, [maria]);
    expect((await K.conferirCarteirinha(pedro.qrToken)).html).toContain('não está válida');
    db.run(sql`UPDATE contratos SET status = 'cancelado' WHERE id = 1`);
    expect((await K.conferirCarteirinha(titular.qrToken)).html).toContain('Contrato sem efeito');
    await expect(K.carteirinhasPdf(1)).rejects.toMatchObject({ status: 409 });
  });
});
