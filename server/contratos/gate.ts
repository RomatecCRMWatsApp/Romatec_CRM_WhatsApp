/**
 * Trava jurídica (spec §4.2/§5.2): antes do registro do parcelamento o sistema só gera minuta —
 * é vedado vender ou prometer vender lote de loteamento não registrado (Lei 6.766/1979, art. 37).
 */
import type { Ctx } from './contexto';

export const OBRIGATORIOS_MINUTA = ['comp_nome', 'comp_cpf', 'lote_codigo', 'plano_preco_tabela'];
export const OBRIGATORIOS_DEFINITIVO = [
  'emp_matricula_empreendimento', 'emp_registro_parcelamento', 'emp_registro_data', 'emp_aprovacao_numero',
  'emp_aprovacao_data', 'emp_lei_municipal', 'emp_li_numero', 'emp_li_data', 'emp_obras_termo_final', 'emp_associacao_nome',
  'emp_associacao_registro', 'emp_trt_rt', 'rom_creci_pj', 'corr_creci', 'corr_creci_validade', 'corr_certidao_codigo',
  'comp_nome', 'comp_cpf', 'comp_endereco', 'ctr_numero', 'ctr_data_extenso', 'pag_recebedor_configurado',
];

export interface GateResult { ok: boolean; faltantes: string[]; bloqueios: string[] }

const vazio = (v: unknown) => v === undefined || v === null || String(v).trim() === '';

/** "dd/mm/aaaa" vencida (ou vazia/ inválida) em relação a hoje */
function vencida(br: unknown, hoje: Date): boolean {
  const [d, m, a] = String(br ?? '').split('/').map(Number);
  if (!a || !m || !d) return true;
  const fimDoDia = new Date(a, m - 1, d, 23, 59, 59);
  return fimDoDia < hoje;
}

export function avaliarGate(ctx: Ctx, alvo: 'minuta' | 'definitivo', hoje = new Date()): GateResult {
  const lista = alvo === 'minuta' ? [...OBRIGATORIOS_MINUTA] : [...OBRIGATORIOS_DEFINITIVO];
  if (alvo === 'definitivo' && ctx.pagamento_financiado) lista.push('plano_saldo_venc1');
  if (ctx.comp_casado) lista.push('conj_nome', 'conj_cpf', 'conj_regime_bens');
  if (ctx.vend_pj) lista.push('vend_razao_social', 'vend_cnpj', 'vend_rep_nome', 'tit_nome', 'tit_cpf');
  if (ctx.assinatura_manuscrita) lista.push('test1_nome', 'test1_cpf', 'test2_nome', 'test2_cpf');
  const faltantes = lista.filter(k => vazio(ctx[k]));
  const bloqueios: string[] = [];
  if (alvo === 'definitivo') {
    if (ctx.emp_parcelamento_registrado !== true) bloqueios.push('Parcelamento não registrado (Lei 6.766/1979, art. 37)');
    if (vencida(ctx.emp_licenca_validade, hoje)) bloqueios.push('Licença ambiental vencida ou não informada');
    if (vencida(ctx.corr_creci_validade, hoje)) bloqueios.push('Carteira CRECI do corretor vencida ou não informada');
    if (vencida(ctx.corr_certidao_validade, hoje)) bloqueios.push('Certidão de regularidade do corretor vencida');
    if (ctx.corr_parceiro && (vencida(ctx.corr_parceiro_creci_validade, hoje) || vencida(ctx.corr_parceiro_certidao_validade, hoje))) {
      bloqueios.push('Credenciais do corretor parceiro vencidas');
    }
    if (String(ctx.emp_matricula_empreendimento ?? '').includes(String(ctx.emp_matricula_origem || '33.036'))) {
      bloqueios.push('Matrícula de origem não pode ser usada no definitivo — informe a matrícula do empreendimento');
    }
  }
  return { ok: !faltantes.length && !bloqueios.length, faltantes, bloqueios };
}
