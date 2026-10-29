import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
vi.mock('./leads/zapiClient', () => ({ enviarTexto: async () => 'id' }));

const S = await import('../shared/visitaConversa');
const V = await import('./autoresposta/visitaConversa');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

const QUI_10H = Date.parse('2026-10-29T13:00:00Z'); // quinta 29/10, 10h em Açailândia

describe('visita pela conversa — regras', () => {
  it('3 opções a partir de amanhã, sem domingo, pulando a faixa ocupada', () => {
    const o = S.opcoesDeVisita(QUI_10H, new Set(['2026-10-30|08-10']));
    expect(o).toEqual([{ dia: '2026-10-30', horario: '10-12' }, { dia: '2026-10-31', horario: '15-17' }, { dia: '2026-11-02', horario: '08-10' }]);
    expect(S.rotuloOpcao(o[1])).toBe('sábado, 31/10 — 15h às 17h');
  });
  it('entende a escolha por número ou ordinal (e não confunde "segunda-feira")', () => {
    expect(S.escolhaPorNumero('2', 3)).toBe(1);
    expect(S.escolhaPorNumero('opção 3', 3)).toBe(2);
    expect(S.escolhaPorNumero('pode ser a 1', 3)).toBe(0);
    expect(S.escolhaPorNumero('a segunda', 3)).toBe(1);
    expect(S.escolhaPorNumero('segunda-feira de manhã', 3)).toBeNull();
    expect(S.escolhaPorNumero('quero 5 chácaras', 3)).toBeNull();
    expect(S.falaDeDataOuHora('sábado às 9h')).toBe(true);
    expect(S.falaDeDataOuHora('qual o valor?')).toBe(false);
    expect(S.faixaDaHora(9)).toBe('08-10');
    expect(S.faixaDaHora(16)).toBe('15-17');
    expect(S.faixaDaHora(20)).toBeNull();
  });
});

describe('visita pela conversa — agenda', () => {
  let db: any;
  const lead = { id: 1, nome: 'Maria Souza', responsavelId: 5, etapa: 'qualificado', funil: 'comprador', phone: '5599911112222' };
  beforeAll(async () => {
    db = await getDb();
    db.run(sql`INSERT INTO users (id, openId, name, role) VALUES (5, 'u5', 'Ana Corretora', 'user')`);
    db.run(sql`INSERT INTO leadQualifications (id, phone, nome, funil, etapa, empreendimentoSlug, responsavelId) VALUES (1, '5599911112222', 'Maria Souza', 'comprador', 'qualificado', 'bom-jardims', 5)`);
  });

  it('sem oferta em aberto, não mexe na conversa', async () => {
    expect(await V.tratarRespostaDeVisita(lead, { nome: 'Bom Jardims' }, '2', QUI_10H)).toBeNull();
  });

  it('oferece horários e marca a opção escolhida como agendada; lead vai para "Visita agendada"', async () => {
    const msg = await V.ofertarHorarios(1, 'O condomínio fica na Estrada do Piquiá.', QUI_10H);
    expect(msg).toContain('1️⃣ sexta, 30/10');
    expect(await V.tratarRespostaDeVisita(lead, { nome: 'Bom Jardims' }, 'qual o valor?', QUI_10H)).toBeNull();
    const r = await V.tratarRespostaDeVisita(lead, { nome: 'Bom Jardims' }, '2', QUI_10H);
    expect(r).toMatchObject({ status: 'agendada' });
    expect(r!.texto).toContain('Visita agendada, Maria! *sábado, 31/10 — 15h às 17h*');
    const [v] = db.all(sql`SELECT status, responsavelId FROM leadVisitas WHERE leadId = 1`);
    expect(v).toMatchObject({ status: 'agendada', responsavelId: 5 });
    const [l] = db.all(sql`SELECT etapa FROM leadQualifications WHERE id = 1`);
    expect(l.etapa).toBe('visita_agendada');
    expect(await V.tratarRespostaDeVisita(lead, { nome: 'Bom Jardims' }, '1', QUI_10H)).toBeNull(); // oferta consumida
  });

  it('dia/hora escrito: a IA lê; fora das opções vira pedido para o corretor confirmar', async () => {
    await V.ofertarHorarios(1, 'Oi!', QUI_10H);
    V.interpretador.claude = async () => ({ dia: '2026-11-04', hora: 13 });
    const r = await V.tratarRespostaDeVisita(lead, { nome: 'Bom Jardims' }, 'quarta às 13h', QUI_10H);
    expect(r).toMatchObject({ status: 'solicitada' });
    expect(r!.texto).toContain('quarta, 04/11 — 13h às 15h');
    await V.ofertarHorarios(1, 'Oi!', QUI_10H);
    V.interpretador.claude = async () => ({ dia: '2026-11-01', hora: 9 }); // domingo
    const r2 = await V.tratarRespostaDeVisita(lead, { nome: 'Bom Jardims' }, 'domingo de manhã', QUI_10H);
    expect(r2).toMatchObject({ status: null, visitaId: null });
    expect(r2!.texto).toContain('Não consegui entender');
  });
});
