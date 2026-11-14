/**
 * Condições de pagamento fora do padrão do lançamento. O administrador escolhe livremente; corretor e secretária
 * precisam da senha do administrador no aparelho. A parcela personalizada é exclusiva do administrador.
 */
export interface PlanoAutorizavel {
  modalidade?: string;
  condicao?: string | null;
  entradaForma?: string | null;
  inicioParcelas?: string | null;
  sinalParcelas?: number | null;
  parcelaPersonalizada?: number | null;
}

/** O que no plano foge do padrão (vazio = padrão, sem autorização) */
export function foraDoPadrao(p: PlanoAutorizavel): string[] {
  if (p.modalidade !== 'financiado' || !p.condicao || p.condicao === 'padrao') return [];
  const fora: string[] = [];
  if (p.entradaForma === 'boleto_cartao') fora.push('entrada dividida boleto/PIX + cartão');
  if ((p.sinalParcelas ?? 1) > 1) fora.push(`sinal em ${p.sinalParcelas} parcelas`);
  if (p.inicioParcelas) fora.push('1º vencimento das parcelas escolhido');
  if (p.parcelaPersonalizada != null) fora.push('valor da parcela personalizado');
  return fora;
}
