/**
 * Desfecho de um lead encaminhado (Leads › Distribuição / Leads recebidos). "vendido" só o sistema marca, quando a
 * venda ou o contrato é lançado; o corretor informa os demais (e o lead vai para "Perdido" no funil com o motivo).
 */
export const DESFECHOS_CORRETOR = ['desistiu', 'sem_contato', 'nao_qualificado', 'comprou_outro'] as const;
export type DesfechoCorretor = typeof DESFECHOS_CORRETOR[number];
export type Desfecho = DesfechoCorretor | 'vendido' | 'repassado' | 'sem_confirmacao';
/** Desfechos que não são perda do corretor: o lead mudou de mãos (troca ou prazo de confirmação vencido) */
export const DESFECHOS_DE_TROCA: Desfecho[] = ['repassado', 'sem_confirmacao'];
/** Prazo para o corretor confirmar o recebimento; sem confirmação, o lead volta para o escritório (padrão 6 h) */
export const PRAZO_CONFIRMACAO_HORAS = 6;

export const ROTULO_DESFECHO: Record<Desfecho, string> = {
  vendido: 'Vendido', desistiu: 'Cliente desistiu', sem_contato: 'Não consegui contato', nao_qualificado: 'Não qualificado',
  comprou_outro: 'Comprou em outro lugar', repassado: 'Repassado a outro corretor', sem_confirmacao: 'Não confirmou em 6 h (voltou ao escritório)',
};

/** Motivo de perda do funil (server/leads/kanban.ts → MOTIVOS_PERDA) para cada desfecho do corretor */
export const MOTIVO_PERDA_DO_DESFECHO: Record<DesfechoCorretor, string> = {
  desistiu: 'outro:Desistiu', sem_contato: 'sem_resposta', nao_qualificado: 'outro:Não qualificado', comprou_outro: 'comprou_outro',
};

export type SituacaoEncaminhamento = 'aguardando_confirmacao' | 'em_atendimento' | 'finalizado';
export function situacaoEncaminhamento(e: { recebidoEm?: unknown; desfecho?: string | null }): SituacaoEncaminhamento {
  if (e.desfecho) return 'finalizado';
  return e.recebidoEm ? 'em_atendimento' : 'aguardando_confirmacao';
}
export const ROTULO_SITUACAO: Record<SituacaoEncaminhamento, string> = {
  aguardando_confirmacao: 'Aguardando confirmação', em_atendimento: 'Em atendimento', finalizado: 'Finalizado',
};
