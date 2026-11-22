/**
 * Link de retorno (/retorno/:slug?c=<ref>): o cliente que não pode falar agora escolhe o dia, a hora e o tipo
 * de retorno — ligação, ou visita com busca no endereço dele. Vira lead + pedido de retorno, e o sistema avisa
 * o responsável na hora marcada.
 */
import { z } from 'zod';

export const TIPOS_RETORNO = [
  ['ligacao', 'Ligação para tirar dúvidas', 'Para quem prefere conversar por telefone'],
  ['visita_busca', 'Visita para escolher e fechar', 'Buscamos você de carro e levamos ao condomínio'],
] as const;
export type TipoRetorno = typeof TIPOS_RETORNO[number][0];

export const HORA_MIN = 7;
export const HORA_MAX = 20;

export const retornoSchema = z.object({
  nome: z.string().trim().min(3, 'Informe seu nome completo').max(120),
  telefone: z.string().trim().min(10, 'Informe o WhatsApp com DDD').max(25),
  tipo: z.enum(['ligacao', 'visita_busca'], { message: 'Escolha o tipo de retorno' }),
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Escolha o dia'),
  hora: z.string().regex(/^\d{2}:\d{2}$/, 'Escolha o horário'),
  enderecoBusca: z.string().trim().max(300).optional().or(z.literal('')),
  pessoas: z.coerce.number().int().min(1).max(10).optional(),
  observacao: z.string().trim().max(300).optional().or(z.literal('')),
  consentimento: z.literal(true, { message: 'É preciso aceitar o contato' }),
  /** Visita com busca: o cliente confirma que já tirou as dúvidas e vai para escolher e fechar */
  decidido: z.boolean().optional(),
  ref: z.string().max(20).optional().or(z.literal('')),
  website: z.string().max(300).optional(),
}).superRefine((p, ctx) => {
  const [h, m] = p.hora.split(':').map(Number);
  if (!(h >= HORA_MIN && (h < HORA_MAX || (h === HORA_MAX && m === 0)) && m >= 0 && m < 60)) {
    ctx.addIssue({ code: 'custom', path: ['hora'], message: `Escolha um horário entre ${HORA_MIN}h e ${HORA_MAX}h` });
  }
  if (p.tipo === 'visita_busca' && h * 60 + m > ULTIMA_BUSCA * 60) {
    ctx.addIssue({ code: 'custom', path: ['hora'], message: `Para a visita com busca, escolha um horário até ${ULTIMA_BUSCA}h` });
  }
  if (p.tipo === 'visita_busca' && (p.enderecoBusca || '').trim().length < 8) {
    ctx.addIssue({ code: 'custom', path: ['enderecoBusca'], message: 'Informe o endereço onde vamos buscar vocês' });
  }
  if (p.tipo === 'visita_busca' && !p.decidido) {
    ctx.addIssue({ code: 'custom', path: ['decidido'], message: 'A visita com busca é para quem já decidiu pela compra. Se ainda tem dúvidas, fale pelo WhatsApp ou escolha a ligação.' });
  }
});
export type PedidoRetorno = z.infer<typeof retornoSchema>;

export const rotuloTipoRetorno = (t: string) => TIPOS_RETORNO.find(x => x[0] === t)?.[1] ?? t;

/** Dia + hora (Brasília, UTC−3) → instante */
export function quandoDoRetorno(dia: string, hora: string): Date {
  const [a, mo, d] = dia.split('-').map(Number);
  const [h, mi] = hora.split(':').map(Number);
  return new Date(Date.UTC(a, mo - 1, d, h + 3, mi, 0));
}

/** "23/11/2026 às 14:30" */
export const quandoTexto = (dia: string, hora: string) => `${dia.split('-').reverse().join('/')} às ${hora}`;

/** Antecedência do aviso ao responsável: ligação 10 min; visita com busca 1 h (tempo de sair) */
export const antecedenciaMs = (tipo: string) => (tipo === 'visita_busca' ? 60 : 10) * 60_000;

/** Duração que cada compromisso ocupa na agenda de quem atende */
export const DURACAO_MIN: Record<string, number> = { ligacao: 30, visita_busca: 180, visita: 120 };
/** Visita com busca: última saída que ainda cabe no dia */
export const ULTIMA_BUSCA = 16;

/** Horários de 30 em 30 min do atendimento para o tipo */
export function gradeHorarios(tipo: string): string[] {
  const fim = tipo === 'visita_busca' ? ULTIMA_BUSCA : HORA_MAX;
  const out: string[] = [];
  for (let h = HORA_MIN; h <= fim; h++) for (const m of [0, 30]) { if (h === fim && m > 0) continue; out.push(`${String(h).padStart(2, '0')}:${m ? '30' : '00'}`); }
  return out;
}

export interface Compromisso { responsavelId: number | null; inicio: number; fim: number }

/** Livre se nenhum compromisso dele cruza o intervalo [inicio, fim) */
export function livre(agenda: Compromisso[], responsavelId: number, inicio: number, fim: number): boolean {
  return !agenda.some(c => c.responsavelId === responsavelId && c.inicio < fim && inicio < c.fim);
}
