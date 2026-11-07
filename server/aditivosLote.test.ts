import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const R = await import('./financeiro/renegociacao');
const L = await import('./contratos/aditivosLote');
const { getDb } = await import('./db');
const S = await import('../drizzle/schema');
const { sql, eq } = await import('drizzle-orm');

const msgs: [string, string][] = [];
let db: any;
const REGISTRO = { numeroRegistro: 'R-1', dataRegistro: '2027-02-15', cartorio: 'Cartório Exemplo de Registro de Imóveis', matriculaEmpreendimento: '9.999', matriculas: { A05: '10.001' }, atualizarCadastro: true };

beforeAll(async () => {
  R.definirEnviador(async (t, m) => { msgs.push([t, m]); });
  db = await getDb();
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
  db.run(sql`INSERT INTO lotes (id, empreendimentoId, codigo, quadra, numero, areaM2, situacao) VALUES (5, 1, 'A05', 'A', 5, '3025.11', 'vendido_parcelado'), (6, 1, 'A06', 'A', 6, '3025.11', 'vendido_parcelado'), (7, 1, 'A07', 'A', 7, '3025.11', 'reservado')`);
  db.run(sql`INSERT INTO users (id, openId, name, role) VALUES (1, 'u1', 'Admin Exemplo', 'admin')`);
  db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{"emp_nome":"Bom Jardims"}', '{"vend_nome":"Vendedora Exemplo","vend_cpf":"000.000.000-00"}')`);
  db.run(sql`INSERT INTO contratos (id, numero, empreendimentoId, loteId, loteCodigo, corretorUserId, simulacaoJson, dadosJson, status, codigoVerificacao) VALUES
    (1, 'BJ-T-0001', 1, 5, 'A05', 1, '{}', '{}', 'ativo', 'COD00000001A'),
    (2, 'BJ-T-0002', 1, 6, 'A06', 1, '{}', '{}', 'assinado', 'COD00000002A'),
    (3, 'BJ-T-0003', 1, 7, 'A07', 1, '{}', '{}', 'rascunho', 'COD00000003A')`);
  db.run(sql`INSERT INTO pessoas (id, nome, cpfCnpj, telefone1) VALUES (1, 'Maria Teste', '52998224725', '99999990001'), (2, 'João Sem Fone', '11144477735', NULL)`);
  db.run(sql`INSERT INTO contratoPessoas (contratoId, pessoaId, papel) VALUES (1, 1, 'comprador'), (2, 2, 'comprador')`);
});

describe('termos aditivos em lote', () => {
  it('valida os dados do registro e da liberação', () => {
    expect(L.validarDados('registro', { ...REGISTRO, cartorio: '' })).toMatch(/Cartório/);
    expect(L.validarDados('liberacao', { dataLiberacao: '2027-03-10', fundamento: 'curto' })).toMatch(/ato/);
    expect(L.validarDados('registro', REGISTRO)).toBeNull();
  });

  it('prévia: só contratos assinados/ativos do empreendimento', async () => {
    const p = await L.previaLote(1, 'registro');
    expect(p.map(x => x.lote)).toEqual(['A05', 'A06']);
    expect(p.find(x => x.lote === 'A06')?.temWhatsapp).toBe(false);
  });

  it('gera um termo por contrato, envia o link e grava o registro no cadastro do empreendimento', async () => {
    const r = await L.gerarLote(1, 'registro', REGISTRO, 1);
    expect(r).toMatchObject({ gerados: 2, enviados: 1 });
    expect(r.semWhatsapp).toEqual(['BJ-T-0002 (A06)']);
    expect(msgs.at(-1)![1]).toMatch(/registro do loteamento/);
    expect(msgs.at(-1)![1]).toMatch(/CRECI J-1234/);
    const [j]: any[] = await db.select().from(S.empJuridico).where(eq(S.empJuridico.empreendimentoId, 1));
    const def = typeof j.defaultsJson === 'string' ? JSON.parse(j.defaultsJson) : j.defaultsJson;
    expect(def).toMatchObject({ emp_registro_parcelamento: 'R-1', emp_registro_data: '15/02/2027', emp_matricula_empreendimento: '9.999', emp_nome: 'Bom Jardims' });
    // Gerar de novo não duplica (já tem termo aguardando)
    expect((await L.gerarLote(1, 'registro', REGISTRO, 1)).gerados).toBe(0);
  });

  it('o comprador vê os pontos do termo, assina com o código e a matrícula da chácara é gravada', async () => {
    const [a]: any[] = await db.select().from(S.contratoAditivos).where(eq(S.contratoAditivos.contratoId, 1));
    expect(a.tipo).toBe('registro');
    const pag: any = await R.paginaAditivo(a.token);
    expect(pag.tipo).toBe('registro');
    expect(pag.pontos.join(' ')).toMatch(/10\.001/);
    await R.enviarCodigo(a.token);
    const codigo = msgs.at(-1)![1].match(/(\d{6})/)![1];
    const r = await R.assinarAditivo(a.token, codigo, { aceite: true, ip: '127.0.0.1', ua: 'teste' });
    expect(r.ok).toBe(true);
    const [lote]: any[] = await db.select().from(S.lotes).where(eq(S.lotes.id, 5));
    expect(lote.matricula).toBe('10.001');
    const lista = await R.aditivosDo(1);
    expect(lista[0]).toMatchObject({ tipo: 'registro', status: 'assinado', titulo: 'Registro do loteamento' });
    const and = await L.andamentoLote(1, 'registro');
    expect(and).toMatchObject({ total: 2, assinados: 1, aguardando: 1, semTermo: 0 });
  });

  it('liberação é outro tipo: não conflita com o registro e não trava a renegociação', async () => {
    const r = await L.gerarLote(1, 'liberacao', { dataLiberacao: '2027-03-10', fundamento: 'Termo de Verificação e Aceite das Obras n.º 1/2027 (exemplo)' }, 1);
    expect(r.gerados).toBe(2);
    const lista = await R.aditivosDo(1);
    expect(lista.map(x => x.tipo)).toEqual(['liberacao', 'registro']);
    expect(lista[0].numero).toBe(2);
  });
});
