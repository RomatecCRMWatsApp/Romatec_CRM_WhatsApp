/**
 * Ficha completa do cliente: regras puras do resumo financeiro e da linha do tempo (server/fichaCliente.ts monta,
 * client/src/pages/FichaCliente.tsx mostra).
 */

export type ParcelaResumo = { valor: number; vencimento: string; status: string; valorPago?: number | null; pagoEm?: string | null };

/** Parcelas que contam no saldo (cancelada/estornada ficam fora) */
const conta = (p: ParcelaResumo) => p.status !== 'cancelada' && p.status !== 'estornada';

/**
 * Resumo das parcelas de um contrato (ou de todos do cliente): contratado, recebido, em aberto, vencido,
 * próxima parcela e dias de atraso da parcela vencida mais antiga. hoje = "AAAA-MM-DD" (horário de Brasília).
 */
export function resumoParcelas(parcelas: ParcelaResumo[], hoje: string) {
  const validas = parcelas.filter(conta);
  const pagas = validas.filter(p => p.status === 'paga');
  const abertas = validas.filter(p => p.status !== 'paga');
  const vencidas = abertas.filter(p => p.vencimento && p.vencimento < hoje);
  const proxima = abertas.filter(p => p.vencimento >= hoje).sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0] ?? null;
  const maisAntiga = vencidas.map(p => p.vencimento).sort()[0] ?? null;
  const dia = 86_400_000;
  const soma = (l: ParcelaResumo[], f: (p: ParcelaResumo) => number) => Math.round(l.reduce((s, p) => s + f(p), 0) * 100) / 100;
  return {
    total: validas.length,
    pagas: pagas.length,
    contratado: soma(validas, p => Number(p.valor) || 0),
    recebido: soma(pagas, p => Number(p.valorPago ?? p.valor) || 0),
    emAberto: soma(abertas, p => Number(p.valor) || 0),
    vencido: soma(vencidas, p => Number(p.valor) || 0),
    parcelasVencidas: vencidas.length,
    diasAtraso: maisAntiga ? Math.max(0, Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${maisAntiga}T12:00:00Z`)) / dia)) : 0,
    proxima: proxima ? { vencimento: proxima.vencimento, valor: Number(proxima.valor) || 0 } : null,
    situacao: !validas.length ? 'sem_parcelas' : !abertas.length ? 'quitado' : vencidas.length ? 'em_atraso' : 'em_dia',
  } as const;
}

export const ROTULO_SITUACAO: Record<string, string> = { sem_parcelas: 'Sem parcelas', quitado: 'Quitado', em_atraso: 'Em atraso', em_dia: 'Em dia' };

export type TipoEvento = 'lead' | 'mensagem' | 'visita' | 'encaminhamento' | 'contrato' | 'pagamento' | 'evento';
export interface EventoFicha { tipo: TipoEvento; quando: string; titulo: string; detalhe?: string | null; url?: string | null }

/** Linha do tempo: mais recente primeiro, sem datas inválidas, no máximo `limite` itens */
export function ordenarLinhaDoTempo(eventos: EventoFicha[], limite = 80): EventoFicha[] {
  return eventos
    .filter(e => e.quando && Number.isFinite(Date.parse(e.quando)))
    .sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando))
    .slice(0, limite);
}

export const ROTULO_STATUS_CONTRATO: Record<string, string> = {
  rascunho: 'Rascunho', minuta: 'Minuta', apto_assinatura: 'Pronto para assinar', em_assinatura: 'Em assinatura', assinado: 'Assinado',
  ativo: 'Ativo', quitado: 'Quitado', distratado: 'Distratado', cancelado: 'Cancelado',
};
export const ROTULO_VISITA: Record<string, string> = { agendada: 'agendada', confirmada: 'confirmada', realizada: 'realizada', nao_veio: 'não veio', cancelada: 'cancelada' };
export const ROTULO_DESFECHO: Record<string, string> = {
  vendido: 'vendeu', desistiu: 'cliente desistiu', sem_contato: 'sem contato', nao_qualificado: 'não qualificado', comprou_outro: 'comprou outro', repassado: 'repassado',
};

/** Telefones comparáveis: só dígitos, sem o 55 do Brasil */
export const foneComparavel = (t: string | null | undefined) => String(t ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
