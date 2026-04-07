#!/usr/bin/env node
/**
 * Diagnóstico completo das campanhas e bot IA - Romatec CRM
 */

import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('ERRO: DATABASE_URL não definida'); process.exit(1); }

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  const results = {};
  
  // ===== 1. STATUS GERAL =====
  console.log('\n========================================');
  console.log('  DIAGNÓSTICO ROMATEC CRM');
  console.log('  ' + new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
  console.log('========================================\n');
  
  // Contatos
  const [contactStats] = await conn.execute(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as ativos,
      SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as bloqueados,
      SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inativos
    FROM contacts
  `);
  console.log('📋 CONTATOS:');
  console.log(`  Total: ${contactStats[0].total}`);
  console.log(`  Ativos: ${contactStats[0].ativos}`);
  console.log(`  Bloqueados: ${contactStats[0].bloqueados}`);
  console.log(`  Inativos: ${contactStats[0].inativos}`);
  
  // ===== 2. CAMPANHAS =====
  console.log('\n📢 CAMPANHAS:');
  const [campaigns] = await conn.execute(`
    SELECT c.*, p.denomination as propertyName, p.price
    FROM campaigns c
    LEFT JOIN properties p ON c.propertyId = p.id
    ORDER BY c.id
  `);
  
  for (const camp of campaigns) {
    console.log(`\n  🏠 ${camp.name} (ID: ${camp.id})`);
    console.log(`     Imóvel: ${camp.propertyName || 'N/A'} - R$ ${Number(camp.price || 0).toLocaleString('pt-BR')}`);
    console.log(`     Status: ${camp.status}`);
    console.log(`     Msgs/hora: ${camp.messagesPerHour}`);
    console.log(`     Contatos total: ${camp.totalContacts}`);
    console.log(`     Enviadas: ${camp.sentCount} | Falhas: ${camp.failedCount}`);
    
    // Variações de mensagem
    let variations = [];
    try {
      variations = typeof camp.messageVariations === 'string' 
        ? JSON.parse(camp.messageVariations) 
        : (camp.messageVariations || []);
    } catch(e) { variations = []; }
    console.log(`     Variações de mensagem: ${variations.length}`);
    
    // Contatos da campanha
    const [campContacts] = await conn.execute(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendentes,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as enviados,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as falhas,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as bloqueados
      FROM campaignContacts WHERE campaignId = ?
    `, [camp.id]);
    
    const cc = campContacts[0];
    console.log(`     Contatos campanha: ${cc.total} (✅ ${cc.enviados} enviados | ⏳ ${cc.pendentes} pendentes | ❌ ${cc.falhas} falhas | 🚫 ${cc.bloqueados} bloqueados)`);
  }
  
  // ===== 3. MENSAGENS ENVIADAS =====
  console.log('\n\n📨 MENSAGENS ENVIADAS:');
  const [msgStats] = await conn.execute(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as enviadas,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as entregues,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as falhas,
      SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as bloqueadas,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendentes
    FROM messages
  `);
  const ms = msgStats[0];
  console.log(`  Total: ${ms.total}`);
  console.log(`  ✅ Enviadas: ${ms.enviadas}`);
  console.log(`  📬 Entregues: ${ms.entregues}`);
  console.log(`  ❌ Falhas: ${ms.falhas}`);
  console.log(`  🚫 Bloqueadas: ${ms.bloqueadas}`);
  console.log(`  ⏳ Pendentes: ${ms.pendentes}`);
  
  // Últimas mensagens
  const [lastMsgs] = await conn.execute(`
    SELECT m.*, c.name as contactName, c.phone, camp.name as campaignName
    FROM messages m
    LEFT JOIN contacts c ON m.contactId = c.id
    LEFT JOIN campaigns camp ON m.campaignId = camp.id
    ORDER BY m.createdAt DESC
    LIMIT 10
  `);
  
  if (lastMsgs.length > 0) {
    console.log('\n  Últimas 10 mensagens:');
    for (const msg of lastMsgs) {
      const time = msg.sentAt ? new Date(msg.sentAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A';
      console.log(`    ${time} | ${msg.status} | ${msg.campaignName} → ${msg.contactName} (${msg.phone})`);
      if (msg.errorMessage) console.log(`      ⚠️ Erro: ${msg.errorMessage}`);
    }
  }
  
  // ===== 4. SCHEDULER STATE =====
  console.log('\n\n⏰ ESTADO DO SCHEDULER:');
  const [schedState] = await conn.execute(`SELECT * FROM schedulerState ORDER BY id DESC LIMIT 1`);
  
  if (schedState.length > 0) {
    const ss = schedState[0];
    console.log(`  Status: ${ss.status}`);
    console.log(`  Ciclo atual: ${ss.cycleNumber}`);
    console.log(`  Par atual: ${ss.currentPairIndex}`);
    console.log(`  Msgs neste ciclo: ${ss.messagesThisCycle}`);
    console.log(`  Iniciado em: ${ss.startedAt ? new Date(ss.startedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A'}`);
    console.log(`  Ciclo iniciado: ${ss.cycleStartedAt ? new Date(ss.cycleStartedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A'}`);
    console.log(`  Última atualização: ${ss.updatedAt ? new Date(ss.updatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A'}`);
    
    if (ss.stateJson) {
      const state = typeof ss.stateJson === 'string' ? JSON.parse(ss.stateJson) : ss.stateJson;
      console.log(`  Dados extras: ${JSON.stringify(state, null, 2).substring(0, 500)}`);
    }
  } else {
    console.log('  ⚠️ Nenhum estado salvo');
  }
  
  // ===== 5. IMÓVEIS =====
  console.log('\n\n🏠 IMÓVEIS:');
  const [props] = await conn.execute(`SELECT * FROM properties ORDER BY id`);
  for (const p of props) {
    let imgs = [];
    try { imgs = typeof p.images === 'string' ? JSON.parse(p.images) : (p.images || []); } catch(e) {}
    console.log(`  ${p.denomination} (ID: ${p.id})`);
    console.log(`    Preço: R$ ${Number(p.price).toLocaleString('pt-BR')}`);
    console.log(`    Cidade: ${p.city || 'N/A'} - ${p.state || 'N/A'}`);
    console.log(`    Status: ${p.status}`);
    console.log(`    Slug: ${p.publicSlug || 'N/A'}`);
    console.log(`    Fotos: ${imgs.length} | Vídeo: ${p.videoUrl ? 'Sim' : 'Não'} | Planta: ${p.plantaBaixaUrl ? 'Sim' : 'Não'}`);
  }
  
  // ===== 6. CONFIGURAÇÃO EMPRESA =====
  console.log('\n\n🏢 CONFIGURAÇÃO EMPRESA:');
  const [config] = await conn.execute(`SELECT * FROM companyConfig LIMIT 1`);
  if (config.length > 0) {
    const cfg = config[0];
    console.log(`  Empresa: ${cfg.companyName}`);
    console.log(`  Telefone: ${cfg.phone}`);
    console.log(`  Endereço: ${cfg.address}`);
    console.log(`  Z-API Instance: ${cfg.zApiInstanceId ? '✅ Configurado' : '❌ Não configurado'}`);
    console.log(`  Z-API Token: ${cfg.zApiToken ? '✅ Configurado' : '❌ Não configurado'}`);
    console.log(`  Z-API Client Token: ${cfg.zApiClientToken ? '✅ Configurado' : '❌ Não configurado'}`);
    console.log(`  Z-API Conectado: ${cfg.zApiConnected ? '✅ Sim' : '❌ Não'}`);
    console.log(`  Última verificação: ${cfg.zApiLastChecked ? new Date(cfg.zApiLastChecked).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A'}`);
  }
  
  // ===== 7. HISTÓRICO DE CONTATOS POR CAMPANHA =====
  console.log('\n\n📊 HISTÓRICO CONTATO-CAMPANHA:');
  const [history] = await conn.execute(`
    SELECT cch.*, c.name as contactName, camp.name as campaignName
    FROM contactCampaignHistory cch
    LEFT JOIN contacts c ON cch.contactId = c.id
    LEFT JOIN campaigns camp ON cch.campaignId = camp.id
    ORDER BY cch.sentAt DESC
    LIMIT 20
  `);
  
  if (history.length > 0) {
    for (const h of history) {
      const time = h.sentAt ? new Date(h.sentAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A';
      console.log(`  ${time} | ${h.campaignName} → ${h.contactName}`);
    }
  } else {
    console.log('  Nenhum histórico registrado');
  }
  
  // ===== 8. ANÁLISE DE COBERTURA =====
  console.log('\n\n📈 ANÁLISE DE COBERTURA:');
  const totalContacts = Number(contactStats[0].ativos);
  const totalSent = Number(ms.total);
  
  // Contatos únicos que receberam mensagem
  const [uniqueContacted] = await conn.execute(`
    SELECT COUNT(DISTINCT contactId) as unique_contacts FROM messages WHERE status IN ('sent', 'delivered')
  `);
  const uniqueCount = uniqueContacted[0].unique_contacts;
  
  console.log(`  Contatos ativos: ${totalContacts}`);
  console.log(`  Contatos que receberam msg: ${uniqueCount}`);
  console.log(`  Cobertura: ${totalContacts > 0 ? ((uniqueCount / totalContacts) * 100).toFixed(1) : 0}%`);
  console.log(`  Contatos não alcançados: ${totalContacts - uniqueCount}`);
  
  // Taxa de sucesso
  const successRate = totalSent > 0 ? ((Number(ms.enviadas) + Number(ms.entregues)) / totalSent * 100).toFixed(1) : 0;
  console.log(`  Taxa de sucesso: ${successRate}%`);
  
  // Estimativa de tempo para cobrir todos
  const msgsPerDay = 5 * 1 * 12 * 2; // 5 campanhas × 1 msg/h × 12h × 2 ciclos
  const daysToComplete = totalContacts > 0 ? Math.ceil((totalContacts - uniqueCount) / msgsPerDay) : 0;
  console.log(`  Msgs/dia estimadas (5 camp × 1 msg/h × 12h × 2 ciclos): ${msgsPerDay}`);
  console.log(`  Dias para cobrir todos: ~${daysToComplete} dias`);
  
  // ===== 9. DIAGNÓSTICO PROBLEMAS =====
  console.log('\n\n🔍 DIAGNÓSTICO DE PROBLEMAS:');
  
  // Verificar campanhas sem variações
  for (const camp of campaigns) {
    let vars = [];
    try { vars = typeof camp.messageVariations === 'string' ? JSON.parse(camp.messageVariations) : (camp.messageVariations || []); } catch(e) {}
    if (vars.length === 0) {
      console.log(`  ⚠️ Campanha "${camp.name}" sem variações de mensagem!`);
    }
    if (vars.length < 5) {
      console.log(`  ⚠️ Campanha "${camp.name}" com apenas ${vars.length} variações (recomendado: 12+)`);
    }
  }
  
  // Verificar contatos pendentes por campanha
  for (const camp of campaigns) {
    const [pending] = await conn.execute(`
      SELECT COUNT(*) as cnt FROM campaignContacts 
      WHERE campaignId = ? AND status = 'pending'
    `, [camp.id]);
    if (pending[0].cnt === 0) {
      console.log(`  ⚠️ Campanha "${camp.name}" sem contatos pendentes! Precisa redesignar.`);
    }
  }
  
  // Verificar mensagens com erro
  const [errorMsgs] = await conn.execute(`
    SELECT errorMessage, COUNT(*) as cnt 
    FROM messages 
    WHERE status = 'failed' AND errorMessage IS NOT NULL
    GROUP BY errorMessage
  `);
  if (errorMsgs.length > 0) {
    console.log('\n  ❌ Erros de envio:');
    for (const err of errorMsgs) {
      console.log(`    "${err.errorMessage}" (${err.cnt}x)`);
    }
  }
  
  // Verificar Z-API
  if (config.length > 0 && !config[0].zApiConnected) {
    console.log('  ⚠️ Z-API NÃO está conectado!');
  }
  
  // Status do scheduler
  if (schedState.length > 0 && schedState[0].status !== 'running') {
    console.log(`  ⚠️ Scheduler está ${schedState[0].status} (não está rodando)`);
  }
  
  console.log('\n========================================');
  console.log('  FIM DO DIAGNÓSTICO');
  console.log('========================================\n');
  
  await conn.end();
}

main().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
