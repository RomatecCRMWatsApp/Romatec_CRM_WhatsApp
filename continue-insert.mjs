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

async function continueInsert() {
  const connection = await mysql.createConnection(config);
  
  try {
    console.log('Carregando contatos restantes...');
    const contactsSql = fs.readFileSync('/home/ubuntu/romatec-crm-whatsapp/insert-contacts.sql', 'utf-8');
    
    // Extrair valores do INSERT
    const valuesMatch = contactsSql.match(/VALUES\n([\s\S]*);/);
    if (valuesMatch) {
      const valuesStr = valuesMatch[1];
      const rows = valuesStr.split('),\n(');
      
      console.log(`Total de contatos: ${rows.length}`);
      
      // Inserir em lotes de 50 (mais rápido)
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const batchSql = `INSERT IGNORE INTO contacts (name, phone, email, status, createdAt) VALUES (${batch.join('),(')}`;
        
        try {
          await connection.execute(batchSql);
          const progress = Math.min(i + 50, rows.length);
          console.log(`  ✓ ${progress}/${rows.length} contatos`);
        } catch (error) {
          console.error(`  ✗ Erro:`, error.message.substring(0, 80));
        }
      }
    }
    
    // Verificar dados finais
    const [conts] = await connection.execute('SELECT COUNT(*) as count FROM contacts');
    console.log(`\n✅ Total de contatos: ${conts[0].count}`);
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await connection.end();
  }
}

continueInsert();
