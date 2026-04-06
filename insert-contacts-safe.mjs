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

async function insertContactsSafe() {
  const connection = await mysql.createConnection(config);
  
  try {
    console.log('Carregando contatos com prepared statements...');
    const contactsSql = fs.readFileSync('/home/ubuntu/romatec-crm-whatsapp/insert-contacts.sql', 'utf-8');
    
    // Extrair valores do INSERT
    const valuesMatch = contactsSql.match(/VALUES\n([\s\S]*);/);
    if (valuesMatch) {
      const valuesStr = valuesMatch[1];
      const rows = valuesStr.split('),\n(');
      
      console.log(`Total de contatos: ${rows.length}`);
      
      let inserted = 0;
      let errors = 0;
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i].replace(/^\(/, '').replace(/\)$/, '');
        
        // Parse valores
        const parts = [];
        let current = '';
        let inQuotes = false;
        
        for (let j = 0; j < row.length; j++) {
          const char = row[j];
          if (char === "'" && (j === 0 || row[j-1] !== '\\')) {
            inQuotes = !inQuotes;
          }
          if (char === ',' && !inQuotes) {
            parts.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        parts.push(current.trim());
        
        // Extrair valores
        const name = parts[0].replace(/^'|'$/g, '').replace(/''/, "'");
        const phone = parts[1].replace(/^'|'$/g, '');
        const email = parts[2] === 'NULL' ? null : parts[2].replace(/^'|'$/g, '');
        const status = parts[3].replace(/^'|'$/g, '');
        
        try {
          await connection.execute(
            'INSERT IGNORE INTO contacts (name, phone, email, status) VALUES (?, ?, ?, ?)',
            [name, phone, email, status]
          );
          inserted++;
          
          if ((i + 1) % 500 === 0) {
            console.log(`  ✓ ${i + 1}/${rows.length} contatos inseridos`);
          }
        } catch (error) {
          errors++;
          if (errors < 5) {
            console.error(`  ✗ Erro na linha ${i+1}:`, error.message.substring(0, 80));
          }
        }
      }
      
      console.log(`\n✅ Inserção concluída!`);
      console.log(`  - Inseridos: ${inserted}`);
      console.log(`  - Erros: ${errors}`);
    }
    
    // Verificar dados finais
    const [conts] = await connection.execute('SELECT COUNT(*) as count FROM contacts');
    console.log(`\n📊 Total de contatos no banco: ${conts[0].count}`);
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await connection.end();
  }
}

insertContactsSafe();
