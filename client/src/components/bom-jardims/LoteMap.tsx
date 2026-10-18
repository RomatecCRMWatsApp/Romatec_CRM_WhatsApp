import { useEffect, useMemo, useState } from "react";

/**
 * Mapa de vendas interativo, desenhado a partir das coordenadas georreferenciadas
 * (/bom-jardims/mapa.json, gerado do lotes.geojson do pacote — sem preço).
 * O status de cada chácara vem ao vivo da API.
 */

type Pt = [number, number]; // [lon, lat]
type MapaData = {
  lotes: { codigo: string; quadra: string; numero: number; areaM2: number; comercializavel: boolean; poly: Pt[] }[];
  ruas: { nome: string; line: Pt[] }[];
  perimetro: Pt[];
  pontos: { nome: string; pt: Pt }[];
};

export type LoteInfo = {
  codigo: string;
  quadra: string | null;
  numero: number | null;
  areaM2: number | null;
  status: "disponivel" | "reservado" | "em_negociacao" | "vendido" | "nao_comercializavel";
};

// Cores do README (§9)
export const STATUS_COR: Record<LoteInfo["status"], string> = {
  disponivel: "#9CC46A",
  reservado: "#E9B44C",
  em_negociacao: "#5B8DD6",
  vendido: "#C0504D",
  nao_comercializavel: "#BFD9EE",
};
const COR_B14 = "#F3E3C3";

export const STATUS_LABEL: Record<LoteInfo["status"], string> = {
  disponivel: "Disponível",
  reservado: "Reservada",
  em_negociacao: "Em negociação",
  vendido: "Vendida",
  nao_comercializavel: "Área técnica",
};

const NAO_COMERCIAL_LABEL: Record<string, string> = {
  A03: "Poço artesiano e reservatório",
  B14: "Stand de vendas e administração",
};

const W = 1000;
const PAD = 24;

function useProjection(data: MapaData | null) {
  return useMemo(() => {
    if (!data) return null;
    const all = [...data.perimetro, ...data.lotes.flatMap(l => l.poly)];
    const lats = all.map(p => p[1]);
    const lons = all.map(p => p[0]);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180); // corrige a escala da longitude
    const spanX = (maxLon - minLon) * k;
    const spanY = maxLat - minLat;
    const scale = (W - 2 * PAD) / spanX;
    const H = Math.round(spanY * scale + 2 * PAD);
    const project = ([lon, lat]: Pt): [number, number] => [
      PAD + (lon - minLon) * k * scale,
      PAD + (maxLat - lat) * scale,
    ];
    return { project, H };
  }, [data]);
}

const pathOf = (pts: [number, number][], close = true) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("") + (close ? "Z" : "");

function centroid(pts: [number, number][]): [number, number] {
  const ring = pts.slice(0, -1);
  return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
}

export function formatArea(m2: number | null) {
  return m2 ? `${m2.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²` : "—";
}

/** Lotes a partir da geometria pública — usados só se a API estiver fora do ar (situação não confirmada) */
export function lotesDoMapa(data: MapaData): LoteInfo[] {
  return data.lotes.map(l => ({
    codigo: l.codigo, quadra: l.quadra, numero: l.numero, areaM2: l.areaM2,
    status: l.comercializavel ? "disponivel" : "nao_comercializavel",
  }));
}

export default function LoteMap({ lotes, selected, onSelect, onMapLoaded }: {
  /** Chamado com os lotes da geometria pública, para a página usar se a API falhar */
  onMapLoaded?: (fallback: LoteInfo[]) => void;
  lotes: LoteInfo[];
  selected?: string;
  onSelect: (codigo: string) => void;
}) {
  const [data, setData] = useState<MapaData | null>(null);
  const [error, setError] = useState(false);
  const proj = useProjection(data);

  useEffect(() => {
    fetch("/bom-jardims/mapa.json")
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: MapaData) => { setData(d); onMapLoaded?.(lotesDoMapa(d)); })
      .catch(() => setError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byCodigo = useMemo(() => new Map(lotes.map(l => [l.codigo, l])), [lotes]);

  if (error) return <p style={{ color: "#0C3320" }}>Não foi possível carregar o mapa agora.</p>;
  if (!data || !proj) {
    return <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", color: "#0C3320" }}>Carregando mapa…</div>;
  }

  const { project, H } = proj;
  const sel = selected ? byCodigo.get(selected) : undefined;

  return (
    <div>
      <div style={{ overflowX: "auto", borderRadius: 16, background: "#E7EEDB", border: "1px solid #CFD8BF" }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mapa de vendas do Bom Jardims"
          style={{ display: "block", width: "100%", height: "auto" }}>
          <path d={pathOf(data.perimetro.map(project))} fill="#D3E2BC" stroke="#0C3320" strokeWidth={2} strokeDasharray="6 4" />
          {data.ruas.map(r => (
            <path key={r.nome} d={pathOf(r.line.map(project), false)} fill="none" stroke="#FFFFFF" strokeWidth={7} strokeLinecap="round" />
          ))}
          {data.lotes.map(l => {
            const info = byCodigo.get(l.codigo);
            const status = info?.status ?? (NAO_COMERCIAL_LABEL[l.codigo] ? "nao_comercializavel" : "disponivel");
            const pts = l.poly.map(project);
            const [cx, cy] = centroid(pts);
            const fill = l.codigo === "B14" ? COR_B14 : STATUS_COR[status];
            const clickable = status !== "nao_comercializavel";
            const isSel = selected === l.codigo;
            return (
              <g key={l.codigo}
                onClick={() => clickable && onSelect(l.codigo)}
                style={{ cursor: clickable ? "pointer" : "default" }}
                role={clickable ? "button" : undefined}
                aria-label={`Chácara ${l.codigo} — ${STATUS_LABEL[status]}`}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={e => { if (clickable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(l.codigo); } }}>
                <path d={pathOf(pts)} fill={fill} stroke={isSel ? "#0C3320" : "#FFFFFF"} strokeWidth={isSel ? 4 : 1.5} />
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#0C3320" pointerEvents="none">
                  {l.codigo}
                </text>
              </g>
            );
          })}
          {data.pontos.map(p => {
            const [x, y] = project(p.pt);
            return (
              <g key={p.nome}>
                <circle cx={x} cy={y} r={7} fill="#C9A84C" stroke="#0C3320" strokeWidth={2} />
                <title>{p.nome}</title>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Escolha pela lista (mais fácil no celular) */}
      <label style={{ display: "block", marginTop: 12, fontSize: 14, color: "#0C3320" }}>
        <span style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Ou escolha pela lista:</span>
        <select value={selected ?? ""} onChange={e => e.target.value && onSelect(e.target.value)}
          style={{ width: "100%", padding: "11px 12px", borderRadius: 12, border: "1px solid #CFC6AD", background: "#fff", color: "#0C3320", fontSize: 16 }}>
          <option value="">Selecione uma chácara disponível</option>
          {lotes.filter(l => l.status === "disponivel").map(l => (
            <option key={l.codigo} value={l.codigo}>{l.codigo} · Quadra {l.quadra} · {formatArea(l.areaM2)}</option>
          ))}
        </select>
      </label>

      {/* Legenda */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 12, fontSize: 13, color: "#0C3320" }}>
        {(["disponivel", "reservado", "em_negociacao", "vendido"] as const).map(s => (
          <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: STATUS_COR[s], border: "1px solid #0C332033" }} />
            {STATUS_LABEL[s]}
          </span>
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 14, borderRadius: 7, background: "#C9A84C", border: "2px solid #0C3320" }} />
          Portal, stand, poço e pontos de banho
        </span>
      </div>

      {/* Chácara selecionada */}
      {sel && (
        <div style={{ marginTop: 16, padding: 16, borderRadius: 16, background: "#FFFFFF", border: "2px solid #C9A84C" }}>
          <p style={{ margin: 0, fontSize: 13, color: "#5C6B5F" }}>Chácara selecionada</p>
          <p style={{ margin: "2px 0 0", fontSize: 22, fontWeight: 700, color: "#0C3320", fontFamily: "'Playfair Display', Georgia, serif" }}>
            {sel.codigo} · Quadra {sel.quadra}
          </p>
          <p style={{ margin: "4px 0 0", color: "#0C3320" }}>
            {formatArea(sel.areaM2)} · <b style={{ color: sel.status === "disponivel" ? "#3E7B1F" : "#8A5A00" }}>{STATUS_LABEL[sel.status]}</b>
          </p>
          {NAO_COMERCIAL_LABEL[sel.codigo] && <p style={{ margin: "4px 0 0" }}>{NAO_COMERCIAL_LABEL[sel.codigo]}</p>}
        </div>
      )}
    </div>
  );
}
