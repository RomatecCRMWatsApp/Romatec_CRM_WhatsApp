/**
 * Memorial descritivo de lote — RASCUNHO para conferência e assinatura do responsável técnico.
 * Coordenadas UTM (SIRGAS 2000), azimutes e distâncias planos; confrontações pelos lotes
 * vizinhos que dividem a mesma linha; o resto fica como "área comum / via — conferir".
 */
import { anelAberto, azimute, distancia, grausMinSeg, type XY } from '../../shared/utm';

export interface LoteMemorial { codigo: string; quadra: string | null; numero: number | null; areaM2: number; perimetroM: number; verticesUtm: XY[] }

const fmt = (n: number, casas = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Começa no vértice mais ao norte (empate: mais a oeste), mantendo o sentido horário */
export function ordenarVertices(v: XY[]): XY[] {
  const p = anelAberto(v);
  let i0 = 0;
  for (let i = 1; i < p.length; i++) if (p[i][1] > p[i0][1] + 1e-6 || (Math.abs(p[i][1] - p[i0][1]) <= 1e-6 && p[i][0] < p[i0][0])) i0 = i;
  return [...p.slice(i0), ...p.slice(0, i0)];
}

/** Distância de um ponto a um segmento */
function distSeg(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Para cada lado do lote: códigos dos lotes vizinhos que dividem essa linha */
export function confrontantes(lote: LoteMemorial, todos: LoteMemorial[], tol = 0.2): string[][] {
  const v = ordenarVertices(lote.verticesUtm);
  return v.map((a, i) => {
    const b = v[(i + 1) % v.length];
    const meio: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const viz: string[] = [];
    for (const o of todos) {
      if (o.codigo === lote.codigo || !o.verticesUtm?.length) continue;
      const ov = anelAberto(o.verticesUtm);
      if (ov.some((q, j) => distSeg(meio, q, ov[(j + 1) % ov.length]) <= tol)) viz.push(o.codigo);
    }
    return viz;
  });
}

/**
 * Rua de um lado sem lote vizinho. O nome da rua costuma estar escrito ao longo dela, às
 * vezes longe do lote; vale o rótulo do lado de fora que está na linha da rua (perto da reta
 * do lado e com o texto na mesma direção). Sem nenhum assim, o rótulo mais perto (até 45 m).
 */
export interface RuaMemorial { nome: string; e: number; n: number; angulo?: number }
export function ruaDoLado(a: XY, b: XY, ruas: RuaMemorial[]): string | null {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const comp = Math.hypot(dx, dy) || 1;
  const direcao = (Math.atan2(dy, dx) * 180) / Math.PI;
  const paralelo = (ang: number) => { const d = Math.abs((((ang - direcao) % 180) + 180) % 180); return Math.min(d, 180 - d) <= 20; };
  let naLinha: { nome: string; c: number } | null = null, perto: { nome: string; c: number } | null = null;
  for (const r of ruas) {
    const px = r.e - a[0], py = r.n - a[1];
    if (dx * py - dy * px <= 0) continue;              // vértices em sentido horário: o lado de fora fica à esquerda
    const t = (px * dx + py * dy) / (comp * comp);    // posição ao longo do lado (0..1 = dentro do lado)
    const d = Math.abs(dx * py - dy * px) / comp;     // distância até a reta do lado
    const fora = Math.max(0, -t, t - 1) * comp;       // quanto o rótulo passa da ponta do lado
    if (d <= 20 && fora <= 800 && r.angulo != null && paralelo(r.angulo)) {
      const c = d + fora * 0.02;
      if (!naLinha || c < naLinha.c) naLinha = { nome: r.nome, c };
    } else if (d <= 45 && fora <= comp * 0.75) {
      const c = d + fora * 0.5;
      if (!perto || c < perto.c) perto = { nome: r.nome, c };
    }
  }
  return naLinha?.nome ?? perto?.nome ?? null;
}

const nomeLote = (codigo: string, todos: LoteMemorial[]) => {
  const l = todos.find(x => x.codigo === codigo);
  return l?.quadra && l.numero != null ? `Lote ${String(l.numero).padStart(2, '0')} da Quadra ${l.quadra}` : `Lote ${codigo}`;
};

export interface Memorial { titulo: string; cabecalho: string[]; descricao: string; vertices: { nome: string; e: number; n: number; azimute: string; distancia: number; confronta: string }[] }

/** O lado está sobre o perímetro do empreendimento? (meio do lado a até `tol` m de algum lado do perímetro) */
export function ladoNoPerimetro(a: XY, b: XY, perimetroUtm: XY[] | null | undefined, tol = 0.5): boolean {
  if (!perimetroUtm || perimetroUtm.length < 3) return false;
  const p = anelAberto(perimetroUtm);
  const meio: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return p.some((q, j) => distSeg(meio, q, p[(j + 1) % p.length]) <= tol);
}

export function memorialDoLote(lote: LoteMemorial, todos: LoteMemorial[], emp: { nome: string; municipio?: string | null; uf?: string | null; fuso: number; matricula?: string | null; ruas?: RuaMemorial[]; perimetroUtm?: XY[] | null }): Memorial {
  const v = ordenarVertices(lote.verticesUtm);
  const conf = confrontantes(lote, todos);
  const nome = lote.quadra && lote.numero != null ? `Lote ${String(lote.numero).padStart(2, '0')} da Quadra ${lote.quadra}` : `Lote ${lote.codigo}`;
  const linhas = v.map((a, i) => {
    const b = v[(i + 1) % v.length];
    const divisa = !conf[i].length && ladoNoPerimetro(a, b, emp.perimetroUtm);
    const rua = conf[i].length || divisa ? null : ruaDoLado(a, b, emp.ruas ?? []);
    const confronta = conf[i].length ? conf[i].map(c => nomeLote(c, todos)).join(' e ')
      : divisa ? 'o limite do condomínio (divisa externa)'
      : rua ? `a ${rua}` : 'área comum do condomínio (conferir)';
    return { nome: `V${i + 1}`, e: a[0], n: a[1], azimute: grausMinSeg(azimute(a, b)), distancia: distancia(a, b), confronta };
  });
  const partes = linhas.map((l, i) => {
    const prox = linhas[(i + 1) % linhas.length];
    const ate = i === linhas.length - 1
      ? `até o vértice V1, ponto inicial da descrição, fechando o polígono`
      : `até o vértice ${prox.nome}, de coordenadas N ${fmt(prox.n, 3)} m e E ${fmt(prox.e, 3)} m`;
    return `do vértice ${l.nome} segue com azimute de ${l.azimute} e distância de ${fmt(l.distancia)} m, confrontando com ${l.confronta}, ${ate}`;
  });
  const descricao = `Inicia-se a descrição deste perímetro no vértice V1, de coordenadas N ${fmt(linhas[0].n, 3)} m e E ${fmt(linhas[0].e, 3)} m; ${partes.join('; ')}.`;
  return {
    titulo: `${nome} — ${emp.nome}`,
    cabecalho: [
      `Imóvel: ${nome}, ${emp.nome}`,
      `Município: ${[emp.municipio, emp.uf].filter(Boolean).join('/') || '—'}`,
      `Área: ${fmt(lote.areaM2)} m² (${fmt(lote.areaM2 / 10000, 4)} ha) · Perímetro: ${fmt(lote.perimetroM)} m`,
      `Matrícula do empreendimento: ${emp.matricula || 'sem registro informado'}`,
      `Sistema geodésico: SIRGAS 2000, projeção UTM, fuso ${emp.fuso} Sul. Azimutes e distâncias planos.`,
    ],
    descricao,
    vertices: linhas,
  };
}
