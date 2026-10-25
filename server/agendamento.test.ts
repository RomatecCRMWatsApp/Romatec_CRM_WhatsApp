import { beforeAll, describe, expect, it, vi } from 'vitest';

// Banco local em memória (SQLite) com as mesmas tabelas da produção; sem Z-API, Telegram nem push
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
delete process.env.ZAPI_INSTANCE_ID;
delete process.env.VAPID_PRIVATE_KEY;
vi.mock('./leads/notificacao', async orig => ({ ...(await orig<any>()), notificarLead: vi.fn(async () => {}), enviarTelegram: vi.fn(async () => {}) }));
vi.mock('./leads/zapiClient', async orig => ({ ...(await orig<any>()), enviarTexto: vi.fn(async () => ({})) }));
// ingestLead grava colunas JSON que o SQLite dos testes não aceita: aqui só cria/atualiza o lead e registra a chamada
const chamadas: any[] = [];
vi.mock('./lead-intake', async orig => {
  const real = await orig<any>();
  return {
    ...real,
    ingestLead: vi.fn(async (input: any) => {
      chamadas.push(input);
      const phone = real.normalizePhoneBR(input.phone);
      if (!phone) return { ok: false, reason: 'invalid_phone' };
      const { getDb } = await import('./db');
      const { sql } = await import('drizzle-orm');
      const d: any = await getDb();
      const ja = d.all(sql`SELECT id FROM leadQualifications WHERE phone = ${phone}`);
      if (!ja.length) {
        d.run(sql`INSERT INTO leadQualifications (phone, nome, stage, score, empreendimentoSlug, loteCodigo, answers, createdAt, updatedAt)
          VALUES (${phone}, ${input.nome}, 'novo_lead', 'frio', ${input.empreendimentoSlug ?? null}, ${input.loteCodigo ?? null}, ${JSON.stringify(input.answers ?? {})}, ${Date.now()}, ${Date.now()})`);
      }
      return { ok: true, created: !ja.length, messageSent: false, phone };
    }),
  };
});

const A = await import('./agendamento');
const { refDoUsuario } = await import('./cartaoVendas');
const { agendamentoSchema, quandoDoPedido } = await import('../shared/agendamento');
const schema = await import('../drizzle/schema');
const { getDb } = await import('./db');
const { sql, eq } = await import('drizzle-orm');
const zap = await import('./leads/zapiClient');

let db: any;
beforeAll(async () => {
  db = await getDb();
  db.run(sql`INSERT INTO users (id, openId, name, role, creci, telefone) VALUES (1, 'u1', 'José Romário', 'admin', '4705', '99991811246')`);
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil, creci, telefone) VALUES (2, 'u2', 'Maria Corretora', 'user', 'corretor', '1234', '99981112222')`);
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil, empreendimentoSlug) VALUES (3, 'u3', 'Dona Empreendedora', 'user', 'empreendedor', 'outro-emp')`);
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil) VALUES (4, 'u4', 'Secretária', 'user', 'secretario')`);
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil, creci) VALUES (5, 'u5', 'Outro Corretor', 'user', 'corretor', '5555')`);
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil, empreendimentoSlug) VALUES (6, 'u6', 'Empreendedora BJ', 'user', 'empreendedor', 'bom-jardims')`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA')`);
  db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, quadra, numero, areaM2, situacao) VALUES (1, 'A01', 'A', 1, '3025.11', 'disponivel')`);
  db.run(sql`INSERT INTO lotes (empreendimentoId, codigo, quadra, numero, areaM2, situacao) VALUES (1, 'A12', 'A', 12, '3661.42', 'vendido_parcelado')`);
  db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{"emp_licenca_ambiental":"Licença de Operação n.º 018/2026","emp_licenca_orgao":"Secretaria Municipal de Meio Ambiente de Açailândia/MA — SEMMA","emp_sigef":"x","emp_area_ha":"41,1045"}', '{}')`);
  db.run(sql`INSERT INTO condicoesPagamento (empreendimentoId, precoBase, areaBaseM2, toleranciaAreaM2, entradaPct, entradaMaxParcelas, descontoAvistaPct, jurosAaEfetivo, metodo, prazos, comissaoTotalPct, comissaoCorretorPct, comissao1aParcelaPct, vigenteDesde, ativo)
    VALUES (1, '160000', '3025.11', '1', '0.30', 6, '0.0625', '0.06', 'PRICE', '[12,24,36,60,120]', '0.05', '0.02', '0.5', '2026-10-23', 1)`);
});

const amanha = new Date(Date.now() - 3 * 3600_000 + 86_400_000).toISOString().slice(0, 10);
const pedido = (x: Record<string, unknown> = {}) => agendamentoSchema.parse({
  nome: 'Carlos Cliente', telefone: '(99) 98877-6655', cidade: 'Imperatriz', unidade: 'A01', dia: amanha, horario: '10-12',
  pagamento: 'entrada_parcelada', pessoas: 3, consentimento: true, ...x,
});

describe('link de agendamento', () => {
  it('página: condições do simulador, licença e o contato de quem compartilhou (ref assinada)', async () => {
    const p = await A.dadosDaPagina('bom-jardims', refDoUsuario(2));
    expect(p.condicoes).toMatchObject({ areaMin: 3025.11, entradaPct: 0.3, entradaMaxParcelas: 6, prazoMax: 120, descontoAvistaTotal: 10000, parcelaMin: 1234.51 });
    expect(p.licenca?.texto).toBe('Licença de Operação n.º 018/2026');
    expect(p.disponiveis).toEqual(['A01']);
    // Mapa público: todos os lotes, só "disponível"/"indisponível" (A12 vendido aparece como indisponível, sem detalhe da venda)
    expect(p.mapa.lotes.map(l => [l.codigo, l.situacao])).toEqual([['A01', 'disponivel'], ['A12', 'reservado']]);
    expect(JSON.stringify(p.mapa)).not.toMatch(/vendido|cliente|corretor|valor/i);
    expect(p.contato).toMatchObject({ nome: 'Maria Corretora', creci: 'CRECI/MA 1.234' });
    // Sem ref, ref adulterada ou link do empreendedor: contato do administrador
    expect((await A.dadosDaPagina('bom-jardims', null)).contato.nome).toBe('José Romário');
    expect((await A.dadosDaPagina('bom-jardims', '2xxxxxxxx')).contato.nome).toBe('José Romário');
    expect((await A.dadosDaPagina('bom-jardims', refDoUsuario(3))).contato.nome).toBe('José Romário');
  });

  it('envio pelo link da corretora: lead + pedido "solicitada" com ela, sininho e WhatsApp dela', async () => {
    const r = await A.registrarAgendamento('bom-jardims', pedido({ ref: refDoUsuario(2) }), '1.2.3.4');
    expect(r).toMatchObject({ ok: true, responsavelId: 2 });
    // Lead pelo ingestLead (o mesmo da captação: dedupe, boas-vindas e aviso no Telegram/WhatsApp)
    expect(chamadas.at(-1)).toMatchObject({ responsavelId: 2, origem: 'site', campanha: 'Link de agendamento', empreendimentoSlug: 'bom-jardims', loteCodigo: 'A01', funil: 'comprador',
      consentimento: expect.objectContaining({ origem: 'link_agendamento', ip: '1.2.3.4' }) });
    const [lead] = await db.select().from(schema.leadQualifications).where(eq(schema.leadQualifications.id, r.leadId));
    expect(lead).toMatchObject({ nome: 'Carlos Cliente', phone: '5599988776655', responsavelId: 2, empreendimentoSlug: 'bom-jardims', loteCodigo: 'A01' });
    const ans = typeof lead.answers === 'string' ? JSON.parse(lead.answers) : lead.answers;
    expect(ans).toMatchObject({ cidade: 'Imperatriz', 'melhor horário': '10h às 12h', 'forma de pagamento': 'Entrada parcelada', 'pessoas no atendimento': '3' });
    const [v] = await db.select().from(schema.leadVisitas).where(eq(schema.leadVisitas.leadId, r.leadId));
    expect(v).toMatchObject({ status: 'solicitada', responsavelId: 2 });
    expect(new Date(v.quando).getTime()).toBe(quandoDoPedido(amanha, '10-12').getTime());
    expect(v.observacao).toContain('3 pessoa(s)');
    const notifs = await db.select().from(schema.notificacoes).where(eq(schema.notificacoes.usuarioId, 2));
    expect(notifs.find((n: any) => n.tipo === 'agendamento')).toMatchObject({ url: `/leads/lead/${r.leadId}` });
    expect((zap.enviarTexto as any).mock.calls.some(([fone, t]: [string, string]) => fone === '5599981112222' && /Pedido de agendamento/.test(t))).toBe(true);
  });

  it('sem ref: cai no administrador; lead que já tem corretor continua com ele', async () => {
    const r1 = await A.registrarAgendamento('bom-jardims', pedido({ nome: 'Ana Sem Link', telefone: '99977665544' }));
    expect(r1.responsavelId).toBe(1);
    // Mesmo cliente da corretora volta por outro link: não troca de dono
    const r2 = await A.registrarAgendamento('bom-jardims', pedido({ ref: '' }));
    expect(r2.responsavelId).toBe(2);
  });

  it('validação: dia passado, campos obrigatórios e honeypot', async () => {
    await expect(A.registrarAgendamento('bom-jardims', pedido({ dia: '2020-01-01' }))).rejects.toMatchObject({ name: 'AgendamentoErro' });
    expect(agendamentoSchema.safeParse({ nome: 'X' }).success).toBe(false);
    expect(agendamentoSchema.safeParse({ ...pedido(), consentimento: false }).success).toBe(false);
    await expect(A.dadosDaPagina('nao-existe', null)).rejects.toMatchObject({ status: 404 });
  });

  it('novo lead: admin, secretária e o corretor do lead (não outro corretor); empreendedor só do empreendimento dele; som próprio', async () => {
    const { notificarNovoLead } = await import('./notificacoes');
    const { SOM_POR_TIPO } = await import('../shared/notificacoes');
    const r = await A.registrarAgendamento('bom-jardims', pedido({ nome: 'Lead Novo Teste', telefone: '99966554433', ref: refDoUsuario(2) }));
    await notificarNovoLead(r.leadId!, undefined, null);
    const doLead = (await db.select().from(schema.notificacoes)).filter((n: any) => n.tipo === 'novo_lead' && n.chave === `novo_lead:${r.leadId}`);
    expect(doLead.map((n: any) => n.usuarioId).sort()).toEqual([1, 2, 4, 6]);
    expect(doLead[0].titulo).toBe('Novo lead: Lead Novo Teste · Condomínio de Chácaras Bom Jardims');
    expect(doLead[0].mensagem).toContain('de Imperatriz · interesse: A01');
    expect(doLead.find((n: any) => n.usuarioId === 2).url).toBe(`/leads/lead/${r.leadId}`);
    // Uma vez só por lead
    await notificarNovoLead(r.leadId!, undefined, null);
    expect((await db.select().from(schema.notificacoes)).filter((n: any) => n.chave === `novo_lead:${r.leadId}`)).toHaveLength(4);
    expect(SOM_POR_TIPO.novo_lead).toBe('/sons/novo_lead.wav');
  });
});
