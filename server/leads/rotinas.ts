/**
 * Saúde das rotinas automáticas (follow-up e alerta de atendimento).
 *
 * Cada rodada registra quando rodou, se deu certo e se os envios do WhatsApp
 * estão falhando. Um vigia a cada 5 min avisa no Telegram quando uma rotina
 * para, falha seguidamente ou não consegue enviar — e avisa de novo quando volta.
 * /api/saude expõe o mesmo estado para um monitor externo (ex.: UptimeRobot).
 */

/** Linhas alteradas por um UPDATE (mysql2 devolve [ResultSetHeader]; SQLite, { changes }) */
export const linhasAfetadas = (r: any): number => Number(r?.[0]?.affectedRows ?? r?.affectedRows ?? r?.changes ?? 0);

export type Situacao = 'ok' | 'parada' | 'falhando' | 'sem_envio';

export interface EstadoRotina {
  nome: string;
  intervaloMs: number;
  iniciadaEm: number;
  ultimaRodada?: number;
  ultimoSucesso?: number;
  falhasSeguidas: number;
  ultimoErro?: string;
  falhasEnvioSeguidas: number;
  ultimoErroEnvio?: string;
  alertada?: Situacao;
}

export const ROTULO_ROTINA: Record<string, string> = {
  followup: 'Follow-up automático',
  sla: 'Alerta de atendimento (5 min)',
};

const ROTULO_SITUACAO: Record<Situacao, string> = {
  ok: 'funcionando',
  parada: 'parou de rodar',
  falhando: 'está dando erro em todas as rodadas',
  sem_envio: 'não está conseguindo enviar pelo WhatsApp',
};

/** Rodadas seguidas com erro, ou envios seguidos falhos, que contam como problema */
export const LIMITE_FALHAS = 3;

/** Situação da rotina agora (função pura) */
export function situacao(e: EstadoRotina, agora = Date.now()): Situacao {
  if (e.falhasSeguidas >= LIMITE_FALHAS) return 'falhando';
  if (e.falhasEnvioSeguidas >= LIMITE_FALHAS) return 'sem_envio';
  const referencia = e.ultimoSucesso ?? e.iniciadaEm;
  if (agora - referencia > 3 * e.intervaloMs) return 'parada';
  return 'ok';
}

/** Texto do alerta quando a situação mudou desde o último aviso; null = nada a avisar */
export function mudancaDeAlerta(e: EstadoRotina, agora = Date.now()): { texto: string; nova: Situacao } | null {
  const s = situacao(e, agora);
  const antes = e.alertada ?? 'ok';
  if (s === antes) return null;
  const rotulo = ROTULO_ROTINA[e.nome] ?? e.nome;
  if (s === 'ok') return { nova: s, texto: `✅ ${rotulo} voltou a funcionar.` };
  const erro = s === 'sem_envio' ? e.ultimoErroEnvio : s === 'falhando' ? e.ultimoErro : undefined;
  return { nova: s, texto: `🛑 ${rotulo} ${ROTULO_SITUACAO[s]}.${erro ? `\nÚltimo erro: ${erro.slice(0, 200)}` : ''}\nConfira o CRM e a conexão do WhatsApp (Z-API).` };
}

const rotinas = new Map<string, EstadoRotina>();

export function registrarRotina(nome: string, intervaloMs: number, agora = Date.now()): EstadoRotina {
  const e: EstadoRotina = rotinas.get(nome) ?? { nome, intervaloMs, iniciadaEm: agora, falhasSeguidas: 0, falhasEnvioSeguidas: 0 };
  e.intervaloMs = intervaloMs;
  rotinas.set(nome, e);
  return e;
}

/** Roda uma rodada da rotina registrando sucesso/erro (não deixa o erro escapar) */
export async function rodarRotina(nome: string, fn: () => Promise<unknown>): Promise<void> {
  const e = rotinas.get(nome) ?? registrarRotina(nome, 60_000);
  e.ultimaRodada = Date.now();
  try {
    await fn();
    e.ultimoSucesso = Date.now();
    e.falhasSeguidas = 0;
  } catch (err: any) {
    e.falhasSeguidas++;
    e.ultimoErro = String(err?.message ?? err);
    console.warn(`[Rotinas] ${nome}: rodada falhou (${e.falhasSeguidas}x): ${e.ultimoErro}`);
  }
}

export function registrarEnvio(nome: string, ok: boolean, erro?: string): void {
  const e = rotinas.get(nome);
  if (!e) return;
  if (ok) { e.falhasEnvioSeguidas = 0; return; }
  e.falhasEnvioSeguidas++;
  e.ultimoErroEnvio = erro;
}

/** Estado público (sem dados de lead) para o painel e para /api/saude */
export function estadoRotinas(agora = Date.now()) {
  const lista = Array.from(rotinas.values()).map(e => ({
    nome: e.nome,
    rotulo: ROTULO_ROTINA[e.nome] ?? e.nome,
    situacao: situacao(e, agora),
    ultimaRodada: e.ultimaRodada ? new Date(e.ultimaRodada).toISOString() : null,
    ultimoSucesso: e.ultimoSucesso ? new Date(e.ultimoSucesso).toISOString() : null,
    ultimoErro: e.falhasSeguidas ? e.ultimoErro ?? null : e.falhasEnvioSeguidas ? e.ultimoErroEnvio ?? null : null,
  }));
  return { ok: lista.every(r => r.situacao === 'ok'), rotinas: lista };
}

/** Uma passada do vigia: avisa no Telegram o que mudou */
export async function verificarRotinas(agora = Date.now()): Promise<string[]> {
  const avisos: string[] = [];
  for (const e of Array.from(rotinas.values())) {
    const m = mudancaDeAlerta(e, agora);
    if (!m) continue;
    e.alertada = m.nova;
    avisos.push(m.texto);
    console.warn(`[Rotinas] ${m.texto.replace(/\n/g, ' | ')}`);
  }
  if (avisos.length) {
    const { enviarTelegram } = await import('./notificacao');
    for (const t of avisos) await enviarTelegram(t).catch(() => {});
  }
  return avisos;
}

let vigia: NodeJS.Timeout | null = null;
export function iniciarVigiaRotinas(intervaloMs = 5 * 60_000) {
  if (vigia) return;
  vigia = setInterval(() => { verificarRotinas().catch(e => console.warn('[Rotinas] Vigia falhou:', e?.message)); }, intervaloMs);
  console.log('[Rotinas] Vigia das rotinas automáticas ativo');
}
