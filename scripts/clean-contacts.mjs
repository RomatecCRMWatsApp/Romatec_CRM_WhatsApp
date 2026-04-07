/**
 * Script para limpar contatos inválidos da base de dados
 * Celular BR válido: 55 + DDD(2) + 9 + 8dígitos = 13 dígitos
 */

import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL não definida');
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  // 1. Buscar todos os contatos
  const [rows] = await conn.execute('SELECT id, name, phone FROM contacts');
  console.log(`📊 Total de contatos na base: ${rows.length}\n`);

  const valid = [];
  const invalid = [];
  const reasons = {};

  for (const contact of rows) {
    const phone = (contact.phone || '').replace(/\D/g, '');
    const formatted = phone.startsWith('55') ? phone : `55${phone}`;
    
    let reason = null;
    
    if (formatted.length < 13) {
      reason = `Curto demais (${formatted.length} dígitos)`;
    } else if (formatted.length > 13) {
      reason = `Longo demais (${formatted.length} dígitos)`;
    } else if (formatted[4] !== '9') {
      reason = `5º dígito não é 9 (fixo/inválido)`;
    }
    
    if (reason) {
      invalid.push({ ...contact, formatted, reason });
      reasons[reason] = (reasons[reason] || 0) + 1;
    } else {
      valid.push(contact);
    }
  }

  console.log(`✅ Contatos válidos: ${valid.length}`);
  console.log(`❌ Contatos inválidos: ${invalid.length}\n`);

  // Mostrar motivos
  console.log('📋 Motivos de invalidação:');
  for (const [reason, count] of Object.entries(reasons)) {
    console.log(`   • ${reason}: ${count}`);
  }

  // Mostrar exemplos de inválidos
  console.log('\n📋 Exemplos de contatos inválidos (primeiros 20):');
  for (const c of invalid.slice(0, 20)) {
    console.log(`   ${c.name || 'Sem nome'} | ${c.phone} → ${c.formatted} | ${c.reason}`);
  }

  if (invalid.length === 0) {
    console.log('\n🎉 Nenhum contato inválido encontrado!');
    await conn.end();
    return;
  }

  // 2. Remover contatos inválidos
  const invalidIds = invalid.map(c => c.id);
  
  // Deletar em lotes de 100 para evitar problemas com queries muito grandes
  const batchSize = 100;
  let ccTotal = 0, chTotal = 0, msgTotal = 0, delTotal = 0;

  for (let i = 0; i < invalidIds.length; i += batchSize) {
    const batch = invalidIds.slice(i, i + batchSize);
    const ph = batch.map(() => '?').join(',');

    const [cc] = await conn.execute(`DELETE FROM campaignContacts WHERE contactId IN (${ph})`, batch);
    ccTotal += cc.affectedRows;

    const [ch] = await conn.execute(`DELETE FROM contactCampaignHistory WHERE contactId IN (${ph})`, batch);
    chTotal += ch.affectedRows;

    const [msg] = await conn.execute(`DELETE FROM messages WHERE contactId IN (${ph})`, batch);
    msgTotal += msg.affectedRows;

    const [del] = await conn.execute(`DELETE FROM contacts WHERE id IN (${ph})`, batch);
    delTotal += del.affectedRows;

    process.stdout.write(`\r🗑️ Processando lote ${Math.min(i + batchSize, invalidIds.length)}/${invalidIds.length}...`);
  }

  console.log(`\n   Removidas ${ccTotal} referências em campaignContacts`);
  console.log(`   Removidas ${chTotal} referências em contactCampaignHistory`);
  console.log(`   Removidas ${msgTotal} referências em messages`);
  console.log(`   Removidos ${delTotal} contatos inválidos`);

  // 3. Verificar resultado final
  const [finalCount] = await conn.execute('SELECT COUNT(*) as total FROM contacts');
  console.log(`\n🎉 Limpeza concluída!`);
  console.log(`   Antes: ${rows.length} contatos`);
  console.log(`   Removidos: ${invalid.length} inválidos`);
  console.log(`   Restantes: ${finalCount[0].total} contatos válidos`);

  await conn.end();
}

main().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
