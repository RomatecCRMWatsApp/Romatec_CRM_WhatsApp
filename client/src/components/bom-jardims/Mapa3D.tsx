import { useEffect, useMemo, useRef, useState } from "react";
import { Compass, Loader2, Mountain, Rotate3d, SlidersHorizontal } from "lucide-react";
import type { Map as MapLibre, StyleSpecification } from "maplibre-gl";
import { STATUS_COR, STATUS_LABEL, type LoteInfo, type MapaData } from "./LoteMap";
import { BotaoSatelite, SATELITE_CREDITO, SATELITE_TILES, useSatelite } from "@/lib/satelite";
import { BotaoTelaCheia, estiloTelaCheia, useTelaCheia } from "@/lib/telaCheia";

/**
 * Mapa 3D do Bom Jardims (MapLibre GL): relevo real do terreno (dados abertos de elevação da AWS/Mapzen), as chácaras
 * em blocos coloridos pela situação ao vivo, ruas, córrego, APP e área de vivência — tudo das coordenadas
 * georreferenciadas de /bom-jardims/mapa.json. Dois dedos giram e inclinam; um toque escolhe a chácara.
 * O "chão" é o ortomosaico do drone quando houver (VITE_MAPA_ORTOFOTO: URL de tiles {z}/{x}/{y}). Vistas: Plano (abre
 * assim, inclinado e sem relevo), Alto relevo (terreno realçado) e Vista de cima (planta, sem inclinação); Satélite liga a foto
 * de satélite por baixo em qualquer vista (inclusive com o relevo). Fora do Bom Jardims (ou no sistema) as cores vêm de `corDoLote` (situação interna).
 */

type Pt = [number, number];
const ORTOFOTO = (import.meta.env.VITE_MAPA_ORTOFOTO as string | undefined) || "";
const ALTURA = 0.3;        // chácaras rentes ao chão…
const ALTURA_SEL = 14;     // …só a escolhida sobe
const ALTURA_RELEVO = 4;   // com o relevo ligado, um pouco acima do terreno
const COR_SEL = "#1E3A8A";

const fechar = (p: Pt[]) => (p.length && (p[0][0] !== p[p.length - 1][0] || p[0][1] !== p[p.length - 1][1]) ? [...p, p[0]] : p);
const poly = (p: Pt[], props: Record<string, unknown> = {}) => ({ type: "Feature" as const, properties: props, geometry: { type: "Polygon" as const, coordinates: [fechar(p)] } });
const linha = (p: Pt[], props: Record<string, unknown> = {}) => ({ type: "Feature" as const, properties: props, geometry: { type: "LineString" as const, coordinates: p } });
const fc = (features: any[]) => ({ type: "FeatureCollection" as const, features });
const centro = (p: Pt[]): Pt => { const q = p.slice(0, -1).length ? p.slice(0, -1) : p; return [q.reduce((s, x) => s + x[0], 0) / q.length, q.reduce((s, x) => s + x[1], 0) / q.length]; };

export function webglDisponivel(): boolean {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

function estilo(): StyleSpecification {
  return {
    version: 8,
    sources: {
      relevo: { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], encoding: "terrarium", tileSize: 256, maxzoom: 15, attribution: "Relevo: Mapzen/AWS Terrain Tiles" },
      ...(ORTOFOTO ? { orto: { type: "raster" as const, tiles: [ORTOFOTO], tileSize: 256, maxzoom: 21, attribution: "Imagem: drone Romatec" } } : {}),
      satelite: { type: "raster", tiles: [SATELITE_TILES], tileSize: 256, maxzoom: 18, attribution: SATELITE_CREDITO },
    },
    layers: [
      { id: "fundo", type: "background", paint: { "background-color": "#C9D9AE" } },
      { id: "satelite", type: "raster", source: "satelite", layout: { visibility: "none" } },
      ...(ORTOFOTO ? [{ id: "orto", type: "raster" as const, source: "orto" }] : [{ id: "sombra", type: "hillshade" as const, source: "relevo", layout: { visibility: "none" as const }, paint: { "hillshade-shadow-color": "#5F7A45", "hillshade-highlight-color": "#EEF3E1", "hillshade-exaggeration": 0.6 } }]),
    ],
  } as StyleSpecification;
}

export default function Mapa3D({ lotes, selected, onSelect, dados, destaque, altura = 520, corDoLote, legenda, semBuscador }: {
  lotes: LoteInfo[]; selected?: string; onSelect: (codigo: string) => void; dados?: MapaData; destaque?: boolean; altura?: number | string;
  /** Cor de cada chácara (situação interna do sistema); sem isso, a situação pública */
  corDoLote?: (codigo: string) => string | null;
  /** Legenda própria (sistema); sem isso, a pública */
  legenda?: { cor: string; rotulo: string }[];
  semBuscador?: boolean;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapLibre | null>(null);
  const rotulos = useRef<any[]>([]);
  const limites = useRef<[[number, number], [number, number]] | null>(null);
  const [data, setData] = useState<MapaData | null>(dados ?? null);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState(false);
  const [girando, setGirando] = useState(false);
  const [filtro, setFiltro] = useState({ aberto: false, soLivres: false, areaMin: 0 });
  const [vista, setVista] = useState<"plano" | "relevo" | "cima">("plano");
  const [satelite, setSatelite] = useSatelite();
  const tela = useTelaCheia();
  const relevo = vista === "relevo";
  const byCodigo = useMemo(() => new Map(lotes.map(l => [l.codigo, l])), [lotes]);

  useEffect(() => {
    if (dados) return;
    fetch("/bom-jardims/mapa.json").then(r => (r.ok ? r.json() : Promise.reject())).then(setData).catch(() => setErro(true));
  }, [dados]);

  /** GeoJSON das chácaras com a cor da situação e o filtro do buscador */
  const geoLotes = useMemo(() => fc((data?.lotes ?? []).map(l => {
    const info = byCodigo.get(l.codigo);
    const status = info?.status ?? (l.comercializavel ? "disponivel" : "nao_comercializavel");
    const passa = (!filtro.soLivres || status === "disponivel") && (!filtro.areaMin || (l.areaM2 ?? 0) >= filtro.areaMin);
    const sel = l.codigo === selected;
    return poly(l.poly as Pt[], {
      codigo: l.codigo, cor: sel ? COR_SEL : corDoLote?.(l.codigo) ?? STATUS_COR[status], altura: sel ? ALTURA_SEL : relevo ? ALTURA_RELEVO : ALTURA, opacidade: passa || sel ? 0.92 : 0.18,
    });
  })), [data, byCodigo, selected, filtro.soLivres, filtro.areaMin, corDoLote, relevo]);

  // Cria o mapa uma vez (MapLibre carregado só aqui: não pesa nas outras páginas)
  useEffect(() => {
    if (!data || !caixa.current || mapa.current) return;
    let vivo = true;
    (async () => {
      const maplibre = (await import("maplibre-gl")).default;
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (!vivo || !caixa.current) return;
      const per = data.perimetro as Pt[];
      const lons = per.map(p => p[0]), lats = per.map(p => p[1]);
      limites.current = [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
      const m = new maplibre.Map({
        container: caixa.current, style: estilo(), pitch: 58, bearing: -28, maxPitch: 78, attributionControl: { compact: true },
        bounds: [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], fitBoundsOptions: { padding: 30 },
      });
      mapa.current = m;
      m.addControl(new maplibre.NavigationControl({ visualizePitch: true }), "top-right");
      m.on("error", () => { /* tile de relevo falhou: o mapa segue sem relevo */ });
      m.on("load", () => {
        if (!vivo) return;
        m.addSource("perimetro", { type: "geojson", data: fc([poly(per)]) });
        m.addLayer({ id: "perimetro-fill", type: "fill", source: "perimetro", paint: { "fill-color": "#DCE8C4", "fill-opacity": ORTOFOTO ? 0 : 0.55 } });
        m.addLayer({ id: "perimetro-linha", type: "line", source: "perimetro", paint: { "line-color": "#0C3320", "line-width": 2, "line-dasharray": [3, 2] } });
        if (data.app) { m.addSource("app", { type: "geojson", data: fc([poly(data.app.poly as Pt[])]) }); m.addLayer({ id: "app", type: "fill", source: "app", paint: { "fill-color": "#2F6B2A", "fill-opacity": 0.45 } }); }
        const adm = (data.areas ?? []).filter(a => /administrativ/i.test(a.nome));
        if (adm.length) { m.addSource("adm", { type: "geojson", data: fc(adm.map(a => poly(a.poly as Pt[]))) }); m.addLayer({ id: "adm", type: "fill", source: "adm", paint: { "fill-color": "#E3CF9F", "fill-opacity": 0.85 } }); }
        const areas = [...(data.areas ?? []).filter(a => !/administrativ/i.test(a.nome)), ...(((data as any).areasComuns ?? []) as any[])];
        if (areas.length) { m.addSource("areas", { type: "geojson", data: fc(areas.map(a => poly(a.poly as Pt[]))) }); m.addLayer({ id: "areas", type: "fill", source: "areas", paint: { "fill-color": "#7FB069", "fill-opacity": 0.6 } }); }
        m.addSource("ruas", { type: "geojson", data: fc(data.ruas.map(r => linha(r.line as Pt[]))) });
        m.addLayer({ id: "ruas", type: "line", source: "ruas", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#E9E2CF", "line-width": ["interpolate", ["linear"], ["zoom"], 14, 2, 18, 12] } });
        if (data.rio) { m.addSource("rio", { type: "geojson", data: fc([linha(data.rio.line as Pt[])]) }); m.addLayer({ id: "rio", type: "line", source: "rio", paint: { "line-color": "#3B8FD9", "line-width": ["interpolate", ["linear"], ["zoom"], 14, 2, 18, 8] } }); }
        if (data.trilha) { m.addSource("trilha", { type: "geojson", data: fc([linha(data.trilha.line as Pt[])]) }); m.addLayer({ id: "trilha", type: "line", source: "trilha", paint: { "line-color": "#8A5A2B", "line-width": 2, "line-dasharray": [1.5, 1.5] } }); }
        m.addSource("lotes", { type: "geojson", data: geoLotes as any });
        m.addLayer({ id: "lotes", type: "fill-extrusion", source: "lotes", paint: {
          "fill-extrusion-color": ["get", "cor"], "fill-extrusion-height": ["get", "altura"], "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.9,
        } });
        m.addLayer({ id: "lotes-borda", type: "line", source: "lotes", paint: { "line-color": "#0C3320", "line-width": 0.8, "line-opacity": ["get", "opacidade"] } });
        // Códigos das chácaras (marcadores HTML: não dependem de fontes externas)
        rotulos.current = data.lotes.map(l => {
          const el = document.createElement("div");
          el.textContent = l.codigo;
          el.style.cssText = "font:700 10px Lato,Arial,sans-serif;color:#0C3320;text-shadow:0 0 3px #fff,0 0 3px #fff;pointer-events:none;";
          return new maplibre.Marker({ element: el }).setLngLat(centro(l.poly as Pt[])).addTo(m);
        });
        const mostrarRotulos = () => { const z = m.getZoom(); rotulos.current.forEach(r => { r.getElement().style.display = z >= 16.3 ? "block" : "none"; }); };
        m.on("zoom", mostrarRotulos); mostrarRotulos();
        m.on("click", "lotes", e => { const c = e.features?.[0]?.properties?.codigo; if (c) onSelect(String(c)); });
        m.on("mouseenter", "lotes", () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", "lotes", () => { m.getCanvas().style.cursor = ""; });
        setPronto(true);
      });
    })().catch(() => setErro(true));
    return () => { vivo = false; rotulos.current.forEach(r => r.remove()); mapa.current?.remove(); mapa.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Situação/filtro/seleção mudaram: atualiza só os dados das chácaras
  useEffect(() => {
    const src: any = pronto ? mapa.current?.getSource("lotes") : null;
    src?.setData(geoLotes);
  }, [geoLotes, pronto]);

  // Chácara escolhida: voa até ela (página da chácara já abre nela)
  useEffect(() => {
    const m = mapa.current;
    const l = data?.lotes.find(x => x.codigo === selected);
    if (!pronto || !m || !l) return;
    m.easeTo({ center: centro(l.poly as Pt[]), zoom: destaque ? 17.6 : Math.max(m.getZoom(), 17), pitch: vista === "cima" ? 0 : 60, duration: 900 });
  }, [selected, pronto, data, destaque]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vista: plano (inclinado, sem relevo), alto relevo (terreno realçado) ou de cima (planta)
  const primeira = useRef(true);
  useEffect(() => {
    const m = mapa.current;
    if (!pronto || !m) return;
    m.setTerrain(relevo ? { source: "relevo", exaggeration: 2 } : null);
    if (m.getLayer("sombra")) m.setLayoutProperty("sombra", "visibility", relevo ? "visible" : "none");
    if (primeira.current) { primeira.current = false; return; }
    // Reenquadra o empreendimento na nova inclinação (com o relevo ligado o centro muda de altura)
    const pitch = vista === "cima" ? 0 : relevo ? 62 : 58;
    const bearing = vista === "cima" ? 0 : m.getBearing();
    // Centro no meio do empreendimento: com o relevo, a câmera mira o chão nessa altura (fitBounds ignora a elevação)
    const b = limites.current;
    const centroEmp: [number, number] | undefined = b ? [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2] : undefined;
    const zoom = b ? m.cameraForBounds(b, { padding: 30, bearing })?.zoom : undefined;
    m.easeTo({ center: centroEmp, zoom: zoom != null ? zoom - (vista === "cima" ? 0 : 0.2) : undefined, pitch, bearing, duration: 800 });
  }, [vista, relevo, pronto]);

  // Satélite: foto por baixo; o desenho fica translúcido para o terreno aparecer
  useEffect(() => {
    const m = mapa.current;
    if (!pronto || !m) return;
    m.setLayoutProperty("satelite", "visibility", satelite ? "visible" : "none");
    if (m.getLayer("perimetro-fill")) m.setPaintProperty("perimetro-fill", "fill-opacity", satelite || ORTOFOTO ? 0 : 0.55);
    if (m.getLayer("areas")) m.setPaintProperty("areas", "fill-opacity", satelite ? 0.25 : 0.6);
    if (m.getLayer("app")) m.setPaintProperty("app", "fill-opacity", satelite ? 0.2 : 0.45);
    if (m.getLayer("ruas")) m.setPaintProperty("ruas", "line-opacity", satelite ? 0.55 : 1);
    m.setPaintProperty("lotes", "fill-extrusion-opacity", satelite ? 0.55 : 0.9);
    if (m.getLayer("perimetro-linha")) m.setPaintProperty("perimetro-linha", "line-color", satelite ? "#F2C04B" : "#0C3320");
    if (m.getLayer("lotes-borda")) m.setPaintProperty("lotes-borda", "line-color", satelite ? "#FFFFFF" : "#0C3320");
  }, [satelite, pronto]);

  // Tela cheia: o mapa refaz o quadro no tamanho novo (a tela cheia do navegador muda o tamanho um pouco depois)
  useEffect(() => {
    if (!pronto) return;
    const ajustar = () => mapa.current?.resize();
    // Depois de ajustar, reenquadra o empreendimento no quadro novo (maior na tela cheia, menor ao voltar)
    const reenquadrar = () => {
      const m = mapa.current, lim = limites.current;
      ajustar();
      if (m && lim) m.fitBounds(lim, { padding: 40, pitch: m.getPitch(), bearing: m.getBearing(), duration: 600 });
    };
    const id = requestAnimationFrame(ajustar);
    const t = window.setTimeout(reenquadrar, 350);
    return () => { cancelAnimationFrame(id); window.clearTimeout(t); };
  }, [tela.cheia]); // eslint-disable-line react-hooks/exhaustive-deps

  // Giro automático (vitrine do stand)
  useEffect(() => {
    if (!girando || !pronto) return;
    let id = 0;
    const passo = () => { const m = mapa.current; if (m) m.setBearing(m.getBearing() + 0.15); id = requestAnimationFrame(passo); };
    id = requestAnimationFrame(passo);
    const parar = () => setGirando(false);
    mapa.current?.once("mousedown", parar); mapa.current?.once("touchstart", parar);
    return () => cancelAnimationFrame(id);
  }, [girando, pronto]);

  const sel = selected ? byCodigo.get(selected) : undefined;
  const livres = lotes.filter(l => l.status === "disponivel").length;
  const botao: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, border: "1px solid #CFD8BF", background: "#fff", color: "#0C3320", fontWeight: 700, fontSize: 13, cursor: "pointer" };
  if (erro) return <p style={{ color: "var(--c-0c3320)" }}>Não foi possível abrir o mapa 3D agora.</p>;
  return (
    <div>
      <div className="mapa3d-quadro" style={{ position: "relative", height: altura, minHeight: 360, borderRadius: 16, overflow: "hidden", border: "1px solid var(--c-cfd8bf)", background: "var(--c-c9d9ae)", ...(tela.cheia ? estiloTelaCheia : {}) }}>
        <style>{".mapa3d-quadro .maplibregl-ctrl-top-right{top:50px}"}</style>
        <div style={{ position: "absolute", inset: tela.cheia ? "env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0" : 0 }}><div ref={caixa} style={{ position: "absolute", inset: 0 }} /></div>
        {pronto && <div style={{ position: "absolute", right: 10, top: tela.cheia ? "calc(env(safe-area-inset-top) + 10px)" : 10, zIndex: 2 }}><BotaoTelaCheia cheia={tela.cheia} onClick={tela.alternar} /></div>}
        {!pronto && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--c-0c3320)", gap: 8 }}><Loader2 className="h-5 w-5 animate-spin" /> Carregando o mapa 3D…</div>}
        {pronto && !destaque && (
          <div style={{ position: "absolute", left: 10, top: 10, display: "flex", gap: 6, flexWrap: "wrap", maxWidth: "calc(100% - 70px)" }}>
            {!semBuscador && <button type="button" style={botao} onClick={() => setFiltro(f => ({ ...f, aberto: !f.aberto }))}><SlidersHorizontal size={15} /> Buscar chácaras</button>}

            <button type="button" style={botao} onClick={() => setGirando(g => !g)}><Rotate3d size={15} /> {girando ? "Parar" : "Girar"}</button>
            <div role="group" aria-label="Vista do mapa" style={{ display: "inline-flex", borderRadius: 10, border: "1px solid var(--c-cfd8bf)", overflow: "hidden", background: "var(--c-ffffff)" }}>
              {([["plano", "Plano", Rotate3d], ["relevo", "Alto relevo", Mountain], ["cima", "Vista de cima", Compass]] as const).map(([k, r, Icone]) => (
                <button key={k} type="button" aria-pressed={vista === k} onClick={() => setVista(k)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 10px", border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer", background: vista === k ? "var(--c-0c3320)" : "transparent", color: vista === k ? "var(--c-ffffff)" : "var(--c-0c3320)" }}>
                  <Icone size={14} /> {r}
                </button>
              ))}
            </div>
            <BotaoSatelite ligado={satelite} onChange={setSatelite} estilo={{ boxShadow: "none" }} />
          </div>
        )}
        {pronto && destaque && <div style={{ position: "absolute", left: 10, top: 10 }}><BotaoSatelite ligado={satelite} onChange={setSatelite} /></div>}
        {filtro.aberto && (
          <div style={{ position: "absolute", left: 10, top: 56, width: 250, padding: 12, borderRadius: 12, background: "color-mix(in srgb, var(--c-ffffff) 96%, transparent)", color: "var(--c-23352a)", fontSize: 13, boxShadow: "0 6px 20px var(--c-00000033)" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <input type="checkbox" checked={filtro.soLivres} onChange={e => setFiltro(f => ({ ...f, soLivres: e.target.checked }))} /> Só disponíveis ({livres})
            </label>
            <label style={{ display: "block" }}>Área mínima: <b>{filtro.areaMin ? `${filtro.areaMin.toLocaleString("pt-BR")} m²` : "qualquer"}</b>
              <input type="range" min={0} max={6000} step={250} value={filtro.areaMin} onChange={e => setFiltro(f => ({ ...f, areaMin: Number(e.target.value) }))} style={{ width: "100%", accentColor: "var(--c-0c3320)" }} />
            </label>
          </div>
        )}
        {pronto && tela.cheia && (
          <div style={{ position: "absolute", left: 10, bottom: "calc(env(safe-area-inset-bottom) + 28px)", display: "flex", flexWrap: "wrap", gap: 10, maxWidth: "calc(100% - 20px)", padding: "6px 10px", borderRadius: 10, fontSize: 12, color: "var(--c-0c3320)", background: "color-mix(in srgb, var(--c-ffffff) 88%, transparent)" }}>
            {sel && <b>Chácara {sel.codigo}</b>}
            {(legenda ?? (["disponivel", "reservado", "em_negociacao", "vendido"] as const).map(s => ({ cor: STATUS_COR[s], rotulo: STATUS_LABEL[s] }))).map(x => (
              <span key={x.rotulo} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: x.cor }} />{x.rotulo}</span>
            ))}
          </div>
        )}
        {pronto && <p style={{ position: "absolute", left: 10, bottom: tela.cheia ? "calc(env(safe-area-inset-bottom) + 8px)" : 8, margin: 0, fontSize: 11, color: "var(--c-0c3320)", textShadow: "0 0 3px var(--c-ffffff)" }}>Dois dedos giram e inclinam · toque numa chácara</p>}
      </div>
      {!destaque && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10, fontSize: 13 }}>
          {(legenda ?? (["disponivel", "reservado", "em_negociacao", "vendido"] as const).map(s => ({ cor: STATUS_COR[s], rotulo: STATUS_LABEL[s] }))).map(x => (
            <span key={x.rotulo} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 3, background: x.cor }} />{x.rotulo}</span>
          ))}
        </div>
      )}
      {sel && !destaque && !corDoLote && (
        <p style={{ marginTop: 8, fontSize: 14 }}><b>Chácara {sel.codigo}</b>{sel.areaM2 ? ` · ${sel.areaM2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²` : ""} · {STATUS_LABEL[sel.status]} · <a href={`/bom-jardims/chacara/${sel.codigo}`} style={{ color: "var(--c-0c3320)", fontWeight: 700 }}>ver detalhes</a></p>
      )}
    </div>
  );
}
