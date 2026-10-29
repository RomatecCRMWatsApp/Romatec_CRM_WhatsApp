import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const F = await import('./lotes/filaEspera');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

describe('fila de espera — regras puras', () => {
  it('posição por ordem de chegada, só de quem está ativo', () => {
    const p = F.posicoes([
      { id: 3, status: 'aguardando', criadoEm: '2026-10-29T12:00:00Z' },
      { id: 1, status: 'desistiu', criadoEm: '2026-10-29T10:00:00Z' },
      { id: 2, status: 'avisado', criadoEm: '2026-10-29T11:00:00Z' },
    ]);
    expect([...p.entries()]).toEqual([[2, 1], [3, 2]]);
  });
  it('mensagens do cliente e do corretor', () => {
    expect(F.msgClienteVez('Maria Souza', 'B07', 'Bom Jardims', 'José Romário')).toContain('Olá, Maria! 🎉 A chácara *B07*');
    expect(F.msgCorretorVez('Maria Souza', '5599988887777', 'B07', 'Bom Jardims')).toContain('*Maria Souza* (5599988887777) é o 1º da fila');
  });
});

describe('fila de espera — banco', () => {
  let db: any;
  const enviados: [string, string][] = [];
  const enviar = async (t: string, m: string) => { enviados.push([t, m]); };
  beforeAll(async () => {
    db = await getDb();
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
    db.run(sql`INSERT INTO lotes (id, empreendimentoId, codigo, quadra, numero, areaM2, situacao, leadId) VALUES (7, 1, 'B07', 'B', 7, '3025', 'reservado', 10), (8, 1, 'B08', 'B', 8, '3025', 'disponivel', NULL)`);
    db.run(sql`INSERT INTO users (id, openId, name, role, telefone) VALUES (5, 'u5', 'Ana Corretora', 'user', '99 9 8111-2222')`);
    db.run(sql`INSERT INTO leadQualifications (id, phone, nome, empreendimentoSlug, responsavelId) VALUES (10, '5599900000010', 'Dono da Reserva', 'bom-jardims', 5), (11, '5599900000011', 'Maria Souza', 'bom-jardims', 5), (12, '5599900000012', 'João Lima', 'bom-jardims', 5)`);
  });

  it('entra na fila só de chácara ocupada, sem repetir, e com a posição', async () => {
    await expect(F.entrarNaFila(11, 8, 5)).rejects.toThrow(/disponível/);
    await expect(F.entrarNaFila(10, 7, 5)).rejects.toThrow(/já está reservada/);
    expect(await F.entrarNaFila(11, 7, 5)).toMatchObject({ posicao: 1, codigo: 'B07' });
    expect(await F.entrarNaFila(12, 7, 5)).toMatchObject({ posicao: 2 });
    await expect(F.entrarNaFila(11, 7, 5)).rejects.toThrow(/já está na fila/);
    const r = await F.filaDoLead(12);
    expect(r.ocupadas.map(o => [o.codigo, o.naFila])).toEqual([['B07', 2]]);
    expect(r.minhas[0]).toMatchObject({ loteCodigo: 'B07', posicao: 2, status: 'aguardando' });
  });

  it('chácara ainda ocupada: ninguém é avisado', async () => {
    expect(await F.avisarProximoDaFila(7, enviar)).toBeNull();
    expect(enviados).toEqual([]);
  });

  it('chácara livre: avisa o 1º (cliente e corretor); desistiu → avisa o próximo', async () => {
    db.run(sql`UPDATE lotes SET situacao = 'disponivel', leadId = NULL WHERE id = 7`);
    const v = await F.avisarProximoDaFila(7, enviar);
    expect(v).toMatchObject({ nome: 'Maria Souza', codigo: 'B07', avisos: ['cliente', 'corretor'] });
    expect(enviados.map(e => e[0])).toEqual(['5599900000011', '5599981112222']);
    // Já há um avisado: não avisa de novo
    expect(await F.avisarProximoDaFila(7, enviar)).toBeNull();
    const maria = (await F.filaDoLead(11)).minhas[0];
    expect(maria.status).toBe('avisado');
    const r = await F.encerrarNaFila(maria.id, 'desistiu', 11);
    expect(r.proximo).toMatchObject({ nome: 'João Lima' });
    // Outro lead não encerra a entrada de quem não é dele
    const joao = (await F.filaDoLead(12)).minhas[0];
    await expect(F.encerrarNaFila(joao.id, 'desistiu', 11)).rejects.toThrow(/não encontrada/);
    await F.encerrarNaFila(joao.id, 'convertido', 12);
    expect(await F.listarFilas()).toEqual([]);
  });
});
