/**
 * Tabela de financiamento (aba Financeiro): condições + evolutivo de um lote, de uma área ou de um valor —
 * só junta as funções do simulador (simular, evolucao, vencimento); nenhum cálculo novo.
 */
import { evolucao, simular, textoEntrada, vencimento, type CondicoesPagamento, type Simulacao } from './simulador';

export class TabelaErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'TabelaErro'; } }
export interface LoteTabela { codigo: string; quadra: string | null; areaM2: number; preco: number; precoTabela: number | null; situacao: string }

export interface PedidoTabela { lote?: string | null; areaM2?: number | null; preco?: number | null; entrada: number; prazo: number; dataPrimeiro?: string | null }

/** Primeiro pagamento padrão: dia 10 do mês seguinte */
export function dataPadrao(agora = new Date()): string {
  const d = new Date(agora.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 10)).toISOString().slice(0, 10);
}

/**
 * Condições + evolutivo. Origem do preço: o lote escolhido (preço de tabela dele), uma área (preço pela área)
 * ou um valor digitado; sem nada, a área padrão das condições (ex.: 3.025,11 m² → R$ 160.000,00).
 */
export function calcularTabela(base: { c: CondicoesPagamento; lotes: LoteTabela[] }, q: PedidoTabela) {
  const { c } = base;
  if (!Number.isInteger(q.entrada) || q.entrada < 1 || q.entrada > c.entradaMaxParcelas) throw new TabelaErro(`Entrada à vista ou em até ${c.entradaMaxParcelas}×`);
  if (!c.prazos.includes(q.prazo)) throw new TabelaErro(`Prazo de ${q.prazo} meses não está nas condições (${c.prazos.join(', ')})`);
  let origem: { tipo: 'lote' | 'area' | 'valor'; codigo?: string; quadra?: string | null; areaM2: number; preco: number };
  let sim: Simulacao;
  if (q.lote) {
    const l = base.lotes.find(x => x.codigo === q.lote!.trim().toUpperCase());
    if (!l) throw new TabelaErro(`Chácara ${q.lote} não encontrada`, 404);
    sim = simular(l.areaM2, q.entrada, c, l.precoTabela);
    origem = { tipo: 'lote', codigo: l.codigo, quadra: l.quadra, areaM2: l.areaM2, preco: sim.preco };
  } else if (q.preco && q.preco > 0) {
    if (q.preco > 100_000_000) throw new TabelaErro('Valor fora do limite');
    sim = simular(q.areaM2 && q.areaM2 > 0 ? q.areaM2 : c.areaBaseM2, q.entrada, c, q.preco);
    origem = { tipo: 'valor', areaM2: sim.areaM2, preco: sim.preco };
  } else {
    const area = q.areaM2 && q.areaM2 > 0 ? q.areaM2 : c.areaBaseM2;
    if (area > 10_000_000) throw new TabelaErro('Área fora do limite');
    sim = simular(area, q.entrada, c);
    origem = { tipo: 'area', areaM2: area, preco: sim.preco };
  }
  const data = q.dataPrimeiro && /^\d{4}-\d{2}-\d{2}$/.test(q.dataPrimeiro) ? q.dataPrimeiro : dataPadrao();
  const linhas = evolucao(sim, q.prazo).map(l => ({ ...l, vencimento: vencimento(data, l.mes) }));
  const opcoesEntrada = Array.from({ length: c.entradaMaxParcelas }, (_, k) => {
    const s = simular(sim.areaM2, k + 1, c, sim.preco);
    return { parcelas: k + 1, valorParcela: s.parcelasEntrada[0], total: s.entradaEfetiva, desconto: k === 0 ? s.descontoAvista : 0, texto: textoEntrada(s) };
  });
  const plano = sim.planos.find(p => p.prazo === q.prazo)!;
  return {
    origem, condicoes: c, simulacao: sim, opcoesEntrada, dataPrimeiro: data, prazo: q.prazo, entrada: q.entrada, linhas,
    resumo: { parcela: plano.parcela, totalSaldo: plano.totalSaldo, juros: plano.juros, totalPago: plano.totalPago },
  };
}
