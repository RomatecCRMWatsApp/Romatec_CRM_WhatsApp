import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * O CRM e a ZAYRA usam o MESMO banco MySQL. Uma tabela do CRM com o nome de uma da ZAYRA não é criada
 * (CREATE TABLE IF NOT EXISTS pula) e o CRM passa a ler/gravar a tabela errada — foi o caso de "recibos"
 * até a v1.30.5. Lista das tabelas da ZAYRA (RomatecVoiceAgent, origin/main em 25/10/2026); atualize quando ela criar novas.
 */
const TABELAS_ZAYRA = new Set([
  'aditivo_campo_config', 'api_keys', 'audit_log', 'auth_logs', 'campaignContacts', 'campaignSchedules', 'campaigns', 'canvas_elementos',
  'canvas_graficos', 'cartorios', 'companyConfig', 'configuracoes', 'configuracoes_demarcacao', 'contactCampaignHistory', 'contacts',
  'contratantes', 'dados_pagamento_emissor', 'dailyReports', 'despesas_extras', 'despesas_extras_itens', 'diario_obra_assinaturas',
  'diarios_obra', 'diarios_obra_anexos', 'diligencias', 'diligencias_mensagens', 'email_verifications', 'esportes_backtest_resultados',
  'esportes_estatisticas_time', 'esportes_eventos', 'esportes_modalidades', 'esportes_odds', 'esportes_probabilidades', 'executantes',
  'folha_fechamento_itens', 'folha_fechamentos', 'folha_pagamentos_log', 'fotos_envios_log', 'fotos_vistoria', 'galeria_duplicatas_log',
  'galeria_fotos', 'interactions', 'invoices', 'laudos_demarcacao', 'laudos_demarcacao_arquivos', 'laudos_demarcacao_fotos',
  'laudos_demarcacao_lados', 'laudos_demarcacao_pontos', 'leadQualifications', 'loteadores', 'loteamento_lotes', 'loteamento_quadras',
  'loteamento_quadras_plantas', 'loteamento_ruas', 'loteamentos', 'mao_obra_avulsa', 'memoriais_calculo', 'messageVariations', 'messages',
  'notas_fiscais', 'notas_fiscais_eventos', 'obra_inventario_cabecalho', 'obra_inventario_etapas', 'obra_inventario_fotos',
  'obra_inventario_itens', 'obra_inventario_notas', 'obra_inventario_utilizacoes', 'obras_entregas', 'obras_entregas_fotos',
  'obras_entregas_materiais_sobra', 'pa_associados', 'pa_boletos', 'pa_caixa_movimentos', 'pa_documentos', 'pa_documentos_arquivos',
  'pa_entregas', 'pa_eventos', 'pa_lancamentos', 'pa_lotes', 'pa_pagamento_rateio', 'pa_pagamentos', 'pa_participantes', 'pa_projetos',
  'pa_usuarios_perfil', 'pa_whatsapp_grupo_membros', 'password_resets', 'payment_methods', 'plans', 'pranchas_tecnicas',
  'processamentos_gnss', 'processamentos_gnss_arquivos', 'prontuario_etapa_documentos', 'prontuario_etapas', 'prontuarios', 'properties',
  'proposta_anexos', 'proposta_itens', 'propostas', 'propostas_aditivos_campo', 'propostas_clientes', 'propostas_demarcacao_lados',
  'propostas_demarcacao_pontos', 'propostas_reforma_piso', 'propostas_reforma_piso_ambientes', 'propostas_reforma_piso_anexos',
  'propostas_reforma_piso_fotos', 'recibos', 'recibos_ajustes', 'recibos_anexos', 'recibos_envios', 'recibos_envios_lotes',
  'recibos_envios_mensagens', 'recibos_eventos', 'recibos_quinzena_emitidos', 'relatorios_demarcacao', 'relatorios_demarcacao_itens',
  'relatorios_demarcacao_seq', 'relatorios_fotograficos', 'romatec_atas_reuniao', 'romatec_avalieimob_leads',
  'romatec_documentos_vencimento', 'romatec_obra_diario', 'romatec_obra_equipe', 'romatec_obra_etapas', 'romatec_obra_funcionario_dias',
  'romatec_obra_materiais', 'romatec_obra_parcelas', 'romatec_obra_profissoes_catalogo', 'romatec_obra_transacoes',
  'romatec_obra_vistoria_fotos', 'romatec_obra_vistorias', 'romatec_obras', 'romatec_proactive_alerts', 'romatec_team_members',
  'schedulerState', 'sessions', 'sinapi_indices', 'sinapi_servicos', 'subscriptions', 'tenant_fiscal_config', 'tenant_invites',
  'tenant_settings', 'tenant_signing_certificates', 'tenant_users', 'tenants', 'textos_explicativos', 'textos_explicativos_envios',
  'usage_metrics', 'user_preferences', 'users', 'vto_atividades_catalogo', 'vto_checklist', 'vto_checklist_itens', 'webhooks', 'wifi_leads',
  'zayra_alarmes', 'zayra_arbitragem_calculos', 'zayra_chat_sessions', 'zayra_conversations', 'zayra_embeddings', 'zayra_memory',
  'zayra_tarefas', 'zayra_telegram_log', 'zayra_tool_calls', 'zayra_whatsapp_drafts', 'zayra_whatsapp_log',
]);

/** Mesmas tabelas nos dois sistemas (vieram do mesmo código inicial): o esquema do CRM é o que existe; a ZAYRA só acrescenta colunas */
const COMPARTILHADAS = new Set([
  'campaignContacts', 'campaignSchedules', 'campaigns', 'companyConfig', 'contactCampaignHistory', 'contacts', 'dailyReports',
  'interactions', 'leadQualifications', 'messageVariations', 'messages', 'properties', 'schedulerState', 'users',
]);

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('banco compartilhado com a ZAYRA', () => {
  it('nenhuma tabela do CRM usa o nome de uma tabela da ZAYRA (fora as compartilhadas)', () => {
    const esquema = readFileSync(path.join(raiz, 'drizzle', 'schema.ts'), 'utf8');
    const doCrm = Array.from(esquema.matchAll(/mysqlTable\(\s*"([A-Za-z_]+)"/g)).map(m => m[1]);
    expect(doCrm.length).toBeGreaterThan(50);
    expect(doCrm.filter(t => TABELAS_ZAYRA.has(t) && !COMPARTILHADAS.has(t))).toEqual([]);
    expect(doCrm).toContain('crm_recibos');
    expect(doCrm).not.toContain('recibos');
  });
});
