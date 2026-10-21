/**
 * KML do Bom Jardims para o Google Earth / apps de GIS (lon/lat WGS 84), a partir da geometria pública
 * (/bom-jardims/mapa.json — polígonos oficiais do KMZ, numeração oficial, perímetro certificado).
 *  - kmlEmpreendimento: a poligonal geral (perímetro) + todos os lotes demarcados (link da campanha).
 *  - kmlChacara: a poligonal geral (perímetro) + só a chácara, destacada (link da chácara).
 * Cada lote é um polígono com o código oficial como nome (C05, D04…).
 */
import { centroDoLote, tituloChacara, NOME_BOM_JARDIMS } from './chacaraLink';

type Pt = [number, number];
export interface GeometriaPublica {
  perimetro: Pt[];
  lotes: { codigo: string; quadra: string; numero: number; areaM2: number | null; comercializavel: boolean; poly: Pt[] }[];
  /** Áreas de uso comum demarcadas (ex.: E01 — Quadra E); não são chácaras vendáveis */
  areasComuns?: { codigo: string; quadra: string; nome: string; areaM2: number | null; poly: Pt[] }[];
}

export const KML_CONTENT_TYPE = 'application/vnd.google-earth.kml+xml';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fechado = (p: Pt[]) => (p.length && (p[0][0] !== p[p.length - 1][0] || p[0][1] !== p[p.length - 1][1]) ? [...p, p[0]] : p);
const coords = (p: Pt[]) => fechado(p).map(([lon, lat]) => `${lon},${lat},0`).join(' ');

/** Cores KML são aabbggrr */
const ESTILOS = `
    <Style id="perimetro"><LineStyle><color>ff00d7ff</color><width>3</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style>
    <Style id="lote"><LineStyle><color>ccffffff</color><width>1.5</width></LineStyle><PolyStyle><color>4d3fae5a</color></PolyStyle></Style>
    <Style id="comum"><LineStyle><color>ccffffff</color><width>1.5</width></LineStyle><PolyStyle><color>66b8c9d6</color></PolyStyle></Style>
    <Style id="chacara"><LineStyle><color>ff0000ff</color><width>4</width></LineStyle><PolyStyle><color>9931b9e8</color></PolyStyle></Style>`;

function poligono(nome: string, estilo: string, p: Pt[], descricao?: string): string {
  return `
      <Placemark>
        <name>${esc(nome)}</name>${descricao ? `\n        <description>${esc(descricao)}</description>` : ''}
        <styleUrl>#${estilo}</styleUrl>
        <Polygon><outerBoundaryIs><LinearRing><coordinates>${coords(p)}</coordinates></LinearRing></outerBoundaryIs></Polygon>
      </Placemark>`;
}

const lookAt = ([lon, lat]: Pt, alcanceM: number) =>
  `<LookAt><longitude>${lon}</longitude><latitude>${lat}</latitude><altitude>0</altitude><heading>0</heading><tilt>0</tilt><range>${alcanceM}</range></LookAt>`;

function documento(nome: string, descricao: string, olhar: string, corpo: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(nome)}</name>
    <description>${esc(descricao)}</description>
    ${olhar}${ESTILOS}${corpo}
  </Document>
</kml>
`;
}

const RODAPE = 'Romatec Consultoria Total · Corretor José Romário — CRECI/MA 4.705. Mapa ilustrativo; medidas do projeto de parcelamento.';

const PERIMETRO = (g: GeometriaPublica) =>
  poligono(`${NOME_BOM_JARDIMS} — perímetro`, 'perimetro', g.perimetro, 'Poligonal geral do empreendimento (perímetro certificado).');

/** Descrição do lote no KML: "Chácara C05 · Quadra C · 3.143,41 m²" (área técnica: A03 poço, B14 stand) + link */
function descricaoLote(l: GeometriaPublica['lotes'][number], link?: string): string {
  return [
    tituloChacara({ codigo: l.codigo, quadra: l.quadra, areaM2: l.areaM2 }),
    l.comercializavel ? '' : 'área técnica do condomínio',
    link || '',
  ].filter(Boolean).join(' — ');
}

/**
 * Empreendimento inteiro: a poligonal geral (perímetro) + TODOS os lotes demarcados, um polígono por lote com
 * o código oficial como nome (C05, D04…), em pastas por quadra. Nenhum destacado.
 */
export function kmlEmpreendimento(g: GeometriaPublica, opts: { link?: string } = {}): string {
  const base = opts.link?.replace(/\/$/, '');
  const quadras = Array.from(new Set(g.lotes.map(l => l.quadra))).sort();
  const pastas = quadras.map(q => {
    const lotes = g.lotes.filter(l => l.quadra === q).sort((a, b) => a.numero - b.numero);
    return `
    <Folder>
      <name>Quadra ${esc(q)} (${lotes.length})</name>${lotes.map(l => poligono(l.codigo, 'lote', l.poly, descricaoLote(l, base ? `${base}/chacara/${l.codigo}` : undefined))).join('')}
    </Folder>`;
  }).join('');
  // Quadra E e afins: área de uso comum, demarcada com estilo próprio (não é chácara vendável)
  const comuns = (g.areasComuns ?? []).map(a => `
    <Folder>
      <name>Quadra ${esc(a.quadra)} · ${esc(a.nome.toLowerCase())}</name>${poligono(`${a.codigo} — ${a.nome}`, 'comum', a.poly,
        [`Quadra ${a.quadra} · ${a.nome.toLowerCase()} (não é chácara à venda)`, a.areaM2 ? `${a.areaM2.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²` : ''].filter(Boolean).join(' — '))}
    </Folder>`).join('');
  return documento(
    NOME_BOM_JARDIMS,
    ['Açailândia/MA · Estrada do Piquiá dos Baianos, altura do km 15 da BR-222.', `${g.lotes.length} lotes demarcados.`, opts.link || '', RODAPE].filter(Boolean).join(' '),
    lookAt(centroDoLote(g.perimetro), 1600),
    PERIMETRO(g) + pastas + comuns,
  );
}

/** Uma chácara: a poligonal geral (perímetro) + o polígono SÓ desta chácara, destacado. null se o código não existe */
export function kmlChacara(g: GeometriaPublica, codigo: string, opts: { link?: string } = {}): string | null {
  const l = g.lotes.find(x => x.codigo === codigo.toUpperCase());
  if (!l) return null;
  const titulo = tituloChacara({ codigo: l.codigo, quadra: l.quadra, areaM2: l.areaM2 });
  return documento(
    `Chácara ${l.codigo} — ${NOME_BOM_JARDIMS}`,
    [titulo + '.', 'Açailândia/MA.', opts.link || '', 'Condições e valores com o corretor.', RODAPE].filter(Boolean).join(' '),
    lookAt(centroDoLote(l.poly), 450),
    PERIMETRO(g) + poligono(l.codigo, 'chacara', l.poly, descricaoLote(l, opts.link)),
  );
}

export function nomeArquivoKml(codigo?: string | null): string {
  return codigo ? `bom-jardims-chacara-${codigo.toUpperCase()}.kml` : 'bom-jardims.kml';
}
