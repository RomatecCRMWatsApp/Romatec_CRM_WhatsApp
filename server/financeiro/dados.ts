/**
 * Monta os dados dos documentos financeiros a partir do contrato e das cobranças.
 * Os campos de pagamento (linha digitável, código de barras, nosso número, PIX) são copiados do snapshot do Asaas
 * gravado na cobrança — sem nenhum cálculo.
 */
import type { PlanoContrato } from '../contratos/plano';
import { brl, type DadosLamina } from './render/comum';
import { CONTATO_PADRAO, instrucoesFicha, type DadosCarne, type DadosParcela } from './render/documentos';

export interface SnapshotAsaas {
  identificationField: string;
  barCode: string;
  nossoNumero: string;
  pixPayload: string | null;
  pixQrBase64?: string | null;
}

export interface CobrancaDoc {
  id: number;
  /** reforco = reforço anual (Plano A); complemento = resto da entrada sem juros (Plano C) */
  tipo: 'entrada' | 'saldo' | 'avista' | 'renegociacao' | 'reforco' | 'complemento';
  numero: number;
  total: number;
  vencimento: string;
  valor: number;
  juros: number;
  amortizacao: number;
  /** saldo devedor após a parcela */
  saldoDevedor: number | null;
  asaas: SnapshotAsaas | null;
  /** Data de emissão no Asaas (AAAA-MM-DD) */
  dataDocumento: string;
}

export interface ContextoDocs {
  contrato: { id: number; numero: string; modeloVersao: string; codigoVerificacao: string };
  lote: { codigo: string; quadra: string | null; areaM2: number };
  comprador: { nome: string; cpfCnpj: string; endereco: string };
  beneficiario: string;
  agenciaCodigo: string;
  urlPublica: string;
  plano: PlanoContrato;
}

const ROTULO = { entrada: 'Entrada', saldo: 'Saldo', avista: 'À vista', renegociacao: 'Renegociação', reforco: 'Reforço anual', complemento: 'Complemento da entrada' } as const;
export const rotuloParcela = (c: Pick<CobrancaDoc, 'tipo' | 'numero' | 'total'>) => `${ROTULO[c.tipo]} ${c.numero}/${c.total}`;
const area = (m2: number) => m2.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const docMascarado = (d: string) => {
  const s = d.replace(/\D/g, '');
  return s.length === 11 ? `CPF ${s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}` : s.length === 14 ? `CNPJ ${s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}` : d;
};

export class SemDadosAsaasError extends Error {
  constructor(c: CobrancaDoc) { super(`Cobrança ${rotuloParcela(c)} ainda não foi emitida no Asaas (sem linha digitável)`); }
}

export function dadosLamina(ctx: ContextoDocs, c: CobrancaDoc): DadosLamina {
  if (!c.asaas?.identificationField || !c.asaas.barCode) throw new SemDadosAsaasError(c);
  const parcela = rotuloParcela(c);
  const prefixo = c.tipo === 'entrada' ? 'E' : c.tipo === 'saldo' ? 'S' : c.tipo === 'renegociacao' ? 'R' : c.tipo === 'reforco' ? 'F' : c.tipo === 'complemento' ? 'C' : 'V';
  return {
    contratoNumero: ctx.contrato.numero, loteCodigo: ctx.lote.codigo, parcela, vencimento: c.vencimento, valor: c.valor,
    nossoNumero: c.asaas.nossoNumero, linhaDigitavel: c.asaas.identificationField, codigoBarras: c.asaas.barCode,
    pixPayload: c.asaas.pixPayload, pixQrBase64: c.asaas.pixQrBase64 ?? null,
    beneficiario: ctx.beneficiario, agenciaCodigo: ctx.agenciaCodigo,
    numeroDocumento: `${ctx.contrato.numero.replace(/^([A-Z]+)-\d{4}-/, '$1')}-${prefixo}${String(c.numero).padStart(3, '0')}`,
    dataDocumento: c.dataDocumento, pagadorNome: ctx.comprador.nome, pagadorDoc: docMascarado(ctx.comprador.cpfCnpj),
    pagadorEndereco: ctx.comprador.endereco, instrucoes: instrucoesFicha(`${parcela} (${ROTULO[c.tipo].toLowerCase()})`, CONTATO_PADRAO, false, c.tipo === 'saldo'),
  };
}

export function dadosParcela(ctx: ContextoDocs, c: CobrancaDoc, todas: CobrancaDoc[]): DadosParcela {
  const restantes = restantesDe(c, ctx.plano);
  void todas;
  return {
    ...dadosLamina(ctx, c),
    loteResumo: `${ctx.lote.codigo} · Quadra ${ctx.lote.quadra ?? '—'} · ${area(ctx.lote.areaM2)} m²`,
    saldoApos: c.tipo === 'saldo' ? c.saldoDevedor : ctx.plano.saldo_valor || null,
    parcelasRestantes: restantes,
  };
}

/** "N do saldo", "N da entrada + M do saldo", "N reforços" … — o que falta depois desta parcela */
export function restantesDe(c: Pick<CobrancaDoc, 'tipo' | 'numero' | 'total'>, plano: Pick<PlanoContrato, 'saldo_qtd'>): string {
  if (c.tipo === 'saldo') return `${c.total - c.numero} do saldo`;
  if (c.tipo === 'entrada') return `${c.total - c.numero} da entrada + ${plano.saldo_qtd} do saldo`;
  if (c.tipo === 'reforco') return `${c.total - c.numero} reforço(s) anual(is)`;
  if (c.tipo === 'complemento') return `${c.total - c.numero} do complemento da entrada`;
  return '—';
}

/** Parcelas por carnê: carnê anual, como nos escritórios (vencido o ano, o cliente pede o próximo) */
export const PARCELAS_POR_CARNE = 12;
const ORDEM_TIPO: Record<string, number> = { avista: 0, entrada: 0, complemento: 1, saldo: 1, reforco: 2, renegociacao: 3, antecipacao: 4 };
/** Ordem dos vencimentos (planos de lançamento têm complemento/reforço no mesmo mês da parcela); empate pelo tipo e nº */
const emOrdem = <T extends { tipo: string; numero: number; vencimento?: string }>(l: T[]) =>
  [...l].sort((a, b) => String(a.vencimento ?? '').localeCompare(String(b.vencimento ?? '')) || (ORDEM_TIPO[a.tipo] ?? 9) - (ORDEM_TIPO[b.tipo] ?? 9) || a.numero - b.numero);

/**
 * Carnê N = 12 parcelas seguidas, na ordem dos vencimentos (entrada e depois saldo), contando do início do contrato:
 * entrada 6× + 120× → carnê 1 = Entrada 1–6 + Saldo 1–6, carnê 2 = Saldo 7–18… 'completo' = todas as parcelas (controle).
 */
export function blocoDoCarne<T extends { tipo: string; numero: number }>(cobrancas: T[], bloco: number | 'completo'): T[] {
  // Carnê anual = parcelas do plano; renegociação e antecipação saem avulsas (boleto/PIX de cada uma)
  const todas = emOrdem(cobrancas.filter(c => c.tipo !== 'antecipacao' && c.tipo !== 'renegociacao'));
  if (bloco === 'completo') return todas;
  if (!Number.isInteger(bloco) || bloco < 1) throw new Error('Bloco inválido');
  return todas.slice((bloco - 1) * PARCELAS_POR_CARNE, bloco * PARCELAS_POR_CARNE);
}

export const totalDeBlocos = (plano: Pick<PlanoContrato, 'parcelas'>) => Math.max(1, Math.ceil(plano.parcelas.length / PARCELAS_POR_CARNE));

export function dadosCarne(ctx: ContextoDocs, bloco: CobrancaDoc[], n: number | 'completo'): DadosCarne {
  const s = ctx.plano;
  const ent = bloco.filter(c => c.tipo === 'entrada'), sal = bloco.filter(c => c.tipo === 'saldo');
  const comp = bloco.filter(c => c.tipo === 'complemento'), ref = bloco.filter(c => c.tipo === 'reforco');
  const faixa = (l: CobrancaDoc[], nome: string) => (l.length ? `${nome} ${l[0].numero}/${l[0].total} a ${l.at(-1)!.numero}/${l.at(-1)!.total}` : '');
  const ultimaEntrada = s.parcelas.filter(p => p.tipo === 'entrada').at(-1);
  return {
    contratoNumero: ctx.contrato.numero, modeloVersao: ctx.contrato.modeloVersao,
    compradorNome: ctx.comprador.nome, compradorDoc: docMascarado(ctx.comprador.cpfCnpj),
    unidade: `Chácara ${ctx.lote.codigo} · Quadra ${ctx.lote.quadra ?? '—'} · ${area(ctx.lote.areaM2)} m²`, loteCodigo: ctx.lote.codigo,
    precoTabela: s.preco_tabela,
    entradaResumo: s.entrada_qtd ? `${s.entrada_qtd} × ${brl(s.entrada_parcela)} — ${s.entrada_venc1.split('-').reverse().join('/')} a ${ultimaEntrada?.vencimento.split('-').reverse().join('/') ?? ''}` : '—',
    saldoResumo: s.saldo_qtd ? `${s.saldo_qtd} × ${brl(s.saldo_parcela)} fixas — Tabela Price, ${(s.taxa_aa * 100).toLocaleString('pt-BR')}% a.a. efetivos` : '—',
    esteCarne: `${[faixa(ent, 'Entrada'), faixa(comp, 'Complemento'), faixa(sal, 'Saldo'), faixa(ref, 'Reforço')].filter(Boolean).join(' + ')} (${n === 'completo' ? 'carnê completo' : `carnê ${n} de ${totalDeBlocos(s)} — 12 meses`})`,
    saldoFinanciado: s.saldo_valor, taxaAA: s.taxa_aa, taxaAM: s.taxa_am, entradaQtd: s.entrada_qtd, entradaValor: s.entrada_parcela,
    saldoQtd: s.saldo_qtd, saldoParcela: s.saldo_parcela, totalJuros: s.total_juros,
    linhas: bloco.map(c => ({ parcela: rotuloParcela(c), vencimento: c.vencimento, valor: c.valor, juros: c.juros, amortizacao: c.amortizacao, saldoApos: c.saldoDevedor })),
    laminas: bloco.map(c => dadosLamina(ctx, c)),
    urlCarneDigital: `${ctx.urlPublica}/c/${ctx.contrato.codigoVerificacao}`,
    beneficiario: ctx.beneficiario,
  };
}
