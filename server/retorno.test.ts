import { beforeAll, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
delete process.env.ZAPI_INSTANCE_ID;
delete process.env.VAPID_PRIVATE_KEY;
vi.mock('./leads/notificacao', async orig => ({ ...(await orig<any>()), notificarLead: vi.fn(async () => {}), enviarTelegram: vi.fn(async () => {}) }));
vi.mock('./leads/zapiClient', async orig => ({ ...(await orig<any>()), enviarTexto: vi.fn(async () => ({})) }));
const chamadas: any[] = [];
const enviadasSistema: [string, string][] = [];
vi.mock('./lead-intake', async orig => {
  const real = await orig<any>();
  return {
    ...real,
    zapiDisponivel: () => true,
    enviarMensagemSistema: vi.fn(async (fone: string, msg: string) => { enviadasSistema.push([fone, msg]); return true; }),
    ingestLead: vi.fn(async (input: any) => {
      chamadas.push(input);
      const phone = real.normalizePhoneBR(input.phone);
      if (!phone) return { ok: false, reason: 'invalid_phone' };
      const { getDb } = await import('./db');
      const { sql } = await import('drizzle-orm');
      const d: any = await getDb();
      const ja = d.all(sql`SELECT id FROM leadQualifications WHERE phone = ${phone}`);
      if (!ja.length) {
        d.run(sql`INSERT INTO leadQualifications (phone, nome, stage, score, empreendimentoSlug, answers, createdAt, updatedAt)
          VALUES (${phone}, ${input.nome}, 'novo_lead', 'frio', ${input.empreendimentoSlug ?? null}, ${JSON.stringify(input.answers ?? {})}, ${Date.now()}, ${Date.now()})`);
      }
      return { ok: true, created: !ja.length, messageSent: false, phone };
    }),
  };
});

const R = await import('./retorno');
const { retornoSchema, quandoDoRetorno, antecedenciaMs, gradeHorarios, livre } = await import('../shared/retorno');
const { refDoUsuario } = await import('./cartaoVendas');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
const zap = await import('./leads/zapiClient');

let db: any;
beforeAll(async () => {
  db = await getDb();
  db.run(sql`INSERT INTO users (id, openId, name, role, creci, telefone) VALUES (1, 'u1', 'José Romário', 'admin', '4705', '99991811246')`);
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil, creci, telefone) VALUES (2, 'u2', 'Maria Corretora', 'user', 'corretor', '1234', '99981112222')`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
});

const amanha = new Date(Date.now() - 3 * 3600_000 + 86_400_000).toISOString().slice(0, 10);
const base = { nome: 'Rose Veríssimo', telefone: '(99) 98877-1111', dia: amanha, hora: '14:30', consentimento: true };

describe('validação do formulário', () => {
  it('visita com busca exige endereço; ligação não', () => {
    expect(retornoSchema.safeParse({ ...base, tipo: 'ligacao' }).success).toBe(true);
    const sem = retornoSchema.safeParse({ ...base, tipo: 'visita_busca' });
    expect(sem.success).toBe(false);
    expect(sem.error?.issues[0].message).toMatch(/endereço/);
    expect(retornoSchema.safeParse({ ...base, tipo: 'visita_busca', enderecoBusca: 'Rua das Flores, 120, Centro, Açailândia' }).success).toBe(false);
    expect(retornoSchema.safeParse({ ...base, tipo: 'visita_busca', decidido: true, enderecoBusca: 'Rua das Flores, 120, Centro, Açailândia' }).success).toBe(true);
  });
  it('horário fora do atendimento é recusado', () => {
    expect(retornoSchema.safeParse({ ...base, tipo: 'ligacao', hora: '06:30' }).success).toBe(false);
    expect(retornoSchema.safeParse({ ...base, tipo: 'ligacao', hora: '20:30' }).success).toBe(false);
    expect(retornoSchema.safeParse({ ...base, tipo: 'ligacao', hora: '20:00' }).success).toBe(true);
  });
  it('dia + hora em Brasília', () => {
    expect(quandoDoRetorno('2026-11-23', '14:30').toISOString()).toBe('2026-11-23T17:30:00.000Z');
  });
});

describe('link de retorno', () => {
  it('página mostra o contato de quem compartilhou', async () => {
    expect((await R.dadosRetorno('bom-jardims', refDoUsuario(2))).contato.nome).toBe('Maria Corretora');
    expect((await R.dadosRetorno('bom-jardims', null)).contato.nome).toBe('José Romário');
  });

  it('ligação: cria lead, grava o retorno, confirma ao cliente e avisa o responsável', async () => {
    (zap.enviarTexto as any).mockClear();
    const p = retornoSchema.parse({ ...base, tipo: 'ligacao', observacao: 'Prefiro à tarde' });
    const r = await R.registrarRetorno('bom-jardims', p, '1.2.3.4');
    expect(r.retornoId).toBeTruthy();
    expect(chamadas.at(-1)).toMatchObject({ campanha: 'Link de retorno', semBoasVindas: true, responsavelId: 1 });
    const [row]: any[] = db.all(sql`SELECT * FROM leadRetornos WHERE id = ${r.retornoId}`);
    expect(row).toMatchObject({ tipo: 'ligacao', status: 'pendente', responsavelId: 1, enderecoBusca: null });
    expect(enviadasSistema.at(-1)?.[1]).toMatch(/eu te ligo em .* às 14:30/);
    const avisos = (zap.enviarTexto as any).mock.calls;
    expect(avisos.some((c: any[]) => c[0] === '5599991811246' && /retorno por ligação/.test(c[1]))).toBe(true);
  });

  it('visita com busca: endereço vai no aviso e para o lead de quem compartilhou', async () => {
    (zap.enviarTexto as any).mockClear();
    const p = retornoSchema.parse({ ...base, telefone: '(99) 98877-2222', tipo: 'visita_busca', decidido: true, enderecoBusca: 'Rua das Flores, 120, Centro', pessoas: 3, ref: refDoUsuario(2) });
    const r = await R.registrarRetorno('bom-jardims', p);
    const [row]: any[] = db.all(sql`SELECT * FROM leadRetornos WHERE id = ${r.retornoId}`);
    expect(row).toMatchObject({ tipo: 'visita_busca', enderecoBusca: 'Rua das Flores, 120, Centro', pessoas: 3, responsavelId: 2 });
    const avisos = (zap.enviarTexto as any).mock.calls;
    expect(avisos.some((c: any[]) => c[0] === '5599981112222' && /Buscar em: Rua das Flores/.test(c[1]))).toBe(true);
  });

  it('horário que já passou é recusado', async () => {
    const ontem = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const p = retornoSchema.parse({ ...base, tipo: 'ligacao', dia: ontem, hora: '07:00' });
    await expect(R.registrarRetorno('bom-jardims', p)).rejects.toThrow();
  });

  it('job: avisa perto do horário uma vez só, respeitando a antecedência por tipo', async () => {
    const quando = quandoDoRetorno(amanha, '14:30').getTime();
    (zap.enviarTexto as any).mockClear();
    // 30 min antes: nem a ligação (10 min) sai; a busca (1 h) do mesmo horário já sai
    const n1 = await R.processarRetornos(quando - 30 * 60_000);
    expect(n1).toBe(1);
    expect((zap.enviarTexto as any).mock.calls[0][1]).toMatch(/Hora de sair para buscar/);
    const n2 = await R.processarRetornos(quando - antecedenciaMs('ligacao'));
    expect(n2).toBe(1);
    expect((zap.enviarTexto as any).mock.calls.at(-1)[1]).toMatch(/Hora de ligar para Rose/);
    expect(await R.processarRetornos(quando)).toBe(0);
  });

  it('conflito: horário ocupado vai para o próximo livre da roleta; sem ninguém livre, recusa', async () => {
    // José (1) já tem a ligação das 14:30; ninguém na roleta → o mesmo horário é recusado
    const p = retornoSchema.parse({ ...base, telefone: '(99) 98877-3333', tipo: 'ligacao' });
    await expect(R.registrarRetorno('bom-jardims', p)).rejects.toThrow(/ocupado/);
    // Entra um corretor na roleta: o retorno vai para ele e o lead é encaminhado
    db.run(sql`INSERT INTO users (id, openId, name, role, perfil, creci, telefone, recebeLeads) VALUES (7, 'u7', 'Pedro Plantão', 'user', 'corretor', '7777', '99970001111', 1)`);
    (zap.enviarTexto as any).mockClear();
    const r = await R.registrarRetorno('bom-jardims', p);
    expect(r).toMatchObject({ responsavelId: 7, redistribuido: true });
    const avisos = (zap.enviarTexto as any).mock.calls;
    expect(avisos.some((c: any[]) => c[0] === '5599970001111' && /retorno por ligação/.test(c[1]))).toBe(true);
    expect(avisos.some((c: any[]) => c[0] === '5599991811246' && /distribuído para Pedro Plantão/.test(c[1]))).toBe(true);
    const enc: any[] = db.all(sql`SELECT * FROM leadEncaminhamentos WHERE paraId = 7`);
    expect(enc.length).toBe(1);
  });

  it('horários livres: some o que ninguém pode atender', async () => {
    // 14:30: José ocupado, Maria em visita, Pedro em ligação → nenhum livre; 15:00 Pedro e José livres
    const hs = await R.horariosLivres('bom-jardims', null, amanha, 'ligacao', Date.now());
    expect(hs).not.toContain('14:30');
    expect(hs).toContain('15:00');
    expect(gradeHorarios('visita_busca').at(-1)).toBe('16:00');
    expect(livre([{ responsavelId: 1, inicio: 0, fim: 10 }], 1, 10, 20)).toBe(true);
  });
});
