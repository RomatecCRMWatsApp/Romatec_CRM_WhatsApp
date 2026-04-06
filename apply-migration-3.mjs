import mysql from "mysql2/promise";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  ssl: {},
  multipleStatements: true,
});

const sql = fs.readFileSync("drizzle/0003_odd_tenebrous.sql", "utf-8");
const statements = sql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);

for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log("✅", stmt.substring(0, 60));
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log("⏭️ Coluna já existe:", stmt.substring(0, 60));
    } else {
      console.error("❌", e.message);
    }
  }
}

await conn.end();
console.log("\n✅ Migração 3 concluída!");
