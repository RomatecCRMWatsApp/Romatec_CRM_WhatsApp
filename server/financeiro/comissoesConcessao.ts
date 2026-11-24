/**
 * Comissão de gestão das concessões da proprietária (Financeiro › Comissões): cada contrato de concessão gera, já na
 * criação, uma receita a receber da proprietária para a gestora, em nome do corretor administrador (José Romário).
 * Não gera boleto nem cobrança no Asaas: o recebimento é marcado à mão (Pix/transferência), na tabela comissaoRepasses
 * com a chave "concessao".
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, comissaoRepasses, contratoPessoas, contratos, empreendimentos, pessoas, users } from '../../drizzle/schema';
import type { PermissoesUsuario } from '../permissoes';
import { RepasseErro } from './comissoesRepasse';

const CHAVE = 'concessao';
const PRAZO_DIAS = 30;
const json = (v: unknown) => { if (typeof v !== 'string') return (v ?? {}) as any; try { return JSON.parse(v); } catch { return {}; } };
const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const somarDias = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);
const escritorio = (p: PermissoesUsuario) => p.perfil === 'admin' || p.perfil === 'secretario';

export interface ReceitaConcessao {
  contratoId: number; numero: string; status: string; empreendimento: string; lote: string; beneficiario: string;
  valorReferencia: number; valor: number; vencimento: string; prazo: string; corretor: string;
  situacao: 'a_receber' | 'atrasada' | 'recebida'; recebidoEm: string | null; forma: string | null;
  /** Divisão dos 5%: escritório e corretor (corretor administrador = integral do escritório). Só para o escritório. */
  divisao: { escritorio: number; corretor: number; pctEscritorio: number; pctCorretor: number; corretorEhEscritorio: boolean };
}

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
/** 5% = 3% escritório + 2% corretor; se o corretor da venda é do escritório (administrador), o valor fica todo com o escritório */
export function dividirComissaoConcessao(valor: number, pctTotal: number, pctCorretor: number, corretorEhEscritorio: boolean) {
  const total = pctTotal > 0 ? pctTotal : 0.05;
  const pc = corretorEhEscritorio ? 0 : Math.min(Math.max(pctCorretor, 0), total);
  const corretor = r2(valor * (pc / total));
  return { escritorio: r2(valor - corretor), corretor, pctEscritorio: r2((total - pc) * 100), pctCorretor: r2(pc * 100), corretorEhEscritorio };
}

export async function receitasConcessao(p: PermissoesUsuario) {
  if (!escritorio(p)) throw new RepasseErro('As receitas da gestora são do administrador e da secretária.', 403);
  return listarConcessoes(null);
}

/** Proprietária: as comissões que ela deve à gestora (valor integral dos 5%, sem a divisão interna) */
export async function concessoesDaProprietaria(empreendimentoId: number) {
  const r = await listarConcessoes(empreendimentoId);
  return { resumo: r.resumo, itens: r.itens.map(({ divisao: _d, corretor: _c, ...resto }) => resto) };
}

async function listarConcessoes(empreendimentoId: number | null) {
  const d: any = await getDb();
  if (!d) throw new RepasseErro('Banco indisponível', 503);
  const todos: any[] = await d.select().from(contratos).where(inArray(contratos.status, ['rascunho', 'minuta', 'apto_assinatura', 'em_assinatura', 'assinado', 'ativo', 'quitado']));
  const lista = todos.map(c => ({ c, plano: json(c.simulacaoJson) })).filter(x => x.plano?.concessao && (empreendimentoId == null || Number(x.c.empreendimentoId) === empreendimentoId));
  if (!lista.length) return { itens: [] as ReceitaConcessao[], resumo: { aReceber: 0, atrasado: 0, recebido: 0 } };
  const ids = lista.map(x => Number(x.c.id));
  const [reps, emps, us, comp, cobs]: any[][] = await Promise.all([
    d.select().from(comissaoRepasses).where(and(inArray(comissaoRepasses.contratoId, ids), eq(comissaoRepasses.chave, CHAVE))),
    d.select({ id: empreendimentos.id, nome: empreendimentos.nome }).from(empreendimentos),
    d.select({ id: users.id, name: users.name, role: users.role, perfil: users.perfil }).from(users),
    d.select({ contratoId: contratoPessoas.contratoId, nome: pessoas.nome }).from(contratoPessoas).innerJoin(pessoas, eq(pessoas.id, contratoPessoas.pessoaId))
      .where(and(inArray(contratoPessoas.contratoId, ids), eq(contratoPessoas.papel, 'comprador'))),
    d.select().from(cobrancas).where(and(inArray(cobrancas.contratoId, ids), eq(cobrancas.tipo, 'comissao'))),
  ]);
  const hoje = hojeBR();
  const itens: ReceitaConcessao[] = lista.map(({ c, plano }) => {
    const r = reps.find(x => Number(x.contratoId) === Number(c.id));
    // Vencimento definido no contrato (editável); contratos antigos: criação + 30 dias
    let venc = /^\d{4}-\d{2}-\d{2}$/.test(String(plano.concessao.comissaoVencimento ?? '')) ? String(plano.concessao.comissaoVencimento) : somarDias(new Date(c.criadoEm ?? Date.now()), PRAZO_DIAS);
    // Paga pelo beneficiário em boletos: a situação segue as cobranças da comissão (vence na 1ª em aberto)
    const minhas = cobs.filter(x => Number(x.contratoId) === Number(c.id) && !['cancelada', 'estornada'].includes(String(x.status)));
    const doBenef = plano.concessao.comissaoPagador === 'beneficiario' && minhas.length > 0;
    const abertas = minhas.filter(x => x.status !== 'paga').sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
    if (doBenef && abertas.length) venc = String(abertas[0].vencimento).slice(0, 10);
    const pagaBenef = doBenef && !abertas.length;
    const ultimoPag = pagaBenef ? minhas.map(x => String(x.pagoEm ?? x.vencimento).slice(0, 10)).sort().at(-1) ?? null : null;
    const corretorU = us.find(u => Number(u.id) === Number(c.corretorUserId));
    const corretorEhEscritorio = !corretorU || corretorU.role === 'admin' || corretorU.perfil === 'admin';
    const valor = Number(plano.concessao.comissaoValor ?? 0);
    return {
      divisao: dividirComissaoConcessao(valor, Number(plano.comissao_percentual ?? 0.05), Number(plano.comissao_corretor_percentual ?? 0.02), corretorEhEscritorio),
      contratoId: Number(c.id), numero: String(c.numero), status: String(c.status),
      empreendimento: String(emps.find(e => Number(e.id) === Number(c.empreendimentoId))?.nome ?? ''), lote: String(c.loteCodigo),
      beneficiario: String(comp.find(x => Number(x.contratoId) === Number(c.id))?.nome ?? '—'),
      valorReferencia: Number(plano.preco_avista ?? 0), valor: Number(plano.concessao.comissaoValor ?? 0),
      vencimento: venc, prazo: String(plano.concessao.comissaoPrazo || 'Pix ou transferência'),
      corretor: String(us.find(u => Number(u.id) === Number(c.corretorUserId))?.name ?? '—'),
      situacao: (r || pagaBenef ? 'recebida' : venc < hoje ? 'atrasada' : 'a_receber') as ReceitaConcessao['situacao'],
      recebidoEm: r ? String(r.pagoEm).slice(0, 10) : ultimoPag, forma: r?.forma ?? (doBenef ? `Boletos do beneficiário (${minhas.filter(x => x.status === 'paga').length}/${minhas.length} pagos)` : null),
    };
  }).sort((a, b) => a.situacao.localeCompare(b.situacao) || b.contratoId - a.contratoId);
  const soma = (f: (i: ReceitaConcessao) => boolean) => Math.round(itens.filter(f).reduce((s, i) => s + i.valor, 0) * 100) / 100;
  return { itens, resumo: { aReceber: soma(i => i.situacao === 'a_receber'), atrasado: soma(i => i.situacao === 'atrasada'), recebido: soma(i => i.situacao === 'recebida') } };
}

export async function registrarRecebimentoConcessao(p: PermissoesUsuario, usuarioId: number, i: { contratoId: number; pagoEm: string; forma?: string; observacao?: string }) {
  if (!escritorio(p)) throw new RepasseErro('Só o administrador e a secretária registram o recebimento.', 403);
  const d: any = await getDb();
  if (!d) throw new RepasseErro('Banco indisponível', 503);
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, i.contratoId)).limit(1);
  const k = c ? json(c.simulacaoJson)?.concessao : null;
  if (!c || !k) throw new RepasseErro('Contrato de concessão não encontrado', 404);
  const [ja]: any[] = await d.select({ id: comissaoRepasses.id }).from(comissaoRepasses).where(and(eq(comissaoRepasses.contratoId, i.contratoId), eq(comissaoRepasses.chave, CHAVE))).limit(1);
  if (ja) throw new RepasseErro('Esta comissão já está registrada como recebida', 409);
  // A proprietária pagou: sai do caixa do empreendimento (despesa "Comissões" já paga, vinculada ao registro)
  const { lancarSaidaComissao } = await import('./saidaComissao');
  const despesaId = await lancarSaidaComissao({ empreendimentoId: c.empreendimentoId ? Number(c.empreendimentoId) : null, descricao: `Comissão de gestão da concessão — ${c.loteCodigo} (${c.numero})`, valor: Number(k.comissaoValor ?? 0), pagoEm: i.pagoEm, forma: i.forma, autorId: usuarioId });
  const obs = [i.observacao?.trim() || 'Recebido da proprietária (concessão)', despesaId ? `despesa:#${despesaId}` : null].filter(Boolean).join(' · ').slice(0, 300);
  await d.insert(comissaoRepasses).values({
    contratoId: i.contratoId, corretorUserId: Number(c.corretorUserId), chave: CHAVE, valor: Number(k.comissaoValor ?? 0).toFixed(2), pagoEm: i.pagoEm,
    forma: i.forma?.slice(0, 30) || null, observacao: obs, registradoPor: usuarioId,
  });
  return { ok: true as const, valor: Number(k.comissaoValor ?? 0) };
}
