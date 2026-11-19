/**
 * Portal do comprador (/c/:codigo): antecipação de parcelas e chamados. A antecipação desconta os juros pela taxa
 * mensal do contrato (Código de Defesa do Consumidor, art. 52, § 2º): cada parcela vale o valor presente na data de
 * hoje. É uma simulação — o escritório confirma o valor e emite a cobrança.
 */

export const TIPOS_CHAMADO = ['duvida', 'financeiro', 'antecipacao', 'documento', 'obra', 'outro'] as const;
export type TipoChamado = typeof TIPOS_CHAMADO[number];
export const ROTULO_CHAMADO: Record<TipoChamado, string> = {
  duvida: 'Dúvida', financeiro: 'Pagamento / boleto', antecipacao: 'Antecipação de parcelas', documento: 'Documentos', obra: 'Obra', outro: 'Outro assunto',
};

export interface ParcelaAntecipavel { id: number; rotulo: string; vencimento: string; valor: number }
export interface LinhaAntecipacao extends ParcelaAntecipavel { meses: number; valorPresente: number; desconto: number }
export interface Antecipacao { parcelas: LinhaAntecipacao[]; totalNominal: number; totalAPagar: number; economia: number; taxaMensal: number; percentual: number }
/** Uma linha da tabela "quanto você economiza": antecipar as `quantidade` últimas parcelas hoje */
export interface LinhaTabelaAntecipacao { quantidade: number; quitaTudo: boolean; totalNominal: number; totalAPagar: number; economia: number; percentual: number }

const r2 = (v: number) => Math.round(v * 100) / 100;
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

/**
 * Antecipa as `quantidade` últimas parcelas em aberto (do fim para o começo, como é usual no saldo financiado).
 * Valor presente = valor ÷ (1 + i)^(dias/30). Parcela vencida ou do mês (≤ 30 dias) não entra.
 */
export function simularAntecipacao(abertas: ParcelaAntecipavel[], taxaMensal: number, quantidade: number, hoje: string): Antecipacao {
  const futuras = abertas.filter(p => diasEntre(hoje, p.vencimento) > 30).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const escolhidas = futuras.slice(Math.max(0, futuras.length - Math.max(0, Math.floor(quantidade))));
  const i = Math.max(0, taxaMensal || 0);
  const parcelas = escolhidas.map(p => {
    const meses = diasEntre(hoje, p.vencimento) / 30;
    const valorPresente = r2(p.valor / Math.pow(1 + i, meses));
    return { ...p, meses: Math.round(meses * 10) / 10, valorPresente, desconto: r2(p.valor - valorPresente) };
  });
  const totalNominal = r2(parcelas.reduce((s, p) => s + p.valor, 0));
  const totalAPagar = r2(parcelas.reduce((s, p) => s + p.valorPresente, 0));
  const economia = r2(totalNominal - totalAPagar);
  return { parcelas, totalNominal, totalAPagar, economia, taxaMensal: i, percentual: totalNominal > 0 ? Math.round((economia / totalNominal) * 10000) / 100 : 0 };
}

/** Quantas parcelas dá para antecipar (as que vencem daqui a mais de 30 dias) */
export const antecipaveis = (abertas: ParcelaAntecipavel[], hoje: string) => abertas.filter(p => diasEntre(hoje, p.vencimento) > 30).length;

/** Quantidades mostradas na tabela do portal (as que couberem) + "quitar tudo" */
export const QUANTIDADES_TABELA = [1, 6, 12, 24, 36, 60] as const;

/**
 * Tabela "quanto você economiza" do portal: antecipar hoje as últimas 1, 6, 12, 24, 36 e 60 parcelas (as que houver)
 * e todas as antecipáveis (quitação). Mesma conta da simulação (valor presente pela taxa do contrato).
 */
export function tabelaAntecipacao(abertas: ParcelaAntecipavel[], taxaMensal: number, hoje: string): LinhaTabelaAntecipacao[] {
  const max = antecipaveis(abertas, hoje);
  if (!max) return [];
  const qtds = [...QUANTIDADES_TABELA.filter(q => q < max), max];
  return qtds.map(q => {
    const s = simularAntecipacao(abertas, taxaMensal, q, hoje);
    return { quantidade: q, quitaTudo: q === max, totalNominal: s.totalNominal, totalAPagar: s.totalAPagar, economia: s.economia, percentual: s.percentual };
  });
}
