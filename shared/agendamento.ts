/**
 * Link de agendamento por empreendimento (/agendar/:slug?c=<ref>): formulário público que vira lead + pedido de
 * agendamento ("solicitada") na agenda, atribuído a quem compartilhou o link (sem ref: o administrador).
 */
import { z } from 'zod';

export const FORMAS_PAGAMENTO = [
  ['avista', 'À vista'],
  ['entrada_parcelada', 'Entrada parcelada'],
  ['financiamento', 'Financiamento direto (saldo em até 120×)'],
] as const;
export type FormaPagamento = typeof FORMAS_PAGAMENTO[number][0];

/** Faixas de horário do atendimento (início usado na agenda; a faixa vai na observação) */
export const HORARIOS = [
  ['08-10', '8h às 10h', 8], ['10-12', '10h às 12h', 10], ['13-15', '13h às 15h', 13], ['15-17', '15h às 17h', 15], ['17-19', '17h às 19h', 17],
] as const;
export type FaixaHorario = typeof HORARIOS[number][0];

export const agendamentoSchema = z.object({
  nome: z.string().trim().min(3, 'Informe seu nome completo').max(120),
  telefone: z.string().trim().min(10, 'Informe o WhatsApp com DDD').max(25),
  cidade: z.string().trim().max(80).optional().or(z.literal('')),
  unidade: z.string().trim().max(60).optional().or(z.literal('')),
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Escolha o melhor dia'),
  horario: z.enum(HORARIOS.map(h => h[0]) as [FaixaHorario, ...FaixaHorario[]], { message: 'Escolha o melhor horário' }),
  pagamento: z.enum(FORMAS_PAGAMENTO.map(f => f[0]) as [FormaPagamento, ...FormaPagamento[]], { message: 'Escolha a forma de pagamento' }),
  pessoas: z.coerce.number().int().min(1, 'Quantas pessoas?').max(20, 'Até 20 pessoas'),
  consentimento: z.literal(true, { message: 'É preciso aceitar o contato' }),
  ref: z.string().max(20).optional().or(z.literal('')),
  // Honeypot: robô preenche, gente não vê
  website: z.string().max(300).optional(),
});
export type PedidoAgendamento = z.infer<typeof agendamentoSchema>;

const rotulo = <T extends readonly (readonly [string, string, ...unknown[]])[]>(lista: T, v: string) => lista.find(x => x[0] === v)?.[1] ?? v;
export const rotuloPagamento = (v: string) => rotulo(FORMAS_PAGAMENTO, v);
export const rotuloHorario = (v: string) => rotulo(HORARIOS, v);

/** Dia + faixa → instante da agenda (hora de Brasília, UTC−3) */
export function quandoDoPedido(dia: string, horario: string): Date {
  const h = HORARIOS.find(x => x[0] === horario)?.[2] ?? 9;
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, h + 3, 0, 0));
}

/** O dia precisa ser de hoje em diante e até 90 dias (hora de Brasília) */
export function diaValido(dia: string, agora = Date.now()): boolean {
  const hoje = new Date(agora - 3 * 3600_000).toISOString().slice(0, 10);
  const limite = new Date(agora - 3 * 3600_000 + 90 * 86_400_000).toISOString().slice(0, 10);
  return dia >= hoje && dia <= limite;
}

/** Respostas do formulário gravadas no lead (aparecem na ficha e no aviso) */
export function respostasDoPedido(p: PedidoAgendamento): Record<string, string> {
  return Object.fromEntries(Object.entries({
    cidade: p.cidade || '',
    'unidade de interesse': p.unidade || '',
    'melhor dia': p.dia.split('-').reverse().join('/'),
    'melhor horário': rotuloHorario(p.horario),
    'forma de pagamento': rotuloPagamento(p.pagamento),
    'pessoas no atendimento': String(p.pessoas),
  }).filter(([, v]) => v));
}

/** Texto da observação do pedido na agenda */
export function observacaoDoPedido(p: PedidoAgendamento): string {
  return [
    `Pedido pelo link de agendamento — ${rotuloHorario(p.horario)}`,
    `${p.pessoas} pessoa(s)`, rotuloPagamento(p.pagamento),
    p.unidade ? `interesse: ${p.unidade}` : '', p.cidade ? `de ${p.cidade}` : '',
  ].filter(Boolean).join(' · ').slice(0, 500);
}
