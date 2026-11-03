/**
 * Base de conhecimento (Ajuda › Base de conhecimento): artigos em Markdown para a equipe consultar e treinar.
 * Na primeira leitura com a base vazia, entram os artigos iniciais (shared/baseConhecimento.ts). Só o administrador edita.
 */
import { asc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { artigosConhecimento } from '../drizzle/schema';
import { ARTIGOS_INICIAIS, CATEGORIAS_ARTIGO, PUBLICOS_ARTIGO, podeLerArtigo, slugDe, type CategoriaArtigo, type PublicoArtigo } from '../shared/baseConhecimento';

export class ConhecimentoErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'ConhecimentoErro'; } }

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new ConhecimentoErro('Banco indisponível', 503);
  return d;
}

let semeado = false;
/** Artigos iniciais, uma única vez, quando a base está vazia */
export async function semearSeVazia(): Promise<void> {
  if (semeado) return;
  const d = await banco();
  const [um]: any[] = await d.select({ id: artigosConhecimento.id }).from(artigosConhecimento).limit(1);
  if (!um) {
    for (const a of ARTIGOS_INICIAIS) {
      await d.insert(artigosConhecimento).values({ ...a, ativo: true, atualizadoEm: new Date() } as any).catch(() => {});
    }
  }
  semeado = true;
}

const iso = (v: unknown) => { const t = v instanceof Date ? v : new Date(typeof v === 'number' && v < 1e12 ? v * 1000 : (v as any)); return Number.isNaN(t.getTime()) ? null : t.toISOString(); };

export async function listarArtigos(perfil: string | null | undefined, incluirInativos = false) {
  await semearSeVazia();
  const d = await banco();
  const rows: any[] = await d.select().from(artigosConhecimento).orderBy(asc(artigosConhecimento.ordem), asc(artigosConhecimento.id));
  return rows
    .filter(r => (incluirInativos && perfil === 'admin') || (r.ativo === true || r.ativo === 1))
    .filter(r => podeLerArtigo(r.publico, perfil))
    .map(r => ({ id: Number(r.id), slug: r.slug, titulo: r.titulo, categoria: r.categoria as CategoriaArtigo, publico: r.publico as PublicoArtigo,
      conteudo: r.conteudo, ordem: Number(r.ordem), ativo: r.ativo === true || r.ativo === 1, atualizadoEm: iso(r.atualizadoEm) }));
}

export interface DadosArtigo { titulo: string; categoria: string; publico: string; conteudo: string; ordem?: number; ativo?: boolean }

function validar(e: DadosArtigo) {
  const titulo = String(e.titulo ?? '').trim();
  const conteudo = String(e.conteudo ?? '').trim();
  if (titulo.length < 3 || titulo.length > 160) throw new ConhecimentoErro('O título precisa ter de 3 a 160 caracteres.');
  if (conteudo.length < 10) throw new ConhecimentoErro('Escreva o conteúdo do artigo.');
  if (conteudo.length > 60_000) throw new ConhecimentoErro('O artigo passou de 60 mil caracteres. Divida em dois.');
  if (!(CATEGORIAS_ARTIGO as readonly string[]).includes(e.categoria)) throw new ConhecimentoErro('Categoria inválida.');
  if (!(PUBLICOS_ARTIGO as readonly string[]).includes(e.publico)) throw new ConhecimentoErro('Público inválido.');
  return { titulo, conteudo, categoria: e.categoria, publico: e.publico, ordem: Math.max(0, Math.min(9999, Math.round(Number(e.ordem) || 0))), ativo: e.ativo !== false };
}

export async function salvarArtigo(id: number | null, e: DadosArtigo, autorId: number) {
  const d = await banco();
  const v = validar(e);
  if (id) {
    const [atual]: any[] = await d.select({ id: artigosConhecimento.id }).from(artigosConhecimento).where(eq(artigosConhecimento.id, id)).limit(1);
    if (!atual) throw new ConhecimentoErro('Artigo não encontrado.', 404);
    await d.update(artigosConhecimento).set({ ...v, atualizadoPor: autorId, atualizadoEm: new Date() } as any).where(eq(artigosConhecimento.id, id));
    return { ok: true as const, id };
  }
  const existentes: any[] = await d.select({ slug: artigosConhecimento.slug }).from(artigosConhecimento);
  const usados = new Set(existentes.map(x => x.slug));
  let slug = slugDe(v.titulo), n = 2;
  while (usados.has(slug)) slug = `${slugDe(v.titulo).slice(0, 74)}-${n++}`;
  await d.insert(artigosConhecimento).values({ ...v, slug, atualizadoPor: autorId, atualizadoEm: new Date() } as any);
  const [novo]: any[] = await d.select({ id: artigosConhecimento.id }).from(artigosConhecimento).where(eq(artigosConhecimento.slug, slug)).limit(1);
  return { ok: true as const, id: Number(novo?.id) };
}

export async function excluirArtigo(id: number) {
  const d = await banco();
  await d.delete(artigosConhecimento).where(eq(artigosConhecimento.id, id));
  return { ok: true as const };
}

/** Só para os testes */
export const _reiniciarSemente = () => { semeado = false; };
