import { beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_DRIVER = 'sqlite';
process.env.SQLITE_PATH = ':memory:';

const C = await import('./credenciamento');
const { refDoUsuario } = await import('./cartaoVendas');
const { getDb } = await import('./db');
const { sql } = await import('drizzle-orm');
const sharp = (await import('sharp')).default;

// Data local (como statusValidade compara), não UTC: entre 21h e meia-noite em Brasília o UTC já é o dia seguinte
const futuro = (dias: number) => { const d = new Date(Date.now() + dias * 86400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const COMPLETO = {
  id: 2, name: 'Maria Corretora da Silva', cpf: '52998224725', rg: '123456', creci: '1234', creciUf: 'MA', estadoCivil: 'solteiro', profissao: 'Corretor(a) de Imóveis',
  sexo: 'F', email: 'maria@exemplo.com', telefone: '99981112222', enderecoCep: '65930000', enderecoLogradouro: 'Rua A', enderecoNumero: '10',
  enderecoBairro: 'Centro', enderecoCidade: 'Açailândia', enderecoUf: 'MA', fotoUrl: '/api/usuarios/2/foto?v=1',
};
const DOCS = [
  { tipo: 'cartao_creci', validade: futuro(300) }, { tipo: 'certidao_creci', validade: futuro(20) }, { tipo: 'cnh' },
];

describe('ficha de credenciamento: o que falta (só CNAI é opcional)', () => {
  it('cadastro completo com cartão, certidão em dia e CNH: nada falta', () => {
    expect(C.pendenciasCredenciamento(COMPLETO, null, DOCS)).toEqual([]);
  });
  it('lista o que falta: dados, foto, certidão vencida/ausente e CNH', () => {
    const p = C.pendenciasCredenciamento({ ...COMPLETO, email: '', fotoUrl: null, enderecoBairro: '' }, null,
      [{ tipo: 'cartao_creci', validade: futuro(300) }, { tipo: 'certidao_creci', validade: futuro(-1) }, { tipo: 'cnh', titular: 'conjuge' }]);
    expect(p).toEqual(expect.arrayContaining(['E-mail', 'Foto', 'Endereço completo (CEP, número e bairro)', 'Certidão CRECI vencida', 'CNH (documento oficial com foto)']));
    expect(C.pendenciasCredenciamento(COMPLETO, null, DOCS.filter(d => d.tipo !== 'certidao_creci'))).toEqual(['Certidão de Regularidade (CRECI)']);
    // CNAI nunca é exigido
    expect(C.pendenciasCredenciamento(COMPLETO, null, DOCS).some(x => /CNAI/.test(x))).toBe(false);
  });
});

describe('ficha de credenciamento: PDF e verificação pública', () => {
  let db: any;
  beforeAll(async () => {
    db = await getDb();
    const png = (await sharp({ create: { width: 600, height: 380, channels: 3, background: '#eeeeee' } }).png().toBuffer()).toString('base64');
    const foto = (await sharp({ create: { width: 400, height: 400, channels: 3, background: '#336655' } }).jpeg().toBuffer()).toString('base64');
    db.run(sql`INSERT INTO users (id, openId, name, role, perfil, cpf, rg, creci, creciUf, estadoCivil, profissao, sexo, email, telefone, enderecoCep, enderecoLogradouro, enderecoNumero, enderecoBairro, enderecoCidade, enderecoUf, fotoUrl)
      VALUES (2, 'u2', ${COMPLETO.name}, 'user', 'corretor', ${COMPLETO.cpf}, '123456', '1234', 'MA', 'solteiro', 'Corretor(a) de Imóveis', 'F', 'maria@exemplo.com', '99981112222', '65930000', 'Rua A', '10', 'Centro', 'Açailândia', 'MA', '/api/usuarios/2/foto?v=1')`);
    db.run(sql`INSERT INTO users (id, openId, name, role, perfil) VALUES (3, 'u3', 'Outro Corretor', 'user', 'corretor')`);
    db.run(sql`INSERT INTO empreendimentos (id, slug, nome, municipio, uf, areaHa) VALUES (1, 'bom-jardims', 'Condomínio de Chácaras Bom Jardims', 'Açailândia', 'MA', '41.1045')`);
    db.run(sql`INSERT INTO acessosCorretor (usuarioId, tipo, refId, criadoEm) VALUES (2, 'empreendimento', 1, ${Date.now()})`);
    db.run(sql`INSERT INTO usuarioFoto (usuarioId, mime, conteudoBase64) VALUES (2, 'image/jpeg', ${foto})`);
    let id = 10;
    for (const d of DOCS) {
      db.run(sql`INSERT INTO usuarioDocumentos (id, usuarioId, tipo, nome, conteudoBase64, validade, titular, anexarDocumentos, exibirPerfil, createdAt)
        VALUES (${id}, 2, ${d.tipo}, ${`${d.tipo}.pdf`}, 'x', ${(d as any).validade ?? null}, 'usuario', 1, 0, ${Date.now()})`);
      db.run(sql`INSERT INTO usuarioDocumentoPaginas (documentoId, n, pngBase64) VALUES (${id}, 1, ${png})`);
      id++;
    }
  });

  it('gera o PDF: página da ficha + uma página por comprovação (cartão, certidão, CNH)', async () => {
    const s = await C.situacaoCredenciamento(2, 'bom-jardims');
    expect(s).toMatchObject({ apto: true, pendencias: [] });
    expect(s.link).toBe(`https://romateccrm.com/api/public/credenciamento/bom-jardims/${refDoUsuario(2)}`);
    const { pdf, nome } = await C.fichaCredenciamentoPdf(2, 'bom-jardims');
    const { PDFDocument } = await import('pdf-lib');
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(4);
    expect(nome).toBe('FICHA-CREDENCIAMENTO-MARIA-CORRETORA-DA-SILVA-BOM-JARDIMS.pdf');
    if (process.env.FICHA_SAIDA) (await import('node:fs')).writeFileSync(`${process.env.FICHA_SAIDA}/${nome}`, pdf);
  });

  it('cadastro incompleto ou corretor sem acesso ao empreendimento: recusa com a lista', async () => {
    await expect(C.fichaCredenciamentoPdf(3, 'bom-jardims')).rejects.toMatchObject({ status: 409, pendencias: expect.arrayContaining(['Acesso ao empreendimento liberado pelo administrador', 'CPF', 'Foto']) });
  });

  it('QR: página pública mostra a situação sem CPF; link adulterado não abre', async () => {
    const ok = await C.verificacaoPublica('bom-jardims', refDoUsuario(2));
    expect(ok.status).toBe(200);
    expect(ok.html).toContain('Corretor(a) credenciado(a)');
    expect(ok.html).toContain('Maria Corretora da Silva');
    expect(ok.html).not.toContain('52998224725');
    expect(ok.html).toContain('noindex');
    const nao = await C.verificacaoPublica('bom-jardims', refDoUsuario(3));
    expect(nao.html).toContain('não está em dia');
    expect((await C.verificacaoPublica('bom-jardims', '2xxxxxxxx')).status).toBe(404);
  });
});
