import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration v1.6.0 — cadastro (adequações) e credenciais profissionais. Idempotente e não destrutiva.
 * - users: versão da sessão (troca de perfil encerra a sessão), sexo, profissão, estrangeiro (país + RNM/passaporte);
 *   nacionalidade e estado civil passam a códigos (brasileira/estrangeira; solteiro/casado/…); CPF/RG/telefone só dígitos;
 *   CPF único (vários vazios são permitidos).
 * - usuarioConjuge (1 por usuário), usuarioFoto (avatar WEBP no banco).
 * - usuarioDocumentos: titular (usuário/cônjuge), nº, links do CRECI, anexar/exibir, alerta, miniatura;
 *   usuarioDocumentoPaginas: páginas PNG (frente/verso) convertidas do arquivo.
 * - configCredenciais: links e prazos dos alertas.
 */
const COLUNAS_USERS: [string, string][] = [
  ['sessaoVersao', 'INT NOT NULL DEFAULT 0'], ['sexo', 'VARCHAR(1) NULL'], ['profissao', 'VARCHAR(80) NULL'],
  ['paisOrigem', 'VARCHAR(60) NULL'], ['docEstrangeiroTipo', 'VARCHAR(12) NULL'], ['docEstrangeiroNumero', 'VARCHAR(30) NULL'],
];
const COLUNAS_DOCS: [string, string][] = [
  ['titular', "VARCHAR(10) NOT NULL DEFAULT 'usuario'"], ['numero', 'VARCHAR(30) NULL'], ['linkVerificacao', 'VARCHAR(500) NULL'],
  ['linkEmissao', 'VARCHAR(500) NULL'], ['anexarDocumentos', 'BOOLEAN NOT NULL DEFAULT TRUE'], ['exibirPerfil', 'BOOLEAN NOT NULL DEFAULT FALSE'],
  ['alertaEnviadoEm', 'DATE NULL'], ['thumbBase64', 'MEDIUMTEXT NULL'], ['paginasQtd', 'INT NULL'],
  ['atualizadoEm', 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'],
];

const COMANDOS: { nome: string; stmt: ReturnType<typeof sql> }[] = [
  ...COLUNAS_USERS.map(([c, t]) => ({ nome: `users.${c}`, stmt: sql.raw(`ALTER TABLE users ADD COLUMN ${c} ${t}`) })),
  // Normalização dos dados da v1.4.0 (texto livre → códigos / só dígitos)
  { nome: 'users.nacionalidade', stmt: sql`UPDATE users SET nacionalidade = 'brasileira' WHERE nacionalidade LIKE 'brasil%'` },
  {
    nome: 'users.estadoCivil',
    stmt: sql`UPDATE users SET estadoCivil = CASE
      WHEN estadoCivil LIKE 'solteir%' THEN 'solteiro' WHEN estadoCivil LIKE 'casad%' THEN 'casado'
      WHEN estadoCivil LIKE 'uni%' THEN 'uniao_estavel' WHEN estadoCivil LIKE 'divorciad%' THEN 'divorciado'
      WHEN estadoCivil LIKE 'separad%' THEN 'separado' WHEN estadoCivil LIKE 'vi_v%' THEN 'viuvo' ELSE estadoCivil END
      WHERE estadoCivil IS NOT NULL`,
  },
  { nome: 'users.rg (só dígitos/X)', stmt: sql`UPDATE users SET rg = UPPER(REGEXP_REPLACE(rg, '[^0-9Xx]', '')) WHERE rg IS NOT NULL` },
  { nome: 'users.cpf (só dígitos)', stmt: sql`UPDATE users SET cpf = REGEXP_REPLACE(cpf, '[^0-9]', '') WHERE cpf IS NOT NULL` },
  { nome: 'users.cpf vazio → NULL', stmt: sql`UPDATE users SET cpf = NULL WHERE cpf = ''` },
  { nome: 'ux_users_cpf', stmt: sql`CREATE UNIQUE INDEX ux_users_cpf ON users (cpf)` },
  {
    nome: 'usuarioConjuge',
    stmt: sql`CREATE TABLE IF NOT EXISTS usuarioConjuge (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuarioId INT NOT NULL,
      nome VARCHAR(150) NOT NULL,
      sexo VARCHAR(1) NULL,
      cpf VARCHAR(11) NOT NULL,
      rg VARCHAR(14) NULL, rgOrgao VARCHAR(20) NULL,
      nacionalidade VARCHAR(12) NOT NULL DEFAULT 'brasileira',
      paisOrigem VARCHAR(60) NULL, docEstrangeiroTipo VARCHAR(12) NULL, docEstrangeiroNumero VARCHAR(30) NULL,
      profissao VARCHAR(80) NULL, dataNascimento DATE NULL, telefone VARCHAR(11) NULL, email VARCHAR(150) NULL,
      regimeBens VARCHAR(30) NULL, dataCasamento DATE NULL, uniaoDataInicio DATE NULL,
      uniaoRegistrada BOOLEAN NOT NULL DEFAULT FALSE, mesmoEndereco BOOLEAN NOT NULL DEFAULT TRUE,
      cep VARCHAR(8) NULL, logradouro VARCHAR(150) NULL, numero VARCHAR(10) NULL, complemento VARCHAR(80) NULL,
      bairro VARCHAR(80) NULL, cidade VARCHAR(80) NULL, uf VARCHAR(2) NULL,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY ux_conjuge_usuario (usuarioId),
      INDEX ix_conjuge_cpf (cpf),
      CONSTRAINT fk_conjuge_usuario FOREIGN KEY (usuarioId) REFERENCES users(id) ON DELETE CASCADE
    )`,
  },
  {
    nome: 'usuarioFoto',
    stmt: sql`CREATE TABLE IF NOT EXISTS usuarioFoto (
      usuarioId INT PRIMARY KEY,
      mime VARCHAR(30) NOT NULL,
      conteudoBase64 MEDIUMTEXT NOT NULL,
      atualizadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_foto_usuario FOREIGN KEY (usuarioId) REFERENCES users(id) ON DELETE CASCADE
    )`,
  },
  ...COLUNAS_DOCS.map(([c, t]) => ({ nome: `usuarioDocumentos.${c}`, stmt: sql.raw(`ALTER TABLE usuarioDocumentos ADD COLUMN ${c} ${t}`) })),
  // Tipos da v1.4.0 renomeados para a lista do MD de credenciais
  { nome: 'tipo comprovante', stmt: sql`UPDATE usuarioDocumentos SET tipo = 'comprovante_residencia' WHERE tipo = 'comprovante_endereco'` },
  { nome: 'tipo outros', stmt: sql`UPDATE usuarioDocumentos SET tipo = 'outros' WHERE tipo = 'outro'` },
  { nome: 'ix_doc_validade', stmt: sql`CREATE INDEX ix_doc_validade ON usuarioDocumentos (tipo, validade)` },
  {
    nome: 'usuarioDocumentoPaginas',
    stmt: sql`CREATE TABLE IF NOT EXISTS usuarioDocumentoPaginas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      documentoId INT NOT NULL,
      n INT NOT NULL,
      pngBase64 LONGTEXT NOT NULL,
      UNIQUE KEY ux_pagina (documentoId, n),
      CONSTRAINT fk_pagina_doc FOREIGN KEY (documentoId) REFERENCES usuarioDocumentos(id) ON DELETE CASCADE
    )`,
  },
  {
    nome: 'configCredenciais',
    stmt: sql`CREATE TABLE IF NOT EXISTS configCredenciais (chave VARCHAR(60) PRIMARY KEY, valor VARCHAR(500) NOT NULL)`,
  },
  {
    nome: 'configCredenciais (padrões)',
    stmt: sql`INSERT IGNORE INTO configCredenciais (chave, valor) VALUES
      ('link_certidao_MA', 'https://www.crecima.gov.br'), ('certidao_validade_dias', '30'),
      ('certidao_alerta_dias', '5'), ('cartao_alerta_dias', '30')`,
  },
];

export async function addCadastroV2(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const { nome, stmt } of COMANDOS) {
    try {
      await (db as any).execute(stmt);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      const msg = e?.message ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && code !== 'ER_DUP_KEYNAME' && !/Duplicate (column|key)/.test(msg)) {
        console.warn(`[Migration] addCadastroV2 (${nome}):`, msg);
      }
    }
  }
  console.log('[Migration] ✅ addCadastroV2 (perfis, cônjuge, foto, credenciais CRECI/CNAI)');
}
