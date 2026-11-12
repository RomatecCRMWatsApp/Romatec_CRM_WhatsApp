/**
 * Dia de vencimento do carnê escolhido pelo comprador (o escritório define; a emissão no Asaas é feita pelo escritório):
 * as parcelas AINDA NÃO EMITIDAS (prevista) do saldo, do complemento da entrada e dos reforços passam a vencer no dia
 * escolhido. A 1ª parcela do saldo vai para o mês indicado (padrão: o mês seguinte ao pagamento da entrada) e todas as
 * outras andam o mesmo número de meses — a sequência e os intervalos do contrato não mudam (o complemento congelado
 * continua contado do ato). Valores, juros e saldo devedor não mudam (parcelas fixas da Tabela Price).
 * Parcela já emitida no Asaas não é remarcada aqui: cancele a cobrança dela antes.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, contratos } from '../../drizzle/schema';

export class VencimentoErro extends Error { constructor(m: string, public status = 409) { super(m); this.name = 'VencimentoErro'; } }

const TIPOS = ['saldo', 'complemento', 'reforco'];
const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate(); // mes 1..12
const mesDe = (iso: string) => { const [a, m] = iso.slice(0, 7).split('-').map(Number); return a * 12 + (m - 1); };
const isoDe = (mesAbs: number, dia: number) => {
  const ano = Math.floor(mesAbs / 12), mes = (mesAbs % 12) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(dia, ultimoDia(ano, mes))).padStart(2, '0')}`;
};
const br = (iso: string) => iso.split('-').reverse().join('/');

export interface MudancaVencimento { id: number; tipo: string; numero: number; total: number; de: string; para: string }
export interface ResultadoVencimentos { dia: number; primeiraParcela: string; mudancas: MudancaVencimento[]; aplicado: boolean; resumo: string[] }

/** Mês sugerido para a 1ª parcela do saldo: o mês seguinte ao pagamento da entrada (ou ao de hoje, se ainda não paga) */
export function mesSugerido(entradaPagaEm: string | null, hoje: string): string {
  const base = mesDe(entradaPagaEm ?? hoje) + 1;
  return isoDe(base, 1).slice(0, 7);
}

/** Regra pura (testável): novas datas das parcelas previstas */
export function calcularVencimentos(linhas: { id: number; tipo: string; numero: number; total: number; vencimento: string; status: string }[], dia: number, primeiroMes: string): MudancaVencimento[] {
  const saldo = linhas.filter(l => l.tipo === 'saldo').sort((a, b) => a.numero - b.numero)[0];
  if (!saldo) throw new VencimentoErro('Contrato sem parcelas do saldo', 400);
  const delta = mesDe(`${primeiroMes}-01`) - mesDe(String(saldo.vencimento));
  return linhas
    .filter(l => TIPOS.includes(l.tipo) && l.status === 'prevista')
    .map(l => ({ id: l.id, tipo: l.tipo, numero: Number(l.numero), total: Number(l.total), de: String(l.vencimento).slice(0, 10), para: isoDe(mesDe(String(l.vencimento)) + delta, dia) }))
    .sort((a, b) => a.para.localeCompare(b.para) || a.tipo.localeCompare(b.tipo) || a.numero - b.numero);
}

const ROTULO: Record<string, string> = { saldo: 'Parcela', complemento: 'Complemento da entrada', reforco: 'Reforço' };

export async function alterarVencimentos(contratoId: number, p: { dia: number; primeiroMes?: string | null; aplicar: boolean }, autorId: number, hoje: string): Promise<ResultadoVencimentos> {
  if (!Number.isInteger(p.dia) || p.dia < 1 || p.dia > 31) throw new VencimentoErro('Dia de vencimento entre 1 e 31', 400);
  const d: any = await getDb();
  if (!d) throw new VencimentoErro('Banco indisponível', 503);
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, contratoId)).limit(1);
  if (!c) throw new VencimentoErro('Contrato não encontrado', 404);
  if (['cancelado', 'distratado', 'quitado'].includes(String(c.status))) throw new VencimentoErro(`Contrato ${c.status}: não remarca vencimentos`);
  const linhas: any[] = await d.select().from(cobrancas).where(eq(cobrancas.contratoId, contratoId));
  if (!linhas.length) throw new VencimentoErro('O plano de cobranças ainda não foi gravado (o contrato fica ativo depois de assinado)');
  const entrada = linhas.filter(l => l.tipo === 'entrada' || l.tipo === 'avista').sort((a, b) => Number(a.numero) - Number(b.numero))[0];
  const pagaEm = entrada?.status === 'paga' && entrada.pagoEm ? String(entrada.pagoEm).slice(0, 10) : null;
  const primeiroMes = p.primeiroMes && /^\d{4}-\d{2}$/.test(p.primeiroMes) ? p.primeiroMes : mesSugerido(pagaEm ?? (c.entradaPagaNoAto ? hoje : null), hoje);
  const mudancas = calcularVencimentos(linhas, p.dia, primeiroMes);
  if (!mudancas.length) throw new VencimentoErro('Não há parcela a remarcar: todas já foram emitidas, pagas ou canceladas');
  if (mudancas[0].para < hoje) throw new VencimentoErro(`A 1ª parcela ficaria vencida (${br(mudancas[0].para)}): escolha um mês a partir do atual`, 400);
  const emitidas = linhas.filter(l => TIPOS.includes(l.tipo) && l.status === 'emitida');
  const resumo = [
    `Todas as ${mudancas.length} parcela(s) ainda não emitidas passam a vencer no dia ${p.dia}.`,
    `1ª parcela do saldo: ${br(mudancas.find(m => m.tipo === 'saldo')?.para ?? mudancas[0].para)}.`,
    ...['complemento', 'reforco'].map(t => {
      const m = mudancas.filter(x => x.tipo === t);
      return m.length ? `${ROTULO[t]}: ${m.length}× a partir de ${br(m[0].para)}.` : null;
    }).filter(Boolean) as string[],
    ...(emitidas.length ? [`${emitidas.length} parcela(s) já emitida(s) no Asaas ficam como estão (para remarcar, cancele a cobrança e emita de novo).`] : []),
    'Valores, juros e saldo devedor não mudam. A emissão no Asaas continua pelo botão "Emitir no Asaas".',
  ];
  if (!p.aplicar) return { dia: p.dia, primeiraParcela: primeiroMes, mudancas, aplicado: false, resumo };

  for (const m of mudancas) await d.update(cobrancas).set({ vencimento: m.para } as any).where(eq(cobrancas.id, m.id));
  const dados = (() => { try { return typeof c.dadosJson === 'string' ? JSON.parse(c.dadosJson) : (c.dadosJson ?? {}); } catch { return {}; } })();
  await d.update(contratos).set({ dadosJson: { ...dados, diaVencimento: p.dia } as any, atualizadoEm: new Date() } as any).where(eq(contratos.id, contratoId));
  const { auditar } = await import('./servico');
  await auditar('vencimentos_alterados', { contratoId, usuarioId: autorId, origem: 'perfil', detalhe: { dia: p.dia, primeiroMes, parcelas: mudancas.length, de: mudancas[0].de, para: mudancas[0].para } });
  const A = await import('../assinatura/servico');
  await A.evento(contratoId, null, 'vencimentos_alterados', { detalhe: { usuarioId: autorId, dia: p.dia, primeiroMes, parcelas: mudancas.length, primeira: mudancas[0].para } });
  return { dia: p.dia, primeiraParcela: primeiroMes, mudancas, aplicado: true, resumo };
}
