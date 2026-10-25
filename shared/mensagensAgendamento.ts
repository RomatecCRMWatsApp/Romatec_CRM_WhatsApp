/**
 * Mensagens do link de agendamento — modelos editáveis (Configurações → Mensagens do agendamento):
 * - agendamento_cliente: confirmação que o cliente recebe na hora pelo WhatsApp do sistema (Z-API);
 * - agendamento_corretor: resumo para o corretor/administrador copiar (card do agendamento e aviso).
 * {corretor_*} é de quem recebeu o agendamento (ou o administrador, quando não há).
 */
import { rotuloHorario, rotuloPagamento } from './agendamento';
import type { CartaoVendas } from './cartaoVendas';
import { formatarTelefone } from './cartaoVendas';

export const CHAVES_MODELO = ['agendamento_cliente', 'agendamento_corretor'] as const;
export type ChaveModelo = typeof CHAVES_MODELO[number];

export const ROTULO_MODELO: Record<ChaveModelo, string> = {
  agendamento_cliente: 'Confirmação para o cliente (WhatsApp automático)',
  agendamento_corretor: 'Resumo para o corretor copiar',
};

export const VARIAVEIS_AGENDAMENTO: [string, string][] = [
  ['nome', 'nome do cliente'], ['telefone', 'WhatsApp do cliente'], ['cidade', 'cidade'], ['unidade', 'unidade de interesse'],
  ['melhor_dia', 'dia escolhido'], ['melhor_horario', 'faixa de horário'], ['forma_pagamento', 'forma de pagamento'],
  ['num_pessoas', 'pessoas no atendimento'], ['corretor_nome', 'corretor'], ['corretor_creci', 'número do CRECI'],
  ['corretor_telefone', 'telefone do corretor'],
];

export const MODELO_PADRAO: Record<ChaveModelo, string> = {
  agendamento_cliente: [
    'Olá, {nome}! 👋 Aqui é da Romatec Consultoria Total. Recebemos seu agendamento para conhecer o Condomínio de Chácaras Bom Jardims — obrigado pelo interesse!',
    '',
    '📅 Seu agendamento:',
    '• Dia: {melhor_dia}',
    '• Horário: {melhor_horario}',
    '• Unidade de interesse: {unidade}',
    '• Pessoas: {num_pessoas}',
    '',
    'Em breve o corretor {corretor_nome} (CRECI/MA {corretor_creci}) confirma seu atendimento pelo número {corretor_telefone}. Qualquer dúvida, é só responder aqui.',
    '',
    'Chácaras a partir de 3.025 m² · entrada 30% · até 120x. Mapa e condições: romateccrm.com/bom-jardims',
  ].join('\n'),
  agendamento_corretor: [
    '🔔 Novo agendamento — Bom Jardims',
    'Cliente: {nome} · {telefone}',
    'Cidade: {cidade}',
    'Unidade de interesse: {unidade}',
    'Melhor dia: {melhor_dia} · Horário: {melhor_horario}',
    'Forma de pagamento: {forma_pagamento}',
    'Pessoas: {num_pessoas}',
    'Origem: link de {corretor_nome}',
  ].join('\n'),
};

/** Dados do formulário guardados no pedido (leadVisitas.pedidoJson) */
export interface DadosPedido {
  nome: string; telefone: string; cidade?: string; unidade?: string; dia: string; horario: string; pagamento: string; pessoas: number;
}

const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export function variaveisDoPedido(p: DadosPedido, corretor: CartaoVendas): Record<string, string> {
  const [a, m, d] = p.dia.split('-').map(Number);
  const semana = SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return {
    nome: p.nome.trim(),
    telefone: formatarTelefone(p.telefone) ?? p.telefone,
    cidade: p.cidade?.trim() || 'não informada',
    unidade: p.unidade?.trim() || 'a definir',
    melhor_dia: `${p.dia.split('-').reverse().join('/')} (${semana})`,
    melhor_horario: rotuloHorario(p.horario),
    forma_pagamento: rotuloPagamento(p.pagamento),
    num_pessoas: String(p.pessoas),
    corretor_nome: corretor.nome,
    corretor_creci: (corretor.creci ?? '').replace(/^CRECI\/[A-Z]{2}\s*/i, ''),
    corretor_telefone: corretor.telefones[0] ?? '',
  };
}

/** Troca {variavel} pelo valor; sem CRECI, some o "(CRECI/MA …)" e o "pelo número" vazio */
export function preencherModelo(modelo: string, v: Record<string, string>): string {
  let t = modelo;
  if (!v.corretor_creci) t = t.replace(/\s*\(CRECI[^()]*\{corretor_creci\}\)/g, '');
  if (!v.corretor_telefone) t = t.replace(/\s*pelo número \{corretor_telefone\}/g, '');
  return t.replace(/\{([a-z_]+)\}/g, (s, k) => (k in v ? v[k] : s));
}

/** wa.me para o corretor continuar a conversa (com a mensagem, se houver) */
export function linkWhatsApp(telefone: string, texto?: string): string {
  const d = String(telefone).replace(/\D/g, '');
  const n = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}
