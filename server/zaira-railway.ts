// Health check da producao Railway. Bate em RAILWAY_PRODUCTION_URL e
// reporta status (latencia, status code, online/offline). Usado pelo loop
// autonomo pra detectar instabilidade e notificar via Telegram.

import axios from "axios";
import { ENV } from "./_core/env";

export async function getRailwayStatus(): Promise<{
  online: boolean;
  url: string;
  statusCode?: number;
  latencyMs?: number;
  error?: string;
  checkedAt: Date;
}> {
  const url = ENV.railwayProductionUrl;
  const start = Date.now();
  try {
    const res = await axios.get(url, {
      timeout: 10000,
      validateStatus: () => true,
    });
    const latency = Date.now() - start;
    return {
      online: res.status >= 200 && res.status < 500,
      url,
      statusCode: res.status,
      latencyMs: latency,
      checkedAt: new Date(),
    };
  } catch (e: any) {
    return {
      online: false,
      url,
      error: e?.message || "Falha de conexao",
      checkedAt: new Date(),
    };
  }
}

export function getEnvironmentInfo(): Record<string, any> {
  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    nodeVersion: process.version,
    platform: process.platform,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    railwayProjectId: process.env.RAILWAY_PROJECT_ID ?? null,
    railwayServiceId: process.env.RAILWAY_SERVICE_ID ?? null,
    railwayEnvironmentName: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
    deployedRegion: process.env.RAILWAY_REPLICA_REGION ?? null,
    flags: {
      campaignsEnabled: process.env.CAMPAIGNS_ENABLED !== "false",
      zairaEnabled: ENV.zairaEnabled,
      hasAnthropicKey: !!ENV.anthropicApiKey,
      hasGithubToken: !!ENV.githubToken,
    },
  };
}
