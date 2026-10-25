import { sql } from 'drizzle-orm';
import { getDb, getDbDriver } from '../../db';

/**
 * Migration: cadastro completo dos usuários (shared/cadastro.ts). Idempotente e não destrutiva.
 * - users: dados pessoais do intermediador (contrato), UF do CRECI, endereço, validade da certidão e foto.
 * - usuarioDocumentos: certidão do CRECI e documentos pessoais, guardados no banco (como os arquivos do
 *   empreendimento) — só abrem com login, nunca por link público.
 */
const COLUNAS: [string, string][] = [
  ['creciUf', 'VARCHAR(2) NULL'], ['cpf', 'VARCHAR(11) NULL'], ['rg', 'VARCHAR(20) NULL'], ['rgOrgao', 'VARCHAR(30) NULL'],
  ['nacionalidade', 'VARCHAR(40) NULL'], ['estadoCivil', 'VARCHAR(30) NULL'],
  ['enderecoLogradouro', 'VARCHAR(160) NULL'], ['enderecoNumero', 'VARCHAR(20) NULL'], ['enderecoComplemento', 'VARCHAR(80) NULL'],
  ['enderecoBairro', 'VARCHAR(80) NULL'], ['enderecoCidade', 'VARCHAR(80) NULL'], ['enderecoUf', 'VARCHAR(2) NULL'], ['enderecoCep', 'VARCHAR(8) NULL'],
  ['certidaoCreciValidade', 'DATE NULL'], ['fotoUrl', 'VARCHAR(500) NULL'], ['instagram', 'VARCHAR(40) NULL'],
];

const COMANDOS: { nome: string; stmt: ReturnType<typeof sql> }[] = [
  ...COLUNAS.map(([c, tipo]) => ({ nome: `users.${c}`, stmt: sql.raw(`ALTER TABLE users ADD COLUMN ${c} ${tipo}`) })),
  {
    nome: 'usuarioDocumentos',
    stmt: sql`CREATE TABLE IF NOT EXISTS usuarioDocumentos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuarioId INT NOT NULL,
      tipo VARCHAR(30) NOT NULL,
      nome VARCHAR(200) NOT NULL,
      mime VARCHAR(100) NULL,
      tamanhoBytes INT NULL,
      conteudoBase64 LONGTEXT NOT NULL,
      validade DATE NULL,
      enviadoPor INT NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_usudoc_usuario (usuarioId, tipo),
      CONSTRAINT fk_usudoc_usuario FOREIGN KEY (usuarioId) REFERENCES users(id) ON DELETE CASCADE
    )`,
  },
];

export async function addCadastroUsuarios(): Promise<void> {
  const db = await getDb();
  if (!db || getDbDriver() !== 'mysql') return;
  for (const { nome, stmt } of COMANDOS) {
    try {
      await (db as any).execute(stmt);
    } catch (e: any) {
      const code = e?.code ?? e?.cause?.code ?? '';
      const msg = e?.message ?? '';
      if (code !== 'ER_DUP_FIELDNAME' && code !== 'ER_DUP_KEYNAME' && !/Duplicate (column|key)/.test(msg)) {
        console.warn(`[Migration] addCadastroUsuarios (${nome}):`, msg);
      }
    }
  }
  console.log('[Migration] ✅ addCadastroUsuarios (dados do intermediador, documentos, certidão do CRECI, foto)');
}
