/**
 * Passeio no Mapa (SPEC "Link Passeio no Mapa"): o corretor gera um link público de um empreendimento (ou de um lote em
 * destaque) e manda ao cliente. A página /p/:token mostra o mapa 3D que já existe, em 6 passos, sem login.
 *
 * Fase 1: links (criar, listar, desativar), dados públicos com allowlist de campos e registro de eventos (aberturas,
 * passos, lotes vistos, clique em "Quero este lote"). Sem IP gravado; a sessão é um id anônimo do navegador.
 * Desligado com TOUR_MAPA_ENABLED=false.
 */
import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { companyConfig, empreendimentos, leadQualifications as leads, lotes, tourEventos, tourLinks, users } from '../../drizzle/schema';
import { temAcesso } from '../../shared/permissoes';
import type { PermissoesUsuario } from '../permissoes';

export class PasseioErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'PasseioErro'; } }

export const passeioLigado = () => process.env.TOUR_MAPA_ENABLED !== 'false';
/** Validade padrão do link */
export const DIAS_VALIDADE = 30;
export const TIPOS_EVENTO = ['open', 'step_view', 'lote_view', 'sun_play', 'cta_click', 'free_explore'] as const;
export type TipoEvento = typeof TIPOS_EVENTO[number];
/** Fuso do local (Maranhão): o sol é calculado no horário do terreno, não do aparelho do cliente */
export const FUSO_PADRAO = 'America/Fortaleza';

export type SituacaoPublica = 'disponivel' | 'reservado' | 'vendido' | 'indisponivel';
/** Situação interna do lote → o que o cliente vê. Vendido nunca aparece como disponível. */
export function situacaoPublica(situacao: string | null | undefined, status?: string | null, comercializavel?: unknown): SituacaoPublica {
  const s = String(situacao ?? status ?? 'disponivel');
  if (['vendido_parcelado', 'vendido_avista', 'quitado', 'concedido', 'vendido'].includes(s) || status === 'vendido') return 'vendido';
  if (['interesse', 'reservado', 'entrada', 'em_negociacao'].includes(s) || status === 'reservado' || status === 'em_negociacao') return 'reservado';
  if (s === 'bloqueado' || status === 'nao_comercializavel' || comercializavel === false || comercializavel === 0) return 'indisponivel';
  return 'disponivel';
}

const banco = async () => {
  const d = await getDb();
  if (!d) throw new PasseioErro('Banco indisponível', 503);
  return d as any;
};
const soDig = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const whatsapp = (v: unknown) => { const d = soDig(v); return d.length < 10 ? null : d.startsWith('55') && d.length >= 12 ? d : `55${d}`; };
const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
const json = (v: unknown): any => { if (typeof v !== 'string') return v ?? null; try { return JSON.parse(v); } catch { return null; } };
const quando = (v: unknown): Date | null => {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : typeof v === 'number' ? new Date(v < 1e11 ? v * 1000 : v) : new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Nome do lead (resposta da qualificação) ou o final do telefone */
const nomeDoLead = (l: any): string => String(json(l?.answers)?.nome || '').trim() || `Lead …${soDig(l?.phone).slice(-4)}`;

const podeGerar = (p: PermissoesUsuario) => ['admin', 'secretario', 'corretor', 'atendente'].includes(String(p.perfil));

/** Cria o link (token aleatório de 16 caracteres, não sequencial) */
export async function criarLink(p: PermissoesUsuario, usuarioId: number, i: { empreendimentoId: number; loteId?: number | null; leadId?: number | null; mostrarPreco?: boolean; dias?: number | null }) {
  if (!passeioLigado()) throw new PasseioErro('O Passeio no Mapa está desligado.', 404);
  if (!podeGerar(p)) throw new PasseioErro('Sem permissão para gerar o link do passeio.', 403);
  if (!temAcesso(p.perfil, p.acessos, 'empreendimento', i.empreendimentoId)) throw new PasseioErro('Sem acesso a este empreendimento.', 403);
  const d = await banco();
  const [emp]: any[] = await d.select({ id: empreendimentos.id, slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.id, i.empreendimentoId)).limit(1);
  if (!emp) throw new PasseioErro('Empreendimento não encontrado.', 404);
  if (i.loteId) {
    const [l]: any[] = await d.select({ id: lotes.id }).from(lotes).where(and(eq(lotes.id, i.loteId), eq(lotes.empreendimentoId, i.empreendimentoId))).limit(1);
    if (!l) throw new PasseioErro('Lote não encontrado neste empreendimento.', 404);
  }
  const token = randomBytes(12).toString('base64url').slice(0, 16);
  const dias = i.dias === null ? null : Math.min(365, Math.max(1, Number(i.dias ?? DIAS_VALIDADE)));
  const expiraEm = dias ? new Date(Date.now() + dias * 86400_000) : null;
  await d.insert(tourLinks).values({
    token, empreendimentoId: i.empreendimentoId, loteDestaqueId: i.loteId ?? null, leadId: i.leadId ?? null, corretorId: usuarioId,
    mostrarPreco: i.mostrarPreco !== false, expiraEm, ativo: true,
  } as any);
  return { token, caminho: `/p/${token}`, expiraEm: expiraEm?.toISOString() ?? null, empreendimento: emp.nome };
}

/** Links do empreendimento (o corretor vê só os dele; escritório vê todos) */
export async function listarLinks(p: PermissoesUsuario, usuarioId: number, empreendimentoId: number) {
  if (!temAcesso(p.perfil, p.acessos, 'empreendimento', empreendimentoId)) throw new PasseioErro('Sem acesso a este empreendimento.', 403);
  const d = await banco();
  const escritorio = p.perfil === 'admin' || p.perfil === 'secretario';
  const cond = escritorio ? eq(tourLinks.empreendimentoId, empreendimentoId) : and(eq(tourLinks.empreendimentoId, empreendimentoId), eq(tourLinks.corretorId, usuarioId));
  const rs: any[] = await d.select().from(tourLinks).where(cond).orderBy(desc(tourLinks.id)).limit(200);
  if (!rs.length) return [];
  const ids = rs.map(r => r.id);
  const ctas: any[] = await d.select({ id: tourEventos.tourLinkId, n: sql<number>`count(*)` }).from(tourEventos)
    .where(and(inArray(tourEventos.tourLinkId, ids), eq(tourEventos.tipo, 'cta_click'))).groupBy(tourEventos.tourLinkId);
  const C = new Map(ctas.map(c => [Number(c.id), Number(c.n)]));
  const loteIds = Array.from(new Set(rs.map(r => r.loteDestaqueId).filter(Boolean)));
  const L = new Map<number, string>(loteIds.length ? (await d.select({ id: lotes.id, codigo: lotes.codigo }).from(lotes).where(inArray(lotes.id, loteIds))).map((l: any) => [l.id, l.codigo]) : []);
  const leadIds = Array.from(new Set(rs.map(r => r.leadId).filter(Boolean)));
  const LD = new Map<number, string>(leadIds.length ? (await d.select({ id: leads.id, answers: leads.answers, phone: leads.phone }).from(leads).where(inArray(leads.id, leadIds))).map((l: any) => [l.id, nomeDoLead(l)]) : []);
  const corrIds = Array.from(new Set(rs.map(r => r.corretorId)));
  const U = new Map<number, string>((await d.select({ id: users.id, nome: users.name }).from(users).where(inArray(users.id, corrIds))).map((u: any) => [u.id, u.nome]));
  const agora = Date.now();
  return rs.map(r => {
    const exp = quando(r.expiraEm);
    const situacao = !r.ativo ? 'desativado' : exp && exp.getTime() < agora ? 'expirado' : 'ativo';
    return {
      id: r.id, token: r.token, caminho: `/p/${r.token}`, situacao, criadoEm: quando(r.criadoEm)?.toISOString() ?? null, expiraEm: exp?.toISOString() ?? null,
      aberturas: Number(r.aberturas ?? 0), ultimaAbertura: quando(r.ultimaAberturaAt)?.toISOString() ?? null, cliques: C.get(r.id) ?? 0,
      lote: r.loteDestaqueId ? L.get(r.loteDestaqueId) ?? null : null, lead: r.leadId ? LD.get(r.leadId) ?? null : null,
      corretor: U.get(r.corretorId) ?? null, mostrarPreco: !!r.mostrarPreco,
    };
  });
}

export async function desativarLink(p: PermissoesUsuario, usuarioId: number, id: number) {
  const d = await banco();
  const [r]: any[] = await d.select().from(tourLinks).where(eq(tourLinks.id, id)).limit(1);
  if (!r) throw new PasseioErro('Link não encontrado.', 404);
  const escritorio = p.perfil === 'admin' || p.perfil === 'secretario';
  if (!escritorio && r.corretorId !== usuarioId) throw new PasseioErro('Só quem gerou o link (ou o escritório) desativa.', 403);
  await d.update(tourLinks).set({ ativo: false } as any).where(eq(tourLinks.id, id));
  return { ok: true as const };
}

async function contatoEmpresa(d: any) {
  const [c]: any[] = await d.select({ nome: companyConfig.companyName, phone: companyConfig.phone }).from(companyConfig).limit(1);
  return { nome: String(c?.nome ?? 'Romatec'), whatsapp: whatsapp(c?.phone) };
}

/** Link válido ou o motivo (para a tela amigável) */
async function linkValido(d: any, token: string, agora = Date.now()) {
  if (!/^[\w-]{10,24}$/.test(token)) return { erro: 'invalido' as const };
  const [r]: any[] = await d.select().from(tourLinks).where(eq(tourLinks.token, token)).limit(1);
  if (!r) return { erro: 'invalido' as const };
  if (!r.ativo) return { erro: 'desativado' as const, link: r };
  const exp = quando(r.expiraEm);
  if (exp && exp.getTime() < agora) return { erro: 'expirado' as const, link: r };
  return { link: r };
}

/**
 * Dados públicos do passeio — SOMENTE o necessário (allowlist): empreendimento, lotes (geometria e campos públicos),
 * entrada e rota, contato do corretor. Nada de clientes, proprietários, custos, contratos ou outros empreendimentos.
 */
export async function dadosPublicos(token: string, agora = Date.now()) {
  if (!passeioLigado()) throw new PasseioErro('Passeio indisponível.', 404);
  const d = await banco();
  const v = await linkValido(d, token, agora);
  if (v.erro) {
    const empresa = await contatoEmpresa(d);
    return { ok: false as const, motivo: v.erro, empresa };
  }
  const t = v.link;
  const [e]: any[] = await d.select().from(empreendimentos).where(eq(empreendimentos.id, t.empreendimentoId)).limit(1);
  if (!e) return { ok: false as const, motivo: 'invalido' as const, empresa: await contatoEmpresa(d) };
  const ls: any[] = await d.select({
    id: lotes.id, codigo: lotes.codigo, quadra: lotes.quadra, numero: lotes.numero, areaM2: lotes.areaM2, perimetroM: lotes.perimetroM,
    situacao: lotes.situacao, status: lotes.status, comercializavel: lotes.comercializavel, poligono: lotes.poligono,
    latCentro: lotes.latCentro, lonCentro: lotes.lonCentro, precoAvistaRef: lotes.precoAvistaRef, precoTabela: lotes.precoTabela,
  }).from(lotes).where(eq(lotes.empreendimentoId, t.empreendimentoId));
  // Preço só se o corretor deixou ligado no link E o empreendimento libera preço público (trava do dono)
  const comPreco = !!t.mostrarPreco && !!e.precosPublicos;
  const lotesPub = ls.map(l => {
    const poligono = json(l.poligono);
    const situacao = situacaoPublica(l.situacao, l.status, l.comercializavel);
    const preco = comPreco && situacao === 'disponivel' ? num(l.precoAvistaRef) ?? num(l.precoTabela) : null;
    return {
      id: Number(l.id), codigo: String(l.codigo), quadra: l.quadra ?? null, numero: l.numero ?? null, areaM2: num(l.areaM2), perimetroM: num(l.perimetroM),
      situacao, poligono: Array.isArray(poligono) && poligono.length >= 3 ? poligono : null,
      centro: l.lonCentro != null && l.latCentro != null ? [Number(l.lonCentro), Number(l.latCentro)] : null, preco,
    };
  }).filter(l => l.poligono).sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));

  const [corr]: any[] = await d.select({ nome: users.name, telefone: users.telefone, creci: users.creci }).from(users).where(eq(users.id, t.corretorId)).limit(1);
  const empresa = await contatoEmpresa(d);
  const perimetro = json(e.perimetro);
  const { entrada, rota } = await chegada(String(e.slug));
  return {
    ok: true as const,
    empreendimento: {
      nome: String(e.nome), slug: String(e.slug), municipio: e.municipio ?? null, uf: e.uf ?? null,
      lat: num(e.lat), lon: num(e.lon), perimetro: Array.isArray(perimetro?.poligono) ? perimetro.poligono : null,
      areaHa: num(e.areaHa), abertura: aberturaDe(String(e.slug)),
    },
    lotes: lotesPub,
    loteDestaqueId: t.loteDestaqueId ?? null,
    entrada, rota,
    sol: { fuso: FUSO_PADRAO, exagero: 1.5 },
    contato: { nome: String(corr?.nome ?? empresa.nome), whatsapp: whatsapp(corr?.telefone) ?? empresa.whatsapp, foto: null, creci: corr?.creci ?? null },
    empresa,
    mostrarPreco: comPreco,
  };
}

/** Vídeo de abertura do passo 1 (planeta → satélite → condomínio), quando o empreendimento tiver um */
function aberturaDe(slug: string): { video: string; poster: string } | null {
  if (slug === 'bom-jardims') return { video: '/passeio/abertura-bom-jardims.mp4', poster: '/passeio/abertura-bom-jardims-final.jpg' };
  return null;
}

/**
 * Entrada e rota (fase 1: as que o Bom Jardims já tem — portal e traçado do "Como chegar", em cache).
 * Fase 2 grava entrada, origens, rota e pontos próximos por empreendimento.
 */
async function chegada(slug: string): Promise<{ entrada: { lon: number; lat: number; rotulo: string } | null; rota: { origem: string; linha: [number, number][]; km: number | null; minutos: number | null; pontos: PontoRota[] } | null }> {
  if (slug !== 'bom-jardims') return { entrada: null, rota: null };
  try {
    const { PORTAL_ENTRADA } = await import('../../shared/chacaraLink');
    const { ORIGEM_ROTA, PONTOS_ROTA } = await import('../../shared/rotaBomJardims');
    const { tracadoRota } = await import('../bom-jardims');
    const r = await tracadoRota();
    return {
      entrada: { lon: PORTAL_ENTRADA.lon, lat: PORTAL_ENTRADA.lat, rotulo: 'Entrada' },
      rota: r.linha.length ? {
        origem: String((ORIGEM_ROTA as any).nome ?? 'Centro de Açailândia'), linha: r.linha, km: r.km, minutos: r.minutos,
        pontos: PONTOS_ROTA.map((p, i) => ({ n: i + 1, titulo: p.titulo, texto: p.texto, lon: p.lon ?? null, lat: p.lat ?? null })),
      } : null,
    };
  } catch (e: any) {
    console.warn('[Passeio] rota:', e?.message);
    return { entrada: null, rota: null };
  }
}

/** Ponto de referência do percurso (sem coordenada: só aparece na lista) */
export type PontoRota = { n: number; titulo: string; texto: string; lon: number | null; lat: number | null };

/** Registra o que o cliente fez. Abertura e "Quero este lote" avisam o corretor e o administrador. */
export async function registrarEvento(token: string, ev: { tipo: string; sessao?: string | null; passo?: number | null; loteId?: number | null; ua?: string | null }, agora = Date.now()) {
  if (!(TIPOS_EVENTO as readonly string[]).includes(ev.tipo)) throw new PasseioErro('Evento inválido.');
  const d = await banco();
  const v = await linkValido(d, token, agora);
  if (v.erro) throw new PasseioErro('Link indisponível.', 410);
  const t = v.link;
  const sessao = String(ev.sessao ?? '').replace(/[^\w-]/g, '').slice(0, 40) || null;
  const passo = ev.passo != null && Number.isInteger(ev.passo) && ev.passo >= 1 && ev.passo <= 6 ? ev.passo : null;
  let loteId: number | null = null;
  if (ev.loteId != null) {
    const [l]: any[] = await d.select({ id: lotes.id }).from(lotes).where(and(eq(lotes.id, Number(ev.loteId)), eq(lotes.empreendimentoId, t.empreendimentoId))).limit(1);
    loteId = l ? Number(l.id) : null;
  }
  // Abertura conta uma vez por sessão
  if (ev.tipo === 'open' && sessao) {
    const [ja]: any[] = await d.select({ id: tourEventos.id }).from(tourEventos)
      .where(and(eq(tourEventos.tourLinkId, t.id), eq(tourEventos.tipo, 'open'), eq(tourEventos.sessao, sessao))).limit(1);
    if (ja) return { ok: true as const, repetido: true };
  }
  await d.insert(tourEventos).values({ tourLinkId: t.id, tipo: ev.tipo, loteId, passo, sessao, ua: resumoUa(ev.ua) } as any);
  if (ev.tipo === 'open') {
    await d.update(tourLinks).set({ aberturas: sql`${tourLinks.aberturas} + 1`, ultimaAberturaAt: new Date(agora) } as any).where(eq(tourLinks.id, t.id));
  }
  if (ev.tipo === 'open' || ev.tipo === 'cta_click') avisar(d, t, ev.tipo, loteId, agora).catch((e: any) => console.warn('[Passeio] aviso:', e?.message));
  return { ok: true as const };
}

/** Navegador e sistema em poucas palavras (sem identificar a pessoa) */
export function resumoUa(ua: string | null | undefined): string | null {
  const u = String(ua ?? '');
  if (!u) return null;
  const so = /iPhone|iPad/i.test(u) ? 'iOS' : /Android/i.test(u) ? 'Android' : /Windows/i.test(u) ? 'Windows' : /Mac OS/i.test(u) ? 'Mac' : 'Outro';
  const nav = /CriOS|Chrome/i.test(u) ? 'Chrome' : /Safari/i.test(u) ? 'Safari' : /Firefox/i.test(u) ? 'Firefox' : /Instagram/i.test(u) ? 'Instagram' : 'Navegador';
  return `${so} · ${nav}${/WhatsApp/i.test(u) ? ' · WhatsApp' : ''}`.slice(0, 120);
}

async function avisar(d: any, t: any, tipo: 'open' | 'cta_click', loteId: number | null, agora: number) {
  const [e]: any[] = await d.select({ id: empreendimentos.id, slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos).where(eq(empreendimentos.id, t.empreendimentoId)).limit(1);
  if (!e) return;
  const [lead]: any[] = t.leadId ? await d.select({ answers: leads.answers, phone: leads.phone }).from(leads).where(eq(leads.id, t.leadId)).limit(1) : [];
  const [lote]: any[] = loteId ? await d.select({ codigo: lotes.codigo }).from(lotes).where(eq(lotes.id, loteId)).limit(1) : [];
  const quem = lead ? nomeDoLead(lead) : 'Um cliente';
  const { notificarPasseio } = await import('../notificacoes');
  // Abertura: no máximo um aviso por link a cada 30 min (a pessoa pode abrir várias vezes)
  const janela = Math.floor(agora / (30 * 60_000));
  await notificarPasseio(tipo === 'open'
    ? { corretorId: t.corretorId, empreendimentoId: e.id, empreendimentoSlug: e.slug, titulo: `Passeio no Mapa aberto · ${e.nome}`, mensagem: `${quem} abriu o passeio${lote?.codigo ? '' : ''}${t.loteDestaqueId ? ' com o lote em destaque' : ''}.`, chave: `passeio:${t.id}:open:${janela}` }
    : { corretorId: t.corretorId, empreendimentoId: e.id, empreendimentoSlug: e.slug, titulo: `Quero este lote · ${lote?.codigo ?? e.nome}`, mensagem: `${quem} tocou em "Quero este lote"${lote?.codigo ? ` no lote ${lote.codigo}` : ''} e foi para o WhatsApp.`, chave: `passeio:${t.id}:cta:${loteId ?? 0}:${janela}` });
}
