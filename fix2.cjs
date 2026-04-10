const mysql = require('mysql2/promise');
mysql.createConnection({host:'mainline.proxy.rlwy.net',port:56439,user:'root',password:'mzhpVamVFtfKDLkQtfxGnjnlVLrVEaAf',database:'railway'}).then(async conn => {
  await conn.execute('DELETE FROM campaign_contacts');
  await conn.execute('DELETE FROM messages');
  await conn.execute('DELETE FROM contact_campaign_history');
  await conn.execute('UPDATE campaigns SET totalContacts=2, sentCount=0, failedCount=0');
  await conn.execute('UPDATE contacts SET blockedUntil=NULL');
  console.log('Tudo limpo!');
  conn.end();
});
