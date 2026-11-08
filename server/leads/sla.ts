/**
 * Responsável pelo lead e prazo de atendimento humano (Fase 1).
 *
 * - Lead novo ganha um responsável: rodízio entre quem tem "recebe leads" na
 *   tela Equipe; sem ninguém, o administrador.
 * - Quando o lead precisa de gente (quente, pediu corretor, quer visita,
 *   qualificação completa, empreendimento/proprietário), o relógio começa e o
 *   aviso leva o link "✅ Já atendi".
 * - 5 min sem atendimento → novo alerta; 15 min → passa para o próximo da roleta
 *   (ou avisa o administrador); 60 min → último alerta ao administrador.
 * - Alertas só entre 7h e 21h (Maranhão).
 */
import crypto from 'crypto';
import { and, asc, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { appUrl } from './config';
import type { TipoAviso } from './notificacao';

export const MIN = 60_000;
const FUSO = 3 * 3600_000;

/** Tipos de aviso que pedem uma pessoa respondendo */
export function precisaDeGente(tipo: TipoAviso, ctx: { funil?: string | null; empreendimento?: boolean } = {}): boolean {
  if (['quente', 'visita', 'avaliacao', 'humano', 'completa'].includes(tipo)) return true;
  return tipo === 'novo_lead' && (ctx.funil === 'proprietario' || !!ctx.empreendimento);
}

export type AcaoSla = 'nada' | 'lembrar' | 'repassar' | 'avisar_admin';

/** O que fazer agora com um lead esperando há `minutos` (nível = alertas já dados) */
export function acaoSla(minutos: number, nivel: number): AcaoSla {
  if (nivel <= 0 && minutos >= 5) return 'lembrar';
  if (nivel === 1 && minutos >= 15) return 'repassar';
  if (nivel === 2 && minutos >= 60) return 'avisar_admin';
  return 'nada';
}

export function horarioDeAlerta(t = Date.now()): boolean {
  const h = new Date(t - FUSO).getUTCHours();
  return h >= 7 && h < 21;
}

/** Escolhe o próximo da roleta: quem recebeu lead há mais tempo (nunca recebeu = primeiro) */
export function escolherResponsavel<T extends { id: number; ultimoLeadAt?: Date | string | null }>(candidatos: T[], excluir?: number | null): T | null {
  const lista = candidatos.filter(c => c.id !== excluir);
  if (!lista.length) return null;
  return [...lista].sort((a, b) => (a.ultimoLeadAt ? new Date(a.ultimoLeadAt).getTime() : 0) - (b.ultimoLeadAt ? new Date(b.ultimoLeadAt).getTime() : 0) || a.id - b.id)[0];
}

// ─── Link "Já atendi" ────────────────────────────────────────────────────────
// Sem segredo em produção, falha (os links /a/ e /w/ seriam forjáveis com o valor padrão do código-fonte)
const segredo = () => process.env.JWT_SECRET || process.env.SESSION_SECRET || (() => { if (process.env.NODE_ENV === 'production') throw new Error('Defina JWT_SECRET: sem ele os links assinados poderiam ser forjados'); return 'romatec-sla'; })();
/** Token do link "Já atendi"/"Atender no WhatsApp": amarrado ao lead e a quem recebeu o aviso (paraId) */
export function tokenAtendido(leadId: number, paraId?: number | null): string {
  return crypto.createHmac('sha256', segredo()).update(paraId ? `atendido:${leadId}:${paraId}` : `atendido:${leadId}`).digest('hex').slice(0, 20);
}
export function tokenAtendidoValido(leadId: number, token: string, paraId?: number | null): boolean {
  const esperado = tokenAtendido(leadId, paraId);
  return token.length === esperado.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(esperado));
}

/**
 * O link ainda vale para quem o recebeu? Quando o lead passa para outro corretor, os links do aviso do anterior
 * (Atender no WhatsApp, Já atendi) deixam de valer. O administrador sempre pode usar os dele.
 * Link antigo, sem destinatário: só vale se o lead nunca foi repassado.
 */
export async function linkAtendidoAindaVale(leadId: number, paraId: number | null): Promise<boolean> {
  const { getDb } = await import('../db');
  const d: any = await getDb();
  if (!d) return true;
  const { leadQualifications, leadEncaminhamentos, users } = await import('../../drizzle/schema');
  if (paraId) {
    const [l]: any[] = await d.select({ responsavelId: leadQualifications.responsavelId }).from(leadQualifications).where(eq(leadQualifications.id, leadId)).limit(1);
    if (!l) return false;
    if (Number(l.responsavelId) === paraId) return true;
    const [u]: any[] = await d.select({ role: users.role, perfil: (users as any).perfil }).from(users).where(eq(users.id, paraId)).limit(1);
    return !!u && (u.role === 'admin' || u.perfil === 'admin');
  }
  const [rep]: any[] = await d.select({ id: leadEncaminhamentos.id }).from(leadEncaminhamentos)
    .where(and(eq(leadEncaminhamentos.leadId, leadId), eq(leadEncaminhamentos.desfecho, 'repassado'))).limit(1);
  return !rep;
}
/** "✅ Confirmar recebimento" do aviso de encaminhamento: 1 toque, sem login (link assinado por encaminhamento) */
export function tokenRecebido(encaminhamentoId: number): string {
  return crypto.createHmac('sha256', segredo()).update(`recebido:${encaminhamentoId}`).digest('hex').slice(0, 20);
}
export function tokenRecebidoValido(encaminhamentoId: number, token: string): boolean {
  const esperado = tokenRecebido(encaminhamentoId);
  return token.length === esperado.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(esperado));
}
export const linkRecebido = (encaminhamentoId: number) => `${appUrl()}/c/${encaminhamentoId}/${tokenRecebido(encaminhamentoId)}`;
const destinatario = (paraId?: number | null) => (paraId ? `?u=${paraId}` : '');
export const linkAtendido = (leadId: number, paraId?: number | null) => `${appUrl()}/a/${leadId}/${tokenAtendido(leadId, paraId)}${destinatario(paraId)}`;
/** "Atender no WhatsApp" do aviso: passa pelo CRM (marca o atendimento) e abre a conversa com o cliente */
export const linkWhatsAppAtendido = (leadId: number, paraId?: number | null) => `${appUrl()}/w/${leadId}/${tokenAtendido(leadId, paraId)}${destinatario(paraId)}`;

/** Robôs de pré-visualização de link (WhatsApp, Telegram, Facebook…) não contam como atendimento */
export function ehRoboDePrevia(ua: string | null | undefined): boolean {
  return /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|curl|wget|python-requests|node-fetch|axios/i.test(String(ua ?? ''));
}

export type ComoAtendeu = 'whatsapp_aviso' | 'whatsapp_crm' | 'encaminhado';

// ─── Banco ───────────────────────────────────────────────────────────────────
async function banco() {
  const { getDb } = await import('../db');
  const db = await getDb();
  const s = await import('../../drizzle/schema');
  return { db, leadQualifications: s.leadQualifications, users: s.users };
}

async function candidatos(db: any, users: any) {
  const todos: any[] = await db.select({ id: users.id, name: users.name, telefone: users.telefone, role: users.role, perfil: users.perfil, ativo: users.ativo, recebeLeads: users.recebeLeads, ultimoLeadAt: users.ultimoLeadAt }).from(users);
  const ativos = todos.filter(u => u.ativo !== false && u.ativo !== 0 && u.perfil !== 'empreendedor');
  const roleta = ativos.filter(u => u.recebeLeads === true || u.recebeLeads === 1);
  const admin = ativos.find(u => u.role === 'admin') ?? null;
  return { roleta, admin, todos: ativos };
}

/** Garante um responsável para o lead (rodízio); devolve o responsável */
export async function garantirResponsavel(leadId: number): Promise<{ id: number; name?: string | null; telefone?: string | null } | null> {
  const { db, leadQualifications, users } = await banco();
  if (!db || !leadId) return null;
  const [lead]: any[] = await db.select({ responsavelId: leadQualifications.responsavelId }).from(leadQualifications).where(eq(leadQualifications.id, leadId)).limit(1);
  if (!lead) return null;
  const { roleta, admin, todos } = await candidatos(db, users);
  if (lead.responsavelId) return todos.find(u => u.id === lead.responsavelId) ?? null;
  // Distribuição manual: ninguém é escolhido sozinho — o lead fica em Leads › Distribuição › Não encaminhados
  if ((await (await import('../configSistema')).modoDistribuicao()) === 'manual') return null;
  const escolhido = escolherResponsavel(roleta) ?? admin;
  if (!escolhido) return null;
  await db.update(leadQualifications).set({ responsavelId: escolhido.id } as any).where(eq(leadQualifications.id, leadId));
  await db.update(users).set({ ultimoLeadAt: new Date() } as any).where(eq(users.id, escolhido.id));
  const { registrarEncaminhamento } = await import('./distribuicao');
  await registrarEncaminhamento({ leadId, deId: null, paraId: escolhido.id, origem: 'automatico', observacao: 'Roleta: lead novo' });
  return escolhido;
}

/** Começa a contar o prazo de atendimento (não reinicia se já está esperando) */
export async function aguardarCorretor(leadId: number): Promise<void> {
  const { db, leadQualifications } = await banco();
  if (!db) return;
  await db.update(leadQualifications)
    .set({ aguardandoCorretorDesde: new Date(), atendidoAt: null, alertaSlaNivel: 0 } as any)
    .where(and(eq(leadQualifications.id, leadId), isNull(leadQualifications.aguardandoCorretorDesde)));
}

/** Corretor atendeu (link "Já atendi" ou ação no CRM) */
export async function marcarAtendido(leadId: number): Promise<void> {
  const { db, leadQualifications } = await banco();
  if (!db) return;
  await db.update(leadQualifications)
    .set({ atendidoAt: new Date(), aguardandoCorretorDesde: null, alertaSlaNivel: 0 } as any)
    .where(eq(leadQualifications.id, leadId));
}

/**
 * Atendimento automático: abriu o WhatsApp do cliente (link do aviso ou botão do CRM) ou a secretária/admin
 * encaminhou para um corretor. Encerra o alerta de 5 min, tira o card de "Novo" e registra no histórico.
 */
export async function registrarAtendimento(leadId: number, o: { como: ComoAtendeu; usuarioId?: number | null; paraId?: number | null }): Promise<{ phone: string } | null> {
  const { db, leadQualifications } = await banco();
  if (!db || !leadId) return null;
  const [l]: any[] = await db.select({ id: leadQualifications.id, phone: leadQualifications.phone, etapa: leadQualifications.etapa, stage: leadQualifications.stage, funil: leadQualifications.funil })
    .from(leadQualifications).where(eq(leadQualifications.id, leadId)).limit(1);
  if (!l) return null;
  await marcarAtendido(leadId);
  // Abrir a conversa pelo aviso (ou atender pelo CRM) também confirma o recebimento do encaminhamento em aberto
  if (o.como !== 'encaminhado') {
    try {
      const { leadEncaminhamentos } = await import('../../drizzle/schema');
      const { isNull } = await import('drizzle-orm');
      await db.update(leadEncaminhamentos).set({ recebidoEm: new Date() } as any).where(and(eq(leadEncaminhamentos.leadId, leadId), isNull(leadEncaminhamentos.desfecho), isNull(leadEncaminhamentos.recebidoEm),
        ...(o.usuarioId ? [eq(leadEncaminhamentos.paraId, o.usuarioId)] : [])));
    } catch (e: any) { console.warn('[SLA] confirmar recebimento:', e?.message); }
  }
  const { etapaDoLead } = await import('./kanban');
  if (etapaDoLead(l) === 'novo') {
    await db.update(leadQualifications).set({ etapa: 'qualificando', updatedAt: new Date() } as any).where(eq(leadQualifications.id, leadId)).catch(() => {});
  }
  const { leadEventos } = await import('../../drizzle/schema');
  await db.insert(leadEventos).values({
    leadId, tipo: o.como === 'encaminhado' ? 'encaminhado' : 'atendido_whatsapp',
    dados: { como: o.como, usuarioId: o.usuarioId ?? null, paraId: o.paraId ?? null }, createdAt: new Date(),
  } as any).catch(() => {});
  return { phone: String(l.phone ?? '') };
}

/** Telefone para o aviso por WhatsApp: o do responsável, se tiver */
export async function telefoneDoResponsavel(leadId: number): Promise<string | null> {
  const { db, leadQualifications, users } = await banco();
  if (!db || !leadId) return null;
  const [l]: any[] = await db.select({ r: leadQualifications.responsavelId }).from(leadQualifications).where(eq(leadQualifications.id, leadId)).limit(1);
  if (!l?.r) return null;
  const [u]: any[] = await db.select({ telefone: users.telefone }).from(users).where(eq(users.id, l.r)).limit(1);
  const f = String(u?.telefone || '').replace(/\D/g, '');
  return f.length >= 10 ? (f.startsWith('55') ? f : `55${f}`) : null;
}

/** Uma rodada: alerta, repassa ou avisa o administrador */
export async function processarSla(agora = Date.now()): Promise<number> {
  if (!horarioDeAlerta(agora)) return 0;
  const { db, leadQualifications, users } = await banco();
  if (!db) return 0;
  const esperando: any[] = await db.select().from(leadQualifications)
    // Sem os que já tiveram os 3 alertas (senão 50 leads esquecidos travam a fila) e do mais antigo para o mais novo
    .where(and(isNotNull(leadQualifications.aguardandoCorretorDesde), isNull(leadQualifications.atendidoAt),
      or(isNull(leadQualifications.alertaSlaNivel), lt(leadQualifications.alertaSlaNivel, NIVEL_DA_ACAO.avisar_admin))))
    .orderBy(asc(leadQualifications.aguardandoCorretorDesde)).limit(50);
  if (!esperando.length) return 0;
  const { roleta, admin, todos } = await candidatos(db, users);
  const manual = (await (await import('../configSistema')).modoDistribuicao()) === 'manual';
  const { enviarTexto } = await import('./zapiClient');
  const { enviarTelegram } = await import('./notificacao');
  const fone = (u: any) => { const f = String(u?.telefone || '').replace(/\D/g, ''); return f.length >= 10 ? (f.startsWith('55') ? f : `55${f}`) : null; };
  const { linhasAfetadas, registrarEnvio } = await import('./rotinas');
  const avisar = async (u: any, texto: string) => {
    const f = fone(u);
    if (f) {
      await enviarTexto(f, texto).then(() => registrarEnvio('sla', true)).catch(e => {
        registrarEnvio('sla', false, String(e?.message ?? e));
        console.warn('[SLA] WhatsApp falhou:', e?.message);
      });
    }
    await enviarTelegram(texto).catch(() => {});
  };
  let n = 0;
  for (const l of esperando) {
    const minutos = Math.floor((agora - new Date(l.aguardandoCorretorDesde).getTime()) / MIN);
    const nivel = Number(l.alertaSlaNivel) || 0;
    const acao = acaoSla(minutos, nivel);
    if (acao === 'nada') continue;
    const resp = todos.find(u => u.id === l.responsavelId) ?? admin;
    // Manual: não repassa sozinho para o próximo da roleta (só lembra e avisa o administrador)
    const proximo = acao === 'repassar' && !manual ? escolherResponsavel(roleta, l.responsavelId) : null;
    // Reserva o nível do alerta antes de avisar: com dois servidores no ar, só um avisa
    const reserva = await db.update(leadQualifications)
      .set({ alertaSlaNivel: NIVEL_DA_ACAO[acao], ...(proximo ? { responsavelId: proximo.id } : {}) } as any)
      .where(and(
        eq(leadQualifications.id, l.id),
        l.alertaSlaNivel == null ? isNull(leadQualifications.alertaSlaNivel) : eq(leadQualifications.alertaSlaNivel, nivel),
      ));
    if (linhasAfetadas(reserva) === 0) continue;
    if (proximo) {
      const { registrarEncaminhamento } = await import('./distribuicao');
      await registrarEncaminhamento({ leadId: l.id, deId: l.responsavelId ?? null, paraId: proximo.id, origem: 'automatico', observacao: `Roleta: sem atendimento em ${minutos} min` });
    }
    const nome = l.nome || 'Lead';
    // Atender pelo link do CRM: abrir a conversa já marca o lead como atendido
    // Links do aviso amarrados a quem recebe: se o lead mudar de corretor, os do anterior deixam de valer
    const contato = (u: any) => `📱 +${String(l.phone).replace(/\D/g, '')}\n💬 Atender no WhatsApp (já conta como atendido): ${linkWhatsAppAtendido(l.id, u?.id ?? null)}\n✅ Já atendi: ${linkAtendido(l.id, u?.id ?? null)}`;
    if (acao === 'lembrar') {
      await avisar(resp, `⏰ ${nome} está esperando atendimento há ${minutos} min.\n${contato(resp)}`);
    } else if (acao === 'repassar') {
      if (proximo) {
        await db.update(users).set({ ultimoLeadAt: new Date() } as any).where(eq(users.id, proximo.id));
        await avisar(proximo, `🔁 O lead ${nome} passou para você: está sem atendimento há ${minutos} min.\n${contato(proximo)}`);
      } else {
        await avisar(admin, `⚠️ ${nome} está há ${minutos} min sem atendimento.\n${contato(admin)}`);
      }
    } else {
      await avisar(admin, `🚨 ${nome} está há ${minutos} min sem atendimento (responsável: ${resp?.name || '—'}).\n${contato(admin)}`);
    }
    n++;
  }
  return n;
}

/** Nível gravado em alertaSlaNivel depois de cada ação */
export const NIVEL_DA_ACAO: Record<Exclude<AcaoSla, 'nada'>, number> = { lembrar: 1, repassar: 2, avisar_admin: 3 };

let timer: NodeJS.Timeout | null = null;
export function iniciarJobSla(intervaloMs = 60_000) {
  if (timer) return;
  import('./rotinas').then(({ registrarRotina, rodarRotina }) => {
    registrarRotina('sla', intervaloMs);
    timer = setInterval(() => { void rodarRotina('sla', () => processarSla()); }, intervaloMs);
  }).catch(e => console.warn('[SLA] Job não iniciado:', e?.message));
  console.log('[SLA] Prazo de atendimento ativo (5, 15 e 60 min)');
}
