/**
 * Comissão de gestão das concessões da proprietária (Financeiro › Comissões): cada contrato de concessão gera, já na
 * criação, uma receita a receber da proprietária para a gestora, em nome do corretor administrador (José Romário).
 * Não gera boleto nem cobrança no Asaas: o recebimento é marcado à mão (Pix/transferência), na tabela comissaoRepasses
 * com a chave "concessao".
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { comissaoRepasses, contratoPessoas, contratos, empreendimentos, pessoas, users } from '../../drizzle/schema';
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
}

export async function receitasConcessao(p: PermissoesUsuario) {
  if (!escritorio(p)) throw new RepasseErro('As receitas da gestora são do administrador e da secretária.', 403);
  const d: any = await getDb();
  if (!d) throw new RepasseErro('Banco indisponível', 503);
  const todos: any[] = await d.select().from(contratos).where(inArray(contratos.status, ['rascunho', 'minuta', 'apto_assinatura', 'em_assinatura', 'assinado', 'ativo', 'quitado']));
  const lista = todos.map(c => ({ c, plano: json(c.simulacaoJson) })).filter(x => x.plano?.concessao);
  if (!lista.length) return { itens: [] as ReceitaConcessao[], resumo: { aReceber: 0, atrasado: 0, recebido: 0 } };
  const ids = lista.map(x => Number(x.c.id));
  const [reps, emps, us, comp]: any[][] = await Promise.all([
    d.select().from(comissaoRepasses).where(and(inArray(comissaoRepasses.contratoId, ids), eq(comissaoRepasses.chave, CHAVE))),
    d.select({ id: empreendimentos.id, nome: empreendimentos.nome }).from(empreendimentos),
    d.select({ id: users.id, name: users.name }).from(users),
    d.select({ contratoId: contratoPessoas.contratoId, nome: pessoas.nome }).from(contratoPessoas).innerJoin(pessoas, eq(pessoas.id, contratoPessoas.pessoaId))
      .where(and(inArray(contratoPessoas.contratoId, ids), eq(contratoPessoas.papel, 'comprador'))),
  ]);
  const hoje = hojeBR();
  const itens: ReceitaConcessao[] = lista.map(({ c, plano }) => {
    const r = reps.find(x => Number(x.contratoId) === Number(c.id));
    const venc = somarDias(new Date(c.criadoEm ?? Date.now()), PRAZO_DIAS);
    return {
      contratoId: Number(c.id), numero: String(c.numero), status: String(c.status),
      empreendimento: String(emps.find(e => Number(e.id) === Number(c.empreendimentoId))?.nome ?? ''), lote: String(c.loteCodigo),
      beneficiario: String(comp.find(x => Number(x.contratoId) === Number(c.id))?.nome ?? '—'),
      valorReferencia: Number(plano.preco_avista ?? 0), valor: Number(plano.concessao.comissaoValor ?? 0),
      vencimento: venc, prazo: String(plano.concessao.comissaoPrazo || `em até ${PRAZO_DIAS} dias da assinatura`),
      corretor: String(us.find(u => Number(u.id) === Number(c.corretorUserId))?.name ?? '—'),
      situacao: (r ? 'recebida' : venc < hoje ? 'atrasada' : 'a_receber') as ReceitaConcessao['situacao'], recebidoEm: r ? String(r.pagoEm).slice(0, 10) : null, forma: r?.forma ?? null,
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
  await d.insert(comissaoRepasses).values({
    contratoId: i.contratoId, corretorUserId: Number(c.corretorUserId), chave: CHAVE, valor: Number(k.comissaoValor ?? 0).toFixed(2), pagoEm: i.pagoEm,
    forma: i.forma?.slice(0, 30) || null, observacao: i.observacao?.slice(0, 300) || 'Recebido da proprietária (concessão)', registradoPor: usuarioId,
  });
  return { ok: true as const, valor: Number(k.comissaoValor ?? 0) };
}
