import mysql from 'mysql2/promise';

async function cleanup() {
  const conn = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: {}
  });
  
  // Delete test properties (keep only the 4 real ones)
  const [result] = await conn.execute(
    "DELETE FROM properties WHERE denomination = 'Imóvel Teste'"
  );
  console.log('Deleted test properties:', result.affectedRows);
  
  // Also delete any campaign_contacts and campaigns linked to deleted properties
  const [campaigns] = await conn.execute(
    "SELECT id FROM campaigns WHERE property_id NOT IN (SELECT id FROM properties)"
  );
  console.log('Orphaned campaigns:', campaigns.length);
  
  if (campaigns.length > 0) {
    const ids = campaigns.map(c => c.id).join(',');
    await conn.execute(`DELETE FROM campaign_contacts WHERE campaign_id IN (${ids})`);
    await conn.execute(`DELETE FROM campaigns WHERE id IN (${ids})`);
    console.log('Cleaned up orphaned campaigns and contacts');
  }
  
  // Verify remaining
  const [props] = await conn.execute("SELECT id, denomination FROM properties");
  console.log('Remaining properties:', props.map(p => `${p.id}: ${p.denomination}`));
  
  const [camps] = await conn.execute("SELECT id, name, property_id FROM campaigns");
  console.log('Remaining campaigns:', camps.length);
  
  await conn.end();
}

cleanup().catch(console.error);
