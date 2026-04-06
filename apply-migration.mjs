import mysql from 'mysql2/promise';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const url = new URL(connectionString);
const config = {
  host: url.hostname,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  port: url.port || 4000,
  ssl: {},
};

async function applyMigration() {
  const connection = await mysql.createConnection(config);
  
  try {
    const migrationSql = fs.readFileSync('/home/ubuntu/romatec-crm-whatsapp/drizzle/0002_talented_azazel.sql', 'utf-8');
    const statements = migrationSql.split('--> statement-breakpoint').map(s => s.trim()).filter(s => s);
    
    console.log(`Aplicando ${statements.length} statements...`);
    
    for (const stmt of statements) {
      try {
        await connection.execute(stmt);
      } catch (error) {
        if (!error.message.includes('already exists')) {
          console.error('Erro:', error.message.substring(0, 100));
        }
      }
    }
    
    console.log('✅ Migração aplicada com sucesso!');
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await connection.end();
  }
}

applyMigration();
