---
name: romatec-migracao
description: Cria coluna ou tabela nova no banco do Romatec CRM nos 4 lugares obrigatórios — drizzle/schema.ts, migration MySQL idempotente, espelho SQLite (initSqlite.ts) e chamada no server/_core/index.ts. Usar ao adicionar campo, tabela, índice ou "salvar mais uma informação" no CRM.
---
# Migração do banco do Romatec CRM

## Quando usar
Qualquer campo ou tabela nova. Produção é MySQL; os testes e o servidor local usam SQLite. Se faltar um dos 4 lugares, o teste passa e a produção quebra (ou o contrário).

## Passo a passo
1. **`drizzle/schema.ts`** — acrescente a coluna na tabela (`varchar`, `int`, `boolean(...).default(false).notNull()`, `text`, `decimal(..., { precision: 12, scale: 2 })`, `timestamp`). Tabela nova: `mysqlTable(...)` com `index`/`uniqueIndex` e comentário `/** ... */` dizendo para que serve.
2. **`server/_core/migrations/addNomeDaMudanca.ts`** — modelo (copie de `addOrigemDespesa.ts` ou `addFabricaCriativos.ts`):
   ```ts
   import { sql } from 'drizzle-orm';
   import { getDb, getDbDriver } from '../../db';
   const COLUNAS = [{ nome: 'campo', stmt: sql`ALTER TABLE tabela ADD COLUMN campo VARCHAR(80) NULL` }];
   export async function addNomeDaMudanca(): Promise<void> {
     const db = await getDb();
     if (!db || getDbDriver() !== 'mysql') return;
     for (const { nome, stmt } of COLUNAS) {
       try { await (db as any).execute(stmt); }
       catch (e: any) {
         const code = e?.code ?? e?.cause?.code ?? '';
         if (code !== 'ER_DUP_FIELDNAME' && !/Duplicate column/.test(e?.message ?? '')) console.error(`[Migration] addNomeDaMudanca (${nome}):`, e?.message);
       }
     }
     // tabela nova: CREATE TABLE IF NOT EXISTS ... (MySQL: INT AUTO_INCREMENT, BOOLEAN, TIMESTAMP DEFAULT CURRENT_TIMESTAMP)
     console.log('[Migration] ✅ addNomeDaMudanca (<o que é>)');
   }
   ```
3. **`server/_core/index.ts`** — chame logo depois da última migration da lista (procure `addFabricaCriativos`):
   `const { addNomeDaMudanca } = await import('./migrations/addNomeDaMudanca'); await addNomeDaMudanca();`
4. **`server/_core/migrations/initSqlite.ts`** — espelho: coluna com `addColumn(\`ALTER TABLE t ADD COLUMN c TEXT\`)` perto da tabela; tabela nova com `run(\`CREATE TABLE IF NOT EXISTS ...\`)` (SQLite: `INTEGER PRIMARY KEY AUTOINCREMENT`, booleano `INTEGER NOT NULL DEFAULT 0`, data `INTEGER ... DEFAULT (strftime('%s','now'))`).
5. **Rotas que fazem `$set` por lista** (`atualizar...` com campos permitidos): inclua o campo novo na lista, senão ele chega e não é gravado.

## Regras e armadilhas conhecidas
- Migration tem que poder rodar várias vezes (todo boot roda todas).
- Nunca apague coluna em produção numa migration; marque como sem uso.
- Booleano no SQLite volta 0/1: no código use `Boolean(r.campo)`.
- JSON salvo em `text`: leia com `JSON.parse` protegido (`try/catch`), o valor pode vir objeto ou string.

## Verificação antes de entregar
- [ ] teste em `server/<feature>.test.ts` cria/lê o campo no SQLite em memória
- [ ] `npx tsc --noEmit -p .` vazio
- [ ] os 4 lugares conferidos: `grep -rn "<campo>" drizzle/schema.ts server/_core/migrations server/_core/index.ts`
