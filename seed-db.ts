import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { contacts, properties, companyConfig } from "./drizzle/schema";
import fs from "fs";

const DATABASE_URL = process.env.DATABASE_URL;

async function seedDatabase() {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection);

  try {
    console.log("🌱 Iniciando população do banco de dados...");

    // Limpar dados existentes
    await connection.execute("DELETE FROM contacts");
    await connection.execute("DELETE FROM properties");
    await connection.execute("DELETE FROM companyConfig");

    // Inserir configuração da empresa
    const companyData = {
      companyName: "Romatec Consultoria Imobiliária",
      phone: "(99) 999169-0178",
      address: "Rua Principal, Centro",
      zApiInstanceId: "3F0D313A38C952B7106F6A1199C38405",
      zApiToken: "",
      zApiConnected: false,
    };

    await db.insert(companyConfig).values(companyData);
    console.log("✅ Configuração da empresa inserida");

    // Inserir imóveis
    const propertiesData = [
      {
        denomination: "ALACIDE",
        address: "AV-Tocantins, Quadra 38 Lote 01, VSF",
        price: "380000.00" as any,
        description: "Imóvel localizado na Avenida Tocantins, excelente localização",
        images: [],
        status: "available" as const,
      },
      {
        denomination: "Mod_Vaz-01",
        address: "Rua João Mariquinha, Quadra 15 Lote 12, LJKO",
        price: "300000.00" as any,
        description: "Módulo residencial na Rua João Mariquinha",
        images: [],
        status: "available" as const,
      },
      {
        denomination: "Mod_Vaz-02",
        address: "Rua Amaro Pedroza, Quadra 17 Lote 010, LJKO",
        price: "250000.00" as any,
        description: "Módulo residencial na Rua Amaro Pedroza",
        images: [],
        status: "available" as const,
      },
      {
        denomination: "Mod_Vaz-03",
        address: "Rua Salomão Awad, Quadra 11 Lote 10E",
        price: "210000.00" as any,
        description: "Módulo residencial com 60m² na Rua Salomão Awad",
        images: [],
        status: "available" as const,
      },
    ];

    for (const prop of propertiesData) {
      await db.insert(properties).values(prop);
    }
    console.log(`✅ ${propertiesData.length} imóveis inseridos`);

    // Inserir contatos do arquivo processado
    const contactsPath = "/home/ubuntu/processed_contacts.json";
    if (fs.existsSync(contactsPath)) {
      const contactsData = JSON.parse(fs.readFileSync(contactsPath, "utf-8"));
      
      // Inserir apenas os primeiros 100 contatos para teste
      const contactsToInsert = contactsData.slice(0, 100).map((c: any) => ({
        name: c.name || "Sem nome",
        phone: c.phone || "",
        email: c.email || null,
        status: "active" as const,
      })).filter((c: any) => c.phone);

      for (const contact of contactsToInsert) {
        try {
          await db.insert(contacts).values(contact);
        } catch (e) {
          // Ignorar duplicatas
        }
      }
      console.log(`✅ ${contactsToInsert.length} contatos inseridos`);
    }

    console.log("✨ População do banco de dados concluída!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Erro ao popular banco de dados:", error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

seedDatabase();
