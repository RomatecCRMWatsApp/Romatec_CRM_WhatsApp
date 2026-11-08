/**
 * Painel financeiro (Financeiro › Painel): regras de cálculo puras, a mesma base do Fluxo de caixa.
 * - Movimentações do período (regime de caixa): parcelas efetivamente recebidas (data do pagamento) e despesas pagas.
 * - Posição em aberto: parcelas e despesas em aberto na data de corte (sempre a posição atual: o sistema não guarda o
 *   histórico de saldos para reconstruir uma posição passada).
 * Valores em centavos inteiros nos cálculos; reais com 2 casas na saída.
 */

/** id é texto: parcelas ("c12") e comissões ("k7") convivem sem colidir. categoria = rótulo exibido e filtrável */
export interface Recebimento { id: string; data: string; valor: number; contratoId: number | null; cliente: string; descricao: string; tipo: string; categoria: string; forma: string; empreendimentoId: number | null }
export interface Pagamento { id: string; data: string; valor: number; fornecedor: string; descricao: string; categoria: string; empreendimentoId: number | null; contratoId?: number | null }
export interface TituloReceber { id: string; contratoId: number | null; cliente: string; descricao: string; categoria: string; vencimento: string; valor: number; status: string; empreendimentoId: number | null }
export interface TituloPagar { id: string; fornecedor: string; descricao: string; categoria: string; vencimento: string; valor: number; empreendimentoId: number | null; contratoId?: number | null }

export const ROTULO_TIPO_PARCELA: Record<string, string> = {
  entrada: 'Entrada', saldo: 'Parcelas do saldo', avista: 'À vista', reforco: 'Reforço anual', complemento: 'Resto da entrada',
};
/** Categorias das comissões no mesmo fluxo de caixa */
export const CAT_COMISSAO_GESTAO = 'Comissão de gestão (concessões)';
export const CAT_COMISSAO_CORRETOR = 'Comissão de corretor (repasses)';

/** Filtro por categoria e por cliente/fornecedor (texto): o mesmo recorte vale para todos os blocos */
export function filtrar<T extends { categoria: string }>(l: T[], f: { categoria?: string | null; pessoa?: string | null }, pessoa: (x: T) => string): T[] {
  const q = (f.pessoa ?? '').trim().toLowerCase();
  return l.filter(x => (!f.categoria || x.categoria === f.categoria) && (!q || pessoa(x).toLowerCase().includes(q)));
}

/** Meta do mês (recebimentos): vale só quando o período é um mês do calendário (inteiro ou em andamento) */
export function metaDoPeriodo(de: string, ate: string, metas: { padrao?: number | null; meses?: Record<string, number> }): { mes: string; valor: number } | null {
  if (de.slice(8) !== '01' || de.slice(0, 7) !== ate.slice(0, 7)) return null;
  const mes = de.slice(0, 7);
  const v = metas.meses?.[mes] ?? metas.padrao ?? null;
  return v != null && v > 0 ? { mes, valor: v } : null;
}

const c = (v: number) => Math.round(v * 100);
const r = (cent: number) => cent / 100;
const DIA = 86_400_000;
const t = (d: string) => Date.parse(`${d}T12:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Período anterior equivalente: mesma duração, imediatamente antes (mês corrente → mesmos dias do mês anterior) */
export function periodoAnterior(de: string, ate: string): { de: string; ate: string } {
  const [ya, ma, da] = de.split('-').map(Number);
  const inicioDoMes = da === 1;
  const fimMesmoMes = ate.slice(0, 7) === de.slice(0, 7);
  if (inicioDoMes && fimMesmoMes) {
    // Mês (inteiro ou em andamento): mesmo trecho de dias do mês anterior, limitado ao fim dele
    const ini = new Date(Date.UTC(ya, ma - 2, 1));
    const ultimoDia = new Date(Date.UTC(ya, ma - 1, 0)).getUTCDate();
    const diaFim = Math.min(Number(ate.slice(8, 10)), ultimoDia);
    return { de: iso(ini.getTime()), ate: iso(Date.UTC(ya, ma - 2, diaFim)) };
  }
  const n = Math.round((t(ate) - t(de)) / DIA) + 1;
  return { de: iso(t(de) - n * DIA), ate: iso(t(de) - DIA) };
}

/** Variação: % só com base positiva; senão a diferença absoluta e o aviso */
export function variacao(atual: number, anterior: number): { absoluta: number; percentual: number | null } {
  const absoluta = r(c(atual) - c(anterior));
  return { absoluta, percentual: anterior > 0 ? Math.round(((atual - anterior) / anterior) * 1000) / 10 : null };
}

/** Agrupamento do gráfico: dia (até 62 dias), semana (até 26 semanas) ou mês */
export function agrupamento(de: string, ate: string): 'dia' | 'semana' | 'mes' {
  const n = Math.round((t(ate) - t(de)) / DIA) + 1;
  return n <= 62 ? 'dia' : n <= 182 ? 'semana' : 'mes';
}

function chaveBucket(data: string, g: 'dia' | 'semana' | 'mes'): string {
  if (g === 'dia') return data;
  if (g === 'mes') return data.slice(0, 7);
  // Semana começando na segunda-feira
  const d = new Date(t(data));
  const desloc = (d.getUTCDay() + 6) % 7;
  return iso(t(data) - desloc * DIA);
}

function buckets(de: string, ate: string, g: 'dia' | 'semana' | 'mes'): string[] {
  const out = new Set<string>();
  for (let ms = t(de); ms <= t(ate); ms += DIA) out.add(chaveBucket(iso(ms), g));
  return Array.from(out).sort();
}

export function calcularPainel(o: {
  de: string; ate: string; corte: string;
  recebimentos: Recebimento[]; pagamentos: Pagamento[]; aReceber: TituloReceber[]; aPagar: TituloPagar[];
  janelaPagarDias?: number;
}) {
  const dentro = (d: string, de: string, ate: string) => d >= de && d <= ate;
  const soma = (l: { valor: number }[]) => r(l.reduce((s, x) => s + c(x.valor), 0));
  const ant = periodoAnterior(o.de, o.ate);
  const rec = o.recebimentos.filter(x => dentro(x.data, o.de, o.ate));
  const pag = o.pagamentos.filter(x => dentro(x.data, o.de, o.ate));
  const recAnt = o.recebimentos.filter(x => dentro(x.data, ant.de, ant.ate));
  const pagAnt = o.pagamentos.filter(x => dentro(x.data, ant.de, ant.ate));
  const recebido = soma(rec), pago = soma(pag);
  const recebidoAnt = soma(recAnt), pagoAnt = soma(pagAnt);
  const resultado = r(c(recebido) - c(pago)), resultadoAnt = r(c(recebidoAnt) - c(pagoAnt));

  // Posição em aberto na data de corte
  const vencidos = o.aReceber.filter(x => x.vencimento < o.corte);
  const venceHoje = o.aReceber.filter(x => x.vencimento === o.corte);
  const janela = o.janelaPagarDias ?? 7;
  const limitePagar = iso(t(o.corte) + janela * DIA);

  // Gráfico
  const g = agrupamento(o.de, o.ate);
  const mapa = new Map(buckets(o.de, o.ate, g).map(k => [k, { entradas: 0, saidas: 0 }]));
  for (const x of rec) { const b = mapa.get(chaveBucket(x.data, g)); if (b) b.entradas += c(x.valor); }
  for (const x of pag) { const b = mapa.get(chaveBucket(x.data, g)); if (b) b.saidas += c(x.valor); }
  const serie = Array.from(mapa.entries()).map(([periodo, b]) => ({ periodo, entradas: r(b.entradas), saidas: r(b.saidas), resultado: r(b.entradas - b.saidas) }));

  // Distribuição dos recebimentos (por tipo de parcela), conciliando com o recebido
  const porTipo = new Map<string, number>();
  for (const x of rec) { const k = x.categoria || 'Sem categoria'; porTipo.set(k, (porTipo.get(k) ?? 0) + c(x.valor)); }
  const distribuicao = Array.from(porTipo.entries()).map(([grupo, v]) => ({ grupo, valor: r(v) })).sort((a, b) => b.valor - a.valor);

  return {
    periodo: { de: o.de, ate: o.ate, anterior: ant }, corte: o.corte, agrupamento: g,
    caixa: {
      recebido, pago, resultado, qtdRecebimentos: rec.length, qtdPagamentos: pag.length,
      comparacao: { recebido: variacao(recebido, recebidoAnt), pago: variacao(pago, pagoAnt), resultado: variacao(resultado, resultadoAnt), anterior: { recebido: recebidoAnt, pago: pagoAnt, resultado: resultadoAnt } },
    },
    posicao: {
      aReceber: soma(o.aReceber), qtdAReceber: o.aReceber.length,
      aPagar: soma(o.aPagar), qtdAPagar: o.aPagar.length,
      vencidos: soma(vencidos), qtdVencidos: vencidos.length,
      venceHoje: soma(venceHoje), qtdVenceHoje: venceHoje.length,
    },
    serie, distribuicao,
    alertas: {
      atrasados: vencidos.slice().sort((a, b) => a.vencimento.localeCompare(b.vencimento) || b.valor - a.valor).slice(0, 12)
        .map(x => ({ ...x, diasAtraso: Math.round((t(o.corte) - t(x.vencimento)) / DIA) })),
      pagarEmBreve: { ate: limitePagar, itens: o.aPagar.filter(x => x.vencimento <= limitePagar).sort((a, b) => a.vencimento.localeCompare(b.vencimento)).slice(0, 12)
        .map(x => ({ ...x, vencida: x.vencimento < o.corte })) },
    },
    movimentacoes: [
      ...rec.map(x => ({ id: `r${x.id}`, data: x.data, natureza: 'entrada' as const, pessoa: x.cliente, descricao: x.descricao, valor: x.valor, classificacao: `${x.categoria || 'Sem categoria'} · ${x.forma}`, contratoId: x.contratoId })),
      ...pag.map(x => ({ id: `p${x.id}`, data: x.data, natureza: 'saida' as const, pessoa: x.fornecedor, descricao: x.descricao, valor: x.valor, classificacao: x.categoria, contratoId: x.contratoId ?? null })),
    ].sort((a, b) => b.data.localeCompare(a.data)),
  };
}
