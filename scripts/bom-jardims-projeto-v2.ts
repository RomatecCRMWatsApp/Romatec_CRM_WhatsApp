/**
 * Gera server/data/bom-jardims/projeto-v2.json a partir do DXF "CONDOMINIO_DE_CHACARAS_BOM_JARDIMS_ATUALIZADO_V2".
 *
 * Mudanças do projeto V2 (nov/2026):
 * - Portal (na Rua Walter e Maria, esquina com a Rua Cedro) e área administrativa/stand de vendas mudam para a entrada; a área administrativa
 *   (4.125 m²) fica fora do condomínio. A chácara B14, que abrigava o stand, vai para venda.
 * - O antigo A02 (3.025,11 m²) é desmembrado: A02 (1.100,04 m², poço e reservatório) e A02A (1.925,07 m², à venda).
 *   O A03, antiga área técnica, vai para venda.
 * - Os demais lotes são casados pela posição com o cadastro (seed.json, numeração oficial): a numeração do
 *   desenho não é usada para os códigos.
 *
 * Uso: npx tsx scripts/bom-jardims-projeto-v2.ts caminho/do/arquivo.dxf
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { importarLotesDxf, lerEntidades, numeroBr, textoDxf } from '../server/lotes/dxf';
import { areaPlana, centroide, perimetro, pontoDentro, sentidoHorario, utmParaGeo, type XY } from '../shared/utm';

const FUSO = 23;
const arquivo = process.argv[2];
if (!arquivo) throw new Error('Informe o DXF');
const conteudo = readFileSync(arquivo, 'latin1');
const ents = lerEntidades(conteudo);
const raiz = path.resolve(import.meta.dirname, '..');
const seed = JSON.parse(readFileSync(path.join(raiz, 'server/data/bom-jardims/seed.json'), 'utf8'));

const r6 = (v: number, c = 1e7) => Math.round(v * c) / c;
const geo = (p: XY) => utmParaGeo(p[0], p[1], FUSO, true).map(v => r6(v)) as [number, number];
const metros = (a: number[], b: number[]) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110574);
function forma(pts: XY[]) {
  const h = sentidoHorario(pts);
  const g = h.map(geo);
  return {
    verticesUtm: h.map(([x, y]) => [r6(x, 1000), r6(y, 1000)] as XY),
    poligono: [...g, g[0]],
    centro: geo(centroide(pts)),
    areaCalculadaM2: r6(areaPlana(pts), 100),
    perimetroM: r6(perimetro(pts), 100),
  };
}

// Lotes: o menor contorno que contém cada número do desenho
const contornos = ents.filter(e => e.camada === 'REGIAO_POLILINHAS' && e.tipo === 'LWPOLYLINE' && e.xs.length >= 3).map(e => e.xs.map((x, i) => [x, e.ys[i]] as XY));
const numeros = ents.filter(e => e.camada === 'NUMERO_DOS_LOTES' && /TEXT/.test(e.tipo)).map(e => ({ n: textoDxf(e.texto).toUpperCase(), x: e.xs[0], y: e.ys[0] }));
const areasTxt = ents.filter(e => e.camada === 'AREA_DOS_LOTES' && /TEXT/.test(e.tipo)).map(e => ({ a: numeroBr(e.texto), x: e.xs[0], y: e.ys[0] }));
const doDesenho = numeros.map(n => {
  const pts = contornos.filter(p => pontoDentro(n.x, n.y, p)).sort((a, b) => areaPlana(a) - areaPlana(b))[0];
  if (!pts) return null;
  const f = forma(pts);
  const areaTxt = areasTxt.find(a => a.a != null && pontoDentro(a.x, a.y, pts))?.a ?? null;
  return { n: n.n, pts, ...f, areaM2: r6(areaTxt ?? f.areaCalculadaM2, 100) };
}).filter((x): x is NonNullable<typeof x> => !!x);

const lotes: any[] = [];
const usados = new Set<string>();
const avisos: string[] = [];
for (const d of doDesenho) {
  if (d.areaM2 > 10000) continue; // área de uso comum (quadra E) — não é lote
  let codigo: string | null = null;
  if (d.n === '2A') codigo = 'A02A';
  else {
    const par = seed.lotes.map((s: any) => ({ s, m: metros([s.lonCentro, s.latCentro], d.centro) }))
      .filter((x: any) => !usados.has(x.s.codigo)).sort((a: any, b: any) => a.m - b.m)[0];
    if (par && par.m < 3) codigo = par.s.codigo;
    else if (d.n === '02' && par?.s.codigo === 'A02' && par.m < 25) codigo = 'A02'; // A02 desmembrado (centro mudou)
  }
  if (!codigo) { avisos.push(`Lote "${d.n}" do desenho sem correspondente no cadastro (${d.areaM2} m²)`); continue; }
  usados.add(codigo);
  const quadra = codigo[0], numero = parseInt(codigo.slice(1, 3), 10);
  lotes.push({ codigo, quadra, numero, areaM2: d.areaM2, areaCalculadaM2: d.areaCalculadaM2, perimetroM: d.perimetroM, verticesUtm: d.verticesUtm, poligono: d.poligono, centro: d.centro });
}
const faltam = seed.lotes.filter((s: any) => !usados.has(s.codigo)).map((s: any) => s.codigo);
if (faltam.length) throw new Error(`Lotes do cadastro sem correspondente no DXF: ${faltam.join(', ')}`);
lotes.sort((a, b) => a.quadra.localeCompare(b.quadra) || a.numero - b.numero || a.codigo.localeCompare(b.codigo));

// Ruas, perímetro: o importador do sistema
const imp = importarLotesDxf(conteudo, { fuso: FUSO });

// Área administrativa e stand (camada Lote_Regular, 4.125 m²) e portal (texto "PORTA DE ENTRADA…")
const adm = ents.find(e => e.camada === 'Lote_Regular' && e.tipo === 'LWPOLYLINE');
if (!adm) throw new Error('Área administrativa (camada Lote_Regular) não encontrada');
const admF = forma(adm.xs.map((x, i) => [x, adm.ys[i]] as XY));
// Boca da Rua Cedro: canto da área administrativa na divisa e o canto do lote mais próximo (D10) — dá a direção da via
const admPts = adm.xs.map((x, i) => [x, adm.ys[i]] as XY);
const per = imp.perimetro!.verticesUtm;
const projSeg = (p: XY, a: XY, b: XY): XY => { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return [a[0] + t * dx, a[1] + t * dy]; };
const naDivisa = (p: XY): XY => per.map((a, i) => projSeg(p, a, per[(i + 1) % per.length])).sort((u, w) => Math.hypot(u[0] - p[0], u[1] - p[1]) - Math.hypot(w[0] - p[0], w[1] - p[1]))[0];
const cantosNaDivisa = admPts.filter(p => { const q = naDivisa(p); return Math.hypot(q[0] - p[0], q[1] - p[1]) < 1.5; });
let boca: { a: XY; b: XY; d: number } | null = null;
for (const a of cantosNaDivisa) for (const l of lotes) for (const b of l.verticesUtm as XY[]) {
  const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
  if (!boca || d < boca.d) boca = { a, b, d };
}
if (!boca || boca.d > 20) throw new Error('Boca da rua de entrada não encontrada');
// Portal (definição de José Romário, nov/2026): atravessa a via de entrada (Rua Walter e Maria) na esquina com a Rua Cedro.
// Começa no ponto do limite da fazenda informado (nada é construído além dele) e vai até o canto da área administrativa;
// o marcador fica no meio do portal e a rota termina na via, 10 m antes, em frente ao stand.
const PONTO_INICIAL_PORTAL: XY = [235955.872, 9454732.409];
const portalUtm: XY = [(boca.a[0] + PONTO_INICIAL_PORTAL[0]) / 2, (boca.a[1] + PONTO_INICIAL_PORTAL[1]) / 2];
const dirVia: XY = [(boca.b[0] - boca.a[0]) / boca.d, (boca.b[1] - boca.a[1]) / boca.d];
const acessoUtm: XY = [portalUtm[0] - 10 * dirVia[0], portalUtm[1] - 10 * dirVia[1]];
const a02 = lotes.find(l => l.codigo === 'A02');

const saida = {
  fonte: path.basename(arquivo),
  geradoEm: new Date().toISOString().slice(0, 10),
  lotes,
  ruas: imp.ruas.map(r => ({ ...r, nome: r.nome.replace(/\bAçai\b/, 'Açaí') })),
  perimetro: imp.perimetro,
  areaAdministrativa: { nome: 'Área administrativa e stand de vendas', areaM2: admF.areaCalculadaM2, perimetroM: admF.perimetroM, verticesUtm: admF.verticesUtm, poligono: admF.poligono, centro: admF.centro },
  portal: {
    nome: 'Portal de entrada', pt: geo(portalUtm), larguraBocaM: r6(boca.d, 100),
    pontoInicial: { e: PONTO_INICIAL_PORTAL[0], n: PONTO_INICIAL_PORTAL[1], pt: geo(PONTO_INICIAL_PORTAL) },
    larguraM: r6(Math.hypot(boca.a[0] - PONTO_INICIAL_PORTAL[0], boca.a[1] - PONTO_INICIAL_PORTAL[1]), 100),
  },
  /** Ponto da via de entrada antes do portal, em frente ao stand (fim da rota do Google Maps) */
  acessoEstrada: { pt: geo(acessoUtm) },
  reservatorio: { nome: 'Poço e reservatório (A02)', pt: a02.centro },
  avisos,
};
writeFileSync(path.join(raiz, 'server/data/bom-jardims/projeto-v2.json'), JSON.stringify(saida));
console.log(`lotes ${lotes.length} | ruas ${imp.ruas.length} | adm ${admF.areaCalculadaM2} m² / ${admF.perimetroM} m | avisos:`, avisos);
