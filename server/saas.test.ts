import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const S = await import('./saas/servico');
const T = await import('./saas/talonarios');
const L = await import('../shared/saas');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
const { PDFDocument } = await import('pdf-lib');

const DIA = 86_400_000;
const enviados: [string, string][] = [];
let db: any;
const usuario = (id: number) => db.all(sql`SELECT * FROM users WHERE id = ${id}`)[0];
const assinatura = (usuarioId: number) => db.all(sql`SELECT * FROM saasAssinaturas WHERE usuarioId = ${usuarioId}`);

beforeAll(async () => {
  db = await getDb();
  db.run(sql`INSERT INTO users (id, openId, name, role, perfil, cpf, telefone, ativo) VALUES
    (1, 'u1', 'José Admin', 'admin', NULL, '52998224725', '99991811246', 1),
    (2, 'u2', 'Carla Corretora Antiga', 'user', 'corretor', '11144477735', '99911112222', 1),
    (3, 'u3', 'Dona Empreendedora', 'user', 'empreendedor', '39053344705', '99933334444', 1),
    (4, 'u4', 'Sofia Secretária', 'user', 'secretario', '15350946056', '99944445555', 1),
    (5, 'u5', 'Novo Corretor', 'user', 'corretor', '86288366757', '99955556666', 1),
    (6, 'u6', 'Mesmo CPF Outra Conta', 'user', 'corretor', '86288366757', '99966667777', 1)`);
  db.run(sql`UPDATE users SET empreendimentoSlug = 'bom-jardims' WHERE id = 3`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'bom-jardims', 'Bom Jardims'), (2, 'outro', 'Outro')`);
  db.run(sql`INSERT INTO leadQualifications (id, phone, nome, stage, score, responsavelId, createdAt, updatedAt) VALUES (1, '5599900001111', 'Lead do Novo', 'novo_lead', 'frio', 5, ${Date.now()}, ${Date.now()})`);
  S.envio.disponivel = () => true;
  S.envio.texto = async (fone, msg) => { enviados.push([fone, msg]); };
});

describe('licença — regras puras', () => {
  it('trial no prazo, ativa, inadimplente na tolerância; sem assinatura bloqueia; MRR anual ÷ 12', () => {
    const agora = Date.now();
    expect(L.licencaLiberada(null, agora)).toBe(false);
    expect(L.licencaLiberada({ status: 'TRIAL', trialFim: new Date(agora + DIA) }, agora)).toBe(true);
    expect(L.licencaLiberada({ status: 'TRIAL', trialFim: new Date(agora - 1) }, agora)).toBe(false);
    expect(L.licencaLiberada({ status: 'INADIMPLENTE', periodoFim: new Date(agora - 2 * DIA), diasTolerancia: 3 }, agora)).toBe(true);
    expect(L.licencaLiberada({ status: 'INADIMPLENTE', periodoFim: new Date(agora - 4 * DIA), diasTolerancia: 3 }, agora)).toBe(false);
    expect(L.licencaLiberada({ status: 'BLOQUEADO' }, agora)).toBe(false);
    expect(L.calcularMrr([
      { status: 'ATIVA', origem: 'PAGA', ciclo: 'MENSAL', plano: { precoMensal: 89.9, precoAnual: 899 } },
      { status: 'ATIVA', origem: 'PAGA', ciclo: 'ANUAL', plano: { precoMensal: 159.9, precoAnual: 1599 } },
      { status: 'ATIVA', origem: 'CORTESIA', ciclo: 'MENSAL', plano: { precoMensal: 89.9 } },
      { status: 'ATIVA', origem: 'PAGA', ciclo: 'MENSAL', precoOverride: 69.9, plano: { precoMensal: 89.9 } },
    ])).toBe(Math.round((89.9 + 1599 / 12 + 69.9) * 100) / 100);
    expect(L.caminhoLivre('saas.minhaAssinatura')).toBe(true);
    expect(L.caminhoLivre('auth.me')).toBe(true);
    expect(L.caminhoLivre('crm.kanban')).toBe(false);
  });
});

describe('licenciamento desligado → ligado com cortesia', () => {
  it('desligado: ninguém é cobrado nem ganha trial', async () => {
    expect(await S.resumoLicenca(usuario(2))).toMatchObject({ exigida: false, liberado: true });
    expect(await S.iniciarTrialSeNecessario(usuario(5))).toBeNull();
    expect(assinatura(5)).toHaveLength(0);
  });

  it('ligar com cortesia: corretor e empreendedor atuais ganham cortesia; admin/secretária isentos', async () => {
    const r = await S.definirLicenciamento(true, new Date(Date.now() + 30 * DIA).toISOString().slice(0, 10), 1);
    expect(r).toEqual({ ativo: true, cortesias: 4 }); // corretores 2, 5, 6 e a empreendedora 3
    expect(assinatura(3)[0]).toMatchObject({ origem: 'CORTESIA', status: 'ATIVA', empreendimentoId: 1 });
    expect(await S.resumoLicenca(usuario(2))).toMatchObject({ exigida: true, liberado: true, origem: 'CORTESIA' });
    expect(await S.resumoLicenca(usuario(4))).toMatchObject({ exigida: false, liberado: true });
  });
});

describe('trial, bloqueio e pagamento', () => {
  it('trial de 7 dias no 1º login; um por CPF (outra conta com o mesmo CPF não ganha)', async () => {
    db.run(sql`DELETE FROM saasAssinaturas WHERE usuarioId IN (5, 6)`);
    S.limparCaches();
    const t = await S.iniciarTrialSeNecessario(usuario(5));
    expect(t?.trialFim.getTime()).toBeGreaterThan(Date.now() + 6.9 * DIA);
    expect(assinatura(5)[0]).toMatchObject({ origem: 'TRIAL', status: 'TRIAL' });
    expect(await S.iniciarTrialSeNecessario(usuario(6))).toBeNull();
    expect(await S.resumoLicenca(usuario(6))).toMatchObject({ exigida: true, liberado: false, motivo: 'Você ainda não tem uma assinatura ativa.' });
  });

  it('lembrete D-3 uma vez só; no fim do teste bloqueia, devolve os leads e avisa', async () => {
    const t0 = Date.parse('2026-11-01T12:00:00-03:00'); // 12h em Fortaleza (janela de lembretes)
    db.run(sql`UPDATE saasAssinaturas SET trialFim = ${new Date(t0 + 3 * DIA).toISOString().replace('T', ' ').replace('Z', '')} WHERE usuarioId = 5`);
    S.limparCaches();
    await S.rotinaSaas(t0);
    await S.rotinaSaas(t0 + 60_000);
    expect(enviados.filter(([f, m]) => f === '5599955556666' && m.includes('Faltam 3 dia(s)'))).toHaveLength(1);
    await S.rotinaSaas(t0 + 3 * DIA + 1000);
    expect(assinatura(5)[0]).toMatchObject({ status: 'BLOQUEADO' });
    expect(db.all(sql`SELECT responsavelId FROM leadQualifications WHERE id = 1`)[0].responsavelId).toBeNull();
    expect(enviados.some(([f, m]) => f === '5599955556666' && m.includes('Seu período de teste terminou'))).toBe(true);
    expect(db.all(sql`SELECT COUNT(*) AS n FROM auditoriaAcesso WHERE usuarioId = 5 AND evento = 'TRIAL_EXPIRADO'`)[0].n).toBe(1);
  });

  it('cortesia que acaba 23:59: bloqueia na hora, mas os WhatsApps só saem a partir das 9h (e uma vez)', async () => {
    db.run(sql`DELETE FROM saasAssinaturas WHERE usuarioId = 2`);
    db.run(sql`INSERT INTO saasAssinaturas (usuarioId, planoId, chave, origem, status, periodoFim) SELECT 2, id, '2:0', 'CORTESIA', 'ATIVA', '2026-10-31 02:59:59' FROM saasPlanos WHERE codigo = 'CORRETOR_ESSENCIAL'`);
    S.limparCaches();
    const antes = enviados.length;
    const madrugada = Date.parse('2026-10-31T00:05:00-03:00');
    await S.rotinaSaas(madrugada);
    expect(assinatura(2)[0].status).toBe('BLOQUEADO');
    expect(enviados.length).toBe(antes); // nada de madrugada
    expect(String(assinatura(2)[0].lembretesJson)).toContain('aviso:');
    await S.rotinaSaas(Date.parse('2026-10-31T08:59:00-03:00'));
    expect(enviados.length).toBe(antes);
    await S.rotinaSaas(Date.parse('2026-10-31T09:00:00-03:00'));
    expect(enviados.filter(([f, m]) => f === '5599911112222' && m.includes('cortesia terminou'))).toHaveLength(1);
    expect(String(assinatura(2)[0].lembretesJson)).not.toContain('aviso:');
    await S.rotinaSaas(Date.parse('2026-10-31T09:15:00-03:00'));
    expect(enviados.filter(([f, m]) => f === '5599911112222' && m.includes('cortesia terminou'))).toHaveLength(1);
  });

  it('bloqueado de madrugada e pago antes das 9h: o aviso guardado é descartado', async () => {
    db.run(sql`UPDATE saasAssinaturas SET status = 'BLOQUEADO', lembretesJson = ${JSON.stringify(['aviso:' + JSON.stringify({ usuario: 'AVISO VELHO', escritorio: null })])} WHERE usuarioId = 2`);
    db.run(sql`UPDATE saasAssinaturas SET status = 'ATIVA', origem = 'PAGA', periodoFim = '2026-12-31 02:59:59' WHERE usuarioId = 2`);
    await S.rotinaSaas(Date.parse('2026-10-31T10:00:00-03:00'));
    expect(enviados.some(([, m]) => m === 'AVISO VELHO')).toBe(false);
    expect(String(assinatura(2)[0].lembretesJson)).not.toContain('aviso:');
  });

  it('pagamento manual desbloqueia; vencido fica na tolerância (inadimplente) e depois bloqueia', async () => {
    const id = assinatura(5)[0].id;
    const agora = Date.now();
    await S.registrarPagamentoManual(id, { ciclo: 'MENSAL', valor: 89.9, observacao: 'Pix' }, 1, agora);
    S.limparCaches();
    expect(await S.resumoLicenca(usuario(5))).toMatchObject({ liberado: true, status: 'ATIVA', origem: 'PAGA' });
    const fim = new Date(assinatura(5)[0].periodoFim.replace(' ', 'T') + 'Z').getTime();
    await S.rotinaSaas(fim + 1000);
    expect(assinatura(5)[0].status).toBe('INADIMPLENTE');
    expect(L.licencaLiberada({ ...assinatura(5)[0], periodoFim: new Date(fim) }, fim + DIA)).toBe(true);
    await S.rotinaSaas(fim + 3 * DIA + 1000);
    expect(assinatura(5)[0].status).toBe('BLOQUEADO');
    expect((await S.metricas(agora)).receitaMes).toBeGreaterThanOrEqual(89.9);
  });

  it('empreendedor avulso com 2 empreendimentos: 2 assinaturas independentes; pacote vencido vira PENDENTE_CONVERSAO', async () => {
    await S.definirAssinatura({ usuarioId: 3, empreendimentoId: 2, planoCodigo: 'EMPREENDEDOR_AVULSO', origem: 'PAGA', periodoFim: '2027-01-31', motivo: 'Avulso do Outro' }, 1);
    expect(assinatura(3)).toHaveLength(2);
    await S.definirAssinatura({ usuarioId: 3, empreendimentoId: 1, planoCodigo: 'EMPREENDEDOR_PACOTE', origem: 'PACOTE_GESTAO', contratoGestaoNr: 'CG-01', periodoFim: '2026-11-10', motivo: 'Pacote' }, 1);
    await S.rotinaSaas(Date.parse('2026-11-11T12:00:00-03:00'));
    const porEmp = new Map(assinatura(3).map((a: any) => [a.empreendimentoId, a.status]));
    expect(porEmp.get(1)).toBe('PENDENTE_CONVERSAO');
    expect(porEmp.get(2)).toBe('ATIVA');
  });
});

describe('cupons (regras do AvalieImob + plano-alvo)', () => {
  it('FUNDADOR com preço fixo por plano, limite e validade; percentual; plano errado recusado', async () => {
    await S.criarCupom({ codigo: 'FUNDADOR', tipo: 'PRECO_FIXO', precosFixos: L.CUPOM_FUNDADOR.precoFixo, limiteUsos: 20, duracaoCiclos: 12 }, 1);
    expect(await S.validarCupom('fundador', 'CORRETOR_ESSENCIAL', 'MENSAL')).toMatchObject({ preco: 89.9, precoComDesconto: 69.9, duracaoCiclos: 12 });
    expect(await S.validarCupom('FUNDADOR', 'CORRETOR_PRO', 'MENSAL')).toMatchObject({ precoComDesconto: 129.9 });
    await expect(S.validarCupom('FUNDADOR', 'EMPREENDEDOR_AVULSO', 'MENSAL')).rejects.toThrow(/não vale/);
    await S.criarCupom({ codigo: 'DEZ', tipo: 'PERCENTUAL', valor: 10, limiteUsos: 5, planoAlvo: 'CORRETOR_PRO' }, 1);
    expect(await S.validarCupom('DEZ', 'CORRETOR_PRO', 'ANUAL')).toMatchObject({ preco: 1599, precoComDesconto: 1439.1 });
    await expect(S.validarCupom('DEZ', 'CORRETOR_ESSENCIAL', 'MENSAL')).rejects.toThrow(/não vale/);
    await expect(S.criarCupom({ codigo: 'DEZ', tipo: 'PERCENTUAL', valor: 5, limiteUsos: 1 }, 1)).rejects.toMatchObject({ status: 409 });
    db.run(sql`UPDATE saasCupons SET validade = '2020-01-01 00:00:00' WHERE codigo = 'DEZ'`);
    await expect(S.validarCupom('DEZ', 'CORRETOR_PRO', 'MENSAL')).rejects.toThrow(/expirado/);
  });
});

describe('talonários (modo arcaico)', () => {
  it('bloco numerado sem sobreposição; folha só do corretor do bloco e uma vez; pendências por corretor', async () => {
    const { id: externoId } = await T.criarExterno({ nome: 'Pedro Externo', cpf: '935.411.347-80', creci: '1111', telefone: '99977778888' }, 4);
    const b = await T.entregarBloco({ tipo: 'CONTRATO', numeroInicial: 101, numeroFinal: 110, externoId, entregueEm: '2026-10-25' }, 4);
    expect(b.folhas).toBe(10);
    await expect(T.entregarBloco({ tipo: 'CONTRATO', numeroInicial: 105, numeroFinal: 120, usuarioId: 2, entregueEm: '2026-10-25' }, 4)).rejects.toMatchObject({ status: 409 });
    const pdf = Buffer.from(await (await PDFDocument.create()).save());
    // Outro corretor não lança folha deste bloco
    await expect(T.lancarFolha({ talonarioId: b.id, numero: 101, corretor: { usuarioId: 2 }, status: 'UTILIZADA', referencia: 'A01', arquivo: { buf: pdf, nome: 'c.pdf' } }, 4)).rejects.toMatchObject({ status: 403 });
    await expect(T.lancarFolha({ talonarioId: b.id, numero: 101, corretor: { externoId }, status: 'UTILIZADA', referencia: 'A01' }, 4)).rejects.toThrow(/digitalizada/);
    await T.lancarFolha({ talonarioId: b.id, numero: 101, corretor: { externoId }, status: 'UTILIZADA', referencia: 'Chácara A01 — Fulano', arquivo: { buf: pdf, nome: 'c.pdf' } }, 4);
    await expect(T.lancarFolha({ talonarioId: b.id, numero: 101, corretor: { externoId }, status: 'CANCELADA' }, 4)).rejects.toMatchObject({ status: 409 });
    await expect(T.lancarFolha({ talonarioId: b.id, numero: 150, corretor: { externoId }, status: 'CANCELADA' }, 4)).rejects.toThrow(/não é deste bloco/);
    await T.lancarFolha({ talonarioId: b.id, numero: 102, corretor: { externoId }, status: 'EXTRAVIADA' }, 4);
    const p = await T.pendencias();
    expect(p).toEqual([{ corretor: 'Pedro Externo', externo: true, contratos: [103, 104, 105, 106, 107, 108, 109, 110], recibos: [] }]);
    expect((await T.arquivoDaFolha(b.id, 101)).mime).toBe('application/pdf');
  });
});

describe('ponto de checagem da licença (tRPC)', () => {
  it('corretor bloqueado: qualquer procedimento → 402; a área do assinante continua aberta; admin isento', async () => {
    const { appRouter } = await import('./routers');
    const caller = (u: any) => appRouter.createCaller({ user: u, req: { headers: {}, socket: {} } as any, res: {} as any } as any);
    S.limparCaches();
    const bloqueado = usuario(6); // mesmo CPF de outro trial: sem assinatura
    await expect(caller(bloqueado).crm.etapas()).rejects.toMatchObject({ code: 'PAYMENT_REQUIRED' });
    const minha = await caller(bloqueado).saas.minhaAssinatura();
    expect(minha.licenca).toMatchObject({ exigida: true, liberado: false });
    expect(minha.planos.map((p: any) => p.codigo)).toEqual(['CORRETOR_ESSENCIAL', 'CORRETOR_PRO']);
    await expect(caller(usuario(1)).crm.etapas()).resolves.toBeTruthy();
    // Licenciamento desligado: ninguém é barrado
    await S.definirLicenciamento(false, null, 1);
    await expect(caller(bloqueado).crm.etapas()).resolves.toBeTruthy();
  });
});
