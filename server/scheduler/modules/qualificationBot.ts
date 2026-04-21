// @module QualificationBot — Fluxo de qualificação (janela 45min, follow-ups T+5/15/25/35/44min)

/**
 * ROMATEC CRM v9.0 — Bot de qualificação pós-disparo
 *
 * Responsabilidades:
 * - Registrar mensagem enviada no bot para iniciar janela de qualificação
 * - Processar e enviar follow-ups T+5/15/25/35/44min
 * - Delegar envio ao messageDispatcher (sendViaZAPI)
 *
 * Re-exporta as funções já implementadas em ../botQualifier.ts (módulo raiz)
 */

export {
  registerBotDispatch,
  processFollowUps,
} from '../botQualifier';
