import { getDb, getDbDriver } from '../../db';
import { sql, eq } from 'drizzle-orm';
import { empreendimentos, lotes } from '../../../drizzle/schema';
import bomJardimsSeed from '../../data/bom-jardims/seed.json';

/**
 * Migration: tabelas empreendimentos + lotes e colunas do lead de empreendimento.
 * Também cadastra o Condomínio de Chácaras Bom Jardims (84 lotes) se ainda não existir.
 * Preços NÃO são semeados (em definição e o repositório é público).
 */
const MYSQL_DDL: { label: string; stmt: ReturnType<typeof sql> }[] = [
  {
    label: 'empreendimentos',
    stmt: sql`CREATE TABLE IF NOT EXISTS empreendimentos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(80) NOT NULL UNIQUE,
      nome VARCHAR(160) NOT NULL,
      fase VARCHAR(30) NOT NULL DEFAULT 'pre_lancamento',
      municipio VARCHAR(80), uf VARCHAR(2), endereco TEXT,
      lat DECIMAL(10,7), lon DECIMAL(10,7), areaHa DECIMAL(10,4),
      totalLotes INT, lotesComercializaveis INT,
      precosPublicos BOOLEAN NOT NULL DEFAULT FALSE,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
  },
  {
    label: 'lotes',
    stmt: sql`CREATE TABLE IF NOT EXISTS lotes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      empreendimentoId INT NOT NULL,
      codigo VARCHAR(10) NOT NULL,
      quadra VARCHAR(2), numero INT,
      areaM2 DECIMAL(10,2), perimetroM DECIMAL(10,2),
      destinacao VARCHAR(30),
      comercializavel BOOLEAN NOT NULL DEFAULT TRUE,
      status ENUM('disponivel','reservado','em_negociacao','vendido','nao_comercializavel') NOT NULL DEFAULT 'disponivel',
      reservadoAte TIMESTAMP NULL,
      precoAvistaRef DECIMAL(12,2) NULL, precoFinanciadoRef DECIMAL(12,2) NULL,
      latCentro DECIMAL(10,7), lonCentro DECIMAL(10,7),
      dossiePdf VARCHAR(120),
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_lote (empreendimentoId, codigo)
    )`,
  },
  { label: 'lead.empreendimentoSlug', stmt: sql`ALTER TABLE leadQualifications ADD COLUMN empreendimentoSlug VARCHAR(80)` },
  { label: 'lead.loteCodigo',         stmt: sql`ALTER TABLE leadQualifications ADD COLUMN loteCodigo VARCHAR(10)` },
  { label: 'lead.leadScore',          stmt: sql`ALTER TABLE leadQualifications ADD COLUMN leadScore INT` },
  { label: 'lead.consentimento',      stmt: sql`ALTER TABLE leadQualifications ADD COLUMN consentimento JSON` },
];

function isAlreadyApplied(e: any): boolean {
  const code = e?.code || e?.cause?.code || '';
  const msg = e?.message || '';
  return code === 'ER_DUP_FIELDNAME' || msg.includes('Duplicate column');
}

export async function seedEmpreendimento(db: any, seed: typeof bomJardimsSeed): Promise<boolean> {
  const e = seed.empreendimento;
  const existing = await db.select({ id: empreendimentos.id }).from(empreendimentos)
    .where(eq(empreendimentos.slug, e.slug)).limit(1);
  if (existing[0]) return false;

  await db.insert(empreendimentos).values({
    slug: e.slug, nome: e.nome, fase: e.fase, municipio: e.municipio, uf: e.uf, endereco: e.endereco,
    lat: String(e.lat), lon: String(e.lon), areaHa: String(e.areaHa),
    totalLotes: e.totalLotes, lotesComercializaveis: e.lotesComercializaveis, precosPublicos: false,
  });
  const [row] = await db.select({ id: empreendimentos.id }).from(empreendimentos)
    .where(eq(empreendimentos.slug, e.slug)).limit(1);

  await db.insert(lotes).values(seed.lotes.map(l => ({
    empreendimentoId: row.id,
    codigo: l.codigo, quadra: l.quadra, numero: l.numero,
    areaM2: String(l.areaM2), perimetroM: String(l.perimetroM),
    destinacao: l.destinacao, comercializavel: l.comercializavel,
    status: l.status as any,
    latCentro: String(l.latCentro), lonCentro: String(l.lonCentro), dossiePdf: l.dossiePdf,
  })));
  return true;
}

export async function addEmpreendimentos() {
  const db = await getDb();
  if (!db) return;

  // SQLite: tabelas criadas em initSqlite.ts
  if (getDbDriver() !== 'sqlite') {
    for (const { label, stmt } of MYSQL_DDL) {
      try {
        await db.execute(stmt);
      } catch (e: any) {
        if (!isAlreadyApplied(e)) console.error(`[Migration] Erro addEmpreendimentos (${label}):`, e?.message);
      }
    }
  }

  try {
    if (await seedEmpreendimento(db, bomJardimsSeed)) {
      console.log(`[Migration] ✅ ${bomJardimsSeed.empreendimento.nome} cadastrado com ${bomJardimsSeed.lotes.length} lotes`);
    }
  } catch (e: any) {
    console.error('[Migration] Erro ao cadastrar Bom Jardims:', e?.message);
  }
}
