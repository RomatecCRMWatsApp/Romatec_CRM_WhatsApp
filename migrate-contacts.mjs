import { drizzle } from "drizzle-orm/mysql2";
import { contacts } from "./drizzle/schema.ts";
import * as fs from "fs";

const db = drizzle(process.env.DATABASE_URL);

// Ler arquivo vCard
const vcardData = fs.readFileSync("/home/ubuntu/upload/vCardsiCloud(1).vcf", "utf-8");

// Parse vCard simples
const vCards = vcardData.split("BEGIN:VCARD").slice(1);
const contactsList = [];

vCards.forEach((vcard) => {
  const fnMatch = vcard.match(/FN:(.+)/);
  const telMatch = vcard.match(/TEL[^:]*:(.+)/);
  
  if (fnMatch && telMatch) {
    const name = fnMatch[1].trim();
    const phone = telMatch[1].trim().replace(/\s+/g, "");
    
    if (name && phone) {
      contactsList.push({
        name,
        phone,
        email: null,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
});

// Inserir no banco
console.log(`Migrando ${contactsList.length} contatos...`);

for (const contact of contactsList) {
  try {
    await db.insert(contacts).values(contact);
  } catch (err) {
    console.error(`Erro ao inserir ${contact.name}:`, err.message);
  }
}

console.log("✅ Migração de contatos concluída!");
