/**
 * Convites de reunião com confirmação de presença (RSVP) — regras em shared/convites.ts.
 * O escritório (admin/secretária) cria a reunião, monta a lista de convidados e manda o link pelo WhatsApp;
 * o convidado confirma ou recusa em /reuniao/:token. Corretor e empreendedor só veem as reuniões dos
 * empreendimentos deles (temAcesso), sem editar.
 */
import crypto from 'node:crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from './db';
import { appUrl } from './leads/config';
import { empreendimentos, reuniaoConvidados, reunioesAgenda } from '../drizzle/schema';
import { temAcesso, type AcessoCorretor } from '../shared/permissoes';
import type { Perfil } from '../shared/equipe';
import {
  RESPOSTA_ATE_MS, contagem, instanteDaReuniao, quandoTexto, telefoneConvite, textoConvite, tokenDoQr,
  type DadosReuniao, type StatusConvidado,
} from '../shared/convites';

export class ConviteErro extends Error {
  name = 'ConviteErro';
  constructor(message: string, public status = 400) { super(message); }
}

export interface Escopo { perfil: Perfil | null; acessos: AcessoCorretor[] }
const escritorio = (e: Escopo) => e.perfil === 'admin' || e.perfil === 'secretario';
/** Reunião sem empreendimento é só do escritório */
const visivel = (e: Escopo, empreendimentoId: number | null) =>
  escritorio(e) || (!!empreendimentoId && temAcesso(e.perfil, e.acessos, 'empreendimento', empreendimentoId));

const novoToken = () => crypto.randomBytes(12).toString('base64url');
const idInserido = (r: any) => Number(r?.[0]?.insertId ?? r?.insertId ?? r?.lastInsertRowid ?? 0);
const duplicado = (e: any) => /Duplicate entry|ER_DUP_ENTRY|UNIQUE constraint|SQLITE_CONSTRAINT/.test(String(e?.message ?? e?.cause?.message ?? ''));

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new ConviteErro('Banco indisponível', 503);
  return d;
}

export const linkConvite = (token: string) => `${appUrl()}/reuniao/${token}`;

async function nomesEmpreendimentos(d: any, ids: (number | null)[]) {
  const unicos = Array.from(new Set(ids.filter((x): x is number => !!x)));
  if (!unicos.length) return new Map<number, { nome: string; slug: string }>();
  const l: any[] = await d.select({ id: empreendimentos.id, nome: empreendimentos.nome, slug: empreendimentos.slug }).from(empreendimentos).where(inArray(empreendimentos.id, unicos));
  return new Map(l.map(e => [e.id, { nome: e.nome, slug: e.slug }]));
}

async function reuniaoOuErro(d: any, id: number) {
  const [r]: any[] = await d.select().from(reunioesAgenda).where(eq(reunioesAgenda.id, id)).limit(1);
  if (!r) throw new ConviteErro('Reunião não encontrada', 404);
  return r;
}

function camposReuniao(dados: DadosReuniao) {
  const quando = instanteDaReuniao(dados.data, dados.hora);
  if (Number.isNaN(quando.getTime())) throw new ConviteErro('Data ou hora inválida');
  return {
    titulo: dados.titulo, empreendimentoId: dados.empreendimentoId ?? null, quando,
    local: dados.local?.trim() || null, linkVideo: dados.linkVideo?.trim() || null, descricao: dados.descricao?.trim() || null,
  };
}

// ─── Escritório ──────────────────────────────────────────────────────────────

export async function criarReuniao(dados: DadosReuniao, autorId: number): Promise<{ id: number }> {
  const d = await banco();
  const r = await d.insert(reunioesAgenda).values({ ...camposReuniao(dados), tokenGeral: novoToken(), criadoPor: autorId });
  return { id: idInserido(r) };
}

export async function editarReuniao(id: number, dados: DadosReuniao): Promise<void> {
  const d = await banco();
  await reuniaoOuErro(d, id);
  await d.update(reunioesAgenda).set(camposReuniao(dados)).where(eq(reunioesAgenda.id, id));
}

export async function cancelarReuniao(id: number): Promise<void> {
  const d = await banco();
  await reuniaoOuErro(d, id);
  await d.update(reunioesAgenda).set({ canceladaEm: new Date() }).where(eq(reunioesAgenda.id, id));
}

/** Empreendimentos para escolher na reunião e filtrar a lista (no escopo de quem vê) */
export async function empreendimentosVisiveis(e: Escopo) {
  const d = await banco();
  const l: any[] = await d.select({ id: empreendimentos.id, nome: empreendimentos.nome }).from(empreendimentos).orderBy(asc(empreendimentos.nome));
  return l.filter(x => visivel(e, x.id));
}

/** Reuniões visíveis (mais recentes primeiro), com a contagem de respostas */
export async function listarReunioes(e: Escopo, filtro: { empreendimentoId?: number | null } = {}) {
  const d = await banco();
  const todas: any[] = await d.select({
    id: reunioesAgenda.id, titulo: reunioesAgenda.titulo, empreendimentoId: reunioesAgenda.empreendimentoId, quando: reunioesAgenda.quando,
    local: reunioesAgenda.local, canceladaEm: reunioesAgenda.canceladaEm,
  }).from(reunioesAgenda).orderBy(desc(reunioesAgenda.quando));
  const lista = todas.filter(r => visivel(e, r.empreendimentoId) && (!filtro.empreendimentoId || r.empreendimentoId === filtro.empreendimentoId));
  if (!lista.length) return [];
  const conv: any[] = await d.select({ reuniaoId: reuniaoConvidados.reuniaoId, status: reuniaoConvidados.status }).from(reuniaoConvidados)
    .where(inArray(reuniaoConvidados.reuniaoId, lista.map(r => r.id)));
  const emps = await nomesEmpreendimentos(d, lista.map(r => r.empreendimentoId));
  return lista.map(r => ({
    ...r, quando: new Date(r.quando), cancelada: !!r.canceladaEm,
    empreendimento: r.empreendimentoId ? emps.get(r.empreendimentoId)?.nome ?? null : null,
    contagem: contagem(conv.filter(c => c.reuniaoId === r.id)),
  }));
}

/** Painel da reunião: dados, links e convidados separados por resposta */
export async function detalheReuniao(id: number, e: Escopo) {
  const d = await banco();
  const r = await reuniaoOuErro(d, id);
  if (!visivel(e, r.empreendimentoId)) throw new ConviteErro('Reunião de um empreendimento fora do seu acesso', 403);
  const conv: any[] = await d.select().from(reuniaoConvidados).where(eq(reuniaoConvidados.reuniaoId, id)).orderBy(asc(reuniaoConvidados.nome));
  const emp = r.empreendimentoId ? (await nomesEmpreendimentos(d, [r.empreendimentoId])).get(r.empreendimentoId) ?? null : null;
  const podeEditar = escritorio(e);
  return {
    id: r.id, titulo: r.titulo, empreendimentoId: r.empreendimentoId, empreendimento: emp?.nome ?? null, quando: new Date(r.quando),
    local: r.local, linkVideo: r.linkVideo, descricao: r.descricao, cancelada: !!r.canceladaEm,
    folder: r.folderMime ? { mime: r.folderMime, nome: r.folderNome } : null,
    linkGeral: podeEditar ? linkConvite(r.tokenGeral) : null, podeEditar,
    contagem: contagem(conv), chegaram: conv.filter(c => !!c.checkinEm).length,
    convidados: conv.map(c => ({
      id: c.id, nome: c.nome, telefone: c.telefone, origem: c.origem, status: c.status as StatusConvidado,
      respondidoEm: c.respondidoEm ? new Date(c.respondidoEm) : null, conviteEnviadoEm: c.conviteEnviadoEm ? new Date(c.conviteEnviadoEm) : null,
      link: podeEditar ? linkConvite(c.token) : null, checkinEm: c.checkinEm ? new Date(c.checkinEm) : null,
    })),
  };
}

/** Lista de convidados (nome + WhatsApp): telefone repetido na mesma reunião é ignorado */
export async function adicionarConvidados(reuniaoId: number, lista: { nome: string; telefone: string }[]) {
  const d = await banco();
  await reuniaoOuErro(d, reuniaoId);
  let adicionados = 0, repetidos = 0;
  for (const c of lista) {
    const telefone = telefoneConvite(c.telefone);
    if (!telefone) throw new ConviteErro(`WhatsApp inválido: ${c.telefone}`);
    try {
      await d.insert(reuniaoConvidados).values({ reuniaoId, nome: c.nome.trim(), telefone, token: novoToken(), origem: 'lista' });
      adicionados++;
    } catch (err) {
      if (!duplicado(err)) throw err;
      repetidos++;
    }
  }
  return { adicionados, repetidos };
}

export async function removerConvidado(convidadoId: number) {
  const d = await banco();
  await d.delete(reuniaoConvidados).where(eq(reuniaoConvidados.id, convidadoId));
}

/** Convite pelo WhatsApp (Z-API): os convidados escolhidos ou, sem escolha, os que ainda não responderam */
export async function enviarConvites(reuniaoId: number, convidadoIds?: number[]) {
  const d = await banco();
  const r = await reuniaoOuErro(d, reuniaoId);
  if (r.canceladaEm) throw new ConviteErro('Reunião cancelada');
  const todos: any[] = await d.select().from(reuniaoConvidados).where(eq(reuniaoConvidados.reuniaoId, reuniaoId));
  const alvo = convidadoIds?.length ? todos.filter(c => convidadoIds.includes(c.id)) : todos.filter(c => c.status === 'pendente');
  const emp = r.empreendimentoId ? (await nomesEmpreendimentos(d, [r.empreendimentoId])).get(r.empreendimentoId)?.nome ?? null : null;
  const { enviarTexto } = await import('./leads/zapiClient');
  let enviados = 0;
  const falhas: string[] = [];
  for (const c of alvo) {
    try {
      await enviarTexto(c.telefone, textoConvite({ titulo: r.titulo, empreendimento: emp, quando: r.quando, local: r.local ?? (r.linkVideo ? 'online (link na página de confirmação)' : null) }, c.nome, linkConvite(c.token)));
      await d.update(reuniaoConvidados).set({ conviteEnviadoEm: new Date() }).where(eq(reuniaoConvidados.id, c.id));
      enviados++;
    } catch (err: any) {
      falhas.push(`${c.nome}: ${err?.message ?? 'falha no envio'}`);
    }
  }
  return { enviados, falhas };
}

export async function salvarFolder(reuniaoId: number, arquivo: { mime: string; nome: string; conteudo: Buffer } | null) {
  const d = await banco();
  await reuniaoOuErro(d, reuniaoId);
  await d.update(reunioesAgenda).set(arquivo
    ? { folderMime: arquivo.mime, folderNome: arquivo.nome.slice(0, 160), folderBase64: arquivo.conteudo.toString('base64') }
    : { folderMime: null, folderNome: null, folderBase64: null }).where(eq(reunioesAgenda.id, reuniaoId));
}

// ─── Página pública (/reuniao/:token) ────────────────────────────────────────

async function porToken(d: any, token: string) {
  if (!/^[A-Za-z0-9_-]{8,24}$/.test(token)) throw new ConviteErro('Link inválido', 404);
  const [geral]: any[] = await d.select().from(reunioesAgenda).where(eq(reunioesAgenda.tokenGeral, token)).limit(1);
  if (geral) return { reuniao: geral, convidado: null as any };
  const [c]: any[] = await d.select().from(reuniaoConvidados).where(eq(reuniaoConvidados.token, token)).limit(1);
  if (!c) throw new ConviteErro('Link inválido ou expirado', 404);
  return { reuniao: await reuniaoOuErro(d, c.reuniaoId), convidado: c };
}

export async function folderPorToken(token: string) {
  const d = await banco();
  const { reuniao } = await porToken(d, token);
  if (!reuniao.folderBase64) throw new ConviteErro('Sem folder', 404);
  return { mime: reuniao.folderMime as string, nome: reuniao.folderNome as string, conteudo: Buffer.from(reuniao.folderBase64, 'base64') };
}

const encerrada = (r: any, agora: number) => !!r.canceladaEm || agora > new Date(r.quando).getTime() + RESPOSTA_ATE_MS;

export async function paginaPublica(token: string, agora = Date.now()) {
  const d = await banco();
  const { reuniao: r, convidado: c } = await porToken(d, token);
  const emp = r.empreendimentoId ? (await nomesEmpreendimentos(d, [r.empreendimentoId])).get(r.empreendimentoId) ?? null : null;
  return {
    titulo: r.titulo, empreendimento: emp?.nome ?? null, quando: new Date(r.quando).toISOString(), quandoTexto: quandoTexto(r.quando),
    local: r.local, linkVideo: r.linkVideo, descricao: r.descricao,
    folder: r.folderMime ? { mime: r.folderMime, nome: r.folderNome, url: `/api/public/reuniao/${token}/folder` } : null,
    cancelada: !!r.canceladaEm, encerrada: encerrada(r, agora),
    geral: !c, convidado: c ? { nome: c.nome, status: c.status as StatusConvidado, entrou: !!c.checkinEm } : null,
  };
}

/** Confirmar / recusar. No link geral a pessoa se identifica; mesmo telefone = mesma pessoa (atualiza a resposta) */
export async function responder(token: string, resposta: 'confirmado' | 'recusado', ident: { nome?: string; telefone?: string } = {}, agora = Date.now()) {
  const d = await banco();
  const { reuniao: r, convidado } = await porToken(d, token);
  if (r.canceladaEm) throw new ConviteErro('Esta reunião foi cancelada.', 409);
  if (encerrada(r, agora)) throw new ConviteErro('O prazo para responder a este convite já terminou.', 409);
  let c = convidado;
  if (!c) {
    const nome = String(ident.nome ?? '').trim();
    const telefone = telefoneConvite(String(ident.telefone ?? ''));
    if (nome.length < 2) throw new ConviteErro('Informe seu nome');
    if (!telefone) throw new ConviteErro('Informe seu WhatsApp com DDD');
    const acha = async () => (await d.select().from(reuniaoConvidados).where(and(eq(reuniaoConvidados.reuniaoId, r.id), eq(reuniaoConvidados.telefone, telefone))).limit(1))[0];
    c = await acha();
    if (!c) {
      try {
        await d.insert(reuniaoConvidados).values({ reuniaoId: r.id, nome: nome.slice(0, 120), telefone, token: novoToken(), origem: 'link_geral' });
      } catch (err) { if (!duplicado(err)) throw err; } // duas respostas ao mesmo tempo: fica a mesma pessoa
      c = await acha();
    }
  }
  const antes = c.status as StatusConvidado;
  await d.update(reuniaoConvidados).set({ status: resposta, respondidoEm: new Date(agora) }).where(eq(reuniaoConvidados.id, c.id));
  if (resposta === 'confirmado' && antes !== 'confirmado') {
    const emp = r.empreendimentoId ? (await nomesEmpreendimentos(d, [r.empreendimentoId])).get(r.empreendimentoId)?.nome ?? null : null;
    import('./notificacoes').then(({ notificarConfirmacaoReuniao }) => notificarConfirmacaoReuniao({
      reuniaoId: r.id, convidadoId: c.id, convidado: c.nome, titulo: r.titulo, quando: quandoTexto(r.quando), empreendimentoId: r.empreendimentoId, empreendimentoNome: emp,
    })).catch(err => console.warn('[Convites] notificação:', err?.message ?? err));
    await virarLead(d, r, c);
  }
  // No link geral, devolve o token da pessoa para a página mostrar o QR de entrada
  return { status: resposta, nome: c.nome as string, token: convidado ? null : c.token as string };
}

// ─── Evento: lead e recepção ─────────────────────────────────────────────────

/**
 * Quem confirma presença (ou chega) num evento de empreendimento vira lead para os corretores, sem mensagem
 * automática (já recebeu o convite). Reunião interna (sem empreendimento) e números da equipe não viram lead.
 */
async function virarLead(d: any, r: any, c: { nome: string; telefone: string }) {
  if (!r.empreendimentoId) return;
  try {
    const emp = (await nomesEmpreendimentos(d, [r.empreendimentoId])).get(r.empreendimentoId);
    const { ingestLead } = await import('./lead-intake');
    await ingestLead({
      nome: c.nome, phone: c.telefone, origem: 'evento', campanha: r.titulo, empreendimentoSlug: emp?.slug,
      semBoasVindas: true, answers: { evento: String(r.titulo).slice(0, 160) },
    });
  } catch (err: any) { console.warn('[Convites] lead do evento:', err?.message ?? err); }
}

async function reuniaoDaRecepcao(d: any, reuniaoId: number, e: Escopo) {
  const r = await reuniaoOuErro(d, reuniaoId);
  if (!visivel(e, r.empreendimentoId)) throw new ConviteErro('Evento de um empreendimento fora do seu acesso', 403);
  if (r.canceladaEm) throw new ConviteErro('Este evento foi cancelado', 409);
  return r;
}

/** Registra a entrada; quem não tinha confirmado passa a confirmado (e vira lead) */
async function registrarEntrada(d: any, r: any, c: any, agora: number) {
  if (c.checkinEm) return { nome: c.nome as string, jaEntrou: true, desde: new Date(c.checkinEm) };
  const confirmou = c.status !== 'confirmado';
  await d.update(reuniaoConvidados).set({ checkinEm: new Date(agora), ...(confirmou ? { status: 'confirmado', respondidoEm: new Date(agora) } : {}) })
    .where(eq(reuniaoConvidados.id, c.id));
  if (confirmou) await virarLead(d, r, c);
  return { nome: c.nome as string, jaEntrou: false, desde: new Date(agora) };
}

/** Leitura do QR na porta: o link do convite individual (/reuniao/<token>) */
export async function checkinPorQr(reuniaoId: number, lido: string, e: Escopo, agora = Date.now()) {
  const d = await banco();
  const r = await reuniaoDaRecepcao(d, reuniaoId, e);
  const token = tokenDoQr(lido);
  if (!token) throw new ConviteErro('QR não reconhecido. Procure a pessoa pelo nome.');
  if (token === r.tokenGeral) throw new ConviteErro('Este é o link geral do convite, não o da pessoa. Procure pelo nome ou cadastre na hora.');
  const [c]: any[] = await d.select().from(reuniaoConvidados).where(eq(reuniaoConvidados.token, token)).limit(1);
  if (!c || c.reuniaoId !== r.id) throw new ConviteErro('Este QR não é deste evento.', 404);
  return registrarEntrada(d, r, c, agora);
}

/** Entrada pelo nome (lista da recepção) */
export async function checkinConvidado(convidadoId: number, e: Escopo, agora = Date.now()) {
  const d = await banco();
  const [c]: any[] = await d.select().from(reuniaoConvidados).where(eq(reuniaoConvidados.id, convidadoId)).limit(1);
  if (!c) throw new ConviteErro('Convidado não encontrado', 404);
  const r = await reuniaoDaRecepcao(d, c.reuniaoId, e);
  return registrarEntrada(d, r, c, agora);
}

/** Desfaz uma entrada marcada por engano */
export async function desfazerCheckin(convidadoId: number, e: Escopo) {
  const d = await banco();
  const [c]: any[] = await d.select().from(reuniaoConvidados).where(eq(reuniaoConvidados.id, convidadoId)).limit(1);
  if (!c) throw new ConviteErro('Convidado não encontrado', 404);
  await reuniaoDaRecepcao(d, c.reuniaoId, e);
  await d.update(reuniaoConvidados).set({ checkinEm: null }).where(eq(reuniaoConvidados.id, convidadoId));
}

/** Chegou sem convite: cadastra na hora, já com entrada (o mesmo WhatsApp da lista só registra a entrada) */
export async function cadastrarNaPorta(reuniaoId: number, pessoa: { nome: string; telefone: string }, e: Escopo, agora = Date.now()) {
  const d = await banco();
  const r = await reuniaoDaRecepcao(d, reuniaoId, e);
  const telefone = telefoneConvite(pessoa.telefone);
  if (!telefone) throw new ConviteErro('WhatsApp inválido (DDD + número)');
  const acha = async () => (await d.select().from(reuniaoConvidados).where(and(eq(reuniaoConvidados.reuniaoId, r.id), eq(reuniaoConvidados.telefone, telefone))).limit(1))[0];
  let c = await acha();
  if (!c) {
    try {
      await d.insert(reuniaoConvidados).values({ reuniaoId: r.id, nome: pessoa.nome.trim().slice(0, 120), telefone, token: novoToken(), origem: 'porta' });
    } catch (err) { if (!duplicado(err)) throw err; }
    c = await acha();
  }
  return registrarEntrada(d, r, c, agora);
}
