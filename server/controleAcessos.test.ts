import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const { situacaoDeUso, situacaoDePagamento, podeEntrar, resumoControle, somarUsoMidias, descreverMidias } = await import('../shared/controleAcessos');
const { podeAbrir } = await import('../shared/equipe');
const S = await import('./saas/servico');
const A = await import('./controleAcessos');
const { hashPassword } = await import('./auth-security');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');

const DIA = 86_400_000;
const AGORA = Date.parse('2026-11-06T12:00:00Z');
let db: any;

describe('controle de acessos: regras', () => {
  it('uso pelo último acesso: usando (3 d), pouco uso (15 d), parado, nunca entrou', () => {
    expect(situacaoDeUso(new Date(AGORA - 2 * DIA), AGORA)).toBe('usando');
    expect(situacaoDeUso(new Date(AGORA - 10 * DIA), AGORA)).toBe('pouco');
    expect(situacaoDeUso(new Date(AGORA - 40 * DIA), AGORA)).toBe('parado');
    expect(situacaoDeUso(null, AGORA)).toBe('nunca');
  });
  it('pagamento pela licença', () => {
    expect(situacaoDePagamento({ status: 'ATIVA', origem: 'PAGA', liberado: true })).toBe('pago');
    expect(situacaoDePagamento({ status: 'ATIVA', origem: 'CORTESIA', liberado: true })).toBe('cortesia');
    expect(situacaoDePagamento({ status: 'TRIAL', origem: 'TRIAL', liberado: true })).toBe('teste');
    expect(situacaoDePagamento({ status: 'TRIAL', origem: 'TRIAL', liberado: false })).toBe('vencido');
    expect(situacaoDePagamento({ status: 'INADIMPLENTE', origem: 'PAGA', liberado: true })).toBe('atrasado');
    expect(situacaoDePagamento({ status: 'INADIMPLENTE', origem: 'PAGA', liberado: false })).toBe('bloqueado');
    expect(situacaoDePagamento({ status: 'BLOQUEADO', origem: 'PAGA', liberado: false })).toBe('bloqueado');
    expect(situacaoDePagamento(null)).toBe('sem_licenca');
    expect(situacaoDePagamento(null, false)).toBe('nao_exige');
  });
  it('entra hoje só com login ativo e licença liberada', () => {
    expect(podeEntrar(true, 'pago')).toBe(true);
    expect(podeEntrar(true, 'atrasado')).toBe(true);
    expect(podeEntrar(true, 'bloqueado')).toBe(false);
    expect(podeEntrar(false, 'pago')).toBe(false);
  });
  it('resumo do topo', () => {
    const r = resumoControle([
      { ativo: true, uso: 'usando', pagamento: 'pago' }, { ativo: true, uso: 'nunca', pagamento: 'sem_licenca' }, { ativo: false, uso: 'parado', pagamento: 'cortesia' },
    ]);
    expect(r).toMatchObject({ total: 3, ativos: 2, inativos: 1, pagos: 1, cortesia: 1, pendentes: 1, usando: 1, parados: 2 });
  });
  it('mídias: soma por tipo, última vez e o texto do card', () => {
    const u = somarUsoMidias([
      { categoria: 'imagem', criadoEm: '2026-11-01T10:00:00Z' }, { categoria: 'imagem', criadoEm: '2026-11-03T10:00:00Z' },
      { categoria: 'video', criadoEm: '2026-11-02T10:00:00Z' }, { categoria: 'texto', criadoEm: null }, { categoria: 'lixo', criadoEm: null },
    ]);
    expect(u).toMatchObject({ imagem: 2, video: 1, pdf: 0, texto: 1, total: 4, ultimo: '2026-11-03T10:00:00.000Z' });
    expect(descreverMidias(u)).toBe('2 fotos, 1 vídeo, 1 texto');
    expect(descreverMidias(somarUsoMidias([]))).toBe('nenhum');
  });
  it('contador das licenças no resumo', () => {
    const r = resumoControle([
      { ativo: true, uso: 'usando', pagamento: 'pago' }, { ativo: true, uso: 'usando', pagamento: 'teste' },
      { ativo: true, uso: 'parado', pagamento: 'bloqueado' }, { ativo: true, uso: 'parado', pagamento: 'bloqueado' },
    ]);
    expect(r.licencas).toMatchObject({ pago: 1, teste: 1, bloqueado: 2, cortesia: 0 });
  });
  it('a tela abre para administrador e secretária, não para corretor e empreendedor', () => {
    expect(podeAbrir('admin', '/controle-acessos')).toBe(true);
    expect(podeAbrir('secretario', '/controle-acessos')).toBe(true);
    expect(podeAbrir('corretor', '/controle-acessos')).toBe(false);
    expect(podeAbrir('empreendedor', '/controle-acessos')).toBe(false);
    // Contrato de gestão (taxas, valores, recibos): privativo do administrador
    expect(podeAbrir('admin', '/contrato-gestao')).toBe(true);
    for (const p of ['secretario', 'corretor', 'empreendedor'] as const) expect(podeAbrir(p, '/contrato-gestao')).toBe(false);
  });
});

describe('controle de acessos: banco', () => {
  beforeAll(async () => {
    db = await getDb();
    const seg = (t: number) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');
    const cad = seg(AGORA - 90 * DIA);
    db.run(sql`INSERT INTO users (id, openId, name, role, perfil, ativo, creci, passwordHash, createdAt, lastSignedIn) VALUES
      (1, 'a1', 'Admin Teste', 'admin', NULL, 1, NULL, 'h', ${cad}, ${cad}),
      (2, 's2', 'Sara Secretária', 'user', 'secretario', 1, NULL, 'h', ${cad}, ${cad}),
      (3, 'c3', 'Carlos Ativo Pago', 'user', 'corretor', 1, '11111', 'h', ${cad}, ${seg(AGORA - DIA)}),
      (4, 'c4', 'Bruna Sem Licença', 'user', 'corretor', 1, '22222', NULL, ${cad}, ${cad}),
      (5, 'c5', 'Diego Desligado', 'user', 'corretor', 0, '33333', 'h', ${cad}, ${seg(AGORA - 60 * DIA)})`);
    db.run(sql`UPDATE users SET password_hash = ${await hashPassword('Senha-do-Jose-1')} WHERE id = 1`);
    await S.definirLicenciamento(true, null, 1);
    await S.definirAssinatura({ usuarioId: 3, planoCodigo: 'CORRETOR_ESSENCIAL', origem: 'PAGA', periodoFim: '2026-12-31', motivo: 'Pix de teste' }, 1);
    await S.auditar(3, 'LOGIN', null, '10.0.0.1');
    await S.auditar(3, 'LOGIN', null, '10.0.0.1');
  });

  it('lista só corretores e empreendedores, com pagamento, uso e entradas', async () => {
    const { linhas, resumo } = await A.listarControleAcessos(AGORA);
    expect(linhas.map(l => l.nome)).toEqual(['Bruna Sem Licença', 'Carlos Ativo Pago', 'Diego Desligado']);
    const carlos = linhas.find(l => l.id === 3)!;
    expect(carlos).toMatchObject({ ativo: true, pagamento: 'pago', uso: 'usando', loginsMes: 2, podeEntrar: true });
    expect(linhas.find(l => l.id === 4)).toMatchObject({ pagamento: 'sem_licenca', uso: 'nunca', podeEntrar: false });
    expect(linhas.find(l => l.id === 5)).toMatchObject({ ativo: false, podeEntrar: false });
    expect(resumo).toMatchObject({ total: 3, ativos: 2, inativos: 1, pagos: 1 });
  });

  it('uso dos materiais aparece por corretor (só contagem dos últimos 30 dias)', async () => {
    const { materialUso } = await import('../drizzle/schema');
    await db.insert(materialUso).values([
      { usuarioId: 3, materialId: 1, empreendimentoSlug: 'bom-jardims', categoria: 'imagem', acao: 'baixar', criadoEm: new Date(AGORA - DIA) },
      { usuarioId: 3, materialId: 2, empreendimentoSlug: 'bom-jardims', categoria: 'pdf', acao: 'enviar', criadoEm: new Date(AGORA - 2 * DIA) },
      { usuarioId: 3, materialId: 1, empreendimentoSlug: 'bom-jardims', categoria: 'imagem', acao: 'enviar', criadoEm: new Date(AGORA - 45 * DIA) },
    ] as any);
    const { linhas, resumo } = await A.listarControleAcessos(AGORA);
    expect(linhas.find(l => l.id === 3)!.midias).toMatchObject({ imagem: 1, pdf: 1, total: 2 });
    expect(linhas.find(l => l.id === 4)!.midias.total).toBe(0);
    expect(resumo.usaramMidias).toBe(1);
  });

  const SARA = { id: 2, name: 'Sara Secretária', perfil: 'secretario', role: 'user' };
  const JOSE = { id: 1, name: 'Admin Teste', perfil: null, role: 'admin' };

  it('secretária só pede: a cortesia só vale depois da senha do administrador', async () => {
    const pedido = await A.pedirProrrogacao(4, { modalidade: 'cortesia', ate: '2026-11-30', motivo: 'Começou na equipe' }, SARA, AGORA);
    expect(pedido.codigo).toMatch(/^\d{6}$/);
    let b = (await A.listarControleAcessos(AGORA)).linhas.find(l => l.id === 4)!;
    expect(b.pagamento).toBe('sem_licenca');
    // Senha errada: nada muda
    await expect(A.autorizarPedido({ codigo: pedido.codigo }, 'errada', SARA, null, AGORA)).rejects.toThrow(/incorreta/);
    b = (await A.listarControleAcessos(AGORA)).linhas.find(l => l.id === 4)!;
    expect(b.pagamento).toBe('sem_licenca');
    // O administrador digita a senha dele no aparelho da secretária
    await A.autorizarPedido({ codigo: pedido.codigo }, 'Senha-do-Jose-1', SARA, null, AGORA);
    b = (await A.listarControleAcessos(AGORA)).linhas.find(l => l.id === 4)!;
    expect(b).toMatchObject({ pagamento: 'cortesia', podeEntrar: true });
    const ped = (await A.listarPedidos(AGORA)).find(p => p.id === pedido.id)!;
    expect(ped).toMatchObject({ status: 'APROVADA', decididoPor: 'Admin Teste', solicitante: 'Sara Secretária' });
    // Pedido já decidido não pode ser usado de novo
    await expect(A.autorizarPedido({ id: pedido.id }, 'Senha-do-Jose-1', SARA, null, AGORA)).rejects.toThrow(/já decidido/);
  });

  it('bloqueado volta com prorrogação paga, e senha errada 5 vezes cancela o pedido', async () => {
    await A.bloquearLicenca(4, 'Não renovou', 2);
    expect((await A.listarControleAcessos(AGORA)).linhas.find(l => l.id === 4)).toMatchObject({ pagamento: 'bloqueado', podeEntrar: false });
    const p1 = await A.pedirProrrogacao(4, { modalidade: 'pago', ate: '2026-12-31', valor: 89.9, motivo: 'Pagou por Pix' }, SARA, AGORA);
    for (let i = 0; i < 4; i++) await expect(A.autorizarPedido({ id: p1.id }, 'chute', SARA, null, AGORA)).rejects.toThrow(/incorreta/);
    await expect(A.autorizarPedido({ id: p1.id }, 'chute', SARA, null, AGORA)).rejects.toThrow(/cancelado/);
    await expect(A.autorizarPedido({ id: p1.id }, 'Senha-do-Jose-1', SARA, null, AGORA)).rejects.toThrow(/já decidido/);
    const p2 = await A.pedirProrrogacao(4, { modalidade: 'pago', ate: '2026-12-31', valor: 89.9, motivo: 'Pagou por Pix' }, SARA, AGORA);
    await A.autorizarPedido({ id: p2.id }, 'Senha-do-Jose-1', SARA, null, AGORA);
    const b = (await A.listarControleAcessos(AGORA)).linhas.find(l => l.id === 4)!;
    expect(b).toMatchObject({ pagamento: 'pago', podeEntrar: true });
    expect(b.licencaFim?.slice(0, 10)).toBe('2027-01-01'); // 31/12 23:59 em Brasília = 01/01 UTC
  });

  it('pedido vence em 48 horas; administrador logado prorroga direto só com a própria senha', async () => {
    const velho = await A.pedirProrrogacao(3, { modalidade: 'cortesia', ate: '2026-12-15', motivo: 'Teste de validade' }, SARA, AGORA);
    await expect(A.autorizarPedido({ id: velho.id }, 'Senha-do-Jose-1', SARA, null, AGORA + 49 * 3600_000)).rejects.toThrow(/expirou/);
    await expect(A.prorrogarComSenha(3, { modalidade: 'cortesia', ate: '2026-12-15', motivo: 'Direto' }, 'Senha-do-Jose-1', SARA)).rejects.toThrow(/só o administrador/);
    await expect(A.prorrogarComSenha(3, { modalidade: 'cortesia', ate: '2026-12-15', motivo: 'Direto' }, 'errada', JOSE)).rejects.toThrow(/incorreta/);
    await A.prorrogarComSenha(3, { modalidade: 'cortesia', ate: '2026-12-15', motivo: 'Direto' }, 'Senha-do-Jose-1', JOSE);
    expect((await A.listarControleAcessos(AGORA)).linhas.find(l => l.id === 3)!.pagamento).toBe('cortesia');
  });

  it('ativar/desativar login fica no histórico com o motivo e quem fez', async () => {
    await A.definirLoginAtivo(5, true, 'Voltou para a equipe', 2);
    const d = db.all(sql`SELECT ativo FROM users WHERE id = 5`)[0];
    expect(Number(d.ativo)).toBe(1);
    const h = await A.historicoAcessos(5);
    expect(h[0]).toMatchObject({ evento: 'LOGIN_ATIVADO', motivo: 'Voltou para a equipe', por: 'Sara Secretária' });
  });

  it('não mexe em administrador nem secretária', async () => {
    await expect(A.definirLoginAtivo(1, false, 'teste indevido', 2)).rejects.toThrow(/só para corretores/);
    await expect(A.pedirProrrogacao(2, { modalidade: 'cortesia', ate: '2026-12-01', motivo: 'teste indevido' }, SARA, AGORA)).rejects.toThrow(/só para corretores/);
  });
});
