/**
 * Visita marcada na conversa pelo robô (shared/visitaConversa.ts): oferece 3 horários livres e, na resposta do
 * cliente, grava a visita na agenda — opção oferecida = "agendada" (o horário está livre); outro dia/hora pedido pelo
 * cliente = "solicitada" (o corretor confirma). Avisa o corretor, sobe o lead para "Visita agendada" e pausa o follow-up.
 */
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { getDb } from '../db';
import { leadQualifications, leadVisitas, visitaOfertas } from '../../drizzle/schema';
import { diaValido, quandoDoPedido, type FaixaHorario } from '../../shared/agendamento';
import { escolhaPorNumero, faixaDaHora, falaDeDataOuHora, mensagemOpcoes, opcoesDeVisita, rotuloOpcao, type OpcaoVisita } from '../../shared/visitaConversa';

const H = 3_600_000;
const VALIDADE_OFERTA = 48 * H;
const banco = async () => { const d = await getDb(); if (!d) throw new Error('Banco indisponível'); return d as any; };

/** Leitura de "sábado às 9h" pela IA (injetável nos testes): dia AAAA-MM-DD e hora 0–23, ou null */
export const interpretador = {
  async claude(texto: string, hojeIso: string, diaSemana: string): Promise<{ dia: string | null; hora: number | null }> {
    if (!process.env.ANTHROPIC_API_KEY) return { dia: null, hora: null };
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ maxRetries: 0, timeout: 6000 });
    const resp: any = await client.beta.messages.create({
      model: process.env.ANTHROPIC_MODEL_CLASSIFICACAO || 'claude-haiku-5-5', max_tokens: 200,
      system: 'Você extrai a data e a hora de uma visita a partir da mensagem de WhatsApp de um cliente. Responda só com o JSON pedido.',
      messages: [{ role: 'user', content: `Hoje é ${diaSemana}, ${hojeIso} (Açailândia/MA). Qual dia (AAAA-MM-DD) e hora (0 a 23) o cliente pede para a visita? ` +
        `"de manhã" = 9, "à tarde" = 15, sem hora = null; sem dia claro = null.\n\nMensagem: """${texto.slice(0, 300)}"""` }],
      output_config: { format: { type: 'json_schema', schema: {
        type: 'object', properties: { dia: { type: ['string', 'null'] }, hora: { type: ['integer', 'null'] } }, required: ['dia', 'hora'], additionalProperties: false,
      } as any } },
    } as any);
    const bloco = resp.content?.find((b: any) => b.type === 'text');
    if (resp.stop_reason === 'refusal' || !bloco?.text) return { dia: null, hora: null };
    const j = JSON.parse(bloco.text);
    return { dia: typeof j.dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.dia) ? j.dia : null, hora: Number.isInteger(j.hora) ? j.hora : null };
  },
};

/** Faixas já tomadas por visitas abertas nos próximos 21 dias ("AAAA-MM-DD|08-10") */
async function faixasOcupadas(agora: number): Promise<Set<string>> {
  const d = await banco();
  const vs: any[] = await d.select({ quando: leadVisitas.quando }).from(leadVisitas)
    .where(and(inArray(leadVisitas.status, ['agendada', 'confirmada', 'solicitada']), gte(leadVisitas.quando, new Date(agora)), lte(leadVisitas.quando, new Date(agora + 21 * 24 * H)))).catch(() => []);
  const out = new Set<string>();
  for (const v of vs) {
    const t = new Date(v.quando).getTime() - 3 * H;
    const f = faixaDaHora(new Date(t).getUTCHours());
    if (f) out.add(`${new Date(t).toISOString().slice(0, 10)}|${f}`);
  }
  return out;
}

/** O cliente pediu visita: monta a mensagem com 3 horários e guarda a oferta (48 h) */
export async function ofertarHorarios(leadId: number, intro: string, agora = Date.now()): Promise<string> {
  const opcoes = opcoesDeVisita(agora, await faixasOcupadas(agora));
  if (!opcoes.length) return intro;
  const d = await banco();
  const valores = { opcoesJson: JSON.stringify(opcoes), expiraEm: new Date(agora + VALIDADE_OFERTA), criadoEm: new Date(agora) };
  const [ja]: any[] = await d.select({ leadId: visitaOfertas.leadId }).from(visitaOfertas).where(eq(visitaOfertas.leadId, leadId)).limit(1);
  if (ja) await d.update(visitaOfertas).set(valores as any).where(eq(visitaOfertas.leadId, leadId));
  else await d.insert(visitaOfertas).values({ leadId, ...valores } as any);
  return mensagemOpcoes(opcoes, intro);
}

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/**
 * Resposta do cliente a uma oferta de horários em aberto. null = não é sobre a visita (o robô segue o fluxo normal);
 * texto = o que responder (visita marcada, pedido anotado ou pedido de esclarecimento).
 */
export async function tratarRespostaDeVisita(lead: { id: number; nome?: string | null; responsavelId?: number | null; etapa?: string | null; stage?: string | null; funil?: string | null; phone: string },
  emp: { nome: string }, texto: string, agora = Date.now()): Promise<{ texto: string; visitaId: number | null; status: 'agendada' | 'solicitada' | null } | null> {
  const d = await banco();
  const [of]: any[] = await d.select().from(visitaOfertas).where(eq(visitaOfertas.leadId, lead.id)).limit(1);
  if (!of || new Date(of.expiraEm).getTime() < agora) return null;
  const opcoes: OpcaoVisita[] = JSON.parse(of.opcoesJson);
  const i = escolhaPorNumero(texto, opcoes.length);
  if (i != null) return marcar(lead, emp, opcoes[i], 'agendada', agora);
  if (!falaDeDataOuHora(texto)) return null;
  const hojeIso = new Date(agora - 3 * H).toISOString().slice(0, 10);
  const r = await interpretador.claude(texto, hojeIso, DIAS_SEMANA[new Date(`${hojeIso}T12:00:00Z`).getUTCDay()]).catch(() => ({ dia: null, hora: null }));
  const faixa = r.hora != null ? faixaDaHora(r.hora) : null;
  if (!r.dia || !faixa || !diaValido(r.dia, agora) || new Date(`${r.dia}T12:00:00Z`).getUTCDay() === 0 || quandoDoPedido(r.dia, faixa).getTime() < agora + 2 * H) {
    return { texto: 'Não consegui entender o dia e o horário 🙂 Responda com o número da opção (1, 2 ou 3) ou escreva o dia e a hora, por exemplo: "sábado às 9h". Atendemos de segunda a sábado, das 8h às 19h.', visitaId: null, status: null };
  }
  const oferecida = opcoes.find(o => o.dia === r.dia && o.horario === faixa);
  return marcar(lead, emp, { dia: r.dia, horario: faixa }, oferecida ? 'agendada' : 'solicitada', agora);
}

async function marcar(lead: { id: number; nome?: string | null; responsavelId?: number | null; etapa?: string | null; stage?: string | null; funil?: string | null; phone: string }, emp: { nome: string },
  o: OpcaoVisita, status: 'agendada' | 'solicitada', agora: number) {
  const d = await banco();
  const quando = quandoDoPedido(o.dia, o.horario as FaixaHorario);
  const r: any = await d.insert(leadVisitas).values({
    leadId: lead.id, quando, local: emp.nome, status, observacao: `Marcada pelo robô no WhatsApp — ${rotuloOpcao(o)}${status === 'solicitada' ? ' (horário pedido pelo cliente: confirmar)' : ''}`,
    responsavelId: lead.responsavelId ?? null, criadoPor: null, createdAt: new Date(agora), updatedAt: new Date(agora),
  } as any);
  const visitaId = Number(r?.[0]?.insertId ?? r?.insertId ?? r?.lastInsertRowid ?? 0) || null;
  await d.delete(visitaOfertas).where(eq(visitaOfertas.leadId, lead.id));
  const { etapaDepoisDaVisita, avisarVisitaAgendada, avisarPedidoDeAgendamento } = await import('../leads/visitas');
  const { etapaDoLead } = await import('../leads/kanban');
  if (status === 'agendada' && lead.funil !== 'proprietario') {
    const etapa = etapaDepoisDaVisita(etapaDoLead(lead as any), 'agendada');
    if (etapa) await d.update(leadQualifications).set({ etapa, updatedAt: new Date(agora) } as any).where(eq(leadQualifications.id, lead.id));
  }
  await import('../leads/followup').then(m => m.cancelarFollowUp(lead.phone)).catch(() => {});
  if (visitaId) {
    const aviso = status === 'agendada' ? avisarVisitaAgendada(visitaId) : avisarPedidoDeAgendamento(visitaId, `🗓️ Pedido de visita pelo WhatsApp (robô) — ${rotuloOpcao(o)}`);
    aviso.catch((e: any) => console.warn('[Visita/robô] aviso ao corretor:', e?.message));
  }
  const nome = String(lead.nome ?? '').trim().split(/\s+/)[0];
  const texto = status === 'agendada'
    ? `✅ Visita agendada${nome ? `, ${nome}` : ''}! *${rotuloOpcao(o)}*, no ${emp.nome}.\n\nO corretor vai te receber no stand de vendas e eu te lembro um dia antes. Se precisar mudar, é só me avisar por aqui.`
    : `Anotado${nome ? `, ${nome}` : ''}! Pedido de visita para *${rotuloOpcao(o)}*. O corretor confirma o horário com você em instantes por aqui.`;
  return { texto, visitaId, status };
}
