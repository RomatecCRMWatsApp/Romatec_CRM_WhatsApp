import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'teste';

const A = await import('./imoveis/agenteCadastro');
const S = await import('../shared/cadastroImovelAgente');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
const sharp = (await import('sharp')).default;

const enviados: [string, string][] = [];
A.definirEnvioAgente(async (t, m) => { enviados.push([t, m]); });
A.definirTranscricaoAgente(async () => 'É uma chácara de exemplo para venda no bairro Vila Teste, em Açailândia MA, com três mil metros quadrados de terreno, endereço Estrada Fictícia km 2. Ainda não sei o preço.');
A.definirIaAgente(async ({ nome, pedido }) => {
  if (nome === 'textos_imovel') return { titulo: 'Chácara de exemplo na Vila Teste', descricao: 'Chácara de 3.000 m² para venda em Açailândia.' };
  const campos = [
    { campo: 'tipo', valor: 'chacara', fonte: 'm1', trecho: 'chácara' }, { campo: 'finalidade', valor: 'venda', fonte: 'm1', trecho: 'para venda' },
    { campo: 'cidade', valor: 'Açailândia', fonte: 'm1', trecho: 'Açailândia' }, { campo: 'uf', valor: 'MA', fonte: 'm1', trecho: 'MA' },
    { campo: 'bairro', valor: 'Vila Teste', fonte: 'm1', trecho: 'Vila Teste' }, { campo: 'endereco', valor: 'Estrada Fictícia km 2', fonte: 'm1', trecho: 'Estrada Fictícia' },
    { campo: 'areaTerreno', valor: '3000', fonte: 'm1', trecho: 'três mil metros' },
    // Tentativa de injeção vinda do "áudio": campo fora da lista é descartado
    { campo: 'responsavelId', valor: '1', fonte: 'm1', trecho: 'x' },
  ];
  if (pedido.includes('320 mil')) campos.push({ campo: 'preco', valor: '320000', fonte: 'm2', trecho: '320 mil' });
  const conflitos = pedido.includes('330 mil') ? [{ campo: 'preco', valores: ['320 mil', '330 mil'] }] : [];
  return { campos, conflitos, duvidas: [] };
});
let n = 0;
A.definirMidiaAgente({
  baixar: async (url) => ({ bytes: await sharp({ create: { width: 64, height: 48, channels: 3, background: url.includes('repetida') ? '#0f0' : `#${(++n * 40 % 255).toString(16).padStart(2, '0')}0000` } }).jpeg().toBuffer(), tipo: 'image/jpeg' }),
  guardar: async (_j, nome) => `https://res.cloudinary.com/teste/image/upload/${nome}.jpg`,
});

const CORRETOR = '5599911112222', EMPRE = '5599933334444', CLIENTE = '5599955556666';
const msg = async (phone: string, texto: string, extra: Partial<Parameters<typeof A.tratarMensagemAgente>[0]> = {}) => {
  const r = await A.tratarMensagemAgente({ phone, texto, messageId: `id-${Math.random()}`, ...extra });
  await A.aguardarFila();
  await new Promise(ok => setTimeout(ok, 20));
  return r;
};
const ultima = () => enviados[enviados.length - 1]?.[1] ?? '';
let db: any;

describe('Agente de Cadastro de Imóveis pelo WhatsApp', () => {
  beforeAll(async () => {
    db = await getDb();
    db.run(sql`INSERT INTO users (id, openId, name, role, perfil, telefone) VALUES (21, 'c21', 'Corretor Teste', 'user', 'corretor', '(99) 9 1111-2222'), (22, 'e22', 'Empreendedor Teste', 'user', 'empreendedor', '(99) 9 3333-4444')`);
  });

  it('regras: comandos, números BR e pendências por tipo (terreno não exige quartos)', () => {
    expect(S.comandoDe('1', 'menu')).toBe('cadastrar');
    expect(S.comandoDe('1', 'revisao')).toBe('confirmar');
    expect(S.comandoDe('Quero cadastrar um imóvel', null)).toBe('cadastrar');
    expect(S.comandoDe('oi', 'menu')).toBeNull();
    expect(S.numeroBR('R$ 350 mil')).toBe(350000);
    expect(S.numeroBR('350.000,00')).toBe(350000);
    expect(S.numeroBR('1,5 milhão')).toBe(1500000);
    expect(S.normalizarValor('preco', '0')).toBeNull();
    expect(S.pendencias({ ...S.DADOS_VAZIOS, tipo: 'chacara' }, 0)).toEqual(expect.arrayContaining(['Área do terreno (m²)', 'Pelo menos 1 foto']));
    expect(S.pendencias({ ...S.DADOS_VAZIOS, tipo: 'casa' }, 1)).not.toContain('Quartos');
    expect(S.podeUsarAgenteImovel('empreendedor')).toBe(false);
  });

  it('empreendedor não vincula; cliente desconhecido segue no fluxo de leads', async () => {
    await expect(A.gerarCodigoVinculo(22)).rejects.toThrow(/perfil/);
    expect(await msg(CLIENTE, 'oi, quero saber das chácaras')).toBe(false);
    expect(await msg(EMPRE, 'cadastrar imóvel')).toBe(false);
  });

  it('vincula pelo código só do número do cadastro', async () => {
    const c = await A.gerarCodigoVinculo(21);
    expect(await msg(EMPRE, c.mensagem)).toBe(true);
    expect(ultima()).toMatch(/não é o WhatsApp do seu cadastro/);
    expect(await msg(CORRETOR, c.mensagem)).toBe(true);
    expect(ultima()).toMatch(/WhatsApp vinculado/);
    expect(await msg(CORRETOR, c.mensagem)).toBe(true);
    expect(ultima()).toMatch(/já está vinculado e autorizado/);
    expect(await msg(EMPRE, 'VINCULAR 000001')).toBe(true);
    expect(ultima()).toMatch(/inválido ou vencido/);
    expect((await A.statusVinculo(21))).toMatchObject({ vinculado: true, autorizado: true, telefoneFinal: '2222' });
  });

  it('"oi" pergunta a função; foto antes da função fica sem destino', async () => {
    expect(await msg(CORRETOR, 'oi')).toBe(true);
    expect(ultima()).toBe(S.MENU_FUNCOES);
    await msg(CORRETOR, '', { imageUrl: 'https://z-api.io/avulsa.jpg' });
    expect(ultima()).toMatch(/Antes de usar, me diga a função/);
  });

  it('cadastro completo: checklist, áudio, pendência, fotos em lote, revisão, confirmação única', async () => {
    await msg(CORRETOR, '1');
    expect(enviados.slice(-2)[0][1]).toMatch(/Checklist do imóvel/);
    expect(ultima()).toMatch(/Usar neste cadastro\?/);
    await msg(CORRETOR, 'não');
    await msg(CORRETOR, '', { audioUrl: 'https://z-api.io/a.ogg' });
    expect(ultima()).toMatch(/Falta: Preço/);
    expect(ultima()).not.toMatch(/Quartos/);
    await msg(CORRETOR, '', { imageUrl: 'https://z-api.io/f1.jpg', messageId: 'img-1' });
    await A.tratarMensagemAgente({ phone: CORRETOR, texto: '', imageUrl: 'https://z-api.io/f1.jpg', messageId: 'img-1' }); // reentrega
    await msg(CORRETOR, '', { imageUrl: 'https://z-api.io/repetida-a.jpg', messageId: 'img-2' });
    await msg(CORRETOR, '', { imageUrl: 'https://z-api.io/repetida-b.jpg', messageId: 'img-3' });
    await msg(CORRETOR, 'concluir');
    expect(ultima()).toMatch(/falta:\n• Preço/);
    expect(ultima()).not.toMatch(/Cidade:/);
    await msg(CORRETOR, 'o preço é 320 mil');
    await msg(CORRETOR, 'concluir');
    expect(ultima()).toMatch(/Revisão do cadastro nº \d+\* \(versão \d+\)/);
    expect(ultima()).toMatch(/Fotos: 2/);
    const [rasc]: any[] = db.all(sql`SELECT id, versao FROM imovelRascunhos WHERE autorId = 21 AND estado = 'awaiting_review'`);
    // Foto nova depois da revisão invalida a versão apresentada
    await msg(CORRETOR, '', { imageUrl: 'https://z-api.io/f4.jpg', messageId: 'img-4' });
    await msg(CORRETOR, '1');
    expect(ultima()).toMatch(/CONCLUIR/);
    await msg(CORRETOR, 'concluir');
    const [rasc2]: any[] = db.all(sql`SELECT versao FROM imovelRascunhos WHERE id = ${rasc.id}`);
    expect(rasc2.versao).toBeGreaterThan(rasc.versao);
    await msg(CORRETOR, '1');
    expect(ultima()).toMatch(/Imóvel cadastrado! Código: IMV-\d{4}/);
    const props: any[] = db.all(sql`SELECT id, status, price, propertyType, images, publicSlug FROM properties`);
    expect(props).toHaveLength(1);
    expect(props[0]).toMatchObject({ status: 'inactive', propertyType: 'Chácara' });
    expect(Number(props[0].price)).toBe(320000);
    expect(JSON.parse(props[0].images)).toHaveLength(3);
    // Repetir a confirmação não cria outro imóvel
    expect((await A.confirmarRascunho(rasc.id, { id: 21, canal: 'crm' })).propertyId).toBe(props[0].id);
    expect(db.all(sql`SELECT id FROM properties`)).toHaveLength(1);
    // Fica em Imóveis (galeria do próprio imóvel e campanha pausada), não em Materiais (que é dos empreendimentos)
    expect(db.all(sql`SELECT id FROM materiais WHERE propertyId = ${props[0].id}`)).toHaveLength(0);
    const camp: any[] = db.all(sql`SELECT status FROM campaigns WHERE propertyId = ${props[0].id}`);
    expect(camp.map(c => c.status)).toEqual(['paused']);
    const [acesso]: any[] = db.all(sql`SELECT usuarioId FROM acessosCorretor WHERE refId = ${props[0].id}`);
    expect(acesso.usuarioId).toBe(21);
  });

  it('valor contraditório vira pergunta, não é escolhido pela IA', async () => {
    await msg(CORRETOR, 'novo imóvel');
    await msg(CORRETOR, 'chácara em Açailândia, 320 mil, ou melhor 330 mil');
    expect(ultima()).toMatch(/Preço \(R\$\): você falou "320 mil" e "330 mil"/);
  });

  it('outro usuário não abre o rascunho de colega; empreendedor é barrado na tela', async () => {
    db.run(sql`INSERT INTO users (id, openId, name, role, perfil, telefone) VALUES (23, 'c23', 'Outro Corretor', 'user', 'corretor', '(99) 9 7777-8888')`);
    const [r]: any[] = db.all(sql`SELECT id FROM imovelRascunhos WHERE autorId = 21 LIMIT 1`);
    await expect(A.detalheRascunho(r.id, 23, 'corretor')).rejects.toThrow(/não encontrado/);
    await expect(A.listarRascunhos(22, 'empreendedor')).rejects.toThrow(/Sem acesso/);
    expect((await A.listarRascunhos(23, 'corretor'))).toHaveLength(0);
  });

  it('sair de todos os aparelhos/trocar senha derruba a autorização do canal (rascunho fica)', async () => {
    db.run(sql`UPDATE users SET sessaoVersao = 5 WHERE id = 21`);
    expect(await msg(CORRETOR, 'cadastrar imóvel')).toBe(true);
    expect(ultima()).toMatch(/precisa ser renovado \(sessão encerrada no CRM\)/);
    await A.autorizarCanal(21);
    expect((await A.statusVinculo(21)).autorizado).toBe(true);
    await A.revogarCanal(21, 'logout');
    expect((await A.statusVinculo(21)).autorizado).toBe(false);
    expect(db.all(sql`SELECT id FROM imovelRascunhos WHERE autorId = 21`).length).toBeGreaterThan(0);
  });

  it('webhook: foto da Z-API vira imageUrl (não é áudio) e status de entrega é ignorado', async () => {
    const { parseWebhookPayload } = await import('./zapi-integration');
    const p = parseWebhookPayload({ phone: CORRETOR, messageId: 'X1', type: 'ReceivedCallback', image: { imageUrl: 'https://z-api.io/f.jpg', caption: 'fachada' } });
    expect(p).toMatchObject({ imageUrl: 'https://z-api.io/f.jpg', legenda: 'fachada', isAudio: false, message: '' });
    expect(p?.audioUrl).toBeUndefined();
    expect(parseWebhookPayload({ phone: CORRETOR, status: 'read', type: 'MessageStatusCallback' })).toBeNull();
  });
});
