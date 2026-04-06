import mysql from 'mysql2/promise';
import fs from 'fs';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL não configurada');
  process.exit(1);
}

// Parsear URL de conexão
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

async function loadData() {
  const connection = await mysql.createConnection(config);
  
  try {
    // Ler arquivo SQL
    const sql = fs.readFileSync('/home/ubuntu/romatec-crm-whatsapp/load-all-data.sql', 'utf-8');
    
    // Dividir em statements individuais
    const statements = sql.split(';').filter(s => s.trim());
    
    console.log(`Executando ${statements.length} statements SQL...`);
    
    let executed = 0;
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;
      
      try {
        if (i % 100 === 0) {
          console.log(`[${i+1}/${statements.length}] Executando...`);
        }
        await connection.execute(stmt);
        executed++;
      } catch (error) {
        if (error.message.includes('Duplicate')) {
          // Ignorar duplicatas
        } else {
          console.error(`Erro no statement ${i+1}:`, error.message.substring(0, 100));
        }
      }
    }
    
    console.log(`✅ ${executed} statements executados com sucesso!`);
    
    // Verificar dados carregados
    const [companies] = await connection.execute('SELECT COUNT(*) as count FROM companyConfig');
    const [properties] = await connection.execute('SELECT COUNT(*) as count FROM properties');
    const [contacts] = await connection.execute('SELECT COUNT(*) as count FROM contacts');
    
    console.log(`\n📊 Resumo:`);
    console.log(`  - Empresa: ${companies[0].count}`);
    console.log(`  - Imóveis: ${properties[0].count}`);
    console.log(`  - Contatos: ${contacts[0].count}`);
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await connection.end();
  }
}

loadData();
