const mysql = require('mysql2/promise');
mysql.createConnection({host:'mainline.proxy.rlwy.net',port:56439,user:'root',password:'mzhpVamVFtfKDLkQtfxGnjnlVLrVEaAf',database:'railway'}).then(async conn => {
  await conn.execute('UPDATE campaigns SET totalContacts=2, sentCount=0, failedCount=0');
  console.log('Atualizado!');
  conn.end();
});
