/**
 * Quando a proprietária paga uma comissão à gestora (Pix), o pagamento sai do caixa do empreendimento: o sistema lança
 * a despesa "Comissões" já paga e guarda o vínculo no registro do recebimento (observação "despesa:#id"). Desfazer o
 * recebimento cancela essa despesa. Assim o fluxo de caixa e o saldo da proprietária não contam a comissão duas vezes.
 */
const FORMA: Record<string, string> = { pix: 'PIX', transferência: 'TRANSFERENCIA', transferencia: 'TRANSFERENCIA', dinheiro: 'DINHEIRO', boleto: 'BOLETO', cartão: 'CARTAO', cartao: 'CARTAO' };
export const formaDespesa = (f?: string | null) => FORMA[String(f ?? 'pix').trim().toLowerCase()] ?? 'OUTRO';
export const MARCA_DESPESA = /despesa:#(\d+)/;

export interface SaidaComissao {
  empreendimentoId: number | null; descricao: string; valor: number; pagoEm: string; forma?: string | null; autorId: number;
  /** Quem recebeu (padrão: a gestora) */
  fornecedor?: string; observacao?: string;
  /** Comprovante do Pix/transferência: fica na despesa e vai anexo ao comunicado da proprietária */
  comprovante?: { base64: string; mime: string; nomeArquivo: string } | null;
  /** Comprovante já guardado (ex.: o do repasse ao corretor): só liga à despesa, sem subir de novo */
  comprovanteUrl?: string | null;
  /** Pede a ciência da proprietária no WhatsApp (comunicado de saída) */
  pedirCiencia?: boolean;
  /** Comissão de venda: contrato e parte — a ciência da proprietária mostra a base (venda, comissão, escritório e corretor) */
  comissao?: { contratoId: number; chave: string } | null;
  /** Recado para a proprietária no pedido de ciência */
  nota?: string | null;
}

export async function lancarSaidaComissao(o: SaidaComissao): Promise<number | null> {
  if (!o.empreendimentoId || !(o.valor > 0)) return null;
  const { lancarDespesa, anexarComprovante } = await import('./despesas');
  const r = await lancarDespesa({
    empreendimentoId: o.empreendimentoId, descricao: o.descricao.slice(0, 200), categoria: 'comissoes', fornecedor: (o.fornecedor || 'Romatec Consultoria Total').slice(0, 120),
    valor: o.valor, vencimento: o.pagoEm, pagoEm: o.pagoEm, formaPagamento: formaDespesa(o.forma), origemRecurso: 'caixa',
    observacao: o.observacao ?? 'Lançada pelo sistema ao registrar o recebimento da comissão pela gestora',
  }, o.autorId);
  const id = r.ids[0] ?? null;
  if (!id) return null;
  if (o.comissao) {
    const { getDb } = await import('../db');
    const { financeiroDespesas } = await import('../../drizzle/schema');
    const { eq } = await import('drizzle-orm');
    const d: any = await getDb();
    await d?.update(financeiroDespesas).set({ comissaoContratoId: o.comissao.contratoId, comissaoChave: o.comissao.chave.replace(/^g:/, '').slice(0, 20) } as any).where(eq(financeiroDespesas.id, id));
  }
  if (o.comprovanteUrl) {
    const { getDb } = await import('../db');
    const { financeiroDespesas } = await import('../../drizzle/schema');
    const { eq } = await import('drizzle-orm');
    const d: any = await getDb();
    await d?.update(financeiroDespesas).set({ comprovanteUrl: o.comprovanteUrl } as any).where(eq(financeiroDespesas.id, id));
  } else if (o.comprovante) await anexarComprovante(id, o.comprovante, o.autorId).catch((e: any) => console.warn('[Comissão] comprovante na despesa:', e?.message));
  if (o.pedirCiencia) {
    const { pedirCiencia } = await import('./despesaCiencia');
    await pedirCiencia(id, o.autorId, undefined, o.nota ?? null).catch((e: any) => console.warn('[Comissão] ciência da proprietária:', e?.message));
  }
  return id;
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
