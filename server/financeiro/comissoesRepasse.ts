/**
 * Comissões de venda a pagar aos corretores (Financeiro › Comissões): contratos assinados com corretor, as partes da
 * comissão com a data do repasse (shared/repasseComissao.ts) e o registro do pagamento (comissaoRepasses).
 * Administrador e secretária veem todos os corretores e marcam os repasses como pagos; o corretor vê só os dele.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db';
import { cobrancas, comissaoRepasses, contratos, empreendimentos, users } from '../../drizzle/schema';
import { temAcesso } from '../../shared/permissoes';
import type { PermissoesUsuario } from '../permissoes';
import {
  STATUS_COM_COMISSAO, STATUS_SEM_COMISSAO, gatilhosDoPlano, partesDaComissao, resumoRepasses, type ParteComissao, type PlanoParaRepasse,
} from '../../shared/repasseComissao';

export class RepasseErro extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const hojeBR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const r2 = (x: number) => Math.round(x * 100) / 100;
const json = (v: unknown) => { if (typeof v !== 'string') return (v ?? {}) as any; try { return JSON.parse(v); } catch { return {}; } };

export interface VendaComissao {
  contratoId: number; numero: string; status: string; empreendimento: string; empreendimentoSlug: string; lote: string;
  comprador: string; corretorId: number; corretor: string; formaPagamento: string; valorVenda: number; comissao: number; dataVenda: string;
  partes: ParteComissao[];
}

const ROTULO_FORMA: Record<string, string> = { padrao: 'Entrada de 30%', A: 'Plano A', B: 'Plano B', C: 'Plano C' };
function formaDoPlano(p: PlanoParaRepasse): string {
  if (p.modalidade === 'avista') return 'À vista';
  const c = p.condicao && p.condicao !== 'padrao' ? p.condicao : 'padrao';
  if (c === 'padrao') return (p.entrada_qtd ?? 1) <= 1 ? 'Entrada de 30% à vista' : `Entrada de 30% em ${p.entrada_qtd}×`;
  return ROTULO_FORMA[c] ?? c;
}

export async function comissoesDeVenda(permissoes: PermissoesUsuario, usuarioId: number, filtro: { corretorId?: number; slug?: string } = {}) {
  const perfil = permissoes.perfil;
  const escritorio = perfil === 'admin' || perfil === 'secretario';
  if (!escritorio && perfil !== 'corretor') throw new RepasseErro('As comissões a pagar são do escritório e de cada corretor.', 403);
  const d: any = await getDb();
  if (!d) throw new RepasseErro('Banco indisponível', 503);
  const emps: any[] = (await d.select().from(empreendimentos))
    .filter((e: any) => temAcesso(perfil, permissoes.acessos, 'empreendimento', e.id) && (!filtro.slug || e.slug === filtro.slug));
  if (!emps.length) return { vendas: [] as VendaComissao[], resumo: resumoRepasses([]), corretores: [] as { id: number; nome: string }[], escritorio };
  const E = new Map(emps.map((e: any) => [Number(e.id), e]));
  const conds: any[] = [inArray(contratos.empreendimentoId, emps.map((e: any) => Number(e.id))), inArray(contratos.status, [...STATUS_COM_COMISSAO, ...STATUS_SEM_COMISSAO])];
  // O corretor só vê as vendas dele; o escritório pode filtrar por corretor
  const corretorId = escritorio ? filtro.corretorId : usuarioId;
  if (corretorId) conds.push(eq(contratos.corretorUserId, corretorId));
  const lista: any[] = await d.select().from(contratos).where(and(...conds));
  const comComissao = lista.map(c => ({ c, plano: json(c.simulacaoJson) as PlanoParaRepasse & { preco_tabela?: number; preco_avista?: number } }))
    .filter(x => Number(x.plano.comissao_corretor ?? 0) > 0);
  const ids = comComissao.map(x => Number(x.c.id));
  const [cobs, reps]: any[][] = ids.length ? await Promise.all([
    d.select({ contratoId: cobrancas.contratoId, tipo: cobrancas.tipo, numero: cobrancas.numero, vencimento: cobrancas.vencimento, status: cobrancas.status, pagoEm: cobrancas.pagoEm })
      .from(cobrancas).where(and(inArray(cobrancas.contratoId, ids), inArray(cobrancas.tipo, ['avista', 'entrada', 'saldo']))),
    d.select().from(comissaoRepasses).where(inArray(comissaoRepasses.contratoId, ids)),
  ]) : [[], []];
  const pessoas: any[] = await d.select({ id: users.id, name: users.name }).from(users);
  const U = new Map(pessoas.map(p => [Number(p.id), String(p.name ?? '')]));
  const hoje = hojeBR();
  const vendas: VendaComissao[] = comComissao.map(({ c, plano }) => {
    const id = Number(c.id);
    const dados = json(c.dadosJson);
    const partes = partesDaComissao({
      plano, statusContrato: c.status, hoje, entradaPagaNoAto: !!c.entradaPagaNoAto,
      cobrancas: cobs.filter(x => Number(x.contratoId) === id).map(x => ({ tipo: x.tipo, numero: Number(x.numero), vencimento: String(x.vencimento), status: x.status, pagoEm: x.pagoEm ? String(x.pagoEm) : null })),
      repasses: reps.filter(x => Number(x.contratoId) === id).map(x => ({ chave: x.chave, valor: Number(x.valor), pagoEm: String(x.pagoEm), forma: x.forma })),
    });
    const emp = E.get(Number(c.empreendimentoId));
    return {
      contratoId: id, numero: String(c.numero), status: String(c.status), empreendimento: String(emp?.nome ?? ''), empreendimentoSlug: String(emp?.slug ?? ''),
      lote: String(c.loteCodigo), comprador: String(dados.comp_nome ?? '—'), corretorId: Number(c.corretorUserId), corretor: U.get(Number(c.corretorUserId)) || '—',
      formaPagamento: formaDoPlano(plano), valorVenda: r2(Number(plano.modalidade === 'avista' ? plano.preco_avista ?? 0 : plano.preco_tabela ?? 0)),
      comissao: r2(Number(plano.comissao_corretor)), dataVenda: new Date(c.criadoEm ?? Date.now()).toISOString().slice(0, 10), partes,
    };
  }).sort((a, b) => b.contratoId - a.contratoId);
  const corretores = escritorio
    ? Array.from(new Set(lista.map(c => Number(c.corretorUserId)))).map(i => ({ id: i, nome: U.get(i) || `#${i}` })).sort((a, b) => a.nome.localeCompare(b.nome))
    : [];
  return { vendas, resumo: resumoRepasses(vendas.flatMap(v => v.partes)), corretores, escritorio };
}

/** Marca uma parte como paga ao corretor (administrador e secretária) */
export async function registrarRepasse(permissoes: PermissoesUsuario, usuarioId: number, i: { contratoId: number; chave: string; pagoEm: string; forma?: string; observacao?: string }) {
  if (permissoes.perfil !== 'admin' && permissoes.perfil !== 'secretario') throw new RepasseErro('Só o administrador e a secretária registram o pagamento da comissão.', 403);
  const d: any = await getDb();
  if (!d) throw new RepasseErro('Banco indisponível', 503);
  const [c]: any[] = await d.select().from(contratos).where(eq(contratos.id, i.contratoId)).limit(1);
  if (!c) throw new RepasseErro('Contrato não encontrado', 404);
  if (!temAcesso(permissoes.perfil, permissoes.acessos, 'empreendimento', Number(c.empreendimentoId))) throw new RepasseErro('Sem acesso a este empreendimento', 403);
  if (!STATUS_COM_COMISSAO.includes(c.status)) throw new RepasseErro(`Contrato ${c.status}: não há comissão a pagar`, 409);
  const plano = json(c.simulacaoJson) as PlanoParaRepasse;
  const parte = partesDaComissao({ plano, statusContrato: c.status, cobrancas: [], repasses: [], hoje: hojeBR() }).find(p => p.chave === i.chave);
  if (!parte || !gatilhosDoPlano(plano).some(g => g.chave === i.chave)) throw new RepasseErro('Parte da comissão inválida para este contrato', 400);
  const [ja]: any[] = await d.select({ id: comissaoRepasses.id }).from(comissaoRepasses).where(and(eq(comissaoRepasses.contratoId, i.contratoId), eq(comissaoRepasses.chave, i.chave))).limit(1);
  if (ja) throw new RepasseErro('Esta parte da comissão já está registrada como paga', 409);
  await d.insert(comissaoRepasses).values({
    contratoId: i.contratoId, corretorUserId: Number(c.corretorUserId), chave: i.chave, valor: parte.valor.toFixed(2), pagoEm: i.pagoEm,
    forma: i.forma?.slice(0, 30) || null, observacao: i.observacao?.slice(0, 300) || null, registradoPor: usuarioId,
  });
  return { ok: true as const, valor: parte.valor };
}

/** Desfaz um registro de pagamento (só o administrador, para corrigir engano) */
export async function desfazerRepasse(permissoes: PermissoesUsuario, i: { contratoId: number; chave: string }) {
  if (permissoes.perfil !== 'admin') throw new RepasseErro('Só o administrador desfaz o registro de pagamento.', 403);
  const d: any = await getDb();
  if (!d) throw new RepasseErro('Banco indisponível', 503);
  await d.delete(comissaoRepasses).where(and(eq(comissaoRepasses.contratoId, i.contratoId), eq(comissaoRepasses.chave, i.chave)));
  return { ok: true as const };
}
