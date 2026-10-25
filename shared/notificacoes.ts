/**
 * Notificações do sininho (v1.8.0): regras puras, servidor e navegador.
 *
 * - 4 eventos: sistema atualizado, reserva, venda/contrato e liberação de lote. Cada um tem um som
 *   próprio no app aberto (client/public/sons, arquivos trocáveis).
 * - Destinatários: admin e secretário recebem de tudo; corretor só dos empreendimentos habilitados
 *   para ele (acessosCorretor); empreendedor só do empreendimento dele. Atualização do sistema: todos.
 * - Quem fez a mudança no lote não é notificado da própria ação.
 */
import type { Perfil } from './equipe';
import { VENDIDOS, type SituacaoLote } from './lotes';
import { temAcesso, type AcessoCorretor } from './permissoes';

export const TIPOS_NOTIFICACAO = ['atualizacao_sistema', 'reserva', 'venda_contrato', 'liberacao', 'solicitacao_cancelamento', 'agendamento'] as const;
export type TipoNotificacao = typeof TIPOS_NOTIFICACAO[number];

/** Som de cada tipo (client/public/sons) — trocar o arquivo troca o som, sem mexer no código */
export const SOM_POR_TIPO: Record<TipoNotificacao, string> = {
  atualizacao_sistema: '/sons/atualizacao.wav',
  reserva: '/sons/reserva.wav',
  venda_contrato: '/sons/venda.wav',
  liberacao: '/sons/liberacao.wav',
  solicitacao_cancelamento: '/sons/cancelamento.wav',
  agendamento: '/sons/agendamento.wav',
};

export const ROTULO_NOTIFICACAO: Record<TipoNotificacao, string> = {
  atualizacao_sistema: 'Sistema atualizado',
  reserva: 'Reserva',
  venda_contrato: 'Venda / contrato',
  liberacao: 'Lote liberado',
  solicitacao_cancelamento: 'Pedido de cancelamento',
  agendamento: 'Pedido de agendamento',
};

/** Cor do selo na lista do sininho */
export const COR_NOTIFICACAO: Record<TipoNotificacao, string> = {
  atualizacao_sistema: '#C9A84C',
  reserva: '#E9B44C',
  venda_contrato: '#B05FC9',
  liberacao: '#5FB04A',
  solicitacao_cancelamento: '#C0504D',
  agendamento: '#2C7FB8',
};

const RESERVAS: SituacaoLote[] = ['reservado', 'entrada'];

/**
 * Evento da mudança de situação do lote (null = não notifica):
 * reserva = passou a reservado/com sinal; venda = passou a vendido (parcelado, à vista ou quitado)
 * vindo de fora das vendas; liberação = voltou a disponível.
 */
export function eventoDaMudanca(de: string | null | undefined, para: SituacaoLote): TipoNotificacao | null {
  const antes = (de || 'disponivel') as SituacaoLote;
  if (antes === para) return null;
  if (VENDIDOS.includes(para)) return VENDIDOS.includes(antes) ? null : 'venda_contrato';
  if (RESERVAS.includes(para)) return RESERVAS.includes(antes) ? null : 'reserva';
  if (para === 'disponivel') return 'liberacao';
  return null;
}

/** Título e mensagem (sininho e push) */
export function textoNotificacao(
  tipo: TipoNotificacao,
  d: { lote?: string; empreendimento?: string; versao?: string; autor?: string | null; contrato?: string; comprador?: string; motivo?: string; quando?: string },
): { titulo: string; mensagem: string } {
  const onde = `Chácara ${d.lote ?? '?'}${d.empreendimento ? ` · ${d.empreendimento}` : ''}`;
  const por = d.autor ? ` (por ${d.autor})` : '';
  switch (tipo) {
    case 'atualizacao_sistema': return { titulo: 'Sistema atualizado', mensagem: `Sistema atualizado para v${d.versao}` };
    case 'reserva': return { titulo: `${onde} reservada`, mensagem: `A ${onde} foi reservada${por}.` };
    case 'venda_contrato': return { titulo: `${onde} vendida`, mensagem: `Venda/contrato fechado da ${onde}${por}.` };
    case 'liberacao': return { titulo: `${onde} liberada`, mensagem: `A ${onde} voltou a ficar disponível${por} — oportunidade aberta.` };
    case 'agendamento': return {
      titulo: `Pedido de agendamento — ${d.comprador ?? 'cliente'}`,
      mensagem: `${d.comprador ?? 'Um cliente'} pediu atendimento${d.empreendimento ? ` no ${d.empreendimento}` : ''}${d.quando ? ` para ${d.quando}` : ''}${d.motivo ? ` (${d.motivo})` : ''}. Confirme o horário com ele.`.slice(0, 500),
    };
    case 'solicitacao_cancelamento': return {
      titulo: `Pedido de cancelamento — contrato ${d.contrato ?? '?'}`,
      mensagem: `${d.autor ?? 'Alguém da equipe'} pediu o cancelamento do contrato ${d.contrato ?? '?'} (${onde}${d.comprador ? `, comprador ${d.comprador}` : ''}). Motivo: ${d.motivo ?? '—'}`.slice(0, 500),
    };
  }
}

export interface UsuarioDestino {
  id: number; role?: string | null; perfil?: string | null; ativo?: boolean | number | null; empreendimentoSlug?: string | null;
}

/**
 * Quem recebe: atualização do sistema vai para todos os ativos; evento de lote respeita o escopo
 * (corretor só com o empreendimento habilitado; empreendedor só o dele). O autor fica de fora.
 */
export function destinatarios(
  tipo: TipoNotificacao,
  usuarios: UsuarioDestino[],
  acessos: (AcessoCorretor & { usuarioId: number })[],
  perfilDe: (u: UsuarioDestino) => Perfil | null,
  alvo?: { empreendimentoId: number; empreendimentoSlug: string; autorId?: number | null },
): number[] {
  return usuarios.filter(u => {
    if (u.ativo === false || u.ativo === 0) return false;
    if (tipo === 'atualizacao_sistema') return true;
    // Pedido de cancelamento: só o administrador decide (e cancela com a senha)
    if (tipo === 'solicitacao_cancelamento') return perfilDe(u) === 'admin' && u.id !== alvo?.autorId;
    // Pedido de agendamento: vai direto para o responsável (notificarAgendamento), não por escopo
    if (tipo === 'agendamento') return false;
    if (!alvo || u.id === alvo.autorId) return false;
    const perfil = perfilDe(u);
    if (perfil === 'empreendedor') return !!u.empreendimentoSlug && u.empreendimentoSlug === alvo.empreendimentoSlug;
    return temAcesso(perfil, acessos.filter(a => a.usuarioId === u.id), 'empreendimento', alvo.empreendimentoId);
  }).map(u => u.id);
}

/**
 * Endereço que o toque na notificação abre: o lote no empreendimento (equipe) ou o painel do
 * empreendedor; atualização do sistema abre o sininho.
 */
export function urlDaNotificacao(
  tipo: TipoNotificacao, d: { empreendimentoSlug?: string | null; lote?: string | null; contratoId?: number | null; leadId?: number | null }, perfil?: Perfil | null,
): string {
  if (tipo === 'agendamento') return d.leadId ? `/leads/lead/${d.leadId}` : '/agenda';
  if (tipo === 'solicitacao_cancelamento') return d.contratoId ? `/contratos/${d.contratoId}` : '/contratos';
  if (perfil === 'empreendedor') return '/empreendedor?notificacoes=1';
  if (tipo === 'atualizacao_sistema' || !d.empreendimentoSlug) return '/dashboard?notificacoes=1';
  return `/empreendimentos/${d.empreendimentoSlug}${d.lote ? `?lote=${encodeURIComponent(d.lote)}` : ''}`;
}

/** Corpo do push (service worker): sem dado sensível além do que o sininho já mostra */
export interface PayloadPush { id: number; tipo: TipoNotificacao; titulo: string; mensagem: string; url: string }

/** Push com resposta 404/410: a inscrição morreu (app desinstalado, permissão revogada) — apagar */
export const inscricaoExpirada = (statusCode: unknown) => statusCode === 404 || statusCode === 410;
