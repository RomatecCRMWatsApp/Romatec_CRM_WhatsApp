import { useEffect, useMemo, useState } from "react";
import { COR_SITUACAO, ROTULO_SITUACAO, SITUACOES_LOTE, type SituacaoLote } from "@shared/lotes";

/**
 * Mapa temático dos lotes (SVG a partir das coordenadas). O desenho vem do banco
 * (importado do DXF); sem ele, usa o /<slug>/mapa.json do site (com ruas e perímetro).
 */
type Pt = [number, number]; // [lon, lat]
export type LoteMapa = { id: number; codigo: string; situacao: SituacaoLote; poligono: Pt[] | null };
type Contexto = { lotes: { codigo: string; poly: Pt[] }[]; ruas: { nome: string; line: Pt[] }[]; perimetro: Pt[] };

const W = 1000, PAD = 20;
const caminho = (pts: [number, number][], fechar = true) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("") + (fechar ? "Z" : "");
const centro = (pts: [number, number][]) => {
  const anel = pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1] ? pts.slice(0, -1) : pts;
  return [anel.reduce((s, p) => s + p[0], 0) / anel.length, anel.reduce((s, p) => s + p[1], 0) / anel.length] as [number, number];
};

export default function MapaTematico({ slug, lotes, selecionado, onSelecionar, destacar, compacto }: {
  slug: string;
  lotes: LoteMapa[];
  selecionado?: number | null;
  onSelecionar?: (id: number) => void;
  /** Só estas situações ficam coloridas (as outras em cinza claro) — ex.: mapa dos disponíveis */
  destacar?: SituacaoLote[];
  compacto?: boolean;
}) {
  const [ctx, setCtx] = useState<Contexto | null>(null);
  useEffect(() => {
    fetch(`/${slug}/mapa.json`).then(r => (r.ok ? r.json() : null)).then(d => d && setCtx(d)).catch(() => {});
  }, [slug]);

  const desenho = useMemo(() => {
    const doContexto = new Map((ctx?.lotes ?? []).map(l => [l.codigo, l.poly]));
    const itens = lotes.map(l => ({ ...l, poly: (l.poligono?.length ? l.poligono : doContexto.get(l.codigo)) ?? null })).filter(l => l.poly && l.poly.length >= 3) as (LoteMapa & { poly: Pt[] })[];
    const todos = [...itens.flatMap(l => l.poly), ...(ctx?.perimetro ?? [])];
    if (!todos.length) return null;
    const lons = todos.map(p => p[0]), lats = todos.map(p => p[1]);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons), minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const escala = (W - 2 * PAD) / ((maxLon - minLon) * k || 1);
    const H = Math.round((maxLat - minLat) * escala + 2 * PAD);
    const proj = ([lon, lat]: Pt): [number, number] => [PAD + (lon - minLon) * k * escala, PAD + (maxLat - lat) * escala];
    return { itens, proj, H };
  }, [lotes, ctx]);

  if (!desenho) return <p className="text-sm text-muted-foreground">Sem desenho dos lotes ainda. Envie o DXF do projeto na aba Arquivos e importe.</p>;
  const { itens, proj, H } = desenho;
  const fonte = compacto ? 9 : 11;

  return (
    <div>
      <div className="rounded-xl border border-border bg-[#E7EEDB] overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mapa temático dos lotes" className="block w-full h-auto">
          {ctx?.perimetro?.length ? <path d={caminho(ctx.perimetro.map(proj))} fill="#D3E2BC" stroke="#0C3320" strokeWidth={2} strokeDasharray="6 4" /> : null}
          {ctx?.ruas?.map(r => <path key={r.nome} d={caminho(r.line.map(proj), false)} fill="none" stroke="#FFFFFF" strokeWidth={7} strokeLinecap="round" />)}
          {itens.map(l => {
            const pts = l.poly.map(proj);
            const [cx, cy] = centro(pts);
            const apagado = destacar && !destacar.includes(l.situacao);
            const sel = selecionado === l.id;
            return (
              <g key={l.id} onClick={() => onSelecionar?.(l.id)} style={{ cursor: onSelecionar ? "pointer" : "default" }}
                role={onSelecionar ? "button" : undefined} aria-label={`${l.codigo} — ${ROTULO_SITUACAO[l.situacao]}`}>
                <path d={caminho(pts)} fill={apagado ? "#EEF1F3" : COR_SITUACAO[l.situacao]} stroke={sel ? "#0C3320" : "#FFFFFF"} strokeWidth={sel ? 4 : 1.2} />
                <text x={cx} y={cy + fonte / 3} textAnchor="middle" fontSize={fonte} fontWeight={700} fill={apagado ? "#9AA3AB" : "#0C3320"} pointerEvents="none">{l.codigo}</text>
                <title>{`${l.codigo} — ${ROTULO_SITUACAO[l.situacao]}`}</title>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-xs">
        {SITUACOES_LOTE.filter(s => !destacar || destacar.includes(s)).map(s => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border border-black/20" style={{ background: COR_SITUACAO[s] }} />
            {ROTULO_SITUACAO[s]} ({lotes.filter(l => l.situacao === s).length})
          </span>
        ))}
      </div>
    </div>
  );
}
