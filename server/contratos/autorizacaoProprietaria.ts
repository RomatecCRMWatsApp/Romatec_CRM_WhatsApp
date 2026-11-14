/**
 * Contrato com plano negociado: só gera o definitivo com a Autorização de venda (server/autorizacoes/servico.ts)
 * assinada pela proprietária e vinculada a ele — o plano tem de ser exatamente o autorizado. O PDF assinado vai anexo.
 */
import { compararComTabela, type Comparativo } from '../../shared/autorizacaoProprietaria';
import type { PlanoContrato } from './plano';
import { condicoesDe, contratoPorId, juridicoDe } from './servico';

const json = (v: unknown) => { if (typeof v !== 'string') return (v ?? {}) as any; try { return JSON.parse(v); } catch { return {}; } };
type PlanoComAutorizacao = PlanoContrato & { autorizacao_venda?: { id: number; numero: number } };

/** Proprietária (usada pelos termos assinados por ela) */
export async function proprietariaDoContrato(contratoId: number) {
  const c = await contratoPorId(contratoId);
  const j = await juridicoDe(c.empreendimentoId);
  const v = j.vendedora as Record<string, string>;
  const pj = j.vendedoraTipo === 'PJ';
  return { nome: (pj ? v.vend_rep_nome : v.vend_nome) || v.vend_nome || 'Proprietária', cpfCnpj: (pj ? v.vend_rep_cpf : v.vend_cpf) || '', telefone1: v.vend_telefone || null, razao: pj ? v.vend_razao_social || '' : '' };
}

/** Plano negociado fora das condições: precisa da autorização assinada da proprietária */
export const precisaAutorizacao = (p: Partial<PlanoContrato> | null | undefined) => !!p && !p.concessao && !!p.plano_autorizado;

export async function situacaoAutorizacao(contratoId: number, plano?: PlanoContrato | null): Promise<{ situacao: 'nao_precisa' | 'pendente' | 'valida'; numero: number | null; pdf: string | null }> {
  const p = (plano ?? json((await contratoPorId(contratoId)).simulacaoJson)) as PlanoComAutorizacao;
  if (!precisaAutorizacao(p)) return { situacao: 'nao_precisa', numero: null, pdf: null };
  const { autorizacaoDoContrato } = await import('../autorizacoes/servico');
  const r = await autorizacaoDoContrato(contratoId, p);
  return r?.valida ? { situacao: 'valida', numero: r.numero, pdf: r.pdf } : { situacao: 'pendente', numero: r?.numero ?? null, pdf: null };
}

/** PDF assinado da autorização vinculada (anexo do contrato) */
export async function pdfAutorizacaoValida(contratoId: number, plano?: PlanoContrato | null): Promise<Buffer | null> {
  const s = await situacaoAutorizacao(contratoId, plano);
  if (s.situacao !== 'valida' || !s.pdf) return null;
  const { lerArquivo } = await import('./arquivos');
  return (await lerArquivo(s.pdf))?.buf ?? null;
}

/** Para a tela do contrato */
export async function painelAutorizacao(contratoId: number) {
  const c = await contratoPorId(contratoId);
  const plano = json(c.simulacaoJson) as PlanoComAutorizacao;
  const sit = await situacaoAutorizacao(contratoId, plano);
  let k: Comparativo | null = null;
  if (plano.modalidade === 'financiado' && plano.parcelas?.length && precisaAutorizacao(plano)) {
    const cond = await condicoesDe(c.empreendimentoId);
    k = compararComTabela({ precoTabela: Number(plano.preco_tabela_original ?? plano.preco_tabela), precoProposta: Number(plano.preco_tabela), entrada: Number(plano.entrada_valor), prazo: Number(plano.saldo_qtd), taxaTabelaAa: Number(cond.jurosAaEfetivo), linhas: plano.parcelas.map(p => ({ vencimento: p.vencimento, valor: Number(p.valor) })), taxaPropostaAm: Number(plano.taxa_am) });
  }
  return { precisa: precisaAutorizacao(plano), situacao: sit.situacao, numero: sit.numero ?? plano.autorizacao_venda?.numero ?? null, autorizacaoId: plano.autorizacao_venda?.id ?? null, comparativo: k };
}
