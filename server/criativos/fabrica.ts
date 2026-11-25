/**
 * Fábrica diária de criativos: catálogo dos Materiais → pautas do dia → peças montadas → fila de aprovação.
 * Nada é publicado aqui: a peça aprovada fica pronta para baixar e, na etapa 4, para a API da Meta (sempre pausada).
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { and, desc, eq, gte, inArray, ne } from 'drizzle-orm';
import { getDb } from '../db';
import { criativosPautas, materiais } from '../../drizzle/schema';
import {
  CONDICOES_PADRAO, PALAVRAS_BLOQUEIO, TEMAS_MIDIA, condicoesValidas, pautasDoDia, trocarMidia as trocarNaPauta,
  type CondicoesComerciais, type MidiaCatalogo, type Pauta,
} from '../../shared/pautaDiaria';

export const SLUG_PADRAO = 'bom-jardims';
const CHAVE = {
  ligada: 'fabrica_ligada', ultimo: 'fabrica_ultimo_dia', entrada: 'fabrica_entrada', parcelas: 'fabrica_parcelas',
  handle: 'fabrica_handle', confirmadoEm: 'fabrica_condicoes_em', confirmadoPor: 'fabrica_condicoes_por',
} as const;
const HORA_GERAR = 6;

export class FabricaErro extends Error { constructor(msg: string) { super(msg); this.name = 'FabricaErro'; } }

async function db(): Promise<any> {
  const d = await getDb();
  if (!d) throw new FabricaErro('Banco indisponível');
  return d;
}

/** Data e hora de Brasília (UTC-3) */
export function agoraBrasilia(agora = Date.now()) {
  const d = new Date(agora - 3 * 3600_000);
  return { data: d.toISOString().slice(0, 10), hora: d.getUTCHours() };
}

// ─── Condições comerciais (entrada/parcelas) ─────────────────────────────────────────────────────────────────

export async function condicoes(): Promise<CondicoesComerciais & { confirmadoEm: string | null; validas: boolean }> {
  const { lerConfig } = await import('../configSistema');
  const [entrada, parcelas, handle, confirmadoEm] = await Promise.all([
    lerConfig(CHAVE.entrada), lerConfig(CHAVE.parcelas), lerConfig(CHAVE.handle), lerConfig(CHAVE.confirmadoEm),
  ]);
  return {
    entrada: entrada || CONDICOES_PADRAO.entrada, parcelas: parcelas || CONDICOES_PADRAO.parcelas, handle: handle || CONDICOES_PADRAO.handle,
    confirmadoEm, validas: condicoesValidas(confirmadoEm, agoraBrasilia().data),
  };
}

/** O dono confirma que entrada e parcelas continuam valendo (vale 30 dias) */
export async function confirmarCondicoes(c: CondicoesComerciais, usuarioId: number): Promise<void> {
  const { gravarConfig } = await import('../configSistema');
  await gravarConfig(CHAVE.entrada, c.entrada.trim(), usuarioId);
  await gravarConfig(CHAVE.parcelas, c.parcelas.trim(), usuarioId);
  await gravarConfig(CHAVE.handle, c.handle.trim(), usuarioId);
  await gravarConfig(CHAVE.confirmadoEm, agoraBrasilia().data, usuarioId);
  await gravarConfig(CHAVE.confirmadoPor, String(usuarioId), usuarioId);
}

export async function fabricaLigada(): Promise<boolean> {
  const { lerConfig } = await import('../configSistema');
  return (await lerConfig(CHAVE.ligada)) === '1';
}
export async function ligarFabrica(ligada: boolean, usuarioId: number): Promise<void> {
  const { gravarConfig } = await import('../configSistema');
  await gravarConfig(CHAVE.ligada, ligada ? '1' : '0', usuarioId);
}

// ─── Catálogo ────────────────────────────────────────────────────────────────────────────────────────────────

const ehVideo = (m: { mime?: string | null; url: string }) => (m.mime || '').startsWith('video/') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(m.url);
const ehImagem = (m: { mime?: string | null; url: string }) => (m.mime || '').startsWith('image/') || /\.(jpe?g|png|webp)(\?|$)/i.test(m.url);
const listaTemas = (s: string | null | undefined) => (s || '').split(',').map(t => t.trim()).filter(t => (TEMAS_MIDIA as readonly string[]).includes(t));

export interface ItemCatalogo extends MidiaCatalogo { motivoBloqueio: string | null }

/** Imagens e vídeos do empreendimento, com os campos do catálogo */
export async function catalogo(slug = SLUG_PADRAO): Promise<ItemCatalogo[]> {
  const d = await db();
  const rows: any[] = await d.select().from(materiais).where(eq(materiais.empreendimentoSlug, slug));
  return rows.filter(m => ehVideo(m) || ehImagem(m)).map(m => {
    const motivoBloqueio = !m.liberado ? 'Bloqueada para divulgação' : PALAVRAS_BLOQUEIO.test(m.titulo || '') ? 'Nome indica preço, condições ou tabela' : null;
    return {
      id: m.id, titulo: m.titulo, arquivo: m.url, tipo: ehVideo(m) ? 'video' : 'imagem',
      dur: m.duracaoMs ? m.duracaoMs / 1000 : null, temas: listaTemas(m.temas), temTexto: Boolean(m.temTexto),
      bloqueada: Boolean(motivoBloqueio), motivoBloqueio,
    };
  });
}

export async function salvarCatalogo(materialId: number, temas: string[], temTexto: boolean): Promise<void> {
  const d = await db();
  const validos = temas.filter(t => (TEMAS_MIDIA as readonly string[]).includes(t));
  await d.update(materiais).set({ temas: validos.length ? validos.join(',') : null, temTexto } as any).where(eq(materiais.id, materialId));
}

/** Mede no ffprobe os vídeos sem duração (o selecionador corta o trecho do meio) */
async function medirDuracoes(itens: ItemCatalogo[]): Promise<void> {
  const faltam = itens.filter(i => i.tipo === 'video' && !i.dur);
  if (!faltam.length) return;
  const { rodar, caminhoLocal } = await import('../materialFormatado');
  const d = await db();
  for (const v of faltam) {
    try {
      const fonte = caminhoLocal(v.arquivo) ?? v.arquivo;
      const s = Number((await rodar('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fonte], 60_000)).trim());
      if (s > 0) { v.dur = s; await d.update(materiais).set({ duracaoMs: Math.round(s * 1000) } as any).where(eq(materiais.id, v.id)); }
    } catch (e: any) { console.warn(`[Fábrica] duração do vídeo #${v.id}:`, e?.message); }
  }
}

// ─── Pautas ──────────────────────────────────────────────────────────────────────────────────────────────────

/** id da mídia → último dia usado em peça não descartada (últimos 30 dias) */
async function historico(slug: string, ate: string): Promise<Map<number, string>> {
  const d = await db();
  const desde = new Date(new Date(`${ate}T12:00:00Z`).getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const rows: any[] = await d.select({ data: criativosPautas.data, pautaJson: criativosPautas.pautaJson }).from(criativosPautas)
    .where(and(eq(criativosPautas.empreendimentoSlug, slug), gte(criativosPautas.data, desde), ne(criativosPautas.status, 'descartada')));
  const h = new Map<number, string>();
  for (const r of rows) {
    if (r.data >= ate) continue;
    for (const m of (JSON.parse(r.pautaJson) as Pauta).midias) if ((h.get(m.id) ?? '') < r.data) h.set(m.id, r.data);
  }
  return h;
}

/** Gera (ou devolve) as pautas do dia e põe a montagem na fila. `refazer` apaga as não aprovadas do dia. */
export async function gerarDoDia(data: string, slug = SLUG_PADRAO, refazer = false): Promise<{ criadas: number; existentes: number }> {
  const d = await db();
  const doDia: any[] = await d.select().from(criativosPautas).where(and(eq(criativosPautas.data, data), eq(criativosPautas.empreendimentoSlug, slug)));
  if (doDia.length && !refazer) return { criadas: 0, existentes: doDia.length };
  if (refazer) {
    const apagar = doDia.filter(r => r.status !== 'aprovada').map(r => r.id);
    if (apagar.length) await d.delete(criativosPautas).where(inArray(criativosPautas.id, apagar));
  }
  const aprovadas = new Set(doDia.filter(r => r.status === 'aprovada').map(r => r.nome));
  const cat = await catalogo(slug);
  if (!cat.some(c => !c.bloqueada)) throw new FabricaErro('Nenhuma imagem ou vídeo liberado no catálogo deste empreendimento');
  await medirDuracoes(cat);
  const pautas = pautasDoDia(cat, data, await historico(slug, data), await condicoes()).filter(p => !aprovadas.has(p.nome));
  const ids: number[] = [];
  for (const p of pautas) {
    const r: any = await d.insert(criativosPautas).values({
      data, nome: p.nome, empreendimentoSlug: slug, tipo: p.tipo, destino: p.destino, temPreco: p.temPreco,
      pautaJson: JSON.stringify(p), legenda: p.legenda, status: 'pendente',
    } as any);
    const id = Number(r?.[0]?.insertId ?? r?.insertId ?? r?.lastInsertRowid ?? 0)
      || (await d.select({ id: criativosPautas.id }).from(criativosPautas).where(eq(criativosPautas.nome, p.nome)).limit(1))[0]?.id;
    if (id) ids.push(id);
  }
  for (const id of ids) enfileirar(id);
  return { criadas: ids.length, existentes: doDia.length - (refazer ? doDia.filter(r => r.status !== 'aprovada').length : 0) };
}

// ─── Montagem (uma por vez) ──────────────────────────────────────────────────────────────────────────────────

export type Montador = (p: Pauta) => Promise<string[]>;
let montadorTeste: Montador | null = null;
/** Testes: troca a montagem + envio ao armazenamento por um dublê que devolve as URLs */
export function definirMontador(m: Montador | null) { montadorTeste = m; }

async function montarESubir(p: Pauta): Promise<string[]> {
  const { montarPeca } = await import('./montar');
  const { baixar, caminhoLocal } = await import('../materialFormatado');
  const { uploadToCloudinary } = await import('../cloudinary');
  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'fabrica-'));
  const baixados = new Map<string, string>();
  try {
    const obter = async (url: string) => {
      const local = caminhoLocal(url);
      if (local) return local;
      if (!baixados.has(url)) {
        const ext = (url.match(/\.(\w{3,4})(\?|$)/)?.[1] ?? 'bin').toLowerCase();
        const arq = path.join(pasta, `m${baixados.size}.${ext}`);
        await fs.writeFile(arq, await baixar(url));
        baixados.set(url, arq);
      }
      return baixados.get(url)!;
    };
    const arquivos = await montarPeca(p, obter, path.join(pasta, 'saida'));
    const urls: string[] = [];
    for (const a of arquivos) {
      const video = a.endsWith('.mp4');
      const { url } = await uploadToCloudinary(await fs.readFile(a), video ? 'video/mp4' : 'image/jpeg', path.basename(a), { folder: 'romatec_criativos', resourceType: video ? 'video' : 'image' });
      urls.push(url);
    }
    return urls;
  } finally {
    await fs.rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}

let fila: Promise<void> = Promise.resolve();
const naFila = new Set<number>();
export function enfileirar(id: number): Promise<void> {
  if (naFila.has(id)) return fila;
  naFila.add(id);
  fila = fila.then(() => montar(id)).catch(e => console.warn(`[Fábrica] peça #${id}:`, e?.message)).finally(() => { naFila.delete(id); });
  return fila;
}
/** Espera a fila esvaziar (testes) */
export const filaVazia = () => fila;

async function montar(id: number): Promise<void> {
  const d = await db();
  const [r]: any[] = await d.select().from(criativosPautas).where(eq(criativosPautas.id, id)).limit(1);
  if (!r || r.status === 'aprovada' || r.status === 'descartada') return;
  await d.update(criativosPautas).set({ status: 'montando', erro: null } as any).where(eq(criativosPautas.id, id));
  try {
    const urls = await (montadorTeste ?? montarESubir)(JSON.parse(r.pautaJson));
    await d.update(criativosPautas).set({ status: 'pronta', pecasJson: JSON.stringify(urls) } as any).where(eq(criativosPautas.id, id));
  } catch (e: any) {
    await d.update(criativosPautas).set({ status: 'erro', erro: String(e?.message ?? 'falha na montagem').slice(0, 500) } as any).where(eq(criativosPautas.id, id));
  }
}

// ─── Fila de aprovação ───────────────────────────────────────────────────────────────────────────────────────

export interface ItemFila {
  id: number; data: string; nome: string; tipo: string; destino: string; temPreco: boolean; status: string;
  legenda: string | null; pecas: string[]; erro: string | null; pauta: Pauta; aprovadoEm: Date | null;
}

export async function listar(dias = 7, slug = SLUG_PADRAO): Promise<ItemFila[]> {
  const d = await db();
  const desde = new Date(Date.now() - 3 * 3600_000 - dias * 86_400_000).toISOString().slice(0, 10);
  const rows: any[] = await d.select().from(criativosPautas)
    .where(and(eq(criativosPautas.empreendimentoSlug, slug), gte(criativosPautas.data, desde)))
    .orderBy(desc(criativosPautas.data), criativosPautas.id);
  return rows.map(r => ({
    id: r.id, data: r.data, nome: r.nome, tipo: r.tipo, destino: r.destino, temPreco: Boolean(r.temPreco), status: r.status,
    legenda: r.legenda, pecas: r.pecasJson ? JSON.parse(r.pecasJson) : [], erro: r.erro, pauta: JSON.parse(r.pautaJson), aprovadoEm: r.aprovadoEm ?? null,
  }));
}

async function item(id: number): Promise<any> {
  const d = await db();
  const [r]: any[] = await d.select().from(criativosPautas).where(eq(criativosPautas.id, id)).limit(1);
  if (!r) throw new FabricaErro('Peça não encontrada');
  return r;
}

export async function aprovar(id: number, usuarioId: number): Promise<void> {
  const r = await item(id);
  if (r.status !== 'pronta') throw new FabricaErro('Só dá para aprovar a peça montada (status "pronta")');
  if (r.temPreco && !(await condicoes()).validas) {
    throw new FabricaErro('Esta peça mostra entrada e parcelas: confirme antes que as condições continuam valendo');
  }
  await (await db()).update(criativosPautas).set({ status: 'aprovada', aprovadoPor: usuarioId, aprovadoEm: new Date() } as any).where(eq(criativosPautas.id, id));
}

export async function descartar(id: number): Promise<void> {
  const r = await item(id);
  if (r.status === 'aprovada') throw new FabricaErro('A peça já foi aprovada');
  await (await db()).update(criativosPautas).set({ status: 'descartada' } as any).where(eq(criativosPautas.id, id));
}

export async function editarLegenda(id: number, legenda: string): Promise<void> {
  const r = await item(id);
  if (r.status === 'aprovada') throw new FabricaErro('A peça já foi aprovada');
  await (await db()).update(criativosPautas).set({ legenda } as any).where(eq(criativosPautas.id, id));
}

/** Troca a mídia da posição e remonta a peça */
export async function trocarMidia(id: number, indice: number): Promise<void> {
  const r = await item(id);
  if (r.status === 'aprovada' || r.status === 'descartada') throw new FabricaErro('Esta peça não pode mais ser alterada');
  if (r.status === 'montando') throw new FabricaErro('A peça está sendo montada; tente de novo em instantes');
  const p: Pauta = JSON.parse(r.pautaJson);
  const cat = await catalogo(r.empreendimentoSlug);
  await medirDuracoes(cat);
  let nova: Pauta;
  try { nova = trocarNaPauta(p, indice, cat, await historico(r.empreendimentoSlug, r.data)); }
  catch (e: any) { throw new FabricaErro(e?.message ?? 'Não deu para trocar a mídia'); }
  await (await db()).update(criativosPautas).set({ pautaJson: JSON.stringify(nova), status: 'pendente', pecasJson: null, erro: null } as any).where(eq(criativosPautas.id, id));
  enfileirar(id);
}

export async function remontar(id: number): Promise<void> {
  const r = await item(id);
  if (r.status !== 'erro' && r.status !== 'pendente') throw new FabricaErro('Só remonta peça com erro ou pendente');
  enfileirar(id);
}

// ─── Rotina diária ───────────────────────────────────────────────────────────────────────────────────────────

/** Às 6h de Brasília, uma vez por dia (marcado no banco), se a fábrica estiver ligada */
export async function rotinaFabrica(agora = Date.now()): Promise<{ gerado: boolean; motivo?: string }> {
  const { data, hora } = agoraBrasilia(agora);
  if (hora < HORA_GERAR) return { gerado: false, motivo: 'fora do horário' };
  if (!(await fabricaLigada())) return { gerado: false, motivo: 'desligada' };
  const { lerConfig, gravarConfig } = await import('../configSistema');
  if ((await lerConfig(CHAVE.ultimo)) === data) return { gerado: false, motivo: 'já gerado' };
  await gravarConfig(CHAVE.ultimo, data, null); // marca antes: com dois servidores, só um gera
  const r = await gerarDoDia(data);
  console.log(`[Fábrica] ${data}: ${r.criadas} pauta(s) na fila de montagem`);
  return { gerado: true };
}

let iniciada = false;
export function iniciarFabrica() {
  if (iniciada) return;
  iniciada = true;
  // Montagens interrompidas por reinício do servidor voltam como erro (o botão Remontar refaz)
  db().then(d => d.update(criativosPautas).set({ status: 'erro', erro: 'Montagem interrompida pelo reinício do servidor' } as any).where(eq(criativosPautas.status, 'montando')))
    .catch(() => {});
  const tick = () => rotinaFabrica().catch(e => console.warn('[Fábrica]', e?.message));
  setInterval(tick, 15 * 60_000).unref?.();
  setTimeout(tick, 120_000).unref?.();
}
