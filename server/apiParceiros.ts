/**
 * API para parceiros (/api/v1): imobiliárias, sites e sistemas parceiros consultam as chácaras e imóveis disponíveis
 * e enviam leads. Autenticação: "Authorization: Bearer rmt_<prefixo>_<segredo>" (chave criada em Admin › Integrações;
 * guardamos só o hash). Preço só sai quando é público (mesma trava do site). Limite: 120 chamadas por minuto por chave.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from './db';
import { apiChaves, empreendimentos, lotes, properties } from '../drizzle/schema';
import { statusPublicoDe } from '../shared/lotes';

export const ESCOPOS = ['lotes:ler', 'imoveis:ler', 'leads:criar'] as const;
export type Escopo = typeof ESCOPOS[number];
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const urlPublica = () => (process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '');

async function banco(): Promise<any> {
  const d = await getDb();
  if (!d) throw new Error('Banco indisponível');
  return d;
}

/** Cria a chave; o segredo completo só volta aqui (mostrado uma vez na tela) */
export async function criarChave(e: { nome: string; escopos: Escopo[]; corretorId?: number | null }, autorId: number) {
  const prefixo = randomBytes(4).toString('hex');
  const segredo = randomBytes(24).toString('base64url');
  const chave = `rmt_${prefixo}_${segredo}`;
  const d = await banco();
  await d.insert(apiChaves).values({ nome: e.nome.trim().slice(0, 120), prefixo, hash: sha(chave), escopos: e.escopos.join(','), corretorId: e.corretorId ?? null, ativo: true, criadoPor: autorId, criadoEm: new Date() } as any);
  return { chave, prefixo };
}

export async function listarChaves() {
  const d = await banco();
  const rs: any[] = await d.select().from(apiChaves);
  return rs.map(r => ({ id: Number(r.id), nome: String(r.nome), prefixo: String(r.prefixo), escopos: String(r.escopos).split(',').filter(Boolean), corretorId: r.corretorId ? Number(r.corretorId) : null,
    ativo: r.ativo === true || r.ativo === 1, usos: Number(r.usos) || 0, ultimoUso: r.ultimoUso ? new Date(r.ultimoUso).toISOString() : null, criadoEm: new Date(r.criadoEm).toISOString() }))
    .sort((a, b) => b.id - a.id);
}

export async function alterarChave(id: number, ativo: boolean) {
  const d = await banco();
  await d.update(apiChaves).set({ ativo } as any).where(eq(apiChaves.id, id));
  return { ok: true as const };
}

/** Confere o Bearer; devolve a chave ou null */
export async function chaveDoPedido(auth: string | undefined): Promise<{ id: number; nome: string; escopos: string[]; corretorId: number | null } | null> {
  const m = String(auth ?? '').match(/^Bearer\s+(rmt_([a-f0-9]{8})_[A-Za-z0-9_-]{20,})$/);
  if (!m) return null;
  const d = await banco();
  const [r]: any[] = await d.select().from(apiChaves).where(eq(apiChaves.prefixo, m[2])).limit(1);
  if (!r || !(r.ativo === true || r.ativo === 1)) return null;
  const a = Buffer.from(sha(m[1])), b = Buffer.from(String(r.hash));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  d.update(apiChaves).set({ ultimoUso: new Date(), usos: sql`${apiChaves.usos} + 1` } as any).where(eq(apiChaves.id, r.id)).catch(() => {});
  return { id: Number(r.id), nome: String(r.nome), escopos: String(r.escopos).split(','), corretorId: r.corretorId ? Number(r.corretorId) : null };
}

const janelas = new Map<number, { n: number; desde: number }>();
export function dentroDoLimiteApi(chaveId: number, agora = Date.now(), max = 120): boolean {
  const j = janelas.get(chaveId);
  if (!j || agora - j.desde > 60_000) { janelas.set(chaveId, { n: 1, desde: agora }); return true; }
  return ++j.n <= max;
}

export const leadApiSchema = z.object({
  nome: z.string().trim().min(2).max(160),
  telefone: z.string().trim().min(10).max(25),
  email: z.string().trim().email().max(160).optional(),
  mensagem: z.string().trim().max(1000).optional(),
  empreendimento: z.string().trim().max(80).optional(),
  chacara: z.string().trim().regex(/^[A-Z]\d{2}$/i).optional(),
  imovel: z.string().trim().max(20).optional(),
  consentimento: z.literal(true, { message: 'consentimento: true é obrigatório (LGPD — o cliente autorizou o contato)' }),
});

type Handler = (req: Request, res: Response) => Promise<unknown>;
const seguro = (h: Handler) => (req: Request, res: Response) => {
  h(req, res).catch((e: any) => { console.error('[API parceiros]', e); if (!res.headersSent) res.status(500).json({ erro: 'falha' }); });
};

export function registrarApiParceiros(app: Express) {
  const autorizar = (escopo: Escopo) => async (req: Request, res: Response): Promise<{ id: number; nome: string; corretorId: number | null } | null> => {
    const k = await chaveDoPedido(req.headers.authorization).catch(() => null);
    if (!k) { res.status(401).json({ erro: 'chave_invalida', mensagem: 'Envie Authorization: Bearer <sua chave>' }); return null; }
    if (!k.escopos.includes(escopo)) { res.status(403).json({ erro: 'sem_permissao', mensagem: `A chave não tem o escopo ${escopo}` }); return null; }
    if (!dentroDoLimiteApi(k.id)) { res.status(429).json({ erro: 'limite', mensagem: 'Limite de 120 chamadas por minuto' }); return null; }
    return k;
  };

  app.get('/api/v1', (_req, res) => res.json({
    nome: 'API Romatec CRM para parceiros', versao: 1, autenticacao: 'Authorization: Bearer rmt_…',
    endpoints: ['GET /api/v1/empreendimentos', 'GET /api/v1/empreendimentos/:slug/chacaras', 'GET /api/v1/imoveis', 'POST /api/v1/leads'],
  }));

  app.get('/api/v1/empreendimentos', seguro(async (req, res) => {
    if (!(await autorizar('lotes:ler')(req, res))) return;
    const d = await banco();
    const es: any[] = await d.select().from(empreendimentos);
    const out = [];
    for (const e of es) {
      const ls: any[] = await d.select({ situacao: lotes.situacao, comercializavel: lotes.comercializavel }).from(lotes).where(eq(lotes.empreendimentoId, e.id));
      out.push({ slug: e.slug, nome: e.nome, municipio: e.municipio, uf: e.uf, chacaras: ls.filter(l => l.comercializavel !== false && l.comercializavel !== 0).length,
        disponiveis: ls.filter(l => (l.situacao || 'disponivel') === 'disponivel' && l.comercializavel !== false && l.comercializavel !== 0).length, pagina: `${urlPublica()}/${e.slug}` });
    }
    res.json({ empreendimentos: out });
  }));

  app.get('/api/v1/empreendimentos/:slug/chacaras', seguro(async (req, res) => {
    if (!(await autorizar('lotes:ler')(req, res))) return;
    const d = await banco();
    const [e]: any[] = await d.select().from(empreendimentos).where(eq(empreendimentos.slug, String(req.params.slug))).limit(1);
    if (!e) return res.status(404).json({ erro: 'nao_encontrado' });
    const precos = e.precosPublicos === true || e.precosPublicos === 1;
    const ls: any[] = await d.select().from(lotes).where(eq(lotes.empreendimentoId, e.id));
    res.json({
      empreendimento: e.slug, precosPublicos: precos,
      chacaras: ls.filter(l => l.comercializavel !== false && l.comercializavel !== 0).map(l => ({
        codigo: l.codigo, quadra: l.quadra, areaM2: Number(l.areaM2) || null, situacao: statusPublicoDe((l.situacao || 'disponivel') as any),
        preco: precos && l.precoTabela != null ? Number(l.precoTabela) : null, lat: l.latCentro != null ? Number(l.latCentro) : null, lon: l.lonCentro != null ? Number(l.lonCentro) : null,
        pagina: e.slug === 'bom-jardims' ? `${urlPublica()}/bom-jardims/chacara/${l.codigo}` : null,
      })).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true })),
    });
  }));

  app.get('/api/v1/imoveis', seguro(async (req, res) => {
    if (!(await autorizar('imoveis:ler')(req, res))) return;
    const d = await banco();
    const { COLS_IMOVEL, fotosDe } = await import('./portais');
    const ps: any[] = await d.select(COLS_IMOVEL).from(properties).where(eq(properties.status, 'available'));
    res.json({ imoveis: ps.map(p => ({
      codigo: p.codigo || `IMV-${p.id}`, titulo: p.denomination, tipo: p.propertyType, cidade: p.city, uf: p.state,
      preco: p.exibirPreco === false || p.exibirPreco === 0 ? null : Number(p.offerPrice || p.price) || null,
      areaTerreno: Number(p.areaTerreno) || null, areaConstruida: Number(p.areaConstruida) || null, quartos: p.bedrooms, banheiros: p.bathrooms, vagas: p.garageSpaces,
      fotos: fotosDe(p.images).map((u: string) => (/^https?:/.test(u) ? u : `${urlPublica()}${u}`)), pagina: `${urlPublica()}/imovel/${p.publicSlug || p.id}`,
    })) });
  }));

  app.post('/api/v1/leads', seguro(async (req, res) => {
    const k = await autorizar('leads:criar')(req, res);
    if (!k) return;
    const p = leadApiSchema.safeParse(req.body ?? {});
    if (!p.success) return res.status(400).json({ erro: 'dados_invalidos', mensagem: p.error.issues[0]?.message, campo: p.error.issues[0]?.path?.join('.') });
    const b = p.data;
    let propertyId: number | undefined;
    if (b.imovel) {
      const d = await banco();
      const [im]: any[] = await d.select({ id: properties.id }).from(properties).where(eq(properties.codigo, b.imovel)).limit(1);
      propertyId = im ? Number(im.id) : /^IMV-\d+$/.test(b.imovel) ? Number(b.imovel.slice(4)) : undefined;
    }
    const { ingestLead } = await import('./lead-intake');
    const r: any = await ingestLead({
      nome: b.nome, phone: b.telefone, origem: 'parceiro', campanha: `API: ${k.nome}`, propertyId,
      empreendimentoSlug: b.empreendimento || (b.chacara ? 'bom-jardims' : undefined), loteCodigo: b.chacara?.toUpperCase(),
      responsavelId: k.corretorId, answers: { parceiro: k.nome, email: b.email ?? '', mensagem: b.mensagem ?? '' },
      consentimento: { at: new Date().toISOString(), texto: `Consentimento declarado pelo parceiro ${k.nome} via API`, origem: 'api_parceiro', ip: String(req.ip ?? '') },
    } as any);
    if (!r?.ok) return res.status(r?.reason === 'invalid_phone' ? 400 : 409).json({ erro: r?.reason ?? 'falha' });
    res.status(r.created ? 201 : 200).json({ ok: true, novo: !!r.created });
  }));
}
