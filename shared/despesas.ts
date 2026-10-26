/**
 * Despesas do fluxo de caixa (saídas): categorias, formas de pagamento e a recorrência mensal.
 * Regras puras, usadas no servidor (server/financeiro/despesas.ts) e na tela do Financeiro.
 */
export const CATEGORIAS_DESPESA = [
  'obras', 'comissoes', 'marketing', 'cartorio', 'impostos', 'projetos', 'pessoal', 'administrativo', 'outros',
] as const;
export type CategoriaDespesa = typeof CATEGORIAS_DESPESA[number];
export const ROTULO_CATEGORIA: Record<CategoriaDespesa, string> = {
  obras: 'Obras e infraestrutura', comissoes: 'Comissões', marketing: 'Marketing e divulgação', cartorio: 'Cartório, registro e taxas',
  impostos: 'Impostos', projetos: 'Projetos e topografia', pessoal: 'Pessoal', administrativo: 'Administrativo', outros: 'Outros',
};

export const FORMAS_DESPESA = ['PIX', 'BOLETO', 'TRANSFERENCIA', 'DINHEIRO', 'CARTAO', 'OUTRO'] as const;
export type FormaDespesa = typeof FORMAS_DESPESA[number];

export type StatusDespesa = 'aberta' | 'paga' | 'cancelada';

/** Mesmo dia nos meses seguintes; dia 31 em mês curto vira o último dia (31/01 → 28/02 → 31/03) */
export function vencimentosRecorrentes(primeiro: string, meses: number): string[] {
  const [a, m, d] = primeiro.split('-').map(Number);
  return Array.from({ length: Math.max(1, meses) }, (_, i) => {
    const alvo = new Date(Date.UTC(a, m - 1 + i, 1));
    const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
    return `${alvo.getUTCFullYear()}-${String(alvo.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
  });
}

/** Situação para a tela: vencida = aberta com vencimento antes de hoje */
export function situacaoDespesa(d: { status: string; vencimento: string }, hoje: string): 'paga' | 'cancelada' | 'vencida' | 'a_pagar' {
  if (d.status === 'paga') return 'paga';
  if (d.status === 'cancelada') return 'cancelada';
  return d.vencimento < hoje ? 'vencida' : 'a_pagar';
}
