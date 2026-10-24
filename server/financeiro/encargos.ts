/**
 * Encargos de parcela em atraso — CPCV, Cláusula 7ª: correção pelo IPCA pro rata die + multa de 2% +
 * juros de mora de 1% ao mês pro rata die, tudo sobre o valor da parcela (corrigido). Usado só na 2ª via:
 * na emissão normal o Asaas aplica multa/juros nativos (fine 2 / interest 1) para quem paga o boleto original.
 */
import { r2 } from '../../shared/simulador';

export const MULTA_PCT = 0.02;
export const JUROS_MES_PCT = 0.01;
/** Acima disso a 2ª via é bloqueada: vai para negociação (spec) */
export const DIAS_MAX_SEGUNDA_VIA = 59;

/** "AAAA-MM" → variação mensal do IPCA em % (0,44 = 0,44%) */
export type IndicesIpca = Map<string, number> | Record<string, number>;

export interface Encargos {
  dias: number;
  valor: number;
  fatorIpca: number;
  correcao: number;
  corrigido: number;
  multa: number;
  juros: number;
  /** encargos = correção + multa + juros */
  encargos: number;
  total: number;
  /** true quando não havia nenhum índice: só multa + juros */
  semIpca: boolean;
}

const DIA = 86_400_000;
const utc = (iso: string) => { const [a, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(a, m - 1, d); };
export const diasEntre = (de: string, ate: string) => Math.round((utc(ate) - utc(de)) / DIA);
const isoDe = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Índice do mês; faltando (IBGE ainda não publicou), vale o último publicado antes dele */
function indiceDoMes(indices: Map<string, number>, comp: string, ordenadas: string[]): number | null {
  if (indices.has(comp)) return indices.get(comp)!;
  const anterior = ordenadas.filter(c => c < comp).pop();
  return anterior ? indices.get(anterior)! : null;
}

/** Fator de correção pelo IPCA pro rata die entre o vencimento (inclusive) e o pagamento (exclusive) */
export function fatorIpca(vencimento: string, pagamento: string, indicesIn: IndicesIpca): { fator: number; semIpca: boolean } {
  const indices = indicesIn instanceof Map ? indicesIn : new Map(Object.entries(indicesIn));
  if (!indices.size) return { fator: 1, semIpca: true };
  const ordenadas = Array.from(indices.keys()).sort();
  let fator = 1;
  for (let t = utc(vencimento); t < utc(pagamento); t += DIA) {
    const d = new Date(t);
    const comp = isoDe(t).slice(0, 7);
    const v = indiceDoMes(indices, comp, ordenadas);
    if (v == null) continue;
    const diasNoMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    fator *= Math.pow(1 + v / 100, 1 / diasNoMes);
  }
  return { fator, semIpca: false };
}

export function calcularEncargos(valor: number, vencimento: string, pagamento: string, indices: IndicesIpca = new Map()): Encargos {
  const dias = diasEntre(vencimento, pagamento);
  if (dias <= 0) {
    return { dias: Math.max(dias, 0), valor, fatorIpca: 1, correcao: 0, corrigido: valor, multa: 0, juros: 0, encargos: 0, total: valor, semIpca: false };
  }
  const { fator, semIpca } = fatorIpca(vencimento, pagamento, indices);
  const corrigido = r2(valor * fator);
  const multa = r2(corrigido * MULTA_PCT);
  const juros = r2((corrigido * JUROS_MES_PCT * dias) / 30);
  const total = r2(corrigido + multa + juros);
  return { dias, valor, fatorIpca: fator, correcao: r2(corrigido - valor), corrigido, multa, juros, encargos: r2(total - valor), total, semIpca };
}

/** Feriados nacionais fixos (MM-DD) — o boleto não vence neles */
const FERIADOS_FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];

export function diaUtil(iso: string): boolean {
  const d = new Date(utc(iso)).getUTCDay();
  return d !== 0 && d !== 6 && !FERIADOS_FIXOS.includes(iso.slice(5, 10));
}

/** hoje + n dias úteis */
export function somarDiasUteis(iso: string, n: number): string {
  let t = utc(iso), faltam = n;
  while (faltam > 0) {
    t += DIA;
    if (diaUtil(isoDe(t))) faltam--;
  }
  return isoDe(t);
}
