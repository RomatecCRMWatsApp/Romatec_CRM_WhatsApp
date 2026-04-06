import { drizzle } from "drizzle-orm/mysql2";
import { properties } from "./drizzle/schema.ts";

const db = drizzle(process.env.DATABASE_URL);

const propertiesList = [
  {
    name: "ALACIDE",
    address: "AV-Tocantins, Quadra 38 Lote 01",
    city: "Açailândia",
    state: "MA",
    price: 380000,
    description: "Lote comercial em localização privilegiada na Avenida Tocantins",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Mod_Vaz-01",
    address: "Rua João Mariquinha, Quadra 15 Lote 12",
    city: "Açailândia",
    state: "MA",
    price: 300000,
    description: "Módulo residencial com acabamento completo",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Mod_Vaz-02",
    address: "Rua Amaro Pedroza, Quadra 17 Lote 010",
    city: "Açailândia",
    state: "MA",
    price: 250000,
    description: "Módulo residencial com projeto moderno",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    name: "Mod_Vaz-03",
    address: "Rua Salomão Awad, Quadra 11 Lote 10E",
    city: "Açailândia",
    state: "MA",
    price: 210000,
    description: "Módulo residencial de 60m² com projeto executivo",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

console.log(`Migrando ${propertiesList.length} imóveis...`);

for (const prop of propertiesList) {
  try {
    await db.insert(properties).values(prop);
    console.log(`✅ ${prop.name} migrado com sucesso!`);
  } catch (err) {
    console.error(`❌ Erro ao inserir ${prop.name}:`, err.message);
  }
}

console.log("✅ Migração de imóveis concluída!");
