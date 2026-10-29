/**
 * Retorno por campanha (Leads › Campanhas de captação): gasto × leads × visitas × vendas, atribuído ao 1º toque
 * (leadQualifications.origemCampanhaId). Venda = contrato assinado, ativo ou quitado; em andamento = da minuta até a
 * assinatura. VGV = preço do contrato (à vista: preço à vista); receita = comissão total do contrato.
 */

export const STATUS_VENDIDO = ['assinado', 'ativo', 'quitado'];
export const STATUS_EM_ANDAMENTO = ['rascunho', 'minuta', 'apto_assinatura', 'em_assinatura'];

export interface BaseRoi { gasto: number; leads: number; visitas: number; vendas: number; emAndamento: number; vgv: number; comissao: number }
export interface Roi extends BaseRoi {
  /** Custo por lead, por visita realizada e por venda (null = sem divisor) */
  cpl: number | null;
  custoVisita: number | null;
  custoVenda: number | null;
  /** % de leads que viraram venda */
  conversao: number | null;
  /** (comissão − gasto) ÷ gasto, em % */
  roi: number | null;
}

const div = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) / 100 : null);

export function calcularRoi(b: BaseRoi): Roi {
  return {
    ...b,
    cpl: div(b.gasto, b.leads),
    custoVisita: div(b.gasto, b.visitas),
    custoVenda: div(b.gasto, b.vendas),
    conversao: b.leads > 0 ? Math.round((b.vendas / b.leads) * 1000) / 10 : null,
    roi: b.gasto > 0 ? Math.round(((b.comissao - b.gasto) / b.gasto) * 1000) / 10 : null,
  };
}

/** Preço de venda do contrato pelo plano congelado (simulacaoJson) */
export function valorDoPlano(p: any): { vgv: number; comissao: number } {
  if (!p || typeof p !== 'object') return { vgv: 0, comissao: 0 };
  const vgv = Number(p.modalidade === 'avista' ? p.preco_avista : p.preco_tabela) || 0;
  return { vgv, comissao: Number(p.comissao_total) || 0 };
}

export function somarRoi(itens: BaseRoi[]): Roi {
  const t = itens.reduce((a, x) => ({
    gasto: a.gasto + x.gasto, leads: a.leads + x.leads, visitas: a.visitas + x.visitas, vendas: a.vendas + x.vendas,
    emAndamento: a.emAndamento + x.emAndamento, vgv: a.vgv + x.vgv, comissao: a.comissao + x.comissao,
  }), { gasto: 0, leads: 0, visitas: 0, vendas: 0, emAndamento: 0, vgv: 0, comissao: 0 });
  return calcularRoi(t);
}
