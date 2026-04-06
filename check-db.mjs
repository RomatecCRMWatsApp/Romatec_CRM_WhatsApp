import mysql from 'mysql2/promise';
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

async function checkDB() {
  const connection = await mysql.createConnection(config);
  
  try {
    const [companies] = await connection.execute('SELECT * FROM companyConfig LIMIT 1');
    const [properties] = await connection.execute('SELECT COUNT(*) as count FROM properties');
    const [contacts] = await connection.execute('SELECT COUNT(*) as count FROM contacts');
    
    console.log('📊 Dados no banco:');
    console.log(`Empresa:`, companies[0] || 'Vazia');
    console.log(`Imóveis: ${properties[0].count}`);
    console.log(`Contatos: ${contacts[0].count}`);
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await connection.end();
  }
}

checkDB();
