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
};

console.log(`Conectando ao banco: ${config.host}:${config.port}/${config.database}`);

async function loadContacts() {
  const connection = await mysql.createConnection(config);
  
  try {
    // Ler arquivo SQL de contatos
    const contactsSql = fs.readFileSync('/home/ubuntu/romatec-crm-whatsapp/insert-contacts.sql', 'utf-8');
    
    console.log(`Carregando contatos...`);
    await connection.execute(contactsSql);
    
    // Atualizar dados da empresa
    console.log(`Atualizando dados da empresa...`);
    await connection.execute(`
      UPDATE companyConfig SET 
        companyName = 'Romatec Consultoria Total',
        phone = '(99) 9181-1246',
        address = 'Rua São Raimundo, 10 - Centro, Açailândia - MA'
      WHERE id = 1
    `);
    
    console.log(`✅ Dados carregados com sucesso!`);
    
    // Verificar dados
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

loadContacts();
