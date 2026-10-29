import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const enviados: [string, string][] = [];
vi.mock('./leads/zapiClient', () => ({ enviarTexto: async (t: string, m: string) => { enviados.push([t, m]); return 'id'; } }));

const S = await import('../shared/followupSequencias');
const F = await import('./leads/followup');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

const SEG_10H = Date.parse('2026-11-02T13:00:00Z'); // segunda, 10h em Açailândia
const DIA = 86_400_000;
// No SQLite de teste as colunas timestamp do schema MySQL guardam texto 'AAAA-MM-DD HH:MM:SS' (UTC)
const txt = (ms: number) => new Date(ms).toISOString().slice(0, -1).replace('T', ' ');
const ms = (v: string) => Date.parse(`${String(v).replace(' ', 'T')}Z`);

describe('sequências de follow-up — regras', () => {
  it('troca as variáveis e garante a saída (SAIR)', () => {
    const t = S.renderizarPasso('{oi} O {empreendimento} está aqui: {link} — {corretor}', { nome: 'maria souza', empreendimento: 'Bom Jardims', link: 'https://x/bj', corretor: 'José (CRECI/MA 4.705)' });
    expect(t).toBe(`Oi, Maria! O Bom Jardims está aqui: https://x/bj — José (CRECI/MA 4.705)\n\n${S.SAIR}`);
    expect(S.renderizarPasso('{oi} Responda SAIR para parar.', { link: '' })).toBe('Oi! Responda SAIR para parar.');
  });
  it('valida dias crescentes, tamanho e proíbe valores', () => {
    expect(S.problemaSequencia([{ dias: 1, texto: 'Oi, tudo bem com você?' }, { dias: 3, texto: 'Mais uma mensagem aqui' }])).toBeNull();
    expect(S.problemaSequencia([{ dias: 3, texto: 'Oi, tudo bem com você?' }, { dias: 2, texto: 'Mais uma mensagem aqui' }])).toMatch(/aumentar/);
    expect(S.problemaSequencia([{ dias: 1, texto: 'Entrada de R$ 5.000 só hoje' }])).toMatch(/valores/);
    expect(S.problemaSequencia([])).toMatch(/1 a 8/);
  });
  it('cada etapa padrão passa na validação', () => {
    for (const s of Object.values(S.SEQUENCIAS_PADRAO)) expect(S.problemaSequencia(s.passos)).toBeNull();
  });
  it('sequência só para comprador em etapa com sequência ativa', () => {
    const m = new Map(Object.values(S.SEQUENCIAS_PADRAO).map(x => [x.etapa, x]));
    expect(F.sequenciaDoLead({ funil: 'comprador', etapa: 'visitou' }, m)?.etapa).toBe('visitou');
    expect(F.sequenciaDoLead({ funil: 'comprador', etapa: 'visita_agendada' }, m)).toBeNull(); // desligada por padrão
    expect(F.sequenciaDoLead({ funil: 'proprietario', etapa: 'novo' }, m)).toBeNull();
    expect(F.quandoSai(2, SEG_10H, [1, 2, 5])).toBe(SEG_10H + 2 * DIA);
    expect(F.proximoPassoEm(3, SEG_10H, [1, 2, 5])).toBeNull();
  });
});

describe('sequências de follow-up — envio', () => {
  let db: any;
  beforeAll(async () => {
    db = await getDb();
    db.run(sql`INSERT INTO users (id, openId, name, role, creci) VALUES (5, 'u5', 'Ana Corretora', 'user', 'CRECI/MA 9.999')`);
    db.run(sql`INSERT INTO leadQualifications (id, phone, nome, funil, etapa, empreendimentoSlug, responsavelId, followUpPasso, proximoFollowUpAt)
      VALUES (1, '5599911112222', 'joão lima', 'comprador', 'visitou', 'bom-jardims', 5, 0, ${txt(SEG_10H - 1000)}),
             (2, '5599933334444', 'ana', 'comprador', 'visita_agendada', 'bom-jardims', 5, 0, ${txt(SEG_10H - 1000)})`);
  });

  it('manda a mensagem da etapa (visitou) e a padrão quando a etapa está desligada; agenda o passo seguinte', async () => {
    const n = await F.processarFollowUps(SEG_10H);
    expect(n).toBe(2);
    const joao = enviados.find(e => e[0] === '5599911112222')![1];
    expect(joao).toContain('Oi, João! Obrigado pela visita ao Condomínio de Chácaras Bom Jardims!');
    const ana = enviados.find(e => e[0] === '5599933334444')![1];
    expect(ana).toContain('Ficou alguma dúvida sobre o Condomínio de Chácaras Bom Jardims');
    const [l1] = db.all(sql`SELECT followUpPasso, proximoFollowUpAt FROM leadQualifications WHERE id = 1`);
    expect(l1.followUpPasso).toBe(1);
    expect(ms(l1.proximoFollowUpAt)).toBe(SEG_10H + 2 * DIA); // visitou: dia 1 → dia 3
  });

  it('mudou de etapa: recomeça pela sequência da nova etapa', async () => {
    db.run(sql`UPDATE leadQualifications SET etapa = 'proposta' WHERE id = 1`);
    await F.reiniciarFollowUpDoLead(1, SEG_10H);
    const [l1] = db.all(sql`SELECT followUpPasso, proximoFollowUpAt FROM leadQualifications WHERE id = 1`);
    expect(l1.followUpPasso).toBe(0);
    expect(ms(l1.proximoFollowUpAt)).toBe(SEG_10H + DIA);
  });
});
