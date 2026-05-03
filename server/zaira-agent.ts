// ZAIRA — agente Claude com tool calling. Conversa com usuario via /zaira
// e tem acesso a 11 tools que cobrem MySQL (SELECT), GitHub, Railway e
// knowledge base in-memory. Claude e chamado via HTTP direto (axios) — sem
// SDK. Modelo padrao: claude-sonnet-4-5; pode trocar via ZAIRA_MODEL env.

import axios from "axios";
import { ENV } from "./_core/env";
import { addKnowledge, searchKnowledge } from "./zaira-knowledge";
import {
  getCampaignMetrics,
  getLeadAnalysis,
  getSystemStats,
  runSafeQuery,
} from "./zaira-db-access";
import { getOpenIssues, getRecentWorkflows, getRepoStatus } from "./zaira-github";
import { getEnvironmentInfo, getRailwayStatus } from "./zaira-railway";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ZAIRA_MODEL ?? "claude-sonnet-4-5-20250929";
const MAX_TOKENS = 4096;
const MAX_TOOL_LOOPS = 6;

const SYSTEM_PROMPT = `Voce e ZAIRA — Zona de Automacao e Insights da Romatec Agent. Agente autonoma do CRM WhatsApp da Romatec Consultoria Imobiliaria, supervisionada pelo CEO Jose Romario.

Seu trabalho:
1. Responder perguntas sobre o CRM (leads, campanhas, imoveis, mensagens)
2. Monitorar producao (Railway, GitHub Actions, base MySQL)
3. Acumular conhecimento via add_knowledge quando aprender algo util
4. Sugerir acoes mas NUNCA executar nada destrutivo (so SELECT no DB)

Personalidade: direta, tecnica, executiva. Use markdown leve. Em portugues do Brasil.

Voce tem 11 tools. Use-as proativamente — nao peca permissao pra ler dados publicos.`;

interface AgentTool {
  name: string;
  description: string;
  input_schema: any;
  run: (args: any) => Promise<any>;
}

const TOOLS: AgentTool[] = [
  {
    name: "system_stats",
    description: "Retorna contagens gerais do CRM: contatos, campanhas, imoveis, mensagens 24h, leads qualificados 7d.",
    input_schema: { type: "object", properties: {} },
    run: async () => getSystemStats(),
  },
  {
    name: "lead_analysis",
    description: "Analisa leads: distribuicao por status/temperatura e os 10 mais recentes.",
    input_schema: { type: "object", properties: {} },
    run: async () => getLeadAnalysis(),
  },
  {
    name: "campaign_metrics",
    description: "Metricas de campanhas: enviados, entregues, respostas e top 5.",
    input_schema: { type: "object", properties: {} },
    run: async () => getCampaignMetrics(),
  },
  {
    name: "db_query",
    description: "Executa um SELECT no MySQL. APENAS SELECT — qualquer outro comando e rejeitado. Limite de 100 linhas.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "SQL SELECT statement" } },
      required: ["query"],
    },
    run: async (args: any) => runSafeQuery(String(args.query ?? "")),
  },
  {
    name: "github_status",
    description: "Status do repo no GitHub: branch padrao, ultimo push, issues abertas, stars.",
    input_schema: { type: "object", properties: {} },
    run: async () => getRepoStatus(),
  },
  {
    name: "github_issues",
    description: "Lista issues abertas no repo. Limite padrao 10.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
    run: async (args: any) => getOpenIssues(Number(args?.limit ?? 10)),
  },
  {
    name: "github_workflows",
    description: "Ultimas execucoes de GitHub Actions (status, conclusao, branch).",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
    run: async (args: any) => getRecentWorkflows(Number(args?.limit ?? 10)),
  },
  {
    name: "railway_status",
    description: "Health check da producao Railway (URL, status code, latencia).",
    input_schema: { type: "object", properties: {} },
    run: async () => getRailwayStatus(),
  },
  {
    name: "environment_info",
    description: "Info do ambiente: Node, plataforma, uptime, memoria, flags ativas.",
    input_schema: { type: "object", properties: {} },
    run: async () => getEnvironmentInfo(),
  },
  {
    name: "search_knowledge",
    description: "Busca na base de conhecimento Romatec. Sem query, retorna tudo.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
    },
    run: async (args: any) => searchKnowledge(args?.query),
  },
  {
    name: "add_knowledge",
    description: "Adiciona uma entrada na base de conhecimento. Use pra guardar fatos uteis aprendidos.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["title", "content"],
    },
    run: async (args: any) =>
      addKnowledge(String(args.title), String(args.content), Array.isArray(args.tags) ? args.tags : []),
  },
];

const _conversationHistory = new Map<string, Array<{ role: "user" | "assistant"; content: any }>>();

export function clearConversation(sessionId: string): void {
  _conversationHistory.delete(sessionId);
}

export interface ChatResult {
  response: string;
  toolsUsed: string[];
  error?: string;
}

export async function chatWithZaira(message: string, sessionId = "default"): Promise<ChatResult> {
  if (!ENV.anthropicApiKey) {
    return {
      response: "ANTHROPIC_API_KEY nao configurado no Railway. ZAIRA precisa dessa chave para funcionar.",
      toolsUsed: [],
      error: "no_api_key",
    };
  }

  const history = _conversationHistory.get(sessionId) ?? [];
  history.push({ role: "user", content: message });

  const toolsUsed: string[] = [];
  let finalText = "";

  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    let res: any;
    try {
      res = await axios.post(
        ANTHROPIC_API,
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          tools: TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema,
          })),
          messages: history,
        },
        {
          headers: {
            "x-api-key": ENV.anthropicApiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          timeout: 60000,
        },
      );
    } catch (e: any) {
      const errMsg = e?.response?.data?.error?.message || e?.message || "Erro Anthropic";
      console.error("[Zaira] Erro Claude:", errMsg);
      return {
        response: `Erro ao contatar Claude: ${errMsg}`,
        toolsUsed,
        error: "anthropic_error",
      };
    }

    const blocks = res.data?.content ?? [];
    history.push({ role: "assistant", content: blocks });

    const stopReason = res.data?.stop_reason;
    const textBlocks = blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    finalText = textBlocks || finalText;

    if (stopReason !== "tool_use") break;

    const toolUseBlocks = blocks.filter((b: any) => b.type === "tool_use");
    if (toolUseBlocks.length === 0) break;

    const toolResults: any[] = [];
    for (const tu of toolUseBlocks) {
      toolsUsed.push(tu.name);
      const tool = TOOLS.find((t) => t.name === tu.name);
      let toolOutput: any;
      if (!tool) {
        toolOutput = { error: `Tool desconhecida: ${tu.name}` };
      } else {
        try {
          toolOutput = await tool.run(tu.input ?? {});
        } catch (e: any) {
          toolOutput = { error: e?.message || "Erro ao executar tool" };
        }
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(toolOutput).slice(0, 8000),
      });
    }

    history.push({ role: "user", content: toolResults });
  }

  if (history.length > 30) {
    history.splice(0, history.length - 30);
  }
  _conversationHistory.set(sessionId, history);

  return {
    response: finalText || "(sem resposta de Claude)",
    toolsUsed: Array.from(new Set(toolsUsed)),
  };
}
