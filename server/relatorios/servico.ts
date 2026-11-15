/**
 * Relatórios fotográficos — registro interno de atividades com fotos (rascunho → final, PDF paginado).
 *
 * Privacidade: fotos e PDF ficam no armazenamento privado do sistema (contratoArquivos), servidos só por rotas
 * autenticadas com checagem de acesso. NÃO usa o Cloudinary/Materiais (links públicos).
 * O original é preservado; a prévia e a miniatura são geradas à parte (sem metadados).
 */
import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, like, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { contacts, empreendimentos, properties, relatorioEventos, relatorioFotos, relatoriosFotograficos, users } from '../../drizzle/schema';
import { perfilDe } from '../../shared/equipe';
import {
  AVISO_REGISTRO, MAX_BYTES_FOTO, MAX_FOTOS_RELATORIO, ROTULO_STATUS, ROTULO_TIPO_ATIVIDADE, TIPOS_ATIVIDADE,
  dataAtividadeValida, dataBr, numeroRelatorio, podeEditarRelatorio, podeUsarRelatorios, podeVerRelatorio,
  type OrigemCaptura, type TipoAtividade,
} from '../../shared/relatoriosFotograficos';
import { lerArquivo, salvarArquivo } from '../contratos/arquivos';
import { dataOriginalExif } from './exif';

export class RelatorioErro extends Error {
  constructor(public status: number, mensagem: string) { super(mensagem); this.name = 'RelatorioErro'; }
}
export interface Ator { id: number; perfil: string | null }
export const atorDe = (user: any): Ator => ({ id: Number(user?.id), perfil: perfilDe(user) });

const db = async () => {
  const d = (await getDb()) as any;
  if (!d) throw new RelatorioErro(503, 'Banco indisponível');
  return d;
};
const uid = () => randomBytes(16).toString('hex');
const exigirUso = (a: Ator) => { if (!podeUsarRelatorios(a.perfil)) throw new RelatorioErro(403, 'Seu perfil não usa relatórios fotográficos.'); };
const iso = (v: unknown) => (v ? new Date(v as any).toISOString() : null);

async function evento(relatorioId: number, usuarioId: number | null, nome: string, detalhe?: Record<string, unknown>) {
  try {
    await (await db()).insert(relatorioEventos).values({ relatorioId, usuarioId, evento: nome, detalheJson: detalhe ? JSON.stringify(detalhe).slice(0, 2000) : null, criadoEm: new Date() } as any);
  } catch (e: any) { console.warn('[Relatórios] evento:', e?.message); }
}

/** Carrega o relatório e confere o acesso (404 para quem não pode ver: não revela existência) */
async function carregar(a: Ator, id: number) {
  exigirUso(a);
  const d = await db();
  const [r]: any[] = await d.select().from(relatoriosFotograficos).where(and(eq(relatoriosFotograficos.id, id), isNull(relatoriosFotograficos.excluidoEm))).limit(1);
  if (!r || !podeVerRelatorio(a.perfil, a.id, r)) throw new RelatorioErro(404, 'Relatório não encontrado');
  return r;
}
async function carregarEditavel(a: Ator, id: number) {
  const r = await carregar(a, id);
  if (!podeEditarRelatorio(a.perfil, a.id, r)) throw new RelatorioErro(409, 'Relatório final é somente leitura. Para corrigir, crie um novo rascunho a partir dele.');
  return r;
}

// ─── Contexto (reaproveita cadastros existentes; nada é duplicado) ──────────────────────────────────

export interface DadosRelatorio {
  titulo: string; descricao?: string | null; tipoAtividade: TipoAtividade; dataAtividade: string;
  empreendimentoId?: number | null; loteCodigo?: string | null; imovelId?: number | null; clienteId?: number | null; responsavelUserId?: number | null;
}

async function validarDados(a: Ator, p: DadosRelatorio) {
  const titulo = String(p.titulo ?? '').trim();
  if (titulo.length < 3) throw new RelatorioErro(400, 'Informe um título (mínimo 3 caracteres).');
  if (!TIPOS_ATIVIDADE.includes(p.tipoAtividade)) throw new RelatorioErro(400, 'Tipo de atividade inválido.');
  if (!dataAtividadeValida(p.dataAtividade)) throw new RelatorioErro(400, 'Data da atividade inválida.');
  const d = await db();
  // Responsável: o corretor só pode ser ele mesmo; administrador e secretária escolhem um usuário ativo da equipe
  let resp = Number(p.responsavelUserId) || a.id;
  if (a.perfil === 'corretor') resp = a.id;
  else if (resp !== a.id) {
    const [u]: any[] = await d.select({ id: users.id, role: users.role, perfil: users.perfil, ativo: users.ativo }).from(users).where(eq(users.id, resp)).limit(1);
    if (!u || !u.ativo || !podeUsarRelatorios(perfilDe(u))) throw new RelatorioErro(400, 'Responsável inválido.');
  }
  const confere = async (tabela: any, coluna: any, idv: number | null | undefined, nome: string) => {
    if (!idv) return null;
    const [x]: any[] = await d.select({ id: coluna }).from(tabela).where(eq(coluna, idv)).limit(1);
    if (!x) throw new RelatorioErro(400, `${nome} não encontrado.`);
    return idv;
  };
  return {
    titulo: titulo.slice(0, 180),
    descricao: String(p.descricao ?? '').trim().slice(0, 5000) || null,
    tipoAtividade: p.tipoAtividade,
    dataAtividade: p.dataAtividade,
    empreendimentoId: await confere(empreendimentos, empreendimentos.id, p.empreendimentoId, 'Empreendimento'),
    loteCodigo: String(p.loteCodigo ?? '').trim().toUpperCase().slice(0, 20) || null,
    imovelId: await confere(properties, properties.id, p.imovelId, 'Imóvel'),
    clienteId: await confere(contacts, contacts.id, p.clienteId, 'Cliente'),
    responsavelUserId: resp,
  };
}

async function proximoNumero(): Promise<string> {
  const d = await db();
  const ano = new Date().getFullYear();
  const [x]: any[] = await d.select({ n: sql<number>`count(*)` }).from(relatoriosFotograficos).where(like(relatoriosFotograficos.numero, `RF-${ano}-%`));
  return numeroRelatorio(ano, Number(x?.n ?? 0) + 1);
}

export async function criarRelatorio(a: Ator, p: DadosRelatorio) {
  exigirUso(a);
  const v = await validarDados(a, p);
  const d = await db();
  const u = uid();
  const agora = new Date();
  await d.insert(relatoriosFotograficos).values({ ...v, uid: u, numero: await proximoNumero(), status: 'draft', dataAtividadeOrigem: 'user_provided', criadoPor: a.id, criadoEm: agora, atualizadoEm: agora } as any);
  const [r]: any[] = await d.select().from(relatoriosFotograficos).where(eq(relatoriosFotograficos.uid, u)).limit(1);
  await evento(r.id, a.id, 'criado');
  return { id: Number(r.id), numero: r.numero };
}

export async function atualizarRelatorio(a: Ator, id: number, p: DadosRelatorio) {
  const r = await carregarEditavel(a, id);
  const v = await validarDados(a, { ...p, responsavelUserId: a.perfil === 'corretor' ? r.responsavelUserId : p.responsavelUserId });
  const d = await db();
  const origem = v.dataAtividade !== r.dataAtividade ? 'edited_by_user' : r.dataAtividadeOrigem;
  await d.update(relatoriosFotograficos).set({ ...v, dataAtividadeOrigem: origem, atualizadoEm: new Date() } as any).where(eq(relatoriosFotograficos.id, id));
  await evento(id, a.id, 'editado', v.dataAtividade !== r.dataAtividade ? { dataDe: r.dataAtividade, dataPara: v.dataAtividade } : undefined);
  return { ok: true };
}

async function fotosAtivas(relatorioId: number) {
  const d = await db();
  return d.select().from(relatorioFotos).where(and(eq(relatorioFotos.relatorioId, relatorioId), isNull(relatorioFotos.excluidaEm)))
    .orderBy(asc(relatorioFotos.ordem), asc(relatorioFotos.id)) as Promise<any[]>;
}

export async function finalizarRelatorio(a: Ator, id: number) {
  await carregarEditavel(a, id);
  if (!(await fotosAtivas(id)).length) throw new RelatorioErro(400, 'Adicione ao menos uma foto antes de finalizar.');
  const agora = new Date();
  await (await db()).update(relatoriosFotograficos).set({ status: 'final', finalizadoEm: agora, finalizadoPor: a.id, atualizadoEm: agora } as any).where(eq(relatoriosFotograficos.id, id));
  await evento(id, a.id, 'finalizado');
  return { ok: true };
}

/** Correção de um final: novo rascunho com os mesmos dados e fotos (mesmos arquivos, que nunca são sobrescritos) */
export async function derivarRelatorio(a: Ator, id: number) {
  const r = await carregar(a, id);
  if (r.status !== 'final') throw new RelatorioErro(409, 'Só um relatório final gera um novo rascunho de correção.');
  const d = await db();
  const u = uid();
  const agora = new Date();
  await d.insert(relatoriosFotograficos).values({
    uid: u, numero: await proximoNumero(), titulo: r.titulo, descricao: r.descricao, tipoAtividade: r.tipoAtividade, dataAtividade: r.dataAtividade,
    dataAtividadeOrigem: r.dataAtividadeOrigem, empreendimentoId: r.empreendimentoId, loteCodigo: r.loteCodigo, imovelId: r.imovelId, clienteId: r.clienteId,
    responsavelUserId: a.perfil === 'corretor' ? a.id : r.responsavelUserId, status: 'draft', derivadoDeId: r.id, criadoPor: a.id, criadoEm: agora, atualizadoEm: agora,
  } as any);
  const [novo]: any[] = await d.select().from(relatoriosFotograficos).where(eq(relatoriosFotograficos.uid, u)).limit(1);
  for (const f of await fotosAtivas(r.id)) {
    const { id: _i, uid: _u, ...resto } = f;
    await d.insert(relatorioFotos).values({ ...resto, relatorioId: novo.id, uid: uid() } as any);
  }
  await evento(novo.id, a.id, 'derivado', { de: r.numero });
  return { id: Number(novo.id), numero: novo.numero };
}

/** Excluir só rascunho (o final é preservado). Exclusão lógica; os arquivos não são apagados automaticamente. */
export async function excluirRascunho(a: Ator, id: number) {
  await carregarEditavel(a, id);
  await (await db()).update(relatoriosFotograficos).set({ excluidoEm: new Date() } as any).where(eq(relatoriosFotograficos.id, id));
  await evento(id, a.id, 'excluido');
  return { ok: true };
}

// ─── Leitura ────────────────────────────────────────────────────────────────────────────────────────

const visaoFoto = (f: any) => ({
  id: Number(f.id), uid: f.uid, ordem: Number(f.ordem), legenda: f.legenda ?? '', incluirCliente: Number(f.incluirCliente) === 1,
  mime: f.mime, bytes: Number(f.bytes), largura: f.largura, altura: f.altura, nomeOriginal: f.nomeOriginal, origemCaptura: f.origemCaptura,
  capturadaEm: iso(f.capturadaEm), enviadaEm: iso(f.enviadaEm), geo: Number(f.geoConsentimento) === 1 && f.latitude != null ? { lat: Number(f.latitude), lng: Number(f.longitude) } : null,
});

async function nomes(ids: { users?: number[]; emps?: number[]; imoveis?: number[]; clientes?: number[] }) {
  const d = await db();
  const mapa = async (tabela: any, colId: any, colNome: any, lista?: number[]) => {
    const u = Array.from(new Set((lista ?? []).filter(Boolean)));
    if (!u.length) return new Map<number, string>();
    const rows: any[] = await d.select({ id: colId, nome: colNome }).from(tabela).where(inArray(colId, u));
    return new Map(rows.map(x => [Number(x.id), String(x.nome ?? '')]));
  };
  return {
    users: await mapa(users, users.id, users.name, ids.users),
    emps: await mapa(empreendimentos, empreendimentos.id, empreendimentos.nome, ids.emps),
    imoveis: await mapa(properties, properties.id, properties.denomination, ids.imoveis),
    clientes: await mapa(contacts, contacts.id, contacts.name, ids.clientes),
  };
}

export interface FiltrosLista { empreendimentoId?: number | null; tipoAtividade?: string | null; status?: string | null; responsavelUserId?: number | null; de?: string | null; ate?: string | null; busca?: string | null }

export async function listarRelatorios(a: Ator, f: FiltrosLista = {}) {
  exigirUso(a);
  const d = await db();
  const cond: any[] = [isNull(relatoriosFotograficos.excluidoEm)];
  if (f.empreendimentoId) cond.push(eq(relatoriosFotograficos.empreendimentoId, f.empreendimentoId));
  if (f.tipoAtividade) cond.push(eq(relatoriosFotograficos.tipoAtividade, f.tipoAtividade));
  if (f.status) cond.push(eq(relatoriosFotograficos.status, f.status));
  if (f.responsavelUserId) cond.push(eq(relatoriosFotograficos.responsavelUserId, f.responsavelUserId));
  if (f.de && dataAtividadeValida(f.de)) cond.push(sql`${relatoriosFotograficos.dataAtividade} >= ${f.de}`);
  if (f.ate && dataAtividadeValida(f.ate)) cond.push(sql`${relatoriosFotograficos.dataAtividade} <= ${f.ate}`);
  if (f.busca?.trim()) cond.push(like(relatoriosFotograficos.titulo, `%${f.busca.trim().slice(0, 80)}%`));
  const rows: any[] = await d.select().from(relatoriosFotograficos).where(and(...cond)).orderBy(desc(relatoriosFotograficos.dataAtividade), desc(relatoriosFotograficos.id)).limit(500);
  const visiveis = rows.filter(r => podeVerRelatorio(a.perfil, a.id, r));
  const ids = visiveis.map(r => Number(r.id));
  const fotos: any[] = ids.length
    ? await d.select({ relatorioId: relatorioFotos.relatorioId, uid: relatorioFotos.uid, ordem: relatorioFotos.ordem, id: relatorioFotos.id }).from(relatorioFotos)
      .where(and(inArray(relatorioFotos.relatorioId, ids), isNull(relatorioFotos.excluidaEm))).orderBy(asc(relatorioFotos.ordem), asc(relatorioFotos.id))
    : [];
  const porRel = new Map<number, any[]>();
  for (const x of fotos) porRel.set(Number(x.relatorioId), [...(porRel.get(Number(x.relatorioId)) ?? []), x]);
  const n = await nomes({ users: visiveis.map(r => r.responsavelUserId), emps: visiveis.map(r => r.empreendimentoId), clientes: visiveis.map(r => r.clienteId) });
  return visiveis.map(r => {
    const fs = porRel.get(Number(r.id)) ?? [];
    return {
      id: Number(r.id), numero: r.numero, titulo: r.titulo, tipoAtividade: r.tipoAtividade, dataAtividade: r.dataAtividade, status: r.status,
      responsavel: n.users.get(Number(r.responsavelUserId)) ?? '—', responsavelUserId: Number(r.responsavelUserId),
      empreendimento: r.empreendimentoId ? n.emps.get(Number(r.empreendimentoId)) ?? null : null, loteCodigo: r.loteCodigo,
      cliente: r.clienteId ? n.clientes.get(Number(r.clienteId)) ?? null : null,
      totalFotos: fs.length, capaUid: fs[0]?.uid ?? null, derivadoDeId: r.derivadoDeId ?? null,
      podeEditar: podeEditarRelatorio(a.perfil, a.id, r),
    };
  });
}

export async function obterRelatorio(a: Ator, id: number) {
  const r = await carregar(a, id);
  const fs = await fotosAtivas(id);
  const n = await nomes({ users: [r.responsavelUserId, r.criadoPor, r.finalizadoPor], emps: [r.empreendimentoId], imoveis: [r.imovelId], clientes: [r.clienteId] });
  const d = await db();
  const [origem]: any[] = r.derivadoDeId ? await d.select({ numero: relatoriosFotograficos.numero }).from(relatoriosFotograficos).where(eq(relatoriosFotograficos.id, r.derivadoDeId)).limit(1) : [];
  return {
    id: Number(r.id), numero: r.numero, titulo: r.titulo, descricao: r.descricao ?? '', tipoAtividade: r.tipoAtividade, dataAtividade: r.dataAtividade,
    dataAtividadeOrigem: r.dataAtividadeOrigem, empreendimentoId: r.empreendimentoId ?? null, loteCodigo: r.loteCodigo ?? '', imovelId: r.imovelId ?? null,
    clienteId: r.clienteId ?? null, responsavelUserId: Number(r.responsavelUserId), status: r.status as 'draft' | 'final',
    derivadoDe: origem?.numero ?? null, finalizadoEm: iso(r.finalizadoEm), criadoEm: iso(r.criadoEm), atualizadoEm: iso(r.atualizadoEm),
    nomes: {
      responsavel: n.users.get(Number(r.responsavelUserId)) ?? '—', criadoPor: n.users.get(Number(r.criadoPor)) ?? '—',
      finalizadoPor: r.finalizadoPor ? n.users.get(Number(r.finalizadoPor)) ?? null : null,
      empreendimento: r.empreendimentoId ? n.emps.get(Number(r.empreendimentoId)) ?? null : null,
      imovel: r.imovelId ? n.imoveis.get(Number(r.imovelId)) ?? null : null,
      cliente: r.clienteId ? n.clientes.get(Number(r.clienteId)) ?? null : null,
    },
    fotos: fs.map(visaoFoto),
    podeEditar: podeEditarRelatorio(a.perfil, a.id, r),
    limites: { maxFotos: MAX_FOTOS_RELATORIO, maxBytes: MAX_BYTES_FOTO },
  };
}

/** Listas para os seletores do formulário (o corretor vê só a si mesmo como responsável) */
export async function opcoesRelatorio(a: Ator, buscaCliente?: string) {
  exigirUso(a);
  const d = await db();
  const emps: any[] = await d.select({ id: empreendimentos.id, nome: empreendimentos.nome }).from(empreendimentos).orderBy(asc(empreendimentos.nome)).limit(200);
  const imoveis: any[] = await d.select({ id: properties.id, nome: properties.denomination }).from(properties).orderBy(asc(properties.denomination)).limit(300);
  let equipe: any[] = [];
  if (a.perfil === 'corretor') equipe = await d.select({ id: users.id, nome: users.name }).from(users).where(eq(users.id, a.id)).limit(1);
  else {
    const todos: any[] = await d.select({ id: users.id, nome: users.name, role: users.role, perfil: users.perfil, ativo: users.ativo }).from(users).limit(1000);
    equipe = todos.filter(u => u.ativo && podeUsarRelatorios(perfilDe(u))).map(u => ({ id: u.id, nome: u.nome }));
  }
  const q = String(buscaCliente ?? '').trim();
  const clientes: any[] = q.length >= 2
    ? await d.select({ id: contacts.id, nome: contacts.name }).from(contacts).where(like(contacts.name, `%${q.slice(0, 60)}%`)).orderBy(asc(contacts.name)).limit(20)
    : [];
  return {
    empreendimentos: emps.map(x => ({ id: Number(x.id), nome: String(x.nome) })),
    imoveis: imoveis.map(x => ({ id: Number(x.id), nome: String(x.nome) })),
    equipe: equipe.map(x => ({ id: Number(x.id), nome: String(x.nome ?? `Usuário ${x.id}`) })).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')),
    clientes: clientes.map(x => ({ id: Number(x.id), nome: String(x.nome) })),
    tipos: TIPOS_ATIVIDADE.map(t => ({ valor: t, rotulo: ROTULO_TIPO_ATIVIDADE[t] })),
  };
}

// ─── Fotos ──────────────────────────────────────────────────────────────────────────────────────────

const FORMATO_MIME: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export interface MetaFoto { nome?: string | null; origem?: OrigemCaptura | null; geo?: { lat: number; lng: number } | null }

/** Valida pelo CONTEÚDO (não pela extensão), preserva o original e gera prévia/miniatura JPEG sem metadados */
export async function adicionarFoto(a: Ator, relatorioId: number, buf: Buffer, meta: MetaFoto = {}) {
  await carregarEditavel(a, relatorioId);
  if (!buf?.length) throw new RelatorioErro(400, 'Arquivo vazio.');
  if (buf.length > MAX_BYTES_FOTO) throw new RelatorioErro(413, `Foto acima de ${Math.round(MAX_BYTES_FOTO / 1048576)} MB.`);
  const atuais = await fotosAtivas(relatorioId);
  if (atuais.length >= MAX_FOTOS_RELATORIO) throw new RelatorioErro(400, `Limite de ${MAX_FOTOS_RELATORIO} fotos por relatório.`);
  const sharp = (await import('sharp')).default;
  let info: any;
  try { info = await sharp(buf, { failOn: 'error' }).metadata(); } catch { throw new RelatorioErro(415, 'Arquivo não é uma imagem válida.'); }
  if (info.format === 'heif') throw new RelatorioErro(415, 'Foto em HEIC não é suportada neste servidor. No iPhone: Ajustes › Câmera › Formatos › "Mais compatível", ou envie em JPEG.');
  const mime = FORMATO_MIME[String(info.format)];
  if (!mime) throw new RelatorioErro(415, 'Formato não aceito. Envie JPEG, PNG ou WebP.');
  const previa = await sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  const mini = await sharp(buf).rotate().resize({ width: 420, height: 420, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
  const meta2 = await sharp(previa).metadata();
  const u = uid();
  const base = `relatorios/${relatorioId}/${u}`;
  await salvarArquivo(`${base}/original.${EXT[mime]}`, buf, mime);
  await salvarArquivo(`${base}/previa.jpg`, previa, 'image/jpeg');
  await salvarArquivo(`${base}/miniatura.jpg`, mini, 'image/jpeg');
  const geo = meta.geo && Number.isFinite(meta.geo.lat) && Number.isFinite(meta.geo.lng) && Math.abs(meta.geo.lat) <= 90 && Math.abs(meta.geo.lng) <= 180 ? meta.geo : null;
  const ordem = atuais.length ? Math.max(...atuais.map(f => Number(f.ordem))) + 1 : 0;
  await (await db()).insert(relatorioFotos).values({
    relatorioId, uid: u, ordem, legenda: null, incluirCliente: 1, mime, bytes: buf.length, largura: meta2.width ?? info.width ?? null, altura: meta2.height ?? info.height ?? null,
    nomeOriginal: String(meta.nome ?? '').slice(0, 255) || null, arquivoOriginal: `${base}/original.${EXT[mime]}`, arquivoPrevia: `${base}/previa.jpg`, arquivoMiniatura: `${base}/miniatura.jpg`,
    origemCaptura: meta.origem ?? 'other', capturadaEm: dataOriginalExif(info.exif), geoConsentimento: geo ? 1 : 0,
    latitude: geo ? geo.lat.toFixed(7) : null, longitude: geo ? geo.lng.toFixed(7) : null, enviadaPor: a.id, enviadaEm: new Date(),
  } as any);
  await (await db()).update(relatoriosFotograficos).set({ atualizadoEm: new Date() } as any).where(eq(relatoriosFotograficos.id, relatorioId));
  await evento(relatorioId, a.id, 'foto_enviada', { uid: u, bytes: buf.length, mime });
  const [f]: any[] = await (await db()).select().from(relatorioFotos).where(eq(relatorioFotos.uid, u)).limit(1);
  return visaoFoto(f);
}

async function fotoDoRelatorio(relatorioId: number, fotoId: number) {
  const [f]: any[] = await (await db()).select().from(relatorioFotos).where(and(eq(relatorioFotos.id, fotoId), eq(relatorioFotos.relatorioId, relatorioId), isNull(relatorioFotos.excluidaEm))).limit(1);
  if (!f) throw new RelatorioErro(404, 'Foto não encontrada');
  return f;
}

export async function atualizarFoto(a: Ator, relatorioId: number, fotoId: number, p: { legenda?: string; incluirCliente?: boolean }) {
  await carregarEditavel(a, relatorioId);
  await fotoDoRelatorio(relatorioId, fotoId);
  const set: any = {};
  if (p.legenda !== undefined) set.legenda = String(p.legenda).trim().slice(0, 1000) || null;
  if (p.incluirCliente !== undefined) set.incluirCliente = p.incluirCliente ? 1 : 0;
  if (!Object.keys(set).length) return { ok: true };
  await (await db()).update(relatorioFotos).set(set).where(eq(relatorioFotos.id, fotoId));
  await evento(relatorioId, a.id, p.legenda !== undefined ? 'legenda_editada' : 'selecao_cliente', { fotoId });
  return { ok: true };
}

export async function reordenarFotos(a: Ator, relatorioId: number, ids: number[]) {
  await carregarEditavel(a, relatorioId);
  const atuais = await fotosAtivas(relatorioId);
  const conj = new Set(atuais.map(f => Number(f.id)));
  if (ids.length !== conj.size || !ids.every(i => conj.has(i))) throw new RelatorioErro(400, 'A ordem enviada não corresponde às fotos do relatório.');
  const d = await db();
  for (let i = 0; i < ids.length; i++) await d.update(relatorioFotos).set({ ordem: i } as any).where(eq(relatorioFotos.id, ids[i]));
  await evento(relatorioId, a.id, 'reordenado');
  return { ok: true };
}

/** Remove a foto do relatório (só rascunho; exclusão lógica — o arquivo original não é apagado) */
export async function removerFoto(a: Ator, relatorioId: number, fotoId: number) {
  await carregarEditavel(a, relatorioId);
  await fotoDoRelatorio(relatorioId, fotoId);
  await (await db()).update(relatorioFotos).set({ excluidaEm: new Date() } as any).where(eq(relatorioFotos.id, fotoId));
  await evento(relatorioId, a.id, 'foto_removida', { fotoId });
  return { ok: true };
}

/** Arquivo da foto para quem pode ver o relatório (o original é registrado na trilha como download) */
export async function arquivoDaFoto(a: Ator, fotoUid: string, variante: 'miniatura' | 'previa' | 'original') {
  exigirUso(a);
  if (!/^[0-9a-f]{32}$/.test(fotoUid)) throw new RelatorioErro(404, 'Foto não encontrada');
  const [f]: any[] = await (await db()).select().from(relatorioFotos).where(and(eq(relatorioFotos.uid, fotoUid), isNull(relatorioFotos.excluidaEm))).limit(1);
  if (!f) throw new RelatorioErro(404, 'Foto não encontrada');
  await carregar(a, Number(f.relatorioId));
  const chave = variante === 'original' ? f.arquivoOriginal : variante === 'previa' ? f.arquivoPrevia : f.arquivoMiniatura;
  const arq = await lerArquivo(chave);
  if (!arq) throw new RelatorioErro(404, 'Arquivo indisponível');
  if (variante === 'original') await evento(Number(f.relatorioId), a.id, 'download_original', { fotoId: Number(f.id) });
  const nome = variante === 'original' ? (f.nomeOriginal || `foto-${f.id}.${EXT[f.mime] ?? 'jpg'}`) : `foto-${f.id}-${variante}.jpg`;
  return { buf: arq.buf, mime: arq.mime, nome };
}

// ─── PDF ────────────────────────────────────────────────────────────────────────────────────────────

/** Texto que a fonte padrão do PDF (WinAnsi) consegue desenhar */
function limpa(s: unknown): string {
  return String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[−‐‑]/g, '-')
    .replace(/[\r\t]/g, ' ').replace(/[^\n\x20-\x7E -ÿ–—•…€]/g, '');
}

export async function gerarPdfRelatorio(a: Ator, id: number, o: { cliente?: boolean; previa?: boolean } = {}) {
  const r = await obterRelatorio(a, id);
  const fotos = r.fotos.filter(f => !o.cliente || f.incluirCliente);
  if (o.cliente && !fotos.length) throw new RelatorioErro(400, 'Nenhuma foto marcada para a versão do cliente.');
  const d = await db();
  const linhas: any[] = fotos.length ? await d.select().from(relatorioFotos).where(inArray(relatorioFotos.id, fotos.map(f => f.id))) : [];
  const previas = new Map<number, Buffer>();
  for (const l of linhas) {
    const arq = await lerArquivo(l.arquivoPrevia);
    if (arq) previas.set(Number(l.id), arq.buf);
  }
  const buf = await montarPdf(r, fotos, previas, !!o.cliente);
  await evento(id, a.id, o.previa ? 'previa_pdf' : 'exportacao_pdf', { cliente: !!o.cliente, fotos: fotos.length });
  const nome = `${r.numero}${o.cliente ? '-cliente' : ''}${r.status === 'draft' ? '-rascunho' : ''}.pdf`;
  return { buf, nome };
}

type Rel = Awaited<ReturnType<typeof obterRelatorio>>;
type Foto = Rel['fotos'][number];

export async function montarPdf(r: Rel, fotos: Foto[], previas: Map<number, Buffer>, cliente: boolean): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const { marca, MARCA } = await import('../recrutamento/formularioArquivos');
  const pdf = await PDFDocument.create();
  pdf.setTitle(limpa(`${r.numero} — ${r.titulo}`));
  pdf.setProducer('Romatec CRM');
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const titulo = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const verde = rgb(0.047, 0.2, 0.125), dourado = rgb(0.788, 0.659, 0.298), tinta = rgb(0.09, 0.23, 0.17), cinza = rgb(0.36, 0.43, 0.38), creme = rgb(0.96, 0.95, 0.91);
  const W = 595, H = 842, M = 40;
  const rosa = await marca('rosa-dark.png', 160).catch(() => null), wordmark = await marca('wordmark-dourado.png', 480).catch(() => null);
  const imgRosa = rosa ? await pdf.embedPng(rosa) : null, imgWord = wordmark ? await pdf.embedPng(wordmark) : null;

  const quebra = (txt: string, f: any, tam: number, larg: number) => {
    const out: string[] = [];
    for (const par of limpa(txt).split('\n')) {
      let linha = '';
      for (const p of par.split(/\s+/).filter(Boolean)) {
        const t = linha ? `${linha} ${p}` : p;
        if (f.widthOfTextAtSize(t, tam) > larg && linha) { out.push(linha); linha = p; } else linha = t;
      }
      out.push(linha);
    }
    return out;
  };
  const cabecalho = (pg: any, compacto: boolean) => {
    const h = compacto ? 46 : 78;
    pg.drawRectangle({ x: 0, y: H - h, width: W, height: h, color: verde });
    pg.drawRectangle({ x: 0, y: H - h - 2, width: W, height: 2, color: dourado });
    let x = M;
    if (imgRosa) { const s = compacto ? 30 : 52; pg.drawImage(imgRosa, { x, y: H - h + (h - s) / 2, width: s, height: s * imgRosa.height / imgRosa.width }); x += s + 10; }
    if (imgWord) { const w = compacto ? 112 : 140, wh = w * imgWord.height / imgWord.width; pg.drawImage(imgWord, { x, y: compacto ? H - h + (h - wh) / 2 : H - h + 26, width: w, height: wh }); }
    else pg.drawText('ROMATEC CONSULTORIA TOTAL', { x, y: H - h / 2, size: 12, font: negrito, color: dourado });
    if (!compacto) pg.drawText(limpa(MARCA.linha), { x, y: H - h + 14, size: 8.5, font: negrito, color: dourado });
    const etiqueta = limpa(`${r.numero}${cliente ? ' · versão para o cliente' : ''}`);
    pg.drawText(etiqueta, { x: W - M - negrito.widthOfTextAtSize(etiqueta, 9), y: H - h / 2 - 3, size: 9, font: negrito, color: creme });
  };

  // Página 1: identificação e contexto
  let pg = pdf.addPage([W, H]);
  cabecalho(pg, false);
  let y = H - 118;
  pg.drawText('RELATÓRIO FOTOGRÁFICO DE ATIVIDADE', { x: M, y, size: 9, font: negrito, color: dourado });
  y -= 24;
  for (const l of quebra(r.titulo, titulo, 20, W - 2 * M).slice(0, 3)) { pg.drawText(l, { x: M, y, size: 20, font: titulo, color: verde }); y -= 24; }
  y -= 4;
  const pares: [string, string][] = [
    ['Tipo de atividade', ROTULO_TIPO_ATIVIDADE[r.tipoAtividade as TipoAtividade] ?? r.tipoAtividade],
    ['Data da atividade', `${dataBr(r.dataAtividade)}${r.dataAtividadeOrigem === 'edited_by_user' ? ' (alterada pelo usuário)' : ''}`],
    ['Responsável', r.nomes.responsavel],
    ['Situação', `${ROTULO_STATUS[r.status]}${r.finalizadoEm ? ` em ${new Date(r.finalizadoEm).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}` : ''}`],
  ];
  if (r.nomes.empreendimento) pares.push(['Empreendimento', `${r.nomes.empreendimento}${r.loteCodigo ? ` — ${r.loteCodigo}` : ''}`]);
  if (r.nomes.imovel) pares.push(['Imóvel', r.nomes.imovel]);
  if (r.nomes.cliente) pares.push(['Cliente', r.nomes.cliente]);
  if (r.derivadoDe) pares.push(['Corrige o relatório', r.derivadoDe]);
  pares.push(['Fotos neste documento', String(fotos.length)]);
  const altBox = pares.length * 18 + 16;
  pg.drawRectangle({ x: M, y: y - altBox, width: W - 2 * M, height: altBox, color: creme, borderColor: rgb(0.83, 0.87, 0.82), borderWidth: 0.8 });
  let yy = y - 20;
  for (const [k, v] of pares) {
    pg.drawText(limpa(k), { x: M + 12, y: yy, size: 9, font: negrito, color: cinza });
    pg.drawText(limpa(v).slice(0, 80), { x: M + 160, y: yy, size: 10, font: fonte, color: tinta });
    yy -= 18;
  }
  y -= altBox + 22;
  if (r.descricao) {
    pg.drawText('Descrição', { x: M, y, size: 11, font: negrito, color: verde });
    y -= 16;
    for (const l of quebra(r.descricao, fonte, 10, W - 2 * M)) {
      if (y < 90) { pg = pdf.addPage([W, H]); cabecalho(pg, true); y = H - 80; }
      pg.drawText(l, { x: M, y, size: 10, font: fonte, color: tinta });
      y -= 14;
    }
  }

  // Fotos: duas por página, com legenda
  const larg = W - 2 * M, slotImg = 300;
  let naPagina = 2;
  for (let i = 0; i < fotos.length; i++) {
    const f = fotos[i];
    if (naPagina >= 2) { pg = pdf.addPage([W, H]); cabecalho(pg, true); y = H - 72; naPagina = 0; }
    naPagina++;
    const b = previas.get(f.id);
    let altUsada = 0;
    if (b) {
      const img = await pdf.embedJpg(Uint8Array.from(b));
      const esc = Math.min(larg / img.width, slotImg / img.height);
      const w = img.width * esc, h = img.height * esc;
      pg.drawRectangle({ x: M, y: y - slotImg, width: larg, height: slotImg, color: rgb(0.94, 0.94, 0.92) });
      pg.drawImage(img, { x: M + (larg - w) / 2, y: y - slotImg + (slotImg - h) / 2, width: w, height: h });
      altUsada = slotImg;
    } else {
      pg.drawRectangle({ x: M, y: y - 60, width: larg, height: 60, color: rgb(0.94, 0.94, 0.92) });
      pg.drawText('Imagem indisponível', { x: M + 12, y: y - 34, size: 10, font: fonte, color: cinza });
      altUsada = 60;
    }
    y -= altUsada + 14;
    pg.drawText(limpa(`Foto ${i + 1}`), { x: M, y, size: 10, font: negrito, color: verde });
    const extra: string[] = [];
    if (f.capturadaEm) extra.push(`registrada pela câmera em ${new Date(f.capturadaEm).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}`);
    if (!cliente && f.geo) extra.push(`local informado com consentimento: ${f.geo.lat.toFixed(5)}, ${f.geo.lng.toFixed(5)}`);
    if (extra.length) pg.drawText(limpa(extra.join(' · ')).slice(0, 110), { x: M + 46, y, size: 8, font: fonte, color: cinza });
    y -= 14;
    for (const l of quebra(f.legenda || 'Sem legenda.', fonte, 10, larg).slice(0, 4)) { pg.drawText(l, { x: M, y, size: 10, font: fonte, color: tinta }); y -= 13; }
    y -= 14;
  }

  // Rodapé paginado + marca de rascunho
  const total = pdf.getPageCount();
  pdf.getPages().forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 44 }, end: { x: W - M, y: 44 }, thickness: 0.6, color: dourado });
    for (const [k, l] of Array.from(quebra(AVISO_REGISTRO, fonte, 7, W - 2 * M - 70).entries())) p.drawText(l, { x: M, y: 33 - k * 9, size: 7, font: fonte, color: cinza });
    const pag = `Página ${i + 1} de ${total}`;
    p.drawText(pag, { x: W - M - fonte.widthOfTextAtSize(pag, 8), y: 33, size: 8, font: negrito, color: cinza });
    if (r.status === 'draft') p.drawText('RASCUNHO', { x: 150, y: 330, size: 78, font: negrito, color: rgb(0.8, 0.2, 0.2), opacity: 0.1, rotate: degrees(40) });
  });
  return Buffer.from(await pdf.save());
}
