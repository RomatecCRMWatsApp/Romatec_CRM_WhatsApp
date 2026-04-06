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

async function insertData() {
  const connection = await mysql.createConnection(config);
  
  try {
    // 1. Inserir empresa
    console.log('1. Inserindo empresa...');
    await connection.execute(`
      INSERT INTO companyConfig (companyName, phone, address, zApiInstanceId, zApiToken, zApiConnected) 
      VALUES ('Romatec Consultoria Total', '(99) 9181-1246', 'Rua São Raimundo, 10 - Centro, Açailândia - MA', '', '', false)
      ON DUPLICATE KEY UPDATE 
      companyName = 'Romatec Consultoria Total',
      phone = '(99) 9181-1246',
      address = 'Rua São Raimundo, 10 - Centro, Açailândia - MA'
    `);
    
    // 2. Inserir imóveis
    console.log('2. Inserindo imóveis...');
    const properties = [
      ['ALACIDE', 'AV-Tocantins, Quadra 38 Lote 01', 380000, 'Lote comercial em localização privilegiada'],
      ['Mod_Vaz-01', 'Rua João Mariquinha, Quadra 15 Lote 12', 300000, 'Módulo residencial completo'],
      ['Mod_Vaz-02', 'Rua Amaro Pedroza, Quadra 17 Lote 010', 250000, 'Módulo residencial em condomínio'],
      ['Mod_Vaz-03', 'Rua Salomão Awad, Quadra 11 Lote 10E', 210000, 'Módulo residencial 60m² com projeto'],
    ];
    
    for (const [name, addr, price, desc] of properties) {
      await connection.execute(
        'INSERT IGNORE INTO properties (denomination, address, price, description, status) VALUES (?, ?, ?, ?, ?)',
        [name, addr, price, desc, 'available']
      );
    }
    
    // 3. Ler e inserir contatos em lotes
    console.log('3. Carregando contatos...');
    const contactsSql = fs.readFileSync('/home/ubuntu/romatec-crm-whatsapp/insert-contacts.sql', 'utf-8');
    
    // Extrair valores do INSERT
    const valuesMatch = contactsSql.match(/VALUES\n([\s\S]*);/);
    if (valuesMatch) {
      const valuesStr = valuesMatch[1];
      const rows = valuesStr.split('),\n(');
      
      console.log(`Inserindo ${rows.length} contatos...`);
      
      // Inserir em lotes de 100
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const batchSql = `INSERT IGNORE INTO contacts (name, phone, email, status, createdAt) VALUES (${batch.join('),(')}`;
        
        try {
          await connection.execute(batchSql);
          console.log(`  ✓ Lote ${Math.floor(i/100)+1} inserido`);
        } catch (error) {
          console.error(`  ✗ Erro no lote ${Math.floor(i/100)+1}:`, error.message.substring(0, 100));
        }
      }
    }
    
    // 4. Verificar dados
    console.log('\n✅ Dados inseridos!');
    const [companies] = await connection.execute('SELECT COUNT(*) as count FROM companyConfig');
    const [props] = await connection.execute('SELECT COUNT(*) as count FROM properties');
    const [conts] = await connection.execute('SELECT COUNT(*) as count FROM contacts');
    
    console.log(`\n📊 Resumo:`);
    console.log(`  - Empresa: ${companies[0].count}`);
    console.log(`  - Imóveis: ${props[0].count}`);
    console.log(`  - Contatos: ${conts[0].count}`);
    
  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await connection.end();
  }
}

insertData();
