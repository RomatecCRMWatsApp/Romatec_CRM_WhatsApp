const mysql = require('mysql2/promise');
mysql.createConnection({host:'mainline.proxy.rlwy.net',port:56439,user:'root',password:'mzhpVamVFtfKDLkQtfxGnjnlVLrVEaAf',database:'railway'}).then(async conn => {
  const [tables] = await conn.execute('SHOW TABLES');
  console.log(tables.map(t => Object.values(t)[0]).join('\n'));
  conn.end();
});
