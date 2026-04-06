import mysql from 'mysql2/promise';

async function reset() {
  const conn = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: {}
  });
  
  // Delete ALL campaign data (camelCase table names)
  await conn.execute("DELETE FROM campaignContacts");
  console.log('Deleted all campaignContacts');
  
  await conn.execute("DELETE FROM contactCampaignHistory");
  console.log('Deleted all contactCampaignHistory');
  
  await conn.execute("DELETE FROM campaignSchedules");
  console.log('Deleted all campaignSchedules');
  
  await conn.execute("DELETE FROM campaigns");
  console.log('Deleted all campaigns');
  
  // Verify
  const [props] = await conn.execute("SELECT id, denomination FROM properties");
  console.log('Properties:', props.length, props.map(p => `${p.id}: ${p.denomination}`));
  
  const [camps] = await conn.execute("SELECT COUNT(*) as c FROM campaigns");
  console.log('Campaigns:', camps[0].c);
  
  const [cc] = await conn.execute("SELECT COUNT(*) as c FROM campaignContacts");
  console.log('Campaign contacts:', cc[0].c);
  
  await conn.end();
}

reset().catch(console.error);
