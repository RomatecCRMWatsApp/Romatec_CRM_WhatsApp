import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const pool = mysql.createPool(process.env.DATABASE_URL);
const db = drizzle(pool);

async function checkTables() {
  try {
    const connection = await pool.getConnection();
    const [tables] = await connection.query('SHOW TABLES');
    console.log('Tabelas no banco:', tables);
    connection.release();
  } catch (error) {
    console.error('Erro ao verificar tabelas:', error.message);
  }
}

checkTables();
