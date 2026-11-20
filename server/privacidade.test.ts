import { beforeAll, describe, expect, it, vi } from 'vitest';

// Privacidade (LGPD): canal do titular, exportação, anonimização, aceites, redação de logs, uploads e escopo de contatos.
// Só dados SINTÉTICOS; nenhum envio real (o envio do código é injetado).
process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
const P = await import('./privacidade/pedidos');
const T = await import('./privacidade/titular');
const A = await import('./privacidade/aceites');
const { redigir, redigirValor, instalarRedacaoDeLogs } = await import('./privacidade/redacao');
const { celulaCsv } = await import('../shared/privacidade');
const { conferirTipo, podeAbrirInline, mimePelosBytes } = await import('../shared/uploadSeguro');
const { hashPassword } = await import('./auth-security');
const { appRouter } = await import('./routers');

const caller = (user: Record<string, unknown>) => appRouter.createCaller({ user: { ativo: true, role: 'user', ...user }, req: { headers: {} } as any, res: {} as any } as any);
const SENHA = 'senha-admin-sintetica-123';
let db: any;

beforeAll(async () => {
  db = await getDb();
  const agora = Date.now();
  db.run(sql`INSERT INTO users (id, openId, name, role) VALUES (1, 'adm', 'Admin Teste', 'admin')`);
  db.run(sql`UPDATE users SET password_hash = ${await hashPassword(SENHA)} WHERE id = 1`);
  // Titular A (o do pedido) e titular B (telefone parecido: mesmos 8 últimos dígitos, DDD diferente)
  db.run(sql`INSERT INTO contacts (id, name, phone, email, status) VALUES (101, 'Ana Sintetica', '+5599911112222', 'ana@exemplo.test', 'active')`);
  db.run(sql`INSERT INTO contacts (id, name, phone, email, status) VALUES (102, 'Bruno Sintetico', '+5598911112222', 'bruno@exemplo.test', 'active')`);
  db.run(sql`INSERT INTO messages (campaignId, contactId, propertyId, messageText, status) VALUES (1, 101, 1, 'Olá Ana', 'sent')`);
  db.run(sql`INSERT INTO messages (campaignId, contactId, propertyId, messageText, status) VALUES (1, 102, 1, 'Olá Bruno', 'sent')`);
  db.run(sql`INSERT INTO leadQualifications (id, phone, nome, stage, score, responsavelId, createdAt, updatedAt) VALUES (201, '99911112222', 'Ana Sintetica', 'novo_lead', 'frio', 21, ${agora}, ${agora})`);
  db.run(sql`INSERT INTO leadQualifications (id, phone, nome, stage, score, responsavelId, createdAt, updatedAt) VALUES (202, '98911112222', 'Bruno Sintetico', 'novo_lead', 'frio', 22, ${agora}, ${agora})`);
  db.run(sql`INSERT INTO pessoas (id, tipo, nome, cpfCnpj, telefone1) VALUES (301, 'PF', 'Ana Sintetica', '52998224725', '99911112222')`);
  db.run(sql`INSERT INTO pessoas (id, tipo, nome, cpfCnpj, telefone1) VALUES (302, 'PF', 'Ana Sintetica (compradora)', '11144477735', '99911112222')`);
  db.run(sql`INSERT INTO contratoPessoas (contratoId, pessoaId, papel) VALUES (900, 302, 'comprador')`);
});

describe('canal do titular (pedido sem conta)', () => {
  it('cria com protocolo, envia o código pelo canal injetado e só abre o prazo após a verificação', async () => {
    let enviado = '';
    const enviar = vi.fn(async (_d: any, msg: string) => { enviado = msg; return true; });
    const r = await P.criarPedido({ tipo: 'acesso', nome: 'Ana Sintetica', contato: '(99) 9 1111-2222' }, { ip: '10.0.0.1', enviar });
    expect(r.protocolo).toMatch(/^LGPD-\d{4}-[A-Z2-9]{8}$/);
    expect(r.codigoEnviado).toBe(true);
    expect(enviar).toHaveBeenCalledWith({ contato: '99911112222', tipo: 'telefone' }, expect.any(String));
    const codigo = /: (\d{6})\./.exec(enviado)![1];
    // Consulta pública não devolve nome nem contato
    const pub = await P.consultarPedido(r.protocolo, '10.0.0.9');
    expect(pub).toMatchObject({ status: 'aguardando_verificacao', prazoEm: null });
    expect(JSON.stringify(pub)).not.toMatch(/Ana|99911112222/);
    await expect(P.verificarCodigo(r.protocolo, codigo === '000000' ? '000001' : '000000')).rejects.toThrow(/inválido/);
    await P.verificarCodigo(r.protocolo, codigo);
    const depois = await P.consultarPedido(r.protocolo, '10.0.0.9');
    expect(depois?.status).toBe('aberto');
    expect(depois!.prazoEm! - Date.now()).toBeGreaterThan(14 * 86_400_000);
    // Código não serve duas vezes
    await expect(P.verificarCodigo(r.protocolo, codigo)).rejects.toThrow();
  });

  it('prevenção de fraude: tentativas limitadas, limite por contato e encerramento exige identidade e resposta', async () => {
    const r = await P.criarPedido({ tipo: 'eliminacao', nome: 'Carla Sintetica', contato: 'carla@exemplo.test' }, { ip: '10.0.0.2', enviar: async () => true });
    for (let i = 0; i < 5; i++) await expect(P.verificarCodigo(r.protocolo, 'xxxxxx')).rejects.toThrow();
    await expect(P.verificarCodigo(r.protocolo, 'xxxxxx')).rejects.toMatchObject({ status: 429 });
    await P.criarPedido({ tipo: 'acesso', nome: 'Carla Sintetica', contato: 'carla@exemplo.test' }, { ip: '10.0.0.3' });
    await P.criarPedido({ tipo: 'acesso', nome: 'Carla Sintetica', contato: 'carla@exemplo.test' }, { ip: '10.0.0.4' });
    await expect(P.criarPedido({ tipo: 'acesso', nome: 'Carla Sintetica', contato: 'carla@exemplo.test' }, { ip: '10.0.0.5' })).rejects.toMatchObject({ status: 429 });
    await expect(P.criarPedido({ tipo: 'invalido' as any, nome: 'X Y Z', contato: 'x@y.zz' }, { ip: '10.0.0.6' })).rejects.toThrow(/tipo/);

    const [ped] = (await P.listarPedidos()).filter(p => p.protocolo === r.protocolo);
    await expect(P.atualizarPedido(ped.id, { status: 'concluido' }, 1)).rejects.toMatchObject({ status: 409 });
    await P.verificarManual(ped.id, 'Retorno pelo e-mail já cadastrado na ficha', 1);
    await expect(P.atualizarPedido(ped.id, { status: 'concluido' }, 1)).rejects.toThrow(/resposta/);
    await P.atualizarPedido(ped.id, { status: 'concluido', resposta: 'Dados eliminados conforme pedido.' }, 1);
    const ev = await P.eventosDoPedido(ped.id);
    expect(ev.map(e => e.evento)).toEqual(expect.arrayContaining(['criado', 'codigo_incorreto', 'contato_verificado', 'atualizado']));
  });

  it('gestão de pedidos é só do administrador', async () => {
    await expect(caller({ id: 21, perfil: 'corretor' }).privacidade.pedidos()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller({ id: 30, perfil: 'secretario' }).privacidade.pedidos()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(Array.isArray(await caller({ id: 1, role: 'admin', perfil: 'admin' }).privacidade.pedidos())).toBe(true);
  });
});

describe('exportação dos dados do titular', () => {
  it('traz só o titular dos critérios (sem o vizinho de telefone parecido) e CSV protegido contra fórmula', async () => {
    const pacote = await T.dadosDoTitular({ telefone: '(99) 9 1111-2222' });
    const json = JSON.stringify(pacote);
    expect(pacote.secoes.leads.map(l => l.id)).toEqual([201]);
    expect(pacote.secoes.contatos.map(c => c.id)).toEqual([101]);
    expect(pacote.secoes.mensagensDeCampanha.map(m => m.messageText)).toEqual(['Olá Ana']);
    expect(json).not.toMatch(/Bruno/);
    expect(celulaCsv('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(celulaCsv('+5599')).toBe(`"'+5599"`);
    expect(celulaCsv('normal')).toBe('normal');
    expect(T.paraCsv(pacote)).toContain('leads;201;nome;Ana Sintetica');
  });

  it('link assinado: vale 15 min, recusa adulteração e vencimento; exige critério', () => {
    const agora = Date.now();
    const tk = T.tokenExportacao(7, { telefone: '99911112222' }, 'csv', agora);
    expect(T.lerTokenExportacao(tk, agora + 60_000)).toMatchObject({ pedidoId: 7, formato: 'csv' });
    expect(T.lerTokenExportacao(tk, agora + T.VALIDADE_EXPORTACAO_MS + 1)).toBeNull();
    const [corpo, sig] = tk.split('.');
    const outro = Buffer.from(JSON.stringify({ p: 7, c: { telefone: '98911112222' }, f: 'csv', e: agora + 60_000 })).toString('base64url');
    expect(T.lerTokenExportacao(`${outro}.${sig}`, agora)).toBeNull();
    expect(T.lerTokenExportacao(`${corpo}.x${sig.slice(1)}`, agora)).toBeNull();
    expect(() => T.tokenExportacao(7, {}, 'json')).toThrow(/telefone/);
  });
});

describe('anonimização (simulação, retenção legal e idempotência)', () => {
  it('a simulação não altera nada; a execução preserva partes de contrato e o outro titular; repetir não acha mais ninguém', async () => {
    const plano = await T.planejarAnonimizacao({ telefone: '99911112222', cpf: '529.982.247-25' });
    expect(plano.relatorio.anonimizar).toMatchObject({ leads: 1, contatos: 1, mensagensDeCampanha: 1, cadastrosDePessoaSemContrato: 1 });
    expect(plano.relatorio.retidos).toMatchObject({ cadastrosDePessoaComContrato: 1, contratosVinculados: 1 });
    expect(db.all(sql`SELECT nome FROM leadQualifications WHERE id = 201`)[0].nome).toBe('Ana Sintetica');

    await T.executarAnonimizacao({ telefone: '99911112222', cpf: '529.982.247-25' });
    const lead = db.all(sql`SELECT nome, phone FROM leadQualifications WHERE id = 201`)[0];
    expect(lead.nome).toBe('Titular anonimizado');
    expect(lead.phone).not.toMatch(/11112222/);
    expect(db.all(sql`SELECT name, email FROM contacts WHERE id = 101`)[0]).toEqual({ name: 'Titular anonimizado', email: null });
    expect(db.all(sql`SELECT messageText FROM messages WHERE contactId = 101`)[0].messageText).toMatch(/removido/);
    expect(db.all(sql`SELECT nome, cpfCnpj FROM pessoas WHERE id = 301`)[0].nome).toBe('Titular anonimizado');
    // Parte de contrato: retida (obrigação legal) — não muda
    expect(db.all(sql`SELECT nome, cpfCnpj FROM pessoas WHERE id = 302`)[0]).toEqual({ nome: 'Ana Sintetica (compradora)', cpfCnpj: '11144477735' });
    // Outro titular intacto
    expect(db.all(sql`SELECT name FROM contacts WHERE id = 102`)[0].name).toBe('Bruno Sintetico');
    expect(db.all(sql`SELECT messageText FROM messages WHERE contactId = 102`)[0].messageText).toBe('Olá Bruno');
    // Idempotente: só sobra a parte de contrato retida
    const de_novo = await T.planejarAnonimizacao({ telefone: '99911112222', cpf: '529.982.247-25' });
    expect(de_novo.relatorio.anonimizar).toMatchObject({ leads: 0, contatos: 0, mensagensDeCampanha: 0, cadastrosDePessoaSemContrato: 0 });
  });

  it('executar pelo CRM exige pedido verificado, senha do administrador e confirmação digitada', async () => {
    const adm = caller({ id: 1, role: 'admin', perfil: 'admin' });
    const r = await P.criarPedido({ tipo: 'anonimizacao', nome: 'Bruno Sintetico', contato: '98911112222' }, { ip: '10.0.1.1' });
    const [ped] = (await P.listarPedidos()).filter(p => p.protocolo === r.protocolo);
    const entrada = { id: ped.id, criterios: { telefone: '98911112222' }, senha: SENHA, confirmacao: 'ANONIMIZAR' as const };
    await expect(adm.privacidade.anonimizar(entrada)).rejects.toMatchObject({ code: 'CONFLICT' });
    await P.verificarManual(ped.id, 'Confirmado por ligação ao número cadastrado', 1);
    await expect(adm.privacidade.anonimizar({ ...entrada, senha: 'errada' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.all(sql`SELECT name FROM contacts WHERE id = 102`)[0].name).toBe('Bruno Sintetico');
    const rel = await adm.privacidade.anonimizar(entrada);
    expect(rel.anonimizar.contatos).toBe(1);
    await expect(caller({ id: 21, perfil: 'corretor' }).privacidade.anonimizar(entrada)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('aceite versionado e consentimento de marketing separados', () => {
  it('usuário antigo fica pendente; aceite grava versão+hash; texto mudado exige novo aceite; marketing revogável com histórico', async () => {
    const s0 = await A.situacao(55);
    expect(s0.documentos.termos.situacao).toBe('pendente');
    expect(s0.marketing.consentido).toBe(false);
    const { hash, versao } = s0.documentos.termos as any;
    await expect(A.aceitar(55, 'termos', versao, '0'.repeat(64))).rejects.toMatchObject({ status: 409 });
    await A.aceitar(55, 'termos', versao, hash);
    const s1 = await A.situacao(55);
    expect(s1.documentos.termos.situacao).toBe('aceito');
    expect(s1.documentos.privacidade.situacao).toBe('pendente'); // aceitar os termos não é aceitar o aviso
    expect(s1.marketing.consentido).toBe(false); // nem consentir marketing
    await A.definirMarketing(55, true);
    await A.definirMarketing(55, false);
    const s2 = await A.situacao(55);
    expect(s2.marketing.consentido).toBe(false);
    expect(s2.historico.filter(h => h.documento === 'marketing').map(h => h.acao)).toEqual(['revogacao', 'aceite']);
    expect(s2.historico.every(h => h.criadoEm > 0)).toBe(true);
  });

  it('desligado (produção sem aprovação): nada de aceite', async () => {
    const antes = process.env.PRIVACIDADE_MINUTAS_ATIVAS;
    process.env.PRIVACIDADE_MINUTAS_ATIVAS = 'off';
    await expect(A.situacao(55)).rejects.toMatchObject({ status: 404 });
    process.env.PRIVACIDADE_MINUTAS_ATIVAS = antes;
    const { minutasAtivas, canalAtivo } = await import('./privacidade/config');
    expect(minutasAtivas({ NODE_ENV: 'production' })).toBe(false);
    expect(canalAtivo({ NODE_ENV: 'production' })).toBe(false);
    expect(canalAtivo({ NODE_ENV: 'production', PRIVACIDADE_CANAL_ATIVO: 'on' })).toBe(true);
  });
});

describe('escopo no servidor (regressões de autorização)', () => {
  it('contacts.list: corretor só vê os contatos dos leads dele; escritório vê todos', async () => {
    db.run(sql`INSERT INTO contacts (id, name, phone, status) VALUES (110, 'Cliente do 21', '+5599977776666', 'active')`);
    db.run(sql`INSERT INTO contacts (id, name, phone, status) VALUES (111, 'Cliente do 22', '+5599955554444', 'active')`);
    db.run(sql`INSERT INTO leadQualifications (phone, nome, stage, score, responsavelId, createdAt, updatedAt) VALUES ('99977776666', 'x', 'novo_lead', 'frio', 21, ${Date.now()}, ${Date.now()})`);
    db.run(sql`INSERT INTO leadQualifications (phone, nome, stage, score, responsavelId, createdAt, updatedAt) VALUES ('99955554444', 'y', 'novo_lead', 'frio', 22, ${Date.now()}, ${Date.now()})`);
    const ids = async (u: Record<string, unknown>) => (await caller(u).contacts.list()).map((c: any) => c.id);
    const do21 = await ids({ id: 21, perfil: 'corretor' });
    expect(do21).toContain(110);
    expect(do21).not.toContain(111);
    expect(await ids({ id: 30, perfil: 'secretario' })).toEqual(expect.arrayContaining([110, 111]));
  });

  it('mensagem livre pelo WhatsApp da empresa e simulação do robô: só administrador', async () => {
    const corretor = caller({ id: 21, perfil: 'corretor' });
    await expect(corretor.zapi.sendMessage({ phone: '5599900000000', message: 'oi' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(corretor.bot.processMessage({ phone: '5599900000000', message: 'oi' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('uploads: tipo conferido pelos bytes', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const html = Buffer.from('<!doctype html><script>alert(1)</script>');
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic0000mif1')]);
  it('SVG/HTML disfarçados de imagem são recusados e nunca abrem inline', () => {
    expect(conferirTipo('image/svg+xml', svg)).toBeNull();
    expect(conferirTipo('image/png', html)).toBeNull();
    expect(conferirTipo('application/pdf', png)).toBeNull();
    expect(conferirTipo('image/png', png)).toBe('image/png');
    expect(conferirTipo('image/heic', heic)).toBe('image/heic');
    expect(podeAbrirInline(svg)).toBe(false);
    expect(podeAbrirInline(html)).toBe(false);
    expect(podeAbrirInline(png)).toBe(true);
    expect(mimePelosBytes(Buffer.from('%PDF-1.7 xxxxxxxx'))).toBe('application/pdf');
  });
});

describe('logs sem segredos nem dados pessoais desnecessários', () => {
  it('redige telefone (mantém 4 dígitos), CPF, e-mail, chaves e tokens; preserva números comuns', () => {
    const s = redigir('[Webhook] 5599991811246 - cpf 529.982.247-25 email ana@exemplo.test Bearer abc.def.ghijklmnop token=segredo123 $aact_prod_000abc123 lote 42 ts=1763654400000');
    expect(s).not.toMatch(/99991811246|529\.982|ana@exemplo|abc\.def|segredo123|aact_prod/);
    expect(s).toContain('[TEL…1246]');
    expect(s).toContain('lote 42');
    expect(s).toContain('1763654400000');
    expect(String((redigirValor(new Error('falhou para (99) 98877-6655')) as Error).message)).toContain('[TEL…6655]');
  });

  it('a instalação no console redige tudo que sai', () => {
    const saida: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => { saida.push(a.map(String).join(' ')); };
    try {
      expect(instalarRedacaoDeLogs({ LOG_REDACAO: 'off' })).toBe(false);
      expect(instalarRedacaoDeLogs({})).toBe(true);
      console.log('[Entrada] Novo lead 5599911112222 origem=x');
      expect(saida.at(-1)).toContain('[TEL…2222]');
      expect(saida.at(-1)).not.toContain('5599911112222');
    } finally { console.log = orig; }
  });
});
