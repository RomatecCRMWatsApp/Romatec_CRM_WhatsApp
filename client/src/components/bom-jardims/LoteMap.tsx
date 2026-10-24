import { useEffect, useMemo, useState } from "react";
import LupaPortal, { alturaDaLupa, cantoDaLupa, densificar } from "./LupaPortal";
import ZoomSvg from "../mapa/ZoomSvg";

/**
 * Mapa de vendas interativo, desenhado a partir das coordenadas georreferenciadas
 * (/bom-jardims/mapa.json, gerado do lotes.geojson do pacote — sem preço).
 * O status de cada chácara vem ao vivo da API.
 */

type Pt = [number, number]; // [lon, lat]
export type MapaData = {
  lotes: { codigo: string; quadra: string; numero: number; areaM2: number; comercializavel: boolean; poly: Pt[] }[];
  ruas: { nome: string; line: Pt[] }[];
  perimetro: Pt[];
  /** imagem: recorte/render da lupa (só no portal) */
  pontos: { nome: string; pt: Pt; imagem?: string }[];
  /** Rio/córrego (eixo) e área de vivência e recreação, da planta oficial */
  rio?: { nome: string; line: Pt[] };
  areas?: { nome: string; detalhe?: string; poly: Pt[]; rotulo?: Pt }[];
  /** APP (30 m) ao longo do rio e trilha ecológica, do KMZ oficial */
  app?: { nome: string; detalhe?: string; poly: Pt[] };
  trilha?: { nome: string; line: Pt[]; rotulo?: Pt };
};
const valido = (p: Pt | null | undefined): p is Pt => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);

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
    const all = [...data.perimetro, ...data.lotes.flatMap(l => l.poly), ...(data.rio?.line ?? []), ...(data.areas ?? []).flatMap(a => a.poly), ...(data.app?.poly ?? []), ...(data.trilha?.line ?? [])].filter(valido);
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

export default function LoteMap({ lotes, selected, onSelect, onMapLoaded, dados, destaque }: {
  /** Chamado com os lotes da geometria pública, para a página usar se a API falhar */
  onMapLoaded?: (fallback: LoteInfo[]) => void;
  /** Geometria já carregada (testes); sem isso, busca /bom-jardims/mapa.json */
  dados?: MapaData;
  /** Página de uma chácara: ela em dourado, sem a lista de escolha nem o cartão da seleção */
  destaque?: boolean;
  lotes: LoteInfo[];
  selected?: string;
  onSelect: (codigo: string) => void;
}) {
  const [data, setData] = useState<MapaData | null>(dados ?? null);
  const [error, setError] = useState(false);
  const proj = useProjection(data);

  useEffect(() => {
    if (dados) return;
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
      <div style={{ overflow: "hidden", borderRadius: 16, background: "#E7EEDB", border: "1px solid #CFD8BF" }}>
        <ZoomSvg W={W} H={H} rotulo="Mapa de vendas do Bom Jardims">
          <path d={pathOf(data.perimetro.map(project))} fill="#D3E2BC" stroke="#0C3320" strokeWidth={2} strokeDasharray="6 4" />
          {/* Área de vivência e recreação na frente, junto ao rio */}
          {data.areas?.map(a => (
            <path key={a.nome} d={pathOf(a.poly.filter(valido).map(project))} fill="#BFDB9C" stroke="#2F7D3A" strokeWidth={1.5} strokeDasharray="6 4" />
          ))}
          {data.app?.poly?.length ? (
            <path d={pathOf(data.app.poly.filter(valido).map(project))} fill="#3F7A3A" fillOpacity={0.28} stroke="#2F6A2C" strokeOpacity={0.55} strokeWidth={1} pointerEvents="none">
              <title>{data.app.nome}</title>
            </path>
          ) : null}
          {data.rio?.line?.length ? (
            <g pointerEvents="none">
              <path d={pathOf(data.rio.line.filter(valido).map(project), false)} fill="none" stroke="#7FB069" strokeOpacity={0.5} strokeWidth={24} strokeLinecap="round" strokeLinejoin="round" />
              <path d={pathOf(data.rio.line.filter(valido).map(project), false)} fill="none" stroke="#2C7FB8" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ) : null}
          {data.ruas.filter(r => r.line.filter(valido).length > 1).map(r => (
            <path key={r.nome} d={pathOf(r.line.filter(valido).map(project), false)} fill="none" stroke="#FFFFFF" strokeWidth={7} strokeLinecap="round" />
          ))}
          {data.lotes.map(l => {
            const info = byCodigo.get(l.codigo);
            const status = info?.status ?? (NAO_COMERCIAL_LABEL[l.codigo] ? "nao_comercializavel" : "disponivel");
            const pts = l.poly.map(project);
            const [cx, cy] = centroid(pts);
            const fill = destaque && selected === l.codigo ? "#E8B931" : l.codigo === "B14" ? COR_B14 : STATUS_COR[status];
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
          {data.trilha?.line?.length ? (
            <g pointerEvents="none">
              <path d={pathOf(data.trilha.line.filter(valido).map(project), false)} fill="none" stroke="#FFFFFF" strokeOpacity={0.8} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
              <path d={pathOf(data.trilha.line.filter(valido).map(project), false)} fill="none" stroke="#7A5530" strokeWidth={2.2} strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" />
              {valido(data.trilha.rotulo) && (() => {
                const [x, y] = project(data.trilha!.rotulo!);
                return <text x={x + 14} y={y + 32} textAnchor="middle" fontSize={12} fontWeight={700} fontStyle="italic" fill="#6A4626" stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke">{data.trilha!.nome}</text>;
              })()}
            </g>
          ) : null}
          {data.areas?.filter(a => valido(a.rotulo)).map(a => {
            const [x, y] = project(a.rotulo!);
            return (
              <text key={`r${a.nome}`} x={x} y={y} textAnchor="middle" fontSize={15} fontWeight={800} fill="#1F5A2A" stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke" pointerEvents="none">
                <tspan x={x} dy={0}>ÁREA DE VIVÊNCIA</tspan>
                <tspan x={x} dy={17}>E RECREAÇÃO</tspan>
              </text>
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
          {/* Lupa do portal de entrada, no canto que não cobre os lotes */}
          {(() => {
            const portal = data.pontos.find(p => /portal/i.test(p.nome));
            if (!portal || !valido(portal.pt)) return null;
            const pt = project(portal.pt);
            const w = 300, h = alturaDaLupa(w);
            const outros = [data.rio?.line, data.perimetro, ...(data.areas ?? []).map(a => a.poly), data.app?.poly]
              .flatMap(linha => densificar((linha ?? []).filter(valido).map(project)));
            const caixa = cantoDaLupa(W, H, w, h, data.lotes.flatMap(l => l.poly.map(project)), pt, outros);
            return <LupaPortal portal={pt} caixa={caixa} imagem={portal.imagem} rotulo="Portal de entrada" raio={15} />;
          })()}
        </ZoomSvg>
      </div>

      {/* Escolha pela lista (mais fácil no celular) */}
      {!destaque && <label style={{ display: "block", marginTop: 12, fontSize: 14, color: "#0C3320" }}>
        <span style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Ou escolha pela lista:</span>
        <select value={selected ?? ""} onChange={e => e.target.value && onSelect(e.target.value)}
          style={{ width: "100%", padding: "11px 12px", borderRadius: 12, border: "1px solid #CFC6AD", background: "#fff", color: "#0C3320", fontSize: 16 }}>
          <option value="">Selecione uma chácara disponível</option>
          {lotes.filter(l => l.status === "disponivel").map(l => (
            <option key={l.codigo} value={l.codigo}>{l.codigo} · Quadra {l.quadra} · {formatArea(l.areaM2)}</option>
          ))}
        </select>
      </label>}

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
        {data.areas?.length ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: "#BFDB9C", border: "1px solid #2F7D3A" }} />
            Área de vivência e recreação
          </span>
        ) : null}
        {data.rio ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 18, height: 6, borderRadius: 3, background: "#2C7FB8" }} />
            Rio
          </span>
        ) : null}
        {data.app ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: "rgba(63,122,58,0.3)", border: "1px solid rgba(47,106,44,0.6)" }} />
            APP (30 m)
          </span>
        ) : null}
        {data.trilha ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 18, borderTop: "2px dashed #7A5530" }} />
            Trilha ecológica
          </span>
        ) : null}
      </div>

      {/* Chácara selecionada */}
      {sel && !destaque && (
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
