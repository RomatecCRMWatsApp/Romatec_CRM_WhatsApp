/**
 * Ranking de vendas por corretor + campanha "Bonificação Surpresa" (regras em shared/ranking.ts).
 * Escopo: admin e secretária veem todos os empreendimentos; corretor e empreendedor, só os que acessam.
 * Prazo da campanha: só o administrador, com a senha de login (step-up). Encerrada (data ou estoque) → congela.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from './db';
import { acessosCorretor, assinaturaSignatarios, cobrancas, contratos, empreendimentos, lotes, rankingCampanhas, users } from '../drizzle/schema';
import { temAcesso, type AcessoCorretor } from '../shared/permissoes';
import { perfilDe, type Perfil } from '../shared/equipe';
import {
  NOME_CAMPANHA, PREMIO_PADRAO, STATUS_CONTRATO_VALIDO, TIPOS_SINAL, classificar, fimDoDia, motivoEncerramento, textoRanking,
  type LinhaRanking, type ModoTermino, type Participante, type Prazo, type VendaValida,
} from '../shared/ranking';
import { exigirAdminComSenha, type Ator } from './contratos/cancelamento';
import { auditar } from './financeiro/servico';

export class RankingErro extends Error {
  name = 'RankingErro';
  constructor(message: string, public status = 400) { super(message); }
}

export interface Escopo { perfil: Perfil | null; acessos: AcessoCorretor[] }
const escritorio = (e: Escopo) => e.perfil === 'admin' || e.perfil === 'secretario';
const visivel = (e: Escopo, empreendimentoId: number) => escritorio(e) || temAcesso(e.perfil, e.acessos, 'empreendimento', empreendimentoId);

/** Situações do controle de vendas que tiram a chácara do estoque */
const SITUACOES_VENDIDAS = ['vendido_parcelado', 'vendido_avista', 'quitado'];

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new RankingErro('Banco indisponível', 503);
  return d;
}

const dataOuNull = (v: unknown): Date | null => {
  if (!v) return null;
  const t = new Date(v as any);
  return Number.isNaN(t.getTime()) ? null : t;
};

export async function empreendimentosVisiveis(e: Escopo) {
  const d = await banco();
  const l: any[] = await d.select({ id: empreendimentos.id, nome: empreendimentos.nome, slug: empreendimentos.slug }).from(empreendimentos).orderBy(asc(empreendimentos.nome));
  return l.filter(x => visivel(e, x.id));
}

/** Vendas válidas (contrato assinado + sinal pago) dos empreendimentos informados */
async function vendasValidas(d: any, empIds: number[]): Promise<(VendaValida & { empreendimentoId: number })[]> {
  if (!empIds.length) return [];
  const cs: any[] = await d.select({
    id: contratos.id, empreendimentoId: contratos.empreendimentoId, loteCodigo: contratos.loteCodigo, corretorUserId: contratos.corretorUserId,
    atualizadoEm: contratos.atualizadoEm,
  }).from(contratos).where(and(inArray(contratos.empreendimentoId, empIds), inArray(contratos.status, [...STATUS_CONTRATO_VALIDO])));
  if (!cs.length) return [];
  const ids = cs.map(c => c.id);
  const [sinais, assinaturas]: any[][] = await Promise.all([
    d.select({ contratoId: cobrancas.contratoId, pagoEm: cobrancas.pagoEm }).from(cobrancas)
      .where(and(inArray(cobrancas.contratoId, ids), inArray(cobrancas.tipo, [...TIPOS_SINAL]), eq(cobrancas.status, 'paga'))),
    d.select({ contratoId: assinaturaSignatarios.contratoId, assinadoEm: assinaturaSignatarios.assinadoEm }).from(assinaturaSignatarios)
      .where(inArray(assinaturaSignatarios.contratoId, ids)),
  ]);
  // Sinal: o primeiro pagamento de entrada/à vista; assinatura: a última assinatura colhida
  const sinal = new Map<number, number>();
  for (const s of sinais) {
    const t = dataOuNull(s.pagoEm ? `${String(s.pagoEm).slice(0, 10)}T12:00:00-03:00` : null)?.getTime() ?? Date.now();
    sinal.set(s.contratoId, Math.min(sinal.get(s.contratoId) ?? Number.POSITIVE_INFINITY, t));
  }
  const assinado = new Map<number, number>();
  for (const a of assinaturas) {
    const t = dataOuNull(a.assinadoEm)?.getTime();
    if (t) assinado.set(a.contratoId, Math.max(assinado.get(a.contratoId) ?? 0, t));
  }
  return cs.filter(c => sinal.has(c.id)).map(c => {
    const assinaturaEm = assinado.get(c.id) ?? dataOuNull(c.atualizadoEm)?.getTime() ?? Date.now();
    return {
      corretorId: Number(c.corretorUserId), empreendimentoId: Number(c.empreendimentoId),
      chave: `${c.empreendimentoId}:${c.loteCodigo}`, em: new Date(Math.max(sinal.get(c.id)!, assinaturaEm)),
    };
  });
}

/** Corretores ativos habilitados nos empreendimentos (participantes da campanha) */
async function participantes(d: any, empIds: number[], comVenda: number[]): Promise<Participante[]> {
  if (!empIds.length) return [];
  const habilitados: any[] = await d.select({ usuarioId: acessosCorretor.usuarioId }).from(acessosCorretor)
    .where(and(eq(acessosCorretor.tipo, 'empreendimento'), inArray(acessosCorretor.refId, empIds)));
  const ids = Array.from(new Set([...habilitados.map(h => Number(h.usuarioId)), ...comVenda]));
  if (!ids.length) return [];
  const us: any[] = await d.select({ id: users.id, name: users.name, role: users.role, perfil: users.perfil, ativo: users.ativo, creci: users.creci })
    .from(users).where(inArray(users.id, ids));
  return us
    .filter(u => (u.ativo === true || u.ativo === 1) && perfilDe(u) === 'corretor' && ['corretor', 'equipe'].includes(String(u.perfil ?? '')))
    .map(u => ({ id: Number(u.id), nome: String(u.name ?? 'Corretor').trim(), creci: u.creci ? String(u.creci) : null }));
}

/** Chácaras comercializáveis ainda não vendidas (null = empreendimento sem lotes cadastrados) */
async function estoqueRestante(d: any, empIds: number[]): Promise<number | null> {
  if (!empIds.length) return null;
  const ls: any[] = await d.select({ status: lotes.status, situacao: lotes.situacao, comercializavel: lotes.comercializavel }).from(lotes)
    .where(inArray(lotes.empreendimentoId, empIds));
  const venda = ls.filter(l => l.comercializavel === true || l.comercializavel === 1);
  if (!venda.length) return null;
  return venda.filter(l => l.status !== 'vendido' && !SITUACOES_VENDIDAS.includes(String(l.situacao ?? ''))).length;
}

async function campanhaDe(d: any, empreendimentoId: number): Promise<any | null> {
  const [c]: any[] = await d.select().from(rankingCampanhas).where(eq(rankingCampanhas.empreendimentoId, empreendimentoId)).limit(1);
  return c ?? null;
}

const prazoDe = (c: any | null): Prazo => ({ modo: (c?.modo as ModoTermino) ?? 'indeterminado', dataEncerramento: c?.dataEncerramento ?? null });

/**
 * Ranking do empreendimento (ou de todos, com empreendimentoId nulo). No empreendimento, encerra e congela
 * a classificação na primeira consulta depois do prazo (data passada ou estoque esgotado).
 */
export async function ranking(e: Escopo, empreendimentoId: number | null) {
  const d = await banco();
  const visiveis = await empreendimentosVisiveis(e);
  if (empreendimentoId && !visiveis.some(x => x.id === empreendimentoId)) throw new RankingErro('Empreendimento fora do seu acesso', 403);
  const empIds = empreendimentoId ? [empreendimentoId] : visiveis.map(x => x.id);
  const nome = empreendimentoId ? visiveis.find(x => x.id === empreendimentoId)!.nome : 'Todos os empreendimentos';
  const [vendas, estoque, campanha] = await Promise.all([
    vendasValidas(d, empIds), estoqueRestante(d, empIds), empreendimentoId ? campanhaDe(d, empreendimentoId) : Promise.resolve(null),
  ]);
  const prazo = prazoDe(campanha);
  const parts = await participantes(d, empIds, Array.from(new Set(vendas.map(v => v.corretorId))));

  let linhas: LinhaRanking[];
  let encerradaEm: Date | null = dataOuNull(campanha?.encerradaEm);
  let motivo: string | null = campanha?.motivoEncerramento ?? null;
  if (empreendimentoId && encerradaEm && campanha?.congeladoJson) {
    linhas = JSON.parse(campanha.congeladoJson);
  } else {
    const fim = empreendimentoId ? motivoEncerramento(prazo, estoque) : null;
    // Encerrou pela data: só as vendas válidas até o fim do dia de encerramento
    const ate = fim === 'data' && prazo.dataEncerramento ? fimDoDia(prazo.dataEncerramento) : null;
    linhas = classificar(parts, vendas, ate);
    if (empreendimentoId && fim) {
      encerradaEm = ate ?? new Date();
      motivo = fim;
      await congelar(d, empreendimentoId, campanha, encerradaEm, fim, linhas);
    }
  }

  return {
    empreendimentoId, empreendimento: nome, campanha: NOME_CAMPANHA, premio: campanha?.premio || PREMIO_PADRAO,
    prazo, encerrada: !!encerradaEm, encerradaEm, motivoEncerramento: motivo, estoqueRestante: estoque,
    totalVendas: linhas.reduce((s, l) => s + l.vendas, 0), linhas,
    podeConfigurar: e.perfil === 'admin' && !!empreendimentoId,
    texto: textoRanking({ empreendimento: nome, linhas, prazo, encerrada: !!encerradaEm, premio: campanha?.premio || PREMIO_PADRAO, estoqueRestante: estoque }),
  };
}

async function congelar(d: any, empreendimentoId: number, campanha: any | null, quando: Date, motivo: string, linhas: LinhaRanking[]) {
  const dados = { encerradaEm: quando, motivoEncerramento: motivo, congeladoJson: JSON.stringify(linhas), updatedAt: new Date() };
  if (campanha) await d.update(rankingCampanhas).set(dados).where(eq(rankingCampanhas.empreendimentoId, empreendimentoId));
  else await d.insert(rankingCampanhas).values({ empreendimentoId, modo: 'indeterminado', ...dados });
  await auditar('ranking.encerrado', { origem: 'sistema', detalhe: { empreendimentoId, motivo, vencedor: linhas[0]?.vendas ? linhas[0].nome : null } }).catch(() => {});
}

/**
 * Prazo da campanha (só o administrador, com a senha). Mudar o prazo reabre a campanha encerrada pela data
 * (ex.: data adiada); encerrada por estoque esgotado continua encerrada enquanto não voltar chácara ao estoque.
 */
export async function definirPrazo(ator: Ator, p: { empreendimentoId: number; modo: ModoTermino; dataEncerramento?: string | null; senha: string }, ip?: string | null) {
  await exigirAdminComSenha(ator, p.senha, 'ranking_prazo', { ip });
  const d = await banco();
  const [emp]: any[] = await d.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.id, p.empreendimentoId)).limit(1);
  if (!emp) throw new RankingErro('Empreendimento não encontrado', 404);
  const dataEncerramento = p.modo === 'data' ? p.dataEncerramento ?? null : null;
  const dados = { modo: p.modo, dataEncerramento, encerradaEm: null, motivoEncerramento: null, congeladoJson: null, atualizadoPor: ator.id, updatedAt: new Date() };
  const atual = await campanhaDe(d, p.empreendimentoId);
  if (atual) await d.update(rankingCampanhas).set(dados).where(eq(rankingCampanhas.empreendimentoId, p.empreendimentoId));
  else await d.insert(rankingCampanhas).values({ empreendimentoId: p.empreendimentoId, ...dados });
  await auditar('ranking.prazo', { usuarioId: ator.id, origem: 'perfil', ip, detalhe: { empreendimentoId: p.empreendimentoId, modo: p.modo, dataEncerramento, antes: atual ? { modo: atual.modo, dataEncerramento: atual.dataEncerramento } : null } }).catch(() => {});
  return { ok: true as const };
}

/** Manda a classificação pelo WhatsApp (Z-API) */
export async function enviarWhatsApp(e: Escopo, empreendimentoId: number | null, destino: string) {
  const r = await ranking(e, empreendimentoId);
  const { enviarTexto } = await import('./leads/zapiClient');
  try { await enviarTexto(destino, r.texto); } catch (err: any) { throw new RankingErro(`WhatsApp não enviou: ${err?.message ?? err}`, 502); }
  return { ok: true as const };
}
