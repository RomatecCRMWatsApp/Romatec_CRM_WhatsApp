import mysql from 'mysql2/promise';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL não configurada');
  process.exit(1);
}

const url = new URL(connectionString);
const config = {
  host: url.hostname,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  port: url.port || 4000,
  ssl: {},
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

console.log(`Conectando ao banco: ${config.host}:${config.port}/${config.database}`);

async function executeMigration() {
  const connection = await mysql.createConnection(config);
  
  try {
    // Ler arquivo de migração
    const migrationSql = fs.readFileSync('/home/ubuntu/romatec-crm-whatsapp/migration.sql', 'utf-8');
    
    // Dividir por quebras de linha e statement-breakpoint
    const statements = migrationSql
      .split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));
    
    console.log(`Executando ${statements.length} statements SQL...`);
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;
      
      try {
        console.log(`[${i+1}/${statements.length}] Executando...`);
        await connection.execute(stmt);
      } catch (error) {
        console.error(`Erro no statement ${i+1}:`, error.message.substring(0, 150));
      }
    }
    
    console.log(`✅ Migração concluída!`);
    
    // Verificar tabelas criadas
    const [tables] = await connection.execute('SHOW TABLES');
    console.log(`\n📊 Tabelas criadas: ${tables.length}`);
    tables.forEach(row => {
      const tableName = Object.values(row)[0];
      console.log(`  - ${tableName}`);
    });
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await connection.end();
  }
}

executeMigration();
