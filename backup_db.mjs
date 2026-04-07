#!/usr/bin/env node
/**
 * Backup completo do banco de dados Romatec CRM
 * Exporta todas as tabelas em formato SQL (INSERT statements) e CSV
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERRO: DATABASE_URL não definida');
  process.exit(1);
}

const backupDir = '/home/ubuntu/romatec-backup';
const csvDir = path.join(backupDir, 'csv');
fs.mkdirSync(backupDir, { recursive: true });
fs.mkdirSync(csvDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace('T', '_').slice(0, 15);

const tables = [
  'contacts',
  'properties',
  'campaigns',
  'campaignContacts',
  'messages',
  'companyConfig',
  'interactions',
  'contactCampaignHistory',
  'campaignSchedules',
  'messageVariations',
  'dailyReports',
  'schedulerState',
  'users'
];

async function main() {
  console.log('Conectando ao banco de dados...');
  
  const conn = await mysql.createConnection(DATABASE_URL);
  
  const sqlFile = path.join(backupDir, `romatec_backup_${timestamp}.sql`);
  let sqlContent = '';
  let totalRows = 0;
  
  sqlContent += `-- Backup Romatec CRM - ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n`;
  sqlContent += `-- Tabelas: ${tables.length}\n\n`;
  sqlContent += `SET NAMES utf8mb4;\n`;
  sqlContent += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;
  
  for (const table of tables) {
    try {
      // Contar registros
      const [countResult] = await conn.execute(`SELECT COUNT(*) as cnt FROM \`${table}\``);
      const count = countResult[0].cnt;
      
      if (count === 0) {
        sqlContent += `-- Tabela ${table}: vazia\n\n`;
        console.log(`  ${table}: 0 registros (vazia)`);
        continue;
      }
      
      // CREATE TABLE
      const [createResult] = await conn.execute(`SHOW CREATE TABLE \`${table}\``);
      const createStmt = createResult[0]['Create Table'];
      sqlContent += `-- Tabela: ${table} (${count} registros)\n`;
      sqlContent += `DROP TABLE IF EXISTS \`${table}\`;\n`;
      sqlContent += `${createStmt};\n\n`;
      
      // Dados
      const [rows, fields] = await conn.execute(`SELECT * FROM \`${table}\``);
      const columns = fields.map(f => f.name);
      
      // CSV
      let csvContent = columns.join(',') + '\n';
      
      for (const row of rows) {
        const values = [];
        const csvValues = [];
        
        for (const col of columns) {
          const val = row[col];
          if (val === null || val === undefined) {
            values.push('NULL');
            csvValues.push('');
          } else if (typeof val === 'number') {
            values.push(String(val));
            csvValues.push(String(val));
          } else if (val instanceof Date) {
            const dateStr = val.toISOString().slice(0, 19).replace('T', ' ');
            values.push(`'${dateStr}'`);
            csvValues.push(dateStr);
          } else if (typeof val === 'object') {
            const jsonStr = JSON.stringify(val);
            const escaped = jsonStr.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            values.push(`'${escaped}'`);
            csvValues.push(`"${jsonStr.replace(/"/g, '""')}"`);
          } else {
            const escaped = String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            values.push(`'${escaped}'`);
            const csvEscaped = String(val).replace(/"/g, '""');
            if (csvEscaped.includes(',') || csvEscaped.includes('\n') || csvEscaped.includes('"')) {
              csvValues.push(`"${csvEscaped}"`);
            } else {
              csvValues.push(csvEscaped);
            }
          }
        }
        
        const colsStr = columns.map(c => `\`${c}\``).join(', ');
        const valsStr = values.join(', ');
        sqlContent += `INSERT INTO \`${table}\` (${colsStr}) VALUES (${valsStr});\n`;
        csvContent += csvValues.join(',') + '\n';
      }
      
      sqlContent += '\n';
      totalRows += count;
      
      // Salvar CSV
      fs.writeFileSync(path.join(csvDir, `${table}.csv`), csvContent, 'utf-8');
      console.log(`  ${table}: ${count} registros`);
      
    } catch (err) {
      sqlContent += `-- ERRO na tabela ${table}: ${err.message}\n\n`;
      console.log(`  ${table}: ERRO - ${err.message}`);
    }
  }
  
  sqlContent += `SET FOREIGN_KEY_CHECKS = 1;\n`;
  sqlContent += `\n-- Total: ${totalRows} registros exportados\n`;
  
  // Salvar SQL
  fs.writeFileSync(sqlFile, sqlContent, 'utf-8');
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`BACKUP COMPLETO!`);
  console.log(`${'='.repeat(50)}`);
  console.log(`SQL: ${sqlFile}`);
  console.log(`CSVs: ${csvDir}/`);
  console.log(`Total: ${totalRows} registros`);
  
  const sqlSize = fs.statSync(sqlFile).size;
  console.log(`Tamanho SQL: ${(sqlSize / 1024).toFixed(1)} KB`);
  
  await conn.end();
  console.log('\nBackup finalizado com sucesso!');
}

main().catch(err => {
  console.error('ERRO FATAL:', err.message);
  process.exit(1);
});
