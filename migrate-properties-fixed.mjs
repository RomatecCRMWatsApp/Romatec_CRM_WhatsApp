import { drizzle } from "drizzle-orm/mysql2";
import { properties } from "./drizzle/schema.ts";

const db = drizzle(process.env.DATABASE_URL);

const propertiesList = [
  {
    denomination: "ALACIDE",
    address: "AV-Tocantins, Quadra 38 Lote 01",
    price: "380000.00",
    description: "Lote comercial em localização privilegiada na Avenida Tocantins",
    images: [],
    status: "available",
  },
  {
    denomination: "Mod_Vaz-01",
    address: "Rua João Mariquinha, Quadra 15 Lote 12",
    price: "300000.00",
    description: "Módulo residencial com acabamento completo",
    images: [],
    status: "available",
  },
  {
    denomination: "Mod_Vaz-02",
    address: "Rua Amaro Pedroza, Quadra 17 Lote 010",
    price: "250000.00",
    description: "Módulo residencial com projeto moderno",
    images: [],
    status: "available",
  },
  {
    denomination: "Mod_Vaz-03",
    address: "Rua Salomão Awad, Quadra 11 Lote 10E",
    price: "210000.00",
    description: "Módulo residencial de 60m² com projeto executivo",
    images: [],
    status: "available",
  },
];

console.log(`Migrando ${propertiesList.length} imóveis...`);

for (const prop of propertiesList) {
  try {
    await db.insert(properties).values(prop);
    console.log(`✅ ${prop.denomination} migrado com sucesso!`);
  } catch (err) {
    console.error(`❌ Erro ao inserir ${prop.denomination}:`, err.message);
  }
}

console.log("✅ Migração de imóveis concluída!");
process.exit(0);
