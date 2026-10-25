import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const S = await import('./recrutamento/servico');
const A = await import('./recrutamento/formularioArquivos');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
const { podeAbrir } = await import('../shared/equipe');
const { checkLogin } = await import('./auth-security');
const sharp = (await import('sharp')).default;

const enviados: { fone: string; tipo: 'texto' | 'doc'; conteudo: string }[] = [];
let png: Buffer;
let db: any;
const admin = { id: 1, role: 'admin' };

beforeAll(async () => {
  db = await getDb();
  db.run(sql`INSERT INTO users (id, openId, name, role, telefone, ativo) VALUES (1, 'u1', 'José Romário', 'admin', '99991811246', 1)`);
  db.run(sql`INSERT INTO empreendimentos (id, slug, nome) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims'), (2, 'outro', 'Outro Loteamento')`);
  db.run(sql`INSERT INTO empJuridico (empreendimentoId, defaultsJson, vendedoraJson) VALUES (1, '{}', ${JSON.stringify({ vend_nome: 'Maria Proprietária', vend_cpf: '529.982.247-25', vend_email: 'maria@prop.com', vend_telefone: '(99) 98888-1111' })})`);
  png = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#cccccc' } }).png().toBuffer();
  S.envio.disponivel = () => true;
  S.envio.texto = async (fone, msg) => { enviados.push({ fone, tipo: 'texto', conteudo: msg }); };
  S.envio.documento = async (fone, doc) => { enviados.push({ fone, tipo: 'doc', conteudo: doc.nomeArquivo }); };
});

const dadosCorretor = {
  nome: 'Carlos Corretor Silva', sexo: 'M', cpf: '11144477735', rg: '1234567', rgOrgao: 'SSP', nacionalidade: 'brasileira', profissao: 'Corretor(a) de Imóveis',
  estadoCivil: 'solteiro', email: 'carlos@corretor.com', telefone: '99977776666', creci: '9876', creciUf: 'MA',
  enderecoCep: '65930000', enderecoLogradouro: 'Rua das Flores', enderecoNumero: '10', enderecoBairro: 'Centro', enderecoCidade: 'Açailândia', enderecoUf: 'MA',
};

describe('recrutamento de corretor', () => {
  it('convite → WhatsApp (texto + PDF + DOC) → formulário com documentos → aprovação com senha provisória', async () => {
    const { id, link } = await S.criarConvite({ perfil: 'corretor', nome: 'Carlos Corretor', telefone: '(99) 9 7777-6666', empreendimentoSlug: 'bom-jardims' }, 1);
    expect(link).toMatch(/\/formulario\/[A-Za-z0-9_-]{32}$/);
    const token = link.split('/').pop()!;
    const env = await S.enviarConvite(id);
    expect(env.enviado).toBe(true);
    const doConvite = enviados.filter(e => e.fone === '5599977776666');
    expect(doConvite.map(e => e.tipo)).toEqual(['texto', 'doc', 'doc']);
    expect(doConvite[0].conteudo).toContain('empreendimento *Condomínio de Chácaras Bom Jardims*');
    expect(doConvite[0].conteudo).toContain(link);
    expect(doConvite.slice(1).map(e => e.conteudo)).toEqual(['Formulario-cadastro-corretor.pdf', 'Formulario-cadastro-corretor.docx']);

    const f = await S.formularioPublico(token);
    expect(f).toMatchObject({ perfil: 'corretor', status: 'convidado', empreendimento: 'Condomínio de Chácaras Bom Jardims' });
    // Sem os documentos obrigatórios, não envia
    await expect(S.salvarFormulario(token, dadosCorretor, true)).rejects.toMatchObject({ status: 422 });
    // Dados inválidos voltam por campo
    await expect(S.salvarFormulario(token, { ...dadosCorretor, cpf: '11111111111' }, true)).rejects.toMatchObject({ campos: expect.objectContaining({ cpf: expect.any(String) }) });
    await expect(S.salvarDocPublico(token, 'cartao_creci', Buffer.from('nada'), 'x.txt')).rejects.toMatchObject({ status: 415 });
    for (const tipo of ['foto', 'cnh', 'cartao_creci']) await S.salvarDocPublico(token, tipo, png, `${tipo}.png`);
    await S.salvarDocPublico(token, 'certidao_creci', png, 'certidao.png', '2026-12-31');
    const r = await S.salvarFormulario(token, dadosCorretor, true);
    expect(r).toMatchObject({ status: 'preenchido' });
    // Administrador avisado pelo WhatsApp
    expect(enviados.some(e => e.fone === '5599991811246' && e.conteudo.includes('Carlos Corretor Silva'))).toBe(true);

    const ap = await S.aprovarRecrutamento(id, admin);
    expect(ap).toMatchObject({ enviado: true, login: 'CRECI 9876', avisos: [] });
    expect(ap.senha).toMatch(/^Rmt-[a-z2-9]{6}$/);
    const [u] = db.all(sql`SELECT * FROM users WHERE id = ${ap.usuarioId}`);
    expect(u).toMatchObject({ name: 'Carlos Corretor Silva', perfil: 'corretor', email: 'carlos@corretor.com', creci: '9876', trocarSenha: 1 });
    expect((await checkLogin(ap.senha, { scryptHash: u.password_hash ?? u.passwordScrypt, legacySha256: null })).ok).toBe(true);
    // Documentos e foto copiados para o cadastro; corretor habilitado só no empreendimento da convocação
    expect(db.all(sql`SELECT tipo FROM usuarioDocumentos WHERE usuarioId = ${ap.usuarioId} ORDER BY tipo`).map((x: any) => x.tipo)).toEqual(['cartao_creci', 'certidao_creci', 'cnh']);
    expect(db.all(sql`SELECT COUNT(*) AS n FROM usuarioFoto WHERE usuarioId = ${ap.usuarioId}`)[0].n).toBe(1);
    expect(db.all(sql`SELECT refId FROM acessosCorretor WHERE usuarioId = ${ap.usuarioId}`).map((x: any) => Number(x.refId))).toEqual([1]);
    // Mensagem com login e senha
    expect(enviados.at(-1)).toMatchObject({ fone: '5599977776666' });
    expect(enviados.at(-1)!.conteudo).toContain(`Senha provisória: ${ap.senha}`);
    // Link encerrado depois da aprovação
    await expect(S.formularioPublico(token)).rejects.toMatchObject({ status: 410 });
  });

  it('CPF já cadastrado é barrado no envio do formulário', async () => {
    const { link } = await S.criarConvite({ perfil: 'secretario', nome: 'Outra Pessoa', telefone: '99955554444' }, 1);
    const token = link.split('/').pop()!;
    for (const tipo of ['foto', 'cnh']) await S.salvarDocPublico(token, tipo, png, `${tipo}.png`);
    await expect(S.salvarFormulario(token, { ...dadosCorretor, email: 'outra@x.com', creci: null }, true)).rejects.toMatchObject({ status: 409, campos: { cpf: expect.any(String) } });
  });
});

describe('empreendedor e permissões', () => {
  it('acesso do empreendedor com os dados do proprietário e senha provisória', async () => {
    const p = await S.dadosDoProprietario('bom-jardims');
    expect(p).toMatchObject({ nome: 'Maria Proprietária', cpf: '52998224725', email: 'maria@prop.com', telefone: '99988881111' });
    const r = await S.criarAcessoEmpreendedor({ slug: 'bom-jardims', email: 'maria@prop.com' }, admin);
    expect(r).toMatchObject({ enviado: true, login: 'CPF 529.982.247-25' });
    const [u] = db.all(sql`SELECT * FROM users WHERE id = ${r.usuarioId}`);
    expect(u).toMatchObject({ perfil: 'empreendedor', empreendimentoSlug: 'bom-jardims', cpf: '52998224725', trocarSenha: 1 });
    await expect(S.criarAcessoEmpreendedor({ slug: 'bom-jardims', email: 'maria2@prop.com' }, admin)).rejects.toMatchObject({ name: 'RecrutamentoErro' });
  });

  it('aba Recrutamento: só administrador e secretária', () => {
    expect(podeAbrir('admin', '/recrutamento')).toBe(true);
    expect(podeAbrir('secretario', '/recrutamento')).toBe(true);
    expect(podeAbrir('corretor', '/recrutamento')).toBe(false);
    expect(podeAbrir('empreendedor', '/recrutamento')).toBe(false);
  });

  it('formulário em PDF e DOC com a marca da plataforma e o empreendimento', async () => {
    const pdf = await A.formularioPdf('corretor', { nome: 'Carlos', empreendimento: 'Bom Jardims' });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const docx = await A.formularioDocx('corretor', { nome: 'Carlos', empreendimento: 'Bom Jardims' });
    const PizZip = (await import('pizzip')).default;
    const zip = new PizZip(docx);
    const xml = zip.file('word/document.xml')!.asText();
    expect(xml).toContain('Convocação para atuar no empreendimento: Bom Jardims');
    expect(xml).toContain('Romatec Consultoria Total');
    expect(xml).toContain('Cartão de Regularidade (CRECI)');
    expect(zip.file('word/media/logo.png')).toBeTruthy();
  });
});
