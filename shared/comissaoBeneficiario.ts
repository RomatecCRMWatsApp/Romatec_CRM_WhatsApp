/**
 * Comissão de gestão e corretagem da concessão paga pelo(a) beneficiário(a), em até 4 parcelas mensais por boleto/PIX.
 * O(A) beneficiário(a) assina a proposta (termo de ciência e assunção) pelo link; assinada, as cobranças vão para o Asaas.
 */
export const MAX_PARCELAS_COMISSAO = 4;
export interface ParcelaComissao { numero: number; vencimento: string; valor: number }

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Mesmo dia nos meses seguintes (dia 31 em mês curto: último dia do mês) */
export function mesSeguinte(iso: string, k: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + k, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/** Parcelas iguais; os centavos que sobram vão na última */
export function parcelasComissao(valor: number, n: number, primeiroVencimento: string): ParcelaComissao[] {
  if (!(valor > 0)) throw new Error('Informe o valor da comissão');
  if (!Number.isInteger(n) || n < 1 || n > MAX_PARCELAS_COMISSAO) throw new Error(`A comissão pode ser dividida em 1 a ${MAX_PARCELAS_COMISSAO} vezes`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(primeiroVencimento)) throw new Error('Informe o 1º vencimento');
  const base = Math.floor((valor / n) * 100) / 100;
  return Array.from({ length: n }, (_, k) => ({
    numero: k + 1, vencimento: mesSeguinte(primeiroVencimento, k), valor: k === n - 1 ? r2(valor - base * (n - 1)) : base,
  }));
}
