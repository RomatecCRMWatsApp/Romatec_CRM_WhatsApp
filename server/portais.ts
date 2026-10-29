/**
 * Portais imobiliários (Grupo OLX: ZAP Imóveis, VivaReal e OLX) — integração pelo Canal Pro.
 *
 * Feed: /feeds/grupo-olx.xml?t=<token> no padrão VRSync. Entram os imóveis ativos com preço público e, de cada
 * empreendimento com preços liberados (precosPublicos), as chácaras disponíveis. Sem preço público, não vai ao portal
 * (a trava de preço vale também aqui). Fotos .webp saem convertidas em JPG (/feeds/imagem.jpg).
 * Leads: o Canal Pro manda cada contato para /api/webhook/portais/grupo-olx?t=<token> → lead no CRM com a origem do
 * portal e o imóvel/chácara do anúncio.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Express } from 'express';
import { getDb } from './db';
import { empreendimentos, lotes, properties } from '../drizzle/schema';
import { DESCRICAO_BOM_JARDIMS, IMAGENS_BOM_JARDIMS } from '../shared/bomJardimsSeo';

const urlPublica = () => (process.env.APP_PUBLIC_URL || 'https://romateccrm.com').replace(/\/+$/, '');
const segredo = () => process.env.PORTAIS_TOKEN || process.env.JWT_SECRET || process.env.SESSION_SECRET || 'romatec-portais';

/** Token fixo do feed e do webhook (derivado do segredo do servidor; PORTAIS_TOKEN troca) */
export const tokenPortais = () => createHmac('sha256', segredo()).update('portais:grupo-olx').digest('hex').slice(0, 32);
export function tokenValido(t: unknown): boolean {
  const a = Buffer.from(String(t ?? '')), b = Buffer.from(tokenPortais());
  return a.length === b.length && timingSafeEqual(a, b);
}
export const linkFeed = () => `${urlPublica()}/feeds/grupo-olx.xml?t=${tokenPortais()}`;
export const linkWebhook = () => `${urlPublica()}/api/webhook/portais/grupo-olx?t=${tokenPortais()}`;

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Só as colunas usadas (o banco local antigo não tem todas) */
export const COLS_IMOVEL = { id: properties.id, denomination: properties.denomination, address: properties.address, city: properties.city, state: properties.state, cep: properties.cep, price: properties.price, offerPrice: properties.offerPrice, description: properties.description, images: properties.images, areaConstruida: properties.areaConstruida, areaCasa: properties.areaCasa, areaTerreno: properties.areaTerreno, bedrooms: properties.bedrooms, bathrooms: properties.bathrooms, garageSpaces: properties.garageSpaces, propertyType: properties.propertyType, publicSlug: properties.publicSlug, codigo: properties.codigo, exibirPreco: properties.exibirPreco };
/** Lista de fotos (JSON do banco; no SQLite vem como texto) */
export const fotosDe = (v: unknown): string[] => { try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? a.filter(Boolean) : []; } catch { return []; } };
const imagem = (src: string) => (/\.webp$/i.test(src) ? `${urlPublica()}/feeds/imagem.jpg?src=${encodeURIComponent(src)}` : /^https?:/.test(src) ? src : `${urlPublica()}${src}`);

const TIPO_VRSYNC: Record<string, string> = {
  casa: 'Residential / Home', apartamento: 'Residential / Apartment', terreno: 'Residential / Land Lot', lote: 'Residential / Land Lot',
  chacara: 'Residential / Farm Ranch', 'chácara': 'Residential / Farm Ranch', sitio: 'Residential / Farm Ranch', fazenda: 'Commercial / Agricultural',
  sala: 'Commercial / Office', comercial: 'Commercial / Building', galpao: 'Commercial / Industrial',
};
export const tipoVrsync = (t: string | null | undefined) => TIPO_VRSYNC[String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()] ?? TIPO_VRSYNC[String(t ?? '').toLowerCase()] ?? 'Residential / Home';

export interface Anuncio {
  id: string; titulo: string; descricao: string; preco: number; tipo: string; url: string; imagens: string[];
  areaTerreno?: number | null; areaUtil?: number | null; quartos?: number | null; banheiros?: number | null; vagas?: number | null;
  cidade: string; uf: string; bairro?: string | null; endereco?: string | null; cep?: string | null; lat?: number | null; lon?: number | null;
}

/** Um <Listing> VRSync */
export function listingXml(a: Anuncio): string {
  const n = (v: number | null | undefined, tag: string, attrs = '') => (v != null && v > 0 ? `<${tag}${attrs}>${Math.round(v)}</${tag}>` : '');
  return `<Listing><ListingID>${esc(a.id)}</ListingID><Title><![CDATA[${a.titulo.slice(0, 100)}]]></Title><TransactionType>For Sale</TransactionType>` +
    `<PublicationType>STANDARD</PublicationType><DetailViewUrl>${esc(a.url)}</DetailViewUrl>` +
    `<Media>${a.imagens.slice(0, 30).map((u, i) => `<Item medium="image"${i === 0 ? ' primary="true"' : ''}>${esc(u)}</Item>`).join('')}</Media>` +
    `<Details><PropertyType>${esc(a.tipo)}</PropertyType><Description><![CDATA[${a.descricao.slice(0, 3000)}]]></Description>` +
    `<ListPrice currency="BRL">${Math.round(a.preco)}</ListPrice>${n(a.areaTerreno, 'LotArea', ' unit="square metres"')}${n(a.areaUtil, 'LivingArea', ' unit="square metres"')}` +
    `${n(a.quartos, 'Bedrooms')}${n(a.banheiros, 'Bathrooms')}${n(a.vagas, 'Garage', ' type="Parking Space"')}</Details>` +
    `<Location displayAddress="Neighborhood"><Country abbreviation="BR">Brasil</Country><State abbreviation="${esc(a.uf)}">${esc(a.uf)}</State>` +
    `<City>${esc(a.cidade)}</City>${a.bairro ? `<Neighborhood>${esc(a.bairro)}</Neighborhood>` : ''}${a.endereco ? `<Address>${esc(a.endereco)}</Address>` : ''}` +
    `${a.cep ? `<PostalCode>${esc(a.cep.replace(/\D/g, ''))}</PostalCode>` : ''}${a.lat != null && a.lon != null ? `<Latitude>${a.lat}</Latitude><Longitude>${a.lon}</Longitude>` : ''}</Location>` +
    `<ContactInfo><Name>Romatec Consultoria Total</Name><Email>romateccrm@gmail.com</Email><Website>${esc(urlPublica())}</Website><Telephone>(99) 99181-1246</Telephone></ContactInfo></Listing>`;
}

export function feedXml(anuncios: Anuncio[], agora = new Date()): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ListingDataFeed xmlns="http://www.vivareal.com/schemas/1.0/VRSync" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://www.vivareal.com/schemas/1.0/VRSync http://xml.vivareal.com/vrsync.xsd">` +
    `<Header><Provider>Romatec CRM</Provider><Email>romateccrm@gmail.com</Email><ContactName>José Romário — CRECI/MA 4.705</ContactName>` +
    `<PublishDate>${agora.toISOString().slice(0, 19)}</PublishDate><Telephone>(99) 99181-1246</Telephone></Header>` +
    `<Listings>${anuncios.map(listingXml).join('')}</Listings></ListingDataFeed>`;
}

/** Anúncios que vão ao feed + os que ficaram de fora (e por quê) — tela Admin › Portais */
export async function anunciosDoFeed(): Promise<{ anuncios: Anuncio[]; fora: { id: string; titulo: string; motivo: string }[] }> {
  const d: any = await getDb();
  if (!d) return { anuncios: [], fora: [] };
  const anuncios: Anuncio[] = [], fora: { id: string; titulo: string; motivo: string }[] = [];
  const props: any[] = await d.select(COLS_IMOVEL).from(properties).where(eq(properties.status, 'available'));
  for (const p of props) {
    const id = p.codigo || `IMV-${p.id}`;
    const preco = Number(p.offerPrice || p.price) || 0;
    if (p.exibirPreco === false || p.exibirPreco === 0) { fora.push({ id, titulo: p.denomination, motivo: 'preço sob consulta (portais exigem preço)' }); continue; }
    if (!preco) { fora.push({ id, titulo: p.denomination, motivo: 'sem preço' }); continue; }
    const imgs = fotosDe(p.images).map(imagem);
    if (!imgs.length) { fora.push({ id, titulo: p.denomination, motivo: 'sem fotos' }); continue; }
    anuncios.push({
      id, titulo: p.denomination, descricao: p.description || p.denomination, preco, tipo: tipoVrsync(p.propertyType),
      url: `${urlPublica()}/imovel/${p.publicSlug || p.id}`, imagens: imgs, areaTerreno: Number(p.areaTerreno) || null,
      areaUtil: Number(p.areaConstruida || p.areaCasa) || null, quartos: p.bedrooms, banheiros: p.bathrooms, vagas: p.garageSpaces,
      cidade: p.city || 'Açailândia', uf: p.state || 'MA', endereco: p.address, cep: p.cep,
    });
  }
  const emps: any[] = await d.select().from(empreendimentos);
  const { condicoesDe } = await import('./contratos/servico');
  const { precoLote } = await import('../shared/simulador');
  for (const e of emps) {
    const ls: any[] = await d.select().from(lotes).where(and(eq(lotes.empreendimentoId, e.id), eq(lotes.situacao, 'disponivel')));
    const livres = ls.filter(l => l.comercializavel !== false && l.comercializavel !== 0);
    if (!livres.length) continue;
    if (!(e.precosPublicos === true || e.precosPublicos === 1)) { fora.push({ id: e.slug, titulo: `${e.nome} (${livres.length} chácaras disponíveis)`, motivo: 'preços do empreendimento ainda travados (precosPublicos desligado)' }); continue; }
    const cond = await condicoesDe(e.id).catch(() => null);
    const bj = e.slug === 'bom-jardims';
    const prefixo = String(e.slug).split('-').map((x: string) => x[0]).join('').toUpperCase().slice(0, 3);
    for (const l of livres) {
      const area = Number(l.areaM2) || 0;
      const preco = l.precoTabela != null && Number(l.precoTabela) > 0 ? Number(l.precoTabela) : cond ? precoLote(area, cond) : 0;
      if (!preco) { fora.push({ id: `${prefixo}-${l.codigo}`, titulo: `${e.nome} · chácara ${l.codigo}`, motivo: 'sem preço de tabela' }); continue; }
      anuncios.push({
        id: `${prefixo}-${l.codigo}`, titulo: `Chácara ${l.codigo} com ${area.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m² — ${e.nome}`,
        descricao: `${bj ? DESCRICAO_BOM_JARDIMS : e.nome} Chácara ${l.codigo}${l.quadra ? ` (Quadra ${l.quadra})` : ''}, ${area.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m². Financiamento direto com a empreendedora. Romatec Consultoria Total — CRECI/MA 4.705.`,
        preco, tipo: 'Residential / Farm Ranch', url: bj ? `${urlPublica()}/bom-jardims/chacara/${l.codigo}` : `${urlPublica()}/bom-jardims`,
        imagens: (bj ? IMAGENS_BOM_JARDIMS.map(i => i.src) : []).map(imagem), areaTerreno: area, cidade: e.municipio || 'Açailândia', uf: e.uf || 'MA',
        endereco: e.endereco, lat: l.latCentro != null ? Number(l.latCentro) : null, lon: l.lonCentro != null ? Number(l.lonCentro) : null,
      });
    }
  }
  return { anuncios, fora };
}

// ─── Leads do Canal Pro (Grupo OLX) ──────────────────────────────────────────

export interface LeadPortal { leadOrigin?: string; originLeadId?: string; originListingId?: string; clientListingId?: string; name?: string; email?: string; ddd?: string; phone?: string; phoneNumber?: string; message?: string; temperature?: string }

export function origemDoPortal(leadOrigin: string | undefined): 'portal_zap' | 'portal_vivareal' | 'portal_olx' {
  const o = String(leadOrigin ?? '').toLowerCase();
  return o.includes('zap') ? 'portal_zap' : o.includes('olx') ? 'portal_olx' : 'portal_vivareal';
}

export async function receberLeadPortal(b: LeadPortal) {
  const nome = String(b.name ?? '').trim() || 'Contato do portal';
  const fone = `${String(b.ddd ?? '').replace(/\D/g, '')}${String(b.phone ?? b.phoneNumber ?? '').replace(/\D/g, '')}`;
  const anuncio = String(b.clientListingId ?? '').trim();
  const d: any = await getDb();
  let propertyId: number | undefined, empreendimentoSlug: string | undefined, loteCodigo: string | undefined;
  if (d && anuncio) {
    const [p]: any[] = await d.select({ id: properties.id }).from(properties).where(eq(properties.codigo, anuncio)).limit(1);
    if (p) propertyId = Number(p.id);
    else if (/^IMV-\d+$/.test(anuncio)) propertyId = Number(anuncio.slice(4));
    else {
      const m = anuncio.match(/^[A-Z]{1,3}-([A-Z]\d{2})$/);
      if (m) { empreendimentoSlug = 'bom-jardims'; loteCodigo = m[1]; }
    }
  }
  const origem = origemDoPortal(b.leadOrigin);
  const { ingestLead } = await import('./lead-intake');
  return ingestLead({
    nome, phone: fone, origem, campanha: origem, propertyId, empreendimentoSlug, loteCodigo,
    answers: { portal: String(b.leadOrigin ?? ''), anuncio, email: String(b.email ?? ''), mensagem: String(b.message ?? '').slice(0, 1000), temperatura: String(b.temperature ?? '') },
  } as any);
}

let cacheImg = new Map<string, Buffer>();
export function registrarRotasPortais(app: Express) {
  app.get('/feeds/grupo-olx.xml', async (req, res) => {
    if (!tokenValido(req.query.t)) return res.status(404).end();
    try {
      const { anuncios } = await anunciosDoFeed();
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=900');
      res.send(feedXml(anuncios));
    } catch (e: any) { console.error('[Portais] feed:', e); res.status(500).end(); }
  });
  /** .webp → JPG para os portais (só arquivos do próprio site) */
  app.get('/feeds/imagem.jpg', async (req, res) => {
    const src = String(req.query.src ?? '');
    if (!/^\/[\w\-/]+\.(webp|png|jpe?g)$/i.test(src)) return res.status(404).end();
    try {
      let jpg = cacheImg.get(src);
      if (!jpg) {
        const r = await fetch(`${urlPublica()}${src}`, { signal: AbortSignal.timeout(15_000) });
        if (!r.ok) return res.status(404).end();
        const sharp = (await import('sharp')).default;
        jpg = await sharp(Buffer.from(await r.arrayBuffer())).jpeg({ quality: 85 }).toBuffer();
        if (cacheImg.size > 200) cacheImg = new Map();
        cacheImg.set(src, jpg);
      }
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(jpg);
    } catch { res.status(404).end(); }
  });
  app.post('/api/webhook/portais/grupo-olx', async (req, res) => {
    if (!tokenValido(req.query.t)) return res.status(401).json({ ok: false });
    try {
      const r: any = await receberLeadPortal(req.body ?? {});
      res.json({ ok: !!r?.ok, ...(r?.ok ? {} : { motivo: r?.reason }) });
    } catch (e: any) { console.error('[Portais] lead:', e); res.status(500).json({ ok: false }); }
  });
}
