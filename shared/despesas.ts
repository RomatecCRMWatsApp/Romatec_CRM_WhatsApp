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

// ─── Origem do recurso: caixa do empreendimento ou terceiro (o empreendimento passa a dever) ───
export const ORIGENS_RECURSO = ['caixa', 'terceiro'] as const;
export type OrigemRecurso = typeof ORIGENS_RECURSO[number];
export const ROTULO_ORIGEM: Record<OrigemRecurso, string> = { caixa: 'Caixa do empreendimento', terceiro: 'Recurso de terceiro' };
export const MODALIDADES_TERCEIRO = ['emprestimo', 'permuta', 'adiantamento', 'outro'] as const;
export type ModalidadeTerceiro = typeof MODALIDADES_TERCEIRO[number];
export const ROTULO_MODALIDADE: Record<ModalidadeTerceiro, string> = { emprestimo: 'Empréstimo', permuta: 'Permuta', adiantamento: 'Adiantamento', outro: 'Outro' };

export interface DespesaTerceiro {
  status: string; origemRecurso?: string | null; terceiroNome?: string | null; valor: number; valorPago?: number | null;
  reembolsadoEm?: string | null; reembolsoValor?: number | null;
}

/**
 * Dívida do empreendimento com quem bancou despesas com recurso próprio: total bancado (despesas pagas), já devolvido
 * e em aberto, por terceiro. Despesa cancelada ou ainda não paga não gera dívida.
 */
export function resumoTerceiros(ds: DespesaTerceiro[]) {
  const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
  const por = new Map<string, { terceiro: string; bancado: number; devolvido: number; emAberto: number }>();
  for (const d of ds) {
    if (d.status !== 'paga' || d.origemRecurso !== 'terceiro') continue;
    const nome = (d.terceiroNome || 'Terceiro não informado').trim();
    const g = por.get(nome) ?? { terceiro: nome, bancado: 0, devolvido: 0, emAberto: 0 };
    const valor = Number(d.valorPago ?? d.valor) || 0;
    const devolvido = d.reembolsadoEm ? Number(d.reembolsoValor ?? valor) || 0 : 0;
    g.bancado = r2(g.bancado + valor);
    g.devolvido = r2(g.devolvido + devolvido);
    g.emAberto = r2(g.bancado - g.devolvido);
    por.set(nome, g);
  }
  const lista = Array.from(por.values()).sort((a, b) => b.emAberto - a.emAberto);
  return {
    porTerceiro: lista,
    bancado: r2(lista.reduce((s, x) => s + x.bancado, 0)), devolvido: r2(lista.reduce((s, x) => s + x.devolvido, 0)), emAberto: r2(lista.reduce((s, x) => s + x.emAberto, 0)),
  };
}
