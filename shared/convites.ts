/**
 * Convites de reunião com confirmação de presença (RSVP): regras puras usadas no servidor e na tela.
 * Lista de convidados → link individual (/reuniao/<token do convidado>); link geral → /reuniao/<token geral>,
 * onde a pessoa informa nome e telefone.
 */
import { z } from 'zod';

export const STATUS_CONVIDADO = ['pendente', 'confirmado', 'recusado'] as const;
export type StatusConvidado = typeof STATUS_CONVIDADO[number];
export const ROTULO_STATUS_CONVIDADO: Record<StatusConvidado, string> = { pendente: 'Pendente', confirmado: 'Confirmado', recusado: 'Não poderá ir' };

/** Até quando dá para responder: 2 h depois do início (atrasados ainda confirmam na porta) */
export const RESPOSTA_ATE_MS = 2 * 3600_000;
export const MAX_FOLDER_BYTES = 10 * 1024 * 1024;

/** Telefone com DDI 55 só com dígitos (10–11 dígitos nacionais); null se inválido */
export function telefoneConvite(v: string): string | null {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  return `55${d}`;
}

/** Data (AAAA-MM-DD) e hora (HH:MM) no horário do Maranhão (UTC−3) → instante */
export function instanteDaReuniao(data: string, hora: string): Date {
  return new Date(`${data}T${hora}:00-03:00`);
}

export function quandoTexto(d: Date | string | number): string {
  return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Quantos confirmados, recusados e pendentes */
export function contagem(convidados: { status: string }[]): Record<StatusConvidado, number> & { total: number } {
  const c = { pendente: 0, confirmado: 0, recusado: 0, total: convidados.length };
  for (const x of convidados) if (x.status in c) c[x.status as StatusConvidado]++;
  return c;
}

/** Mensagem do convite no WhatsApp */
export function textoConvite(r: { titulo: string; empreendimento?: string | null; quando: Date | string; local?: string | null }, nome: string | null, link: string): string {
  return [
    `Olá${nome ? `, ${nome.split(' ')[0]}` : ''}! Você está convidado(a) para a reunião *${r.titulo}*${r.empreendimento ? ` — ${r.empreendimento}` : ''}.`,
    `📅 ${quandoTexto(r.quando)}`,
    r.local ? `📍 ${r.local}` : null,
    '',
    `Confirme sua presença pelo link: ${link}`,
  ].filter(x => x !== null).join('\n');
}

export const reuniaoSchema = z.object({
  titulo: z.string().trim().min(3, 'Informe o título').max(160),
  empreendimentoId: z.number().int().positive().nullable(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida'),
  local: z.string().trim().max(250).nullable().optional(),
  linkVideo: z.string().trim().url('Link de videochamada inválido').max(300).nullable().optional().or(z.literal('').transform(() => null)),
  descricao: z.string().trim().max(2000).nullable().optional(),
});
export type DadosReuniao = z.infer<typeof reuniaoSchema>;

export const convidadoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(120),
  telefone: z.string().refine(v => !!telefoneConvite(v), 'WhatsApp inválido (DDD + número)'),
});

/** Resposta na página pública (no link geral, nome e telefone são obrigatórios) */
export const respostaSchema = z.object({
  resposta: z.enum(['confirmado', 'recusado']),
  nome: z.string().trim().max(120).optional(),
  telefone: z.string().max(30).optional(),
  website: z.string().max(200).optional(), // honeypot: preenchido = robô
});

/** "Nome, telefone" por linha (vírgula, ponto e vírgula, tab ou traço antes do número) */
export function lerLista(texto: string): { ok: { nome: string; telefone: string }[]; erros: string[] } {
  const ok: { nome: string; telefone: string }[] = [], erros: string[] = [];
  for (const linha of texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
    const m = linha.match(/^(.*?)[\s,;\t–-]+(\+?[\d\s().-]{10,})$/);
    if (!m || m[1].trim().length < 2 || !telefoneConvite(m[2])) { erros.push(linha); continue; }
    ok.push({ nome: m[1].trim(), telefone: m[2].trim() });
  }
  return { ok, erros };
}

