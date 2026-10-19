/**
 * Importação de lotes de um DXF de parcelamento (Métrica TOPO / AutoCAD, coordenadas UTM).
 *
 * Camadas padrão do projeto (configuráveis):
 *   REGIAO_POLILINHAS  → contorno fechado de cada lote (LWPOLYLINE)
 *   NUMERO_DOS_LOTES   → texto "01", "02"… dentro do lote
 *   AREA_DOS_LOTES     → texto "3.025,11 m²" dentro do lote (área oficial do projeto)
 *   IDENT_DAS_QUADRAS  → texto "A", "B"… (a quadra do lote é o rótulo mais próximo)
 * Cópias do desenho sem contorno (pranchas de detalhe) são ignoradas.
 */
import { areaPlana, centroide, perimetro, pontoDentro, sentidoHorario, utmParaGeo, type LonLat, type XY } from '../../shared/utm';

export interface EntidadeDxf { tipo: string; camada: string; xs: number[]; ys: number[]; texto: string; fechada: boolean; rotacao?: number; ax?: number; ay?: number }

/** Ponto do texto: o de alinhamento (centralizado) quando existe, senão o de inserção */
const pontoDoTexto = (e: EntidadeDxf): [number, number] => (e.ax != null && e.ay != null && (e.ax !== 0 || e.ay !== 0) ? [e.ax, e.ay] : [e.xs[0], e.ys[0]]);

/** Texto do DXF legível: "\U+00CA" → "Ê", sem códigos de formatação do MTEXT */
export function textoDxf(t: string): string {
  return t
    .replace(/\\U\+([0-9A-F]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\P/g, ' ')
    .replace(/\\[A-Za-z][^;]*;|[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lê as entidades da seção ENTITIES (DXF ASCII) */
export function lerEntidades(conteudo: string): EntidadeDxf[] {
  const linhas = conteudo.split(/\r?\n/);
  const ents: EntidadeDxf[] = [];
  let dentro = false, cur: EntidadeDxf | null = null;
  for (let i = 0; i + 1 < linhas.length; i += 2) {
    const c = linhas[i].trim(), v = linhas[i + 1];
    if (!dentro) { if (c === '2' && v.trim() === 'ENTITIES') dentro = true; continue; }
    if (c === '0') {
      if (cur) ents.push(cur);
      if (v.trim() === 'ENDSEC') break;
      cur = { tipo: v.trim(), camada: '', xs: [], ys: [], texto: '', fechada: false };
    } else if (cur) {
      if (c === '8') cur.camada = v.trim();
      else if (c === '10') cur.xs.push(Number(v));
      else if (c === '20') cur.ys.push(Number(v));
      else if (c === '1') cur.texto += v;
      else if (c === '70' && cur.tipo === 'LWPOLYLINE') cur.fechada = (Number(v) & 1) === 1;
      else if (c === '50' && /TEXT/.test(cur.tipo)) cur.rotacao = Number(v);
      else if (c === '11' && cur.tipo === 'TEXT') cur.ax = Number(v);
      else if (c === '21' && cur.tipo === 'TEXT') cur.ay = Number(v);
    }
  }
  return ents;
}

/** Texto do DXF: "3.025,11 m\U+00B2" → 3025.11 */
export function numeroBr(texto: string): number | null {
  const t = texto.replace(/\\U\+[0-9A-F]{4}/gi, '').replace(/\{[^}]*;|[{}]/g, '').replace(/m.*$/i, '').trim();
  if (!/^[\d.,]+$/.test(t)) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const limpo = (t: string) => t.replace(/\\[A-Za-z][^;]*;|[{}]/g, '').trim();

export interface LoteDxf {
  codigo: string; quadra: string; numero: number;
  areaM2: number;               // área do texto do projeto (ou calculada, se faltar)
  areaCalculadaM2: number;
  perimetroM: number;
  verticesUtm: XY[];            // sentido horário, sem repetir o 1º
  poligono: LonLat[];           // [lon, lat], fechado
  centro: LonLat;
}

/** Rótulo de rua escrito no desenho ("RUA IPÊ"): posição UTM e geográfica e inclinação (graus, anti-horário a partir do leste) */
export interface RuaDxf { nome: string; e: number; n: number; lon: number; lat: number; angulo: number }

export interface ResultadoDxf { lotes: LoteDxf[]; ruas: RuaDxf[]; avisos: string[]; fuso: number }

/** "RUA WALTER e MARIA" → "Rua Walter e Maria" */
export function nomeDeRua(t: string): string {
  const minusc = new Set(['e', 'de', 'da', 'do', 'das', 'dos']);
  return t.toLowerCase().split(/\s+/).map((p, i) => (i > 0 && minusc.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}

const RUA = /^(rua|r\.|av\.?|avenida|alameda|travessa|tv\.?|estrada|rodovia|via|acesso|viela|praça)\s+\S/i;

export interface OpcoesDxf {
  fuso?: number; sul?: boolean;
  camadas?: Partial<Record<'contorno' | 'numero' | 'area' | 'quadra', string>>;
  /** Quadra pela posição de um lote já cadastrado (mantém os códigos ao reimportar); null = regra do desenho */
  quadraDoLote?: (centro: LonLat, numero: number) => string | null;
}

export function importarLotesDxf(conteudo: string, opts: OpcoesDxf = {}): ResultadoDxf {
  const fuso = opts.fuso ?? 23, sul = opts.sul ?? true;
  const cam = { contorno: 'REGIAO_POLILINHAS', numero: 'NUMERO_DOS_LOTES', area: 'AREA_DOS_LOTES', quadra: 'IDENT_DAS_QUADRAS', ...opts.camadas };
  const ents = lerEntidades(conteudo);
  const textos = (camada: string) => ents.filter(e => e.camada === camada && /TEXT/.test(e.tipo) && e.xs.length);
  const contornos = ents.filter(e => e.camada === cam.contorno && e.tipo === 'LWPOLYLINE' && e.xs.length >= 3)
    .map(e => e.xs.map((x, i) => [x, e.ys[i]] as XY));
  const numeros = textos(cam.numero).map(t => ({ n: limpo(t.texto), x: t.xs[0], y: t.ys[0] })).filter(t => /^\d{1,3}$/.test(t.n));
  const areas = textos(cam.area).map(t => ({ a: numeroBr(t.texto), x: t.xs[0], y: t.ys[0] }));
  const quadras = textos(cam.quadra).map(t => ({ q: limpo(t.texto).toUpperCase(), x: t.xs[0], y: t.ys[0] })).filter(t => /^[A-Z]{1,2}$/.test(t.q));
  const avisos: string[] = [];
  if (!contornos.length) avisos.push(`Nenhum contorno fechado na camada ${cam.contorno}`);
  if (!quadras.length) avisos.push(`Nenhum rótulo de quadra na camada ${cam.quadra}`);

  // Contorno de lote = o menor contorno que contém exatamente um número
  const deLote = contornos.filter(pts => {
    const dentroNum = numeros.filter(t => pontoDentro(t.x, t.y, pts));
    if (dentroNum.length !== 1) return false;
    const n = dentroNum[0];
    return contornos.filter(p => pontoDentro(n.x, n.y, p)).sort((a, b) => areaPlana(a) - areaPlana(b))[0] === pts;
  });
  // Quadra: os números são escritos quadra a quadra (01, 02… recomeça em 01). Cada sequência
  // é uma quadra; a letra é o rótulo mais próximo da maioria dos lotes da sequência.
  const comContorno = numeros
    .map(t => ({ t, pts: deLote.find(p => pontoDentro(t.x, t.y, p)) }))
    .filter((x): x is { t: typeof numeros[number]; pts: XY[] } => !!x.pts);
  const sequencias: (typeof comContorno)[] = [];
  for (const x of comContorno) {
    const atual = sequencias[sequencias.length - 1];
    if (!atual || Number(x.t.n) <= Number(atual[atual.length - 1].t.n)) sequencias.push([x]);
    else atual.push(x);
  }
  const maisProximo = (c: XY) => quadras.map(t => ({ q: t.q, d: Math.hypot(t.x - c[0], t.y - c[1]) })).sort((a, b) => a.d - b.d)[0]?.q ?? null;
  const quadraDaSequencia = new Map<(typeof comContorno)[number], string>();
  const letrasUsadas = new Set<string>();
  for (const seq of sequencias) {
    const votos = new Map<string, number>();
    for (const x of seq) { const q = maisProximo(centroide(x.pts)); if (q) votos.set(q, (votos.get(q) ?? 0) + 1); }
    const ordem = Array.from(votos).sort((a, b) => b[1] - a[1]).map(([q]) => q);
    const letra = ordem.find(q => !letrasUsadas.has(q)) ?? ordem[0];
    if (!letra) continue;
    if (letrasUsadas.has(letra)) avisos.push(`Quadra ${letra} apareceu em duas sequências de números — confira`);
    letrasUsadas.add(letra);
    for (const x of seq) quadraDaSequencia.set(x, letra);
  }

  const lotes: LoteDxf[] = [];
  const usados = new Set<string>();
  for (const x of comContorno) {
    const { t: num, pts } = x;
    const c = centroide(pts);
    const quadra = opts.quadraDoLote?.(utmParaGeo(c[0], c[1], fuso, sul), Number(num.n)) ?? quadraDaSequencia.get(x) ?? null;
    if (!quadra) continue;
    const q = { q: quadra };
    const numero = Number(num.n);
    const codigo = `${q.q}${String(numero).padStart(2, '0')}`;
    if (usados.has(codigo)) { avisos.push(`Lote ${codigo} apareceu duas vezes — confira a quadra no desenho`); continue; }
    usados.add(codigo);
    const areaTxt = areas.find(a => a.a != null && pontoDentro(a.x, a.y, pts))?.a ?? null;
    const calc = areaPlana(pts);
    if (areaTxt == null) avisos.push(`Lote ${codigo}: sem texto de área; usada a área calculada`);
    else if (Math.abs(areaTxt - calc) / areaTxt > 0.02) avisos.push(`Lote ${codigo}: área do texto (${areaTxt}) difere da calculada (${calc.toFixed(2)}) — confira`);
    const horario = sentidoHorario(pts);
    const geo = horario.map(([x, y]) => utmParaGeo(x, y, fuso, sul));
    lotes.push({
      codigo, quadra: q.q, numero,
      areaM2: Math.round((areaTxt ?? calc) * 100) / 100,
      areaCalculadaM2: Math.round(calc * 100) / 100,
      perimetroM: Math.round(perimetro(pts) * 100) / 100,
      verticesUtm: horario.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] as XY),
      poligono: [...geo, geo[0]].map(([lo, la]) => [Math.round(lo * 1e7) / 1e7, Math.round(la * 1e7) / 1e7] as LonLat),
      centro: utmParaGeo(c[0], c[1], fuso, sul).map(v => Math.round(v * 1e7) / 1e7) as LonLat,
    });
  }
  const semContorno = numeros.filter(t => !contornos.some(p => pontoDentro(t.x, t.y, p)));
  if (semContorno.length && lotes.length) avisos.push(`${semContorno.length} número(s) de lote fora de qualquer contorno (cópias/detalhes do desenho foram ignorados)`);
  lotes.sort((a, b) => a.quadra.localeCompare(b.quadra) || a.numero - b.numero);

  // Ruas: textos "RUA …", "TRAVESSA …" em qualquer camada (fora dos lotes)
  const ruas: RuaDxf[] = ents
    .filter(e => /TEXT/.test(e.tipo) && e.xs.length && RUA.test(textoDxf(e.texto)))
    .map(e => ({ e, p: pontoDoTexto(e) }))
    .filter(({ p }) => !deLote.some(pl => pontoDentro(p[0], p[1], pl)))
    .map(({ e, p }) => {
      const [lon, lat] = utmParaGeo(p[0], p[1], fuso, sul);
      return { nome: nomeDeRua(textoDxf(e.texto)), e: Math.round(p[0] * 1000) / 1000, n: Math.round(p[1] * 1000) / 1000, lon: Math.round(lon * 1e7) / 1e7, lat: Math.round(lat * 1e7) / 1e7, angulo: e.rotacao ?? 0 };
    });
  return { lotes, ruas, avisos, fuso };
}
