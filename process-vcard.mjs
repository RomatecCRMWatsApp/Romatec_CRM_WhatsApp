import fs from 'fs';
import path from 'path';

// Ler arquivo vCard
const vCardContent = fs.readFileSync('/home/ubuntu/upload/vCardsiCloud(1).vcf', 'utf-8');

// Dividir em cards individuais
const cards = vCardContent.split('BEGIN:VCARD').filter(c => c.trim());

// Processar cada card
const contacts = [];
const seen = new Set();

cards.forEach(card => {
  try {
    // Extrair nome
    let name = '';
    const fnMatch = card.match(/FN:(.+)/);
    if (fnMatch) {
      name = fnMatch[1].trim();
    }

    // Extrair telefone
    let phone = '';
    const telMatch = card.match(/TEL[^:]*:(.+)/);
    if (telMatch) {
      phone = telMatch[1].trim();
      // Limpar telefone
      phone = phone.replace(/[^\d+]/g, '');
      if (!phone.startsWith('+')) {
        phone = '+55' + phone.replace(/^0+/, '');
      }
    }

    if (name && phone && !seen.has(phone)) {
      seen.add(phone);
      contacts.push({
        name: name.substring(0, 100),
        phone: phone.substring(0, 20),
        email: null,
        status: 'active'
      });
    }
  } catch (e) {
    // Ignorar erros de parsing
  }
});

console.log(`Processados ${contacts.length} contatos únicos`);

// Gerar SQL
let sql = 'INSERT IGNORE INTO contacts (name, phone, email, status, created_at) VALUES\n';
const values = contacts.map(c => {
  const name = c.name.replace(/'/g, "''");
  return `('${name}', '${c.phone}', NULL, 'active', NOW())`;
});

sql += values.join(',\n') + ';';

// Salvar SQL
fs.writeFileSync('/home/ubuntu/romatec-crm-whatsapp/insert-contacts.sql', sql);
console.log(`SQL salvo em insert-contacts.sql (${sql.length} bytes)`);
