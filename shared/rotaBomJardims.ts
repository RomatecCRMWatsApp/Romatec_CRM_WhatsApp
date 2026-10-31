/**
 * Como chegar ao Bom Jardims (/bom-jardims/rota): percurso do centro de Açailândia até o portal, com os pontos de
 * referência, links para Google Maps / Waze / Apple Maps e o arquivo da rota (GPX e KML) para qualquer app de navegação.
 * O traçado pelas estradas vem do OSRM (OpenStreetMap) no servidor; sem ele, o arquivo leva só os pontos e o app traça.
 */
import { ACESSO_ESTRADA, NOME_BOM_JARDIMS, PORTAL_ENTRADA } from './chacaraLink';

export const ROTA_COMO_CHEGAR = '/bom-jardims/rota';
export const CAMPANHA_ROTA = 'BJ-ROTA';
export const TITULO_ROTA = 'Como chegar ao Condomínio de Chácaras Bom Jardims — rota do centro de Açailândia/MA';
export const DESCRICAO_ROTA = 'Percurso do centro de Açailândia até o portal do Bom Jardims, com os pontos de referência e a rota para Google Maps, Waze e qualquer app de navegação.';

/** Ponto de partida: centro de Açailândia (sede do município) — o Google/Apple usam o nome; o GPX usa a coordenada */
export const ORIGEM_ROTA = { nome: 'Prefeitura Municipal de Açailândia', busca: 'Prefeitura Municipal de Açailândia, MA', lat: -4.9469, lon: -47.5000 };

/** Pontos de referência, na ordem de quem sai do centro */
export const PONTOS_ROTA: { titulo: string; texto: string }[] = [
  { titulo: 'Prefeitura Municipal', texto: 'Saia do centro de Açailândia passando em frente à Prefeitura Municipal.' },
  { titulo: 'BR-222', texto: 'Pegue a rodovia BR-222, sentido Piquiá.' },
  { titulo: 'Polícia Rodoviária Federal', texto: 'Siga pela BR-222 passando pelo posto da Polícia Rodoviária Federal (PRF).' },
  { titulo: 'Entrada da estação ferroviária', texto: 'Saia da rodovia e entre pela entrada da estação ferroviária.' },
  { titulo: 'Duas ferrovias', texto: 'Vire e atravesse as duas linhas de ferrovia, com atenção à passagem dos trens.' },
  { titulo: 'Balneário Walter Figueiredo', texto: 'Mais à frente, vire novamente e siga até o Balneário Walter Figueiredo.' },
  { titulo: 'Portal do Bom Jardims', texto: 'Do Balneário Walter Figueiredo são cerca de 300 a 500 metros até o portal de entrada do condomínio.' },
];

const dest = `${ACESSO_ESTRADA.lat},${ACESSO_ESTRADA.lon}`;
/** Google Maps: do centro (pelo nome) até a ponta do acesso na estrada */
export const linkGoogleRota = () => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(ORIGEM_ROTA.busca)}&destination=${dest}&travelmode=driving`;
/** Waze: navega de onde a pessoa estiver até o acesso */
export const linkWazeRota = () => `https://waze.com/ul?ll=${dest}&navigate=yes`;
/** Apple Maps (iPhone) */
export const linkAppleRota = () => `https://maps.apple.com/?saddr=${encodeURIComponent(ORIGEM_ROTA.busca)}&daddr=${dest}&dirflg=d`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export type Coord = [number, number]; // [lon, lat]

/** Traçado final: do acesso na estrada até o portal (o OSRM termina na estrada) */
function comChegada(linha: Coord[]): Coord[] {
  const fim: Coord = [ACESSO_ESTRADA.lon, ACESSO_ESTRADA.lat], portal: Coord = [PORTAL_ENTRADA.lon, PORTAL_ENTRADA.lat];
  const l = linha.length ? [...linha] : [[ORIGEM_ROTA.lon, ORIGEM_ROTA.lat] as Coord];
  const ult = l[l.length - 1];
  if (Math.abs(ult[0] - fim[0]) > 1e-6 || Math.abs(ult[1] - fim[1]) > 1e-6) l.push(fim);
  l.push(portal);
  return l;
}

/** GPX 1.1: pontos (partida e portal), rota (para apps que recalculam) e trilha (o traçado pelas estradas, quando houver) */
export function gpxRota(linha: Coord[], link: string): string {
  const pts = comChegada(linha);
  const wpt = (lat: number, lon: number, nome: string, desc: string) => `  <wpt lat="${lat}" lon="${lon}"><name>${esc(nome)}</name><desc>${esc(desc)}</desc></wpt>`;
  const desc = PONTOS_ROTA.map((p, i) => `${i + 1}. ${p.texto}`).join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Romatec CRM" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(`Como chegar — ${NOME_BOM_JARDIMS}`)}</name><desc>${esc(desc)}</desc><link href="${esc(link)}"><text>Como chegar</text></link></metadata>
${wpt(ORIGEM_ROTA.lat, ORIGEM_ROTA.lon, 'Centro de Açailândia', ORIGEM_ROTA.nome)}
${wpt(PORTAL_ENTRADA.lat, PORTAL_ENTRADA.lon, `Portal — ${NOME_BOM_JARDIMS}`, 'Portal de entrada do condomínio')}
  <rte><name>${esc(`Centro de Açailândia → ${NOME_BOM_JARDIMS}`)}</name>
    <rtept lat="${ORIGEM_ROTA.lat}" lon="${ORIGEM_ROTA.lon}"><name>Centro de Açailândia</name></rtept>
    <rtept lat="${ACESSO_ESTRADA.lat}" lon="${ACESSO_ESTRADA.lon}"><name>Acesso ao condomínio</name></rtept>
    <rtept lat="${PORTAL_ENTRADA.lat}" lon="${PORTAL_ENTRADA.lon}"><name>Portal do Bom Jardims</name></rtept>
  </rte>
${pts.length > 3 ? `  <trk><name>Percurso pelas estradas</name><trkseg>\n${pts.map(([lon, lat]) => `    <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"/>`).join('\n')}\n  </trkseg></trk>\n` : ''}</gpx>
`;
}

/** KML: o percurso (linha dourada) e os dois pontos — abre no Google Earth, Maps (Meus mapas) e apps de GIS */
export function kmlRota(linha: Coord[], link: string): string {
  const pts = comChegada(linha);
  const ponto = (nome: string, desc: string, lat: number, lon: number) => `    <Placemark><name>${esc(nome)}</name><description>${esc(desc)}</description><Point><coordinates>${lon},${lat},0</coordinates></Point></Placemark>`;
  const desc = PONTOS_ROTA.map((p, i) => `${i + 1}. ${p.titulo}: ${p.texto}`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <name>${esc(`Como chegar — ${NOME_BOM_JARDIMS}`)}</name>
  <description>${esc(`${desc}\n\n${link}`)}</description>
  <Style id="rota"><LineStyle><color>ff4ca8c9</color><width>6</width></LineStyle></Style>
  <Placemark><name>Percurso</name><styleUrl>#rota</styleUrl><LineString><tessellate>1</tessellate><coordinates>${pts.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)},0`).join(' ')}</coordinates></LineString></Placemark>
${ponto('Centro de Açailândia', ORIGEM_ROTA.nome, ORIGEM_ROTA.lat, ORIGEM_ROTA.lon)}
${ponto(`Portal — ${NOME_BOM_JARDIMS}`, 'Portal de entrada do condomínio', PORTAL_ENTRADA.lat, PORTAL_ENTRADA.lon)}
</Document></kml>
`;
}

/** Distância (km) e tempo (min) do traçado, para a página */
export interface ResumoRota { km: number | null; minutos: number | null; tracado: boolean }
