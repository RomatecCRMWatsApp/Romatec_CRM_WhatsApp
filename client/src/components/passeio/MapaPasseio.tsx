import { useEffect, useRef } from "react";
import type { Map as MapLibre, StyleSpecification } from "maplibre-gl";
import { SATELITE_CREDITO, SATELITE_TILES } from "@/lib/satelite";

/**
 * Mapa do Passeio no Mapa: o mesmo MapLibre, a mesma foto de satélite e o mesmo relevo (Terrarium/AWS) do mapa 3D do
 * empreendimento — aqui com terreno 3D, sombra do relevo guiada pelo sol e câmera conduzida pelos passos.
 */
type Pt = [number, number];
export type LotePasseio = { id: number; codigo: string; quadra: string | null; areaM2: number | null; perimetroM: number | null; situacao: "disponivel" | "reservado" | "vendido" | "indisponivel"; poligono: Pt[]; centro: Pt | null; preco: number | null };
export const COR_PASSEIO: Record<LotePasseio["situacao"], string> = { disponivel: "#5DBB63", reservado: "#E9C046", vendido: "#9AA0A6", indisponivel: "#C9CDD2" };
export const COR_SELECIONADO = "#F28C28";

const DEM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const fechar = (p: Pt[]) => (p.length && (p[0][0] !== p[p.length - 1][0] || p[0][1] !== p[p.length - 1][1]) ? [...p, p[0]] : p);
const fc = (features: any[]) => ({ type: "FeatureCollection" as const, features });
const caixaDe = (pts: Pt[]): [[number, number], [number, number]] => {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
};
export const centroDe = (p: Pt[]): Pt => { const q = fechar(p).slice(0, -1); return [q.reduce((s, x) => s + x[0], 0) / q.length, q.reduce((s, x) => s + x[1], 0) / q.length]; };

function estilo(): StyleSpecification {
  return {
    version: 8,
    sources: {
      satelite: { type: "raster", tiles: [SATELITE_TILES], tileSize: 256, maxzoom: 17, attribution: SATELITE_CREDITO },
      demSombra: { type: "raster-dem", tiles: [DEM], encoding: "terrarium", tileSize: 256, maxzoom: 15, attribution: "Relevo: Mapzen/AWS Terrain Tiles" },
    },
    layers: [
      { id: "fundo", type: "background", paint: { "background-color": "#1d2a1f" } },
      { id: "satelite", type: "raster", source: "satelite", paint: { "raster-brightness-max": 1 } },
      { id: "sombra", type: "hillshade", source: "demSombra", paint: { "hillshade-exaggeration": 0.45, "hillshade-illumination-anchor": "map", "hillshade-illumination-direction": 315, "hillshade-shadow-color": "#000000", "hillshade-highlight-color": "#FFF3D6", "hillshade-accent-color": "#2A2A2A" } },
    ],
  } as StyleSpecification;
}

export type Camera = { tipo: "visao" | "rota" | "lote" | "final"; loteId?: number | null };

export default function MapaPasseio({ perimetro, lotes, entrada, rota, exagero = 1.5, camera, selecionado, esmaecer, livre, sol, desenharRota, onLote, onPronto }: {
  perimetro: Pt[] | null; lotes: LotePasseio[]; entrada: { lon: number; lat: number; rotulo: string } | null;
  rota: Pt[] | null; exagero?: number; camera: Camera; selecionado: number | null; esmaecer: boolean; livre: boolean;
  /** Sol: azimute (do norte) e altura em graus; null = luz padrão */
  sol: { azimute: number; altura: number } | null;
  /** Fração (0–1) da rota já desenhada */
  desenharRota: number;
  onLote: (id: number) => void; onPronto?: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapLibre | null>(null);
  const pronto = useRef(false);
  const funcs = useRef<Record<"atualizarLotes" | "atualizarRota" | "atualizarSol" | "atualizarInteracao" | "moverCamera", () => void>>(null as any);
  const marcador = useRef<any>(null);
  const reduzir = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const todos: Pt[] = perimetro ?? lotes.flatMap(l => l.poligono);

  // Cria o mapa uma vez (MapLibre carregado só aqui)
  useEffect(() => {
    if (!caixa.current || mapa.current || !todos.length) return;
    let vivo = true;
    (async () => {
      const maplibre = (await import("maplibre-gl")).default;
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (!vivo || !caixa.current) return;
      const m = new maplibre.Map({
        container: caixa.current, style: estilo(), bounds: caixaDe(todos), fitBoundsOptions: { padding: 40 },
        pitch: 55, bearing: -20, maxPitch: 80, maxZoom: 19, attributionControl: { compact: true }, interactive: true,
      });
      m.addControl(new maplibre.NavigationControl({ visualizePitch: true }), "top-right");
      mapa.current = m;
      if (import.meta.env.DEV) (window as any).__passeioMapa = m;
      m.on("error", (e: any) => { if (import.meta.env.DEV) console.warn("[Passeio mapa]", e?.error?.message ?? e); /* tile do relevo falhou: segue sem relevo */ });
      // "style.load" (não "load"): não espera os tiles do satélite/relevo, que em rede lenta atrasam o passeio
      const montar = () => {
        if (!vivo || pronto.current) return;
        // Fase 1: sem a malha 3D do relevo (sem os dados ela desloca a câmera); o relevo aparece pelo sombreamento do sol
        if (perimetro) {
          m.addSource("perimetro", { type: "geojson", data: fc([{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [fechar(perimetro)] } }]) });
          m.addLayer({ id: "perimetro", type: "line", source: "perimetro", paint: { "line-color": "#F5D27A", "line-width": 2.2, "line-dasharray": [3, 1.5] } });
        }
        m.addSource("lotes", { type: "geojson", data: fc([]) });
        m.addLayer({ id: "lotes-fill", type: "fill", source: "lotes", paint: { "fill-color": ["get", "cor"], "fill-opacity": ["get", "opacidade"] } });
        m.addLayer({ id: "lotes-borda", type: "line", source: "lotes", paint: { "line-color": ["get", "borda"], "line-width": ["get", "largura"] } });
        m.addSource("rota", { type: "geojson", data: fc([]) });
        m.addLayer({ id: "rota-halo", type: "line", source: "rota", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#3a1a00", "line-width": 7, "line-opacity": 0.5 } });
        m.addLayer({ id: "rota", type: "line", source: "rota", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": COR_SELECIONADO, "line-width": 4 } });
        m.on("click", "lotes-fill", ev => { const id = Number(ev.features?.[0]?.properties?.id); if (id) onLoteRef.current(id); });
        m.on("mouseenter", "lotes-fill", () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", "lotes-fill", () => { m.getCanvas().style.cursor = ""; });
        if (entrada) {
          const el = document.createElement("div");
          el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none"><span style="background:#F28C28;color:#fff;font:700 11px system-ui;padding:2px 7px;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,.5)">${entrada.rotulo.replace(/[<>&]/g, "")}</span><span style="width:12px;height:12px;border-radius:999px;background:#F28C28;border:2px solid #fff"></span></div>`;
          marcador.current = new maplibre.Marker({ element: el, anchor: "bottom" }).setLngLat([entrada.lon, entrada.lat]).addTo(m);
        }
        pronto.current = true;
        // Pelas versões atuais (o mapa pode terminar de carregar depois que o cliente já avançou de passo)
        const f = funcs.current; f.atualizarLotes(); f.atualizarRota(); f.atualizarSol(); f.atualizarInteracao(); f.moverCamera();
        onPronto?.();
      };
      if (m.isStyleLoaded()) montar(); else m.once("style.load", montar);
    })();
    return () => { vivo = false; mapa.current?.remove(); mapa.current = null; pronto.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLoteRef = useRef(onLote);
  onLoteRef.current = onLote;

  const atualizarLotes = () => {
    const m = mapa.current;
    if (!m || !pronto.current) return;
    const src: any = m.getSource("lotes");
    src?.setData(fc(lotes.map(l => {
      const sel = l.id === selecionado;
      return {
        type: "Feature", properties: {
          id: l.id, cor: sel ? COR_SELECIONADO : COR_PASSEIO[l.situacao],
          opacidade: sel ? 0.75 : esmaecer ? 0.12 : l.situacao === "disponivel" ? 0.42 : 0.3,
          borda: sel ? "#FFFFFF" : esmaecer ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.85)", largura: sel ? 3 : 1,
        },
        geometry: { type: "Polygon", coordinates: [fechar(l.poligono)] },
      };
    })));
  };
  const atualizarRota = () => {
    const m = mapa.current;
    if (!m || !pronto.current) return;
    const src: any = m.getSource("rota");
    if (!rota || rota.length < 2 || desenharRota <= 0) { src?.setData(fc([])); return; }
    const n = Math.max(2, Math.round(rota.length * Math.min(1, desenharRota)));
    src?.setData(fc([{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: rota.slice(0, n) } }]));
  };
  const atualizarSol = () => {
    const m = mapa.current;
    if (!m || !pronto.current) return;
    const az = sol ? sol.azimute : 315;
    const alt = sol ? Math.max(0, sol.altura) : 45;
    m.setPaintProperty("sombra", "hillshade-illumination-direction", Math.round(az) % 360);
    // Sol baixo: sombra mais forte; perto do nascente/poente, luz mais quente e menos brilho
    m.setPaintProperty("sombra", "hillshade-exaggeration", sol ? Math.min(0.9, 0.3 + (1 - alt / 90) * 0.6) : 0.45);
    m.setPaintProperty("sombra", "hillshade-highlight-color", sol && alt < 20 ? "#FFC98A" : "#FFF3D6");
    m.setPaintProperty("satelite", "raster-brightness-max", sol ? 0.55 + Math.min(1, alt / 45) * 0.45 : 1);
  };
  const atualizarInteracao = () => {
    const m = mapa.current;
    if (!m) return;
    const h = [m.dragPan, m.scrollZoom, m.boxZoom, m.dragRotate, m.keyboard, m.doubleClickZoom, m.touchZoomRotate, m.touchPitch] as any[];
    // Pinça, giro e inclinação sempre liberados (como nos outros mapas); "livre" só esconde o painel
    h.forEach(x => x?.enable?.());
  };
  const moverCamera = () => {
    const m = mapa.current;
    if (!m || !pronto.current || !todos.length) return;
    const dur = reduzir ? 0 : 2600;
    // O painel do passeio ocupa até ~45% da altura: a câmera enquadra só a parte de cima
    const alt = m.getContainer().clientHeight || 700;
    const baixo = Math.round(alt * 0.46), cima = Math.min(80, Math.round(alt * 0.09));
    m.stop();
    if (camera.tipo === "rota" && rota && rota.length > 1) {
      m.fitBounds(caixaDe([...rota, ...(entrada ? [[entrada.lon, entrada.lat] as Pt] : [])]), { padding: { top: cima, bottom: baixo, left: 30, right: 30 }, pitch: 45, bearing: -10, duration: dur, essential: true });
      return;
    }
    if (camera.tipo === "lote" && camera.loteId) {
      const l = lotes.find(x => x.id === camera.loteId);
      if (l) { m.flyTo({ center: l.centro ?? centroDe(l.poligono), zoom: 16.8, pitch: 50, bearing: m.getBearing(), duration: dur, essential: true, padding: { top: cima, bottom: baixo, left: 0, right: 0 } }); return; }
    }
    m.fitBounds(caixaDe(todos), { padding: { top: cima, bottom: baixo, left: 30, right: 30 }, pitch: camera.tipo === "final" ? 40 : 62, bearing: camera.tipo === "final" ? 0 : -25, duration: dur, essential: true });
  };

  funcs.current = { atualizarLotes, atualizarRota, atualizarSol, atualizarInteracao, moverCamera };
  useEffect(atualizarLotes, [lotes, selecionado, esmaecer]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(atualizarRota, [rota, desenharRota]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(atualizarSol, [sol?.azimute, sol?.altura]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(atualizarInteracao, [livre]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(moverCamera, [camera.tipo, camera.loteId]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="absolute inset-0 [&_.maplibregl-ctrl-top-right]:top-[max(76px,calc(env(safe-area-inset-top)+64px))]"><div ref={caixa} className="h-full w-full" aria-label="Mapa do empreendimento em 3D" role="img" /></div>;
}
