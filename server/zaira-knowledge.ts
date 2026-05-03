// Base de conhecimento in-memory da Zaira. Carregada no boot, com 10 entradas
// pre-cadastradas sobre Romatec/CRM. Pode ser estendida em runtime via tool
// add_knowledge (Claude armazena learnings da conversa aqui).

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: Date;
}

const _knowledge: KnowledgeEntry[] = [];

const SEED: Array<Omit<KnowledgeEntry, "id" | "createdAt">> = [
  {
    title: "Romatec — Identidade",
    content:
      "Romatec Consultoria Imobiliaria. CEO: Jose Romario Pinto Bezerra. Sede: Acailandia/MA. CNPJ: 12.091.853/0001-69. Atua com avaliacao imobiliaria, locacao, venda, contratos e CRM via WhatsApp.",
    tags: ["empresa", "ceo", "identidade"],
  },
  {
    title: "Stack do CRM WhatsApp",
    content:
      "Backend: Node.js 22 + Express + tRPC + Drizzle ORM + MySQL (Railway). Frontend: React 19 + Vite + Tailwind + shadcn/ui + wouter. Bot: Z-API + Claude/OpenAI fallback. Hospedagem: Railway us-west2.",
    tags: ["stack", "tecnologia", "crm"],
  },
  {
    title: "Equipe Romatec",
    content:
      "CEO: Jose Romario P. Bezerra (99 99181-1246). Especialista: Daniele Cavalcante Vieira (99 99206-2871). Daniele e a unica colaboradora real do CRM — nao usar nomes ficticios em listagens.",
    tags: ["equipe", "ceo", "daniele"],
  },
  {
    title: "Ecossistema Romatec",
    content:
      "3 sistemas integrados: 1) AvalieImob (SaaS de avaliacao, Python/FastAPI/MongoDB), 2) CRM WhatsApp (este sistema), 3) RomatecVoiceAgent/ZAYRA (assistente de voz, Node/TypeScript). ZAIRA e a agente desse CRM, ZAYRA e a assistente do CEO no VoiceAgent.",
    tags: ["sistemas", "ecossistema", "zayra", "zaira"],
  },
  {
    title: "Variaveis criticas Railway CRM",
    content:
      "DATABASE_URL (MySQL), ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN (Z-API), ANTHROPIC_API_KEY (Claude/Zaira), OPENAI_API_KEY (bot AI fallback), TELEGRAM_BOT_TOKEN, JWT_SECRET, ZAYRA_WEBHOOK_URL (fan-out CEO).",
    tags: ["env", "railway", "config"],
  },
  {
    title: "Limites do CRM",
    content:
      "Maximo 5 imoveis ativos por empresa em campanhas (definido pra controlar custo). Cadastro de imoveis e ilimitado, mas so 5 podem estar em campanhas simultaneas. Campaign envio em massa e gerenciado por CAMPAIGNS_ENABLED env var (true/false).",
    tags: ["limites", "imoveis", "campanhas"],
  },
  {
    title: "Fluxo do bot AI",
    content:
      "Webhook Z-API recebe mensagem -> parseWebhookPayload -> processBotMessage (server/bot-ai.ts) -> qualifica lead em qualification-flow -> resposta volta via sendMessageViaZAPI. Mensagens do CEO sao repassadas pra ZAYRA via webhook fan-out.",
    tags: ["bot", "fluxo", "webhook"],
  },
  {
    title: "Dominio publico de imoveis",
    content:
      "Pagina publica de imovel: /imovel/:slug (PropertyPublic.tsx). Catalogo: /imoveis (PropertiesCatalog.tsx). URL publica produzida em romateccrm.com.",
    tags: ["publico", "imoveis", "rota"],
  },
  {
    title: "Schema principal MySQL",
    content:
      "Tabelas: contacts (leads), campaigns, properties, messages (historico WhatsApp), users, leadQualifications, schedulerState, contactCampaignHistory, campaignContacts, companyConfig (tokens), zairaOperations (logs Zaira).",
    tags: ["schema", "mysql", "db"],
  },
  {
    title: "Tools disponiveis pra Zaira",
    content:
      "system_stats, lead_analysis, campaign_metrics, db_query (SELECT only), github_status, github_issues, github_workflows, railway_status, environment_info, search_knowledge, add_knowledge. Total: 11 tools.",
    tags: ["tools", "zaira"],
  },
];

let _initialized = false;

export function initKnowledge(): void {
  if (_initialized) return;
  for (const entry of SEED) {
    _knowledge.push({
      id: `kb_${_knowledge.length + 1}_${Date.now()}`,
      title: entry.title,
      content: entry.content,
      tags: entry.tags,
      createdAt: new Date(),
    });
  }
  _initialized = true;
  console.log(`[Zaira Knowledge] ${_knowledge.length} entradas carregadas`);
}

export function searchKnowledge(query?: string): KnowledgeEntry[] {
  if (!query) return [..._knowledge];
  const q = query.toLowerCase();
  return _knowledge.filter(
    (e) =>
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

export function addKnowledge(title: string, content: string, tags: string[] = []): KnowledgeEntry {
  const entry: KnowledgeEntry = {
    id: `kb_${_knowledge.length + 1}_${Date.now()}`,
    title,
    content,
    tags,
    createdAt: new Date(),
  };
  _knowledge.push(entry);
  return entry;
}

export function getAllKnowledge(): KnowledgeEntry[] {
  return [..._knowledge];
}
