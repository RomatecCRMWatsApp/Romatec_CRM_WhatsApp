/**
 * Busca de empresas no Google Maps pela API oficial (Places API — Text Search, versão "New").
 * https://developers.google.com/maps/documentation/places/web-service/text-search
 *
 * Por que a API oficial e não scraping: os Termos do Google Maps proíbem raspar a página; a API é permitida, roda dentro
 * do próprio CRM (sem navegador) e, no volume do escritório (algumas buscas por cidade), fica na cota gratuita mensal.
 *
 * A chave vem de GOOGLE_PLACES_API_KEY (variável do servidor) ou de Configurações (configSistema "google_places_api_key").
 * Só pede os campos usados (FieldMask): o custo da API depende dos campos.
 */
import { TIPOS_BUSCA_MAPS, normalizarTelefone, type CategoriaProspecto, type TipoBuscaMaps } from '../../shared/prospeccao';

export const CHAVE_CONFIG_PLACES = 'google_places_api_key';
const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const CAMPOS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.nationalPhoneNumber', 'places.internationalPhoneNumber',
  'places.websiteUri', 'places.rating', 'places.userRatingCount', 'places.googleMapsUri', 'places.primaryTypeDisplayName', 'places.businessStatus',
  'nextPageToken',
].join(',');
const PAGINAS_POR_TERMO = 3; // até 60 lugares por termo (20 por página)
const TEMPO_LIMITE_MS = 20_000;

export class PlacesErro extends Error { constructor(msg: string, public status = 400) { super(msg); this.name = 'ProspeccaoErro'; } }

export interface LugarMaps {
  placeId: string;
  nome: string;
  categoria: CategoriaProspecto;
  tipoGoogle: string | null;
  endereco: string | null;
  telefone: string | null;
  site: string | null;
  nota: number | null;
  avaliacoes: number;
  mapsUrl: string | null;
  termo: string;
}

let fetchPlaces: typeof fetch = (...a) => fetch(...a);
/** Testes: troca o fetch (API simulada) */
export function _usarFetch(f: typeof fetch) { fetchPlaces = f; }

/** Chave: variável de ambiente ou a gravada em Configurações */
export async function chavePlaces(): Promise<string | null> {
  const env = String(process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '').trim();
  if (env) return env;
  try {
    const { lerConfig } = await import('../configSistema');
    const v = String((await lerConfig(CHAVE_CONFIG_PLACES)) ?? '').trim();
    return v || null;
  } catch { return null; }
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function umaPagina(chave: string, textQuery: string, pageToken?: string): Promise<{ places: any[]; next?: string }> {
  const r = await fetchPlaces(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': chave, 'X-Goog-FieldMask': CAMPOS },
    body: JSON.stringify({ textQuery, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
  if (!r.ok) {
    const j: any = await r.json().catch(() => ({}));
    const msg = String(j?.error?.message ?? '').slice(0, 200);
    if (r.status === 400 && /API key/i.test(msg)) throw new PlacesErro('Chave do Google inválida. Confira em Configurações › Prospecção (Google Places).', 400);
    if (r.status === 403) throw new PlacesErro(`O Google recusou a busca (403): ative a "Places API (New)" no Google Cloud e confira as restrições da chave. ${msg}`.trim(), 400);
    if (r.status === 429) throw new PlacesErro('Limite de buscas do Google atingido. Tente de novo mais tarde.', 429);
    throw new PlacesErro(`Busca no Google falhou (${r.status}). ${msg}`.trim(), 502);
  }
  const j: any = await r.json();
  return { places: Array.isArray(j?.places) ? j.places : [], next: j?.nextPageToken || undefined };
}

/**
 * Busca os tipos pedidos na cidade. Junta os termos, tira repetidos (mesmo lugar) e fica só com o que está na cidade
 * (o Google às vezes devolve vizinhos). Empresas fechadas definitivamente ficam de fora.
 */
export async function buscarNoMaps(o: { cidade: string; uf: string; tipos: TipoBuscaMaps[] }): Promise<{ lugares: LugarMaps[]; buscas: number }> {
  const chave = await chavePlaces();
  if (!chave) throw new PlacesErro('Busca no Google Maps não configurada: informe a chave da Places API em Configurações › Prospecção.', 412);
  const cidade = o.cidade.trim(), uf = o.uf.trim().toUpperCase();
  const alvo = semAcento(cidade);
  const vistos = new Map<string, LugarMaps>();
  let buscas = 0;
  for (const tipo of o.tipos) {
    const t = TIPOS_BUSCA_MAPS[tipo];
    if (!t) continue;
    for (const termo of t.termos) {
      const textQuery = `${termo} em ${cidade} - ${uf}`;
      let token: string | undefined;
      for (let pag = 0; pag < PAGINAS_POR_TERMO; pag++) {
        const { places, next } = await umaPagina(chave, textQuery, token);
        buscas++;
        for (const p of places) {
          const id = String(p?.id ?? '');
          if (!id || vistos.has(id)) continue;
          if (p.businessStatus === 'CLOSED_PERMANENTLY') continue;
          const endereco = p.formattedAddress ? String(p.formattedAddress).replace(/, Brasil$|, Brazil$/, '') : null;
          if (endereco && !semAcento(endereco).includes(alvo)) continue;
          vistos.set(id, {
            placeId: id,
            nome: String(p.displayName?.text ?? '').slice(0, 200),
            categoria: t.categoria,
            tipoGoogle: p.primaryTypeDisplayName?.text ?? null,
            endereco,
            telefone: normalizarTelefone(p.internationalPhoneNumber ?? p.nationalPhoneNumber),
            site: p.websiteUri ? String(p.websiteUri).slice(0, 300) : null,
            nota: typeof p.rating === 'number' ? p.rating : null,
            avaliacoes: Number(p.userRatingCount ?? 0),
            mapsUrl: p.googleMapsUri ?? null,
            termo,
          });
        }
        if (!next) break;
        token = next;
      }
    }
  }
  const lugares = Array.from(vistos.values()).filter(l => l.nome).sort((a, b) => b.avaliacoes - a.avaliacoes || a.nome.localeCompare(b.nome, 'pt-BR'));
  return { lugares, buscas };
}
