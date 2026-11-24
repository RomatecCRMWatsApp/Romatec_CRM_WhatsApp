/**
 * Quando a proprietária paga uma comissão à gestora (Pix), o pagamento sai do caixa do empreendimento: o sistema lança
 * a despesa "Comissões" já paga e guarda o vínculo no registro do recebimento (observação "despesa:#id"). Desfazer o
 * recebimento cancela essa despesa. Assim o fluxo de caixa e o saldo da proprietária não contam a comissão duas vezes.
 */
const FORMA: Record<string, string> = { pix: 'PIX', transferência: 'TRANSFERENCIA', transferencia: 'TRANSFERENCIA', dinheiro: 'DINHEIRO', boleto: 'BOLETO', cartão: 'CARTAO', cartao: 'CARTAO' };
export const formaDespesa = (f?: string | null) => FORMA[String(f ?? 'pix').trim().toLowerCase()] ?? 'OUTRO';
export const MARCA_DESPESA = /despesa:#(\d+)/;

export async function lancarSaidaComissao(o: { empreendimentoId: number | null; descricao: string; valor: number; pagoEm: string; forma?: string | null; autorId: number }): Promise<number | null> {
  if (!o.empreendimentoId || !(o.valor > 0)) return null;
  const { lancarDespesa } = await import('./despesas');
  const r = await lancarDespesa({
    empreendimentoId: o.empreendimentoId, descricao: o.descricao.slice(0, 200), categoria: 'comissoes', fornecedor: 'Romatec Consultoria Total',
    valor: o.valor, vencimento: o.pagoEm, pagoEm: o.pagoEm, formaPagamento: formaDespesa(o.forma), origemRecurso: 'caixa',
    observacao: 'Lançada pelo sistema ao registrar o recebimento da comissão pela gestora',
  }, o.autorId);
  return r.ids[0] ?? null;
}

/** Cancela a despesa vinculada a um recebimento (se houver) */
export async function cancelarSaidaComissao(observacao: string | null | undefined, autorId: number) {
  const m = MARCA_DESPESA.exec(String(observacao ?? ''));
  if (!m) return;
  const id = Number(m[1]);
  const { reabrirDespesa, cancelarDespesa } = await import('./despesas');
  try {
    await reabrirDespesa(id, autorId).catch(() => null);
    await cancelarDespesa(id, 'Recebimento da comissão desfeito', autorId);
  } catch (e: any) { console.warn('[Comissão] despesa vinculada não cancelada:', e?.message); }
}
