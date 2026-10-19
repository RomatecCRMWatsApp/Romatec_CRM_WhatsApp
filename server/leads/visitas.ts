/**
 * Agenda de visitas (Fase 2).
 *
 * - O corretor agenda a visita na tela do lead; o lead vai para "Visita agendada"
 *   e o responsável recebe o aviso.
 * - Véspera (até 24 h antes, se a visita foi marcada com pelo menos 12 h de antecedência):
 *   lembrete ao cliente pedindo para confirmar com SIM. "Sim" → visita confirmada.
 * - 2 h antes: lembrete ao corretor.
 * - 3 h depois, se ninguém marcou o resultado: o CRM pergunta ao corretor como foi.
 * - Realizada → lead em "Visitou". Sem preço e sem escassez nas mensagens.
 * Cada aviso sai uma vez (reserva com UPDATE condicional — sem duplicidade).
 */
import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { appUrl } from './config';

export const STATUS_VISITA = ['agendada', 'confirmada', 'realizada', 'nao_veio', 'cancelada'] as const;
export type StatusVisita = typeof STATUS_VISITA[number];
export const ROTULO_STATUS_VISITA: Record<StatusVisita, string> = {
  agendada: 'Agendada', confirmada: 'Confirmada', realizada: 'Realizada', nao_veio: 'Não veio', cancelada: 'Cancelada',
};
export const ABERTAS: StatusVisita[] = ['agendada', 'confirmada'];

const H = 3600_000;
const FUSO = 3 * H; // UTC-3

/** Etapa do funil comprador depois de agendar/realizar a visita (null = não mexe) */
export function etapaDepoisDaVisita(etapaAtual: string | null | undefined, status: StatusVisita): string | null {
  const ordem = ['novo', 'qualificando', 'qualificado', 'visita_agendada', 'visitou', 'proposta', 'fechado'];
  const atual = ordem.indexOf(String(etapaAtual || 'novo'));
  if (etapaAtual === 'perdido') return null;
  const alvo = status === 'realizada' ? 'visitou' : (status === 'agendada' || status === 'confirmada') ? 'visita_agendada' : null;
  if (!alvo) return null;
  return atual < ordem.indexOf(alvo) ? alvo : null;
}

export type AcaoVisita = 'lembrar_cliente' | 'avisar_corretor' | 'pedir_resultado';

export interface VisitaAgenda {
  status: string;
  quando: Date | string | number;
  createdAt?: Date | string | number | null;
  lembreteClienteAt?: unknown;
  avisoCorretorAt?: unknown;
  resultadoPedidoAt?: unknown;
}

const ms = (d: Date | string | number) => new Date(d).getTime();
const horaLocal = (t: number) => new Date(t - FUSO).getUTCHours();

/** Avisos devidos agora para esta visita (função pura) */
export function acoesDaVisita(v: VisitaAgenda, agora = Date.now()): AcaoVisita[] {
  if (!ABERTAS.includes(v.status as StatusVisita)) return [];
  const q = ms(v.quando);
  const falta = q - agora;
  const out: AcaoVisita[] = [];
  const antecedencia = v.createdAt ? q - ms(v.createdAt) : Infinity;
  const h = horaLocal(agora);
  if (!v.lembreteClienteAt && v.status === 'agendada' && falta <= 24 * H && falta >= 2 * H && antecedencia >= 12 * H && h >= 8 && h < 20) {
    out.push('lembrar_cliente');
  }
  if (!v.avisoCorretorAt && falta <= 2 * H && falta > 0) out.push('avisar_corretor');
  if (!v.resultadoPedidoAt && agora - q >= 3 * H) out.push('pedir_resultado');
  return out;
}

/** "hoje às 15h", "amanhã às 9h30", "sexta, 24/10 às 10h" — no fuso do Maranhão */
export function quandoPorExtenso(quando: Date | string | number, agora = Date.now()): string {
  const q = new Date(ms(quando) - FUSO), a = new Date(agora - FUSO);
  const dia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dif = Math.round((dia(q) - dia(a)) / (24 * H));
  const hh = q.getUTCHours(), mm = q.getUTCMinutes();
  const hora = `${hh}h${mm ? String(mm).padStart(2, '0') : ''}`;
  if (dif === 0) return `hoje às ${hora}`;
  if (dif === 1) return `amanhã às ${hora}`;
  const semana = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][q.getUTCDay()];
  return `${semana}, ${String(q.getUTCDate()).padStart(2, '0')}/${String(q.getUTCMonth() + 1).padStart(2, '0')} às ${hora}`;
}

const primeiro = (nome?: string | null) => {
  const p = String(nome || '').trim().split(/\s+/)[0] || '';
  return /^[A-Za-zÀ-ÿ]{2,20}$/.test(p) && !/^cliente$/i.test(p) ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
};

/** Lembrete ao cliente (sem preço, sem escassez) */
export function mensagemLembrete(p: { nome?: string | null; quando: Date | string | number; local?: string | null; imovel?: string | null }, agora = Date.now()): string {
  const fn = primeiro(p.nome);
  const onde = [p.imovel, p.local].filter(Boolean).join(' — ');
  return [
    `Oi${fn ? `, ${fn}` : ''}! Passando para lembrar da sua visita ${quandoPorExtenso(p.quando, agora)}${onde ? ` (${onde})` : ''}. 🏡`,
    `Pode confirmar? Responda *SIM* para confirmar, ou me diga um novo horário se precisar remarcar.`,
  ].join('\n');
}

/** A resposta do cliente confirma a visita? */
export function respostaConfirma(texto: string | null | undefined): boolean {
  return /^\s*(sim|s|confirmo|confirmad[oa]|ok|okay|pode ser|vou sim|vou|estarei l[aá]|combinado|certo|beleza|blz|👍)(?![A-Za-zÀ-ÿ])[\s!.,👍]*$/i.test(String(texto || ''));
}

// ─── Banco e avisos ──────────────────────────────────────────────────────────
async function banco() {
  const { getDb } = await import('../db');
  const s = await import('../../drizzle/schema');
  return { db: await getDb() as any, ...s };
}

/** Avisa o corretor da visita (WhatsApp do responsável; sem telefone, NOTIFY_PHONES) e o Telegram */
async function avisarCorretor(responsavelId: number | null | undefined, texto: string) {
  const { db, users } = await banco();
  const { enviarTexto } = await import('./zapiClient');
  const { enviarTelegram } = await import('./notificacao');
  const { telefonesNotificacao } = await import('./config');
  let fones: string[] = [];
  if (responsavelId && db) {
    const [u]: any[] = await db.select({ telefone: users.telefone }).from(users).where(eq(users.id, responsavelId)).limit(1);
    const f = String(u?.telefone || '').replace(/\D/g, '');
    if (f.length >= 10) fones = [f.startsWith('55') ? f : `55${f}`];
  }
  if (!fones.length) fones = telefonesNotificacao();
  const { registrarEnvio } = await import('./rotinas');
  for (const f of fones) {
    await enviarTexto(f, texto).then(() => registrarEnvio('visitas', true)).catch(e => {
      registrarEnvio('visitas', false, String(e?.message ?? e));
      console.warn('[Visitas] WhatsApp do corretor falhou:', e?.message);
    });
  }
  await enviarTelegram(texto).catch(() => {});
}

/** Linha "Nome · telefone · imóvel" para os avisos internos */
function resumo(v: any) {
  const fone = String(v.phone || '').replace(/\D/g, '');
  return `${v.nome || 'Lead'} · +${fone}${v.imovel ? ` · ${v.imovel}` : ''}${v.local ? ` · ${v.local}` : ''}`;
}

/** Aviso ao responsável quando a visita é agendada */
export async function avisarVisitaAgendada(visitaId: number): Promise<void> {
  const v = await carregar(visitaId);
  if (!v) return;
  await avisarCorretor(v.responsavelId, `📅 Visita agendada ${quandoPorExtenso(v.quando)}\n${resumo(v)}\n🔗 ${appUrl()}/leads/lead/${v.leadId}`);
}

async function carregar(visitaId: number): Promise<any | null> {
  const { db, leadVisitas, leadQualifications, properties } = await banco();
  if (!db) return null;
  const [v]: any[] = await db.select().from(leadVisitas).where(eq(leadVisitas.id, visitaId)).limit(1);
  if (!v) return null;
  const [l]: any[] = await db.select({ nome: leadQualifications.nome, phone: leadQualifications.phone }).from(leadQualifications).where(eq(leadQualifications.id, v.leadId)).limit(1);
  let imovel: string | null = null;
  if (v.propertyId) {
    const [p]: any[] = await db.select({ t: properties.denomination }).from(properties).where(eq(properties.id, v.propertyId)).limit(1);
    imovel = p?.t ?? null;
  }
  return { ...v, nome: l?.nome, phone: l?.phone, imovel };
}

/** Uma rodada: lembretes, aviso ao corretor e pedido de resultado */
export async function processarVisitas(agora = Date.now()): Promise<number> {
  const { db, leadVisitas } = await banco();
  if (!db) return 0;
  const { linhasAfetadas } = await import('./rotinas');
  const abertas: any[] = await db.select({ id: leadVisitas.id }).from(leadVisitas)
    .where(and(inArray(leadVisitas.status, ABERTAS), gte(leadVisitas.quando, new Date(agora - 2 * 24 * H)), lte(leadVisitas.quando, new Date(agora + 25 * H))))
    .limit(100);
  let n = 0;
  for (const { id } of abertas) {
    const v = await carregar(id);
    if (!v) continue;
    for (const acao of acoesDaVisita(v, agora)) {
      const coluna = acao === 'lembrar_cliente' ? 'lembreteClienteAt' : acao === 'avisar_corretor' ? 'avisoCorretorAt' : 'resultadoPedidoAt';
      // Reserva: só um servidor manda cada aviso
      const r = await db.update(leadVisitas).set({ [coluna]: new Date(agora) } as any)
        .where(and(eq(leadVisitas.id, id), isNull((leadVisitas as any)[coluna])));
      if (linhasAfetadas(r) === 0) continue;
      if (acao === 'lembrar_cliente') {
        const texto = mensagemLembrete({ nome: v.nome, quando: v.quando, local: v.local, imovel: v.imovel }, agora);
        try {
          const { enviarTexto } = await import('./zapiClient');
          await enviarTexto(v.phone, texto);
          const { registrarMensagem } = await import('./qualificacaoService');
          await registrarMensagem(v.leadId, 'out', 'sistema', texto);
        } catch (e: any) {
          console.warn(`[Visitas] Lembrete da visita ${id} não enviado: ${e?.message}`);
        }
      } else if (acao === 'avisar_corretor') {
        await avisarCorretor(v.responsavelId, `⏰ Visita ${quandoPorExtenso(v.quando, agora)}${v.status === 'confirmada' ? ' (confirmada ✅)' : ''}\n${resumo(v)}\n💬 https://wa.me/${String(v.phone).replace(/\D/g, '')}`);
      } else {
        await avisarCorretor(v.responsavelId, `📝 Como foi a visita de ${v.nome || 'Lead'}? Marque no CRM (realizada / não veio):\n${appUrl()}/leads/lead/${v.leadId}`);
      }
      n++;
    }
  }
  return n;
}

/** Resposta do cliente ao lembrete: "sim" confirma a visita. Devolve o texto de resposta ou null. */
export async function confirmarPorResposta(phone: string, texto: string, agora = Date.now()): Promise<string | null> {
  if (!respostaConfirma(texto)) return null;
  const { db, leadVisitas, leadQualifications } = await banco();
  if (!db) return null;
  const fone = phone.replace(/\D/g, '');
  const [l]: any[] = await db.select({ id: leadQualifications.id }).from(leadQualifications).where(eq(leadQualifications.phone, fone)).limit(1);
  if (!l) return null;
  const [v]: any[] = await db.select().from(leadVisitas)
    .where(and(eq(leadVisitas.leadId, l.id), eq(leadVisitas.status, 'agendada'), gte(leadVisitas.quando, new Date(agora))))
    .orderBy(leadVisitas.quando).limit(1);
  if (!v || !v.lembreteClienteAt) return null; // só vale como resposta ao lembrete
  await db.update(leadVisitas).set({ status: 'confirmada', confirmadaAt: new Date(agora), updatedAt: new Date(agora) } as any).where(eq(leadVisitas.id, v.id));
  const completo = await carregar(v.id);
  await avisarCorretor(v.responsavelId, `✅ Visita confirmada pelo cliente — ${quandoPorExtenso(v.quando, agora)}\n${resumo(completo ?? v)}`).catch(() => {});
  const resposta = `Confirmado! ✅ Te esperamos ${quandoPorExtenso(v.quando, agora)}. Se precisar remarcar, é só me avisar por aqui.`;
  const { registrarMensagem } = await import('./qualificacaoService');
  await registrarMensagem(l.id, 'in', 'lead', texto);
  await registrarMensagem(l.id, 'out', 'sistema', resposta);
  return resposta;
}

let timer: NodeJS.Timeout | null = null;
export function iniciarJobVisitas(intervaloMs = 5 * 60_000) {
  if (timer) return;
  import('./rotinas').then(({ registrarRotina, rodarRotina, ROTULO_ROTINA }) => {
    ROTULO_ROTINA.visitas = 'Lembretes de visita';
    registrarRotina('visitas', intervaloMs);
    timer = setInterval(() => { void rodarRotina('visitas', () => processarVisitas()); }, intervaloMs);
  }).catch(e => console.warn('[Visitas] Job não iniciado:', e?.message));
  console.log('[Visitas] Lembretes de visita ativos (véspera, 2 h antes e resultado)');
}
