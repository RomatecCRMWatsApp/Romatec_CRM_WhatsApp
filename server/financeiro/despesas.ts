/**
 * Despesas do fluxo de caixa (saídas): lançar (avulsa ou recorrente mensal), pagar, reabrir, cancelar e anexar o
 * comprovante. Nada é apagado — cancelada fica no histórico, e cada ação vai para a auditoria do financeiro.
 */
import { and, eq, gte } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { getDb } from '../db';
import { empreendimentos, financeiroDespesas } from '../../drizzle/schema';
import { CATEGORIAS_DESPESA, FORMAS_DESPESA, ROTULO_CATEGORIA, situacaoDespesa, vencimentosRecorrentes, type CategoriaDespesa } from '../../shared/despesas';
import { auditar, FinanceiroErro } from './servico';

const hojeBrasil = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const centavos = (v: number) => Math.round(v * 100) / 100;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const banco = async () => { const d = await getDb(); if (!d) throw new FinanceiroErro('DB', 'Banco indisponível', 503); return d as any; };

export interface NovaDespesa {
  empreendimentoId?: number | null; descricao: string; categoria: CategoriaDespesa; fornecedor?: string | null; valor: number;
  vencimento: string; meses?: number; observacao?: string | null;
  /** Já paga no lançamento (só a primeira, se recorrente) */
  pagoEm?: string | null; formaPagamento?: string | null;
}

function validar(p: NovaDespesa) {
  if (!p.descricao?.trim()) throw new FinanceiroErro('DESCRICAO', 'Informe a descrição', 400);
  if (!(CATEGORIAS_DESPESA as readonly string[]).includes(p.categoria)) throw new FinanceiroErro('CATEGORIA', 'Categoria inválida', 400);
  if (!(p.valor > 0)) throw new FinanceiroErro('VALOR', 'Valor deve ser maior que zero', 400);
  if (!DATA.test(p.vencimento)) throw new FinanceiroErro('VENCIMENTO', 'Vencimento inválido', 400);
  if (p.pagoEm && !DATA.test(p.pagoEm)) throw new FinanceiroErro('PAGAMENTO', 'Data de pagamento inválida', 400);
  if (p.formaPagamento && !(FORMAS_DESPESA as readonly string[]).includes(p.formaPagamento)) throw new FinanceiroErro('FORMA', 'Forma de pagamento inválida', 400);
  if (p.meses != null && (p.meses < 1 || p.meses > 60)) throw new FinanceiroErro('MESES', 'Recorrência de 1 a 60 meses', 400);
}

/** Lança a despesa; recorrente = uma linha por mês (mesmo dia), ligadas pelo grupo */
export async function lancarDespesa(p: NovaDespesa, autorId: number) {
  validar(p);
  const d = await banco();
  const meses = p.meses ?? 1;
  const vencs = vencimentosRecorrentes(p.vencimento, meses);
  const grupo = meses > 1 ? randomBytes(9).toString('base64url') : null;
  const agora = new Date();
  const ids: number[] = [];
  for (let i = 0; i < vencs.length; i++) {
    const paga = i === 0 && !!p.pagoEm;
    const r = await d.insert(financeiroDespesas).values({
      empreendimentoId: p.empreendimentoId ?? null, descricao: p.descricao.trim().slice(0, 200), categoria: p.categoria, fornecedor: p.fornecedor?.trim() || null,
      valor: centavos(p.valor).toFixed(2), vencimento: vencs[i], status: paga ? 'paga' : 'aberta', pagoEm: paga ? p.pagoEm : null,
      valorPago: paga ? centavos(p.valor).toFixed(2) : null, formaPagamento: paga ? (p.formaPagamento || 'PIX') : null,
      grupo, parcela: grupo ? `${i + 1}/${vencs.length}` : null, observacao: p.observacao?.trim() || null, criadoPor: autorId, createdAt: agora, updatedAt: agora,
    } as any);
    const id = Number(r?.[0]?.insertId ?? r?.lastInsertRowid ?? 0);
    if (id) ids.push(id);
  }
  await auditar('despesa_lancada', { usuarioId: autorId, origem: 'perfil', detalhe: { ids, descricao: p.descricao, valor: p.valor, meses } });
  return { ids, quantidade: vencs.length };
}

async function despesa(id: number) {
  const d = await banco();
  const [x]: any[] = await d.select().from(financeiroDespesas).where(eq(financeiroDespesas.id, id)).limit(1);
  if (!x) throw new FinanceiroErro('NAO_ENCONTRADA', 'Despesa não encontrada', 404);
  return { d, x };
}

/** Edita uma despesa em aberto (paga: reabra antes; cancelada: não edita) */
export async function editarDespesa(id: number, p: Omit<NovaDespesa, 'meses' | 'pagoEm' | 'formaPagamento'>, autorId: number) {
  validar(p);
  const { d, x } = await despesa(id);
  if (x.status !== 'aberta') throw new FinanceiroErro('STATUS', x.status === 'paga' ? 'Despesa paga: desfaça o pagamento para editar' : 'Despesa cancelada não pode ser editada', 409);
  await d.update(financeiroDespesas).set({
    empreendimentoId: p.empreendimentoId ?? null, descricao: p.descricao.trim().slice(0, 200), categoria: p.categoria, fornecedor: p.fornecedor?.trim() || null,
    valor: centavos(p.valor).toFixed(2), vencimento: p.vencimento, observacao: p.observacao?.trim() || null, updatedAt: new Date(),
  } as any).where(eq(financeiroDespesas.id, id));
  await auditar('despesa_editada', { usuarioId: autorId, origem: 'perfil', detalhe: { id, antes: { valor: Number(x.valor), vencimento: x.vencimento }, depois: { valor: p.valor, vencimento: p.vencimento } } });
  return { success: true };
}

export async function pagarDespesa(id: number, p: { pagoEm: string; valorPago?: number | null; formaPagamento: string }, autorId: number, hoje = hojeBrasil()) {
  if (!DATA.test(p.pagoEm)) throw new FinanceiroErro('PAGAMENTO', 'Data de pagamento inválida', 400);
  if (p.pagoEm > hoje) throw new FinanceiroErro('PAGAMENTO', 'O pagamento não pode ser em data futura', 400);
  if (!(FORMAS_DESPESA as readonly string[]).includes(p.formaPagamento)) throw new FinanceiroErro('FORMA', 'Forma de pagamento inválida', 400);
  const { d, x } = await despesa(id);
  if (x.status !== 'aberta') throw new FinanceiroErro('STATUS', x.status === 'paga' ? 'Esta despesa já está paga' : 'Despesa cancelada', 409);
  const valorPago = p.valorPago && p.valorPago > 0 ? centavos(p.valorPago) : Number(x.valor);
  await d.update(financeiroDespesas).set({ status: 'paga', pagoEm: p.pagoEm, valorPago: valorPago.toFixed(2), formaPagamento: p.formaPagamento, updatedAt: new Date() } as any)
    .where(and(eq(financeiroDespesas.id, id), eq(financeiroDespesas.status, 'aberta')));
  await auditar('despesa_paga', { usuarioId: autorId, origem: 'perfil', detalhe: { id, pagoEm: p.pagoEm, valorPago, forma: p.formaPagamento } });
  return { success: true };
}

/** Desfaz o pagamento (lançado por engano): volta a aberta */
export async function reabrirDespesa(id: number, autorId: number) {
  const { d, x } = await despesa(id);
  if (x.status !== 'paga') throw new FinanceiroErro('STATUS', 'Só despesa paga pode ser reaberta', 409);
  await d.update(financeiroDespesas).set({ status: 'aberta', pagoEm: null, valorPago: null, formaPagamento: null, updatedAt: new Date() } as any).where(eq(financeiroDespesas.id, id));
  await auditar('despesa_reaberta', { usuarioId: autorId, origem: 'perfil', detalhe: { id, pagoEm: x.pagoEm, valorPago: Number(x.valorPago) } });
  return { success: true };
}

/** Cancela (não apaga). `seguintes` = também as próximas em aberto do mesmo grupo recorrente */
export async function cancelarDespesa(id: number, motivo: string, autorId: number, seguintes = false) {
  if (!motivo?.trim() || motivo.trim().length < 3) throw new FinanceiroErro('MOTIVO', 'Informe o motivo do cancelamento', 400);
  const { d, x } = await despesa(id);
  if (x.status === 'paga') throw new FinanceiroErro('STATUS', 'Despesa paga: desfaça o pagamento antes de cancelar', 409);
  if (x.status === 'cancelada') return { canceladas: 0 };
  const alvo: any[] = seguintes && x.grupo
    ? (await d.select().from(financeiroDespesas).where(and(eq(financeiroDespesas.grupo, x.grupo), gte(financeiroDespesas.vencimento, x.vencimento)))).filter((y: any) => y.status === 'aberta')
    : [x];
  const obs = (y: any) => [y.observacao, `Cancelada: ${motivo.trim()}`].filter(Boolean).join('\n').slice(0, 2000);
  for (const y of alvo) await d.update(financeiroDespesas).set({ status: 'cancelada', observacao: obs(y), updatedAt: new Date() } as any).where(eq(financeiroDespesas.id, y.id));
  await auditar('despesa_cancelada', { usuarioId: autorId, origem: 'perfil', detalhe: { ids: alvo.map(y => y.id), motivo } });
  return { canceladas: alvo.length };
}

/** Comprovante (PDF/imagem até 10 MB) no Cloudinary */
export async function anexarComprovante(id: number, arq: { base64: string; mime: string; nomeArquivo: string }, autorId: number) {
  const { d } = await despesa(id);
  const buf = Buffer.from(arq.base64, 'base64');
  if (buf.length > 10 * 1024 * 1024) throw new FinanceiroErro('ARQUIVO', 'Arquivo grande demais (máx. 10 MB)', 400);
  const { uploadToCloudinary } = await import('../cloudinary');
  const up = await uploadToCloudinary(buf, arq.mime, arq.nomeArquivo, { folder: 'financeiro/despesas' });
  await d.update(financeiroDespesas).set({ comprovanteUrl: up.url, updatedAt: new Date() } as any).where(eq(financeiroDespesas.id, id));
  await auditar('despesa_comprovante', { usuarioId: autorId, origem: 'perfil', detalhe: { id, url: up.url } });
  return { url: up.url };
}

export interface FiltroDespesas { de?: string | null; ate?: string | null; empreendimentoId?: number | null; categoria?: string | null; situacao?: 'todas' | 'a_pagar' | 'vencida' | 'paga' | 'cancelada' }

/** Lista por vencimento no período, com os totais (a pagar, vencido, pago) e por categoria */
export async function listarDespesas(f: FiltroDespesas = {}, hoje = hojeBrasil()) {
  const d = await banco();
  const todas: any[] = await d.select().from(financeiroDespesas);
  const emps: any[] = await d.select({ id: empreendimentos.id, nome: empreendimentos.nome }).from(empreendimentos);
  const nome = new Map(emps.map(e => [Number(e.id), e.nome as string]));
  const linhas = todas
    .filter(x => (!f.de || x.vencimento >= f.de) && (!f.ate || x.vencimento <= f.ate))
    .filter(x => f.empreendimentoId == null || (f.empreendimentoId === 0 ? x.empreendimentoId == null : Number(x.empreendimentoId) === f.empreendimentoId))
    .filter(x => !f.categoria || x.categoria === f.categoria)
    .map(x => ({
      id: Number(x.id), empreendimentoId: x.empreendimentoId == null ? null : Number(x.empreendimentoId), empreendimento: x.empreendimentoId == null ? null : nome.get(Number(x.empreendimentoId)) ?? null,
      descricao: x.descricao as string, categoria: x.categoria as CategoriaDespesa, rotuloCategoria: ROTULO_CATEGORIA[x.categoria as CategoriaDespesa] ?? x.categoria,
      fornecedor: x.fornecedor ?? null, valor: Number(x.valor), vencimento: String(x.vencimento), status: String(x.status),
      situacao: situacaoDespesa({ status: x.status, vencimento: x.vencimento }, hoje), pagoEm: x.pagoEm ?? null,
      valorPago: x.valorPago == null ? null : Number(x.valorPago), formaPagamento: x.formaPagamento ?? null, grupo: x.grupo ?? null, parcela: x.parcela ?? null,
      comprovanteUrl: x.comprovanteUrl ?? null, observacao: x.observacao ?? null,
    }))
    .filter(x => !f.situacao || f.situacao === 'todas' || x.situacao === f.situacao)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.id - b.id);
  const soma = (l: typeof linhas, k: 'valor' | 'valorPago') => centavos(l.reduce((s, x) => s + (Number(x[k]) || 0), 0));
  const porCategoria = new Map<string, number>();
  for (const x of linhas.filter(y => y.status !== 'cancelada')) porCategoria.set(x.rotuloCategoria, centavos((porCategoria.get(x.rotuloCategoria) ?? 0) + (x.status === 'paga' ? Number(x.valorPago) : x.valor)));
  return {
    hoje, linhas,
    totais: {
      aPagar: soma(linhas.filter(x => x.situacao === 'a_pagar'), 'valor'), vencido: soma(linhas.filter(x => x.situacao === 'vencida'), 'valor'),
      pago: soma(linhas.filter(x => x.situacao === 'paga'), 'valorPago'), quantidade: linhas.filter(x => x.status !== 'cancelada').length,
    },
    porCategoria: Array.from(porCategoria.entries()).map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor),
  };
}

/** Planilha das despesas filtradas */
export async function despesasXlsx(f: FiltroDespesas = {}): Promise<Buffer> {
  const { gerarXlsx } = await import('./planilha');
  const r = await listarDespesas(f);
  const br = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');
  const SIT: Record<string, string> = { paga: 'Paga', cancelada: 'Cancelada', vencida: 'Vencida', a_pagar: 'A pagar' };
  return gerarXlsx('Despesas', [
    ['Vencimento', 'Descrição', 'Categoria', 'Empreendimento', 'Fornecedor', 'Valor (R$)', 'Situação', 'Pago em', 'Valor pago (R$)', 'Forma', 'Parcela'],
    ...r.linhas.map(x => [br(x.vencimento), x.descricao, x.rotuloCategoria, x.empreendimento ?? 'Escritório', x.fornecedor ?? '', x.valor, SIT[x.situacao], br(x.pagoEm), x.valorPago ?? '', x.formaPagamento ?? '', x.parcela ?? '']),
    ['TOTAL', '', '', '', '', '', '', '', r.totais.pago, '', ''],
  ] as any, [12, 36, 24, 20, 22, 14, 11, 12, 15, 14, 9]);
}
