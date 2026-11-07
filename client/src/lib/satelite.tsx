import { useEffect, useState } from "react";
import { Satellite } from "lucide-react";

/**
 * Vista de satélite dos mapas (Esri World Imagery, com crédito obrigatório na tela).
 * No mapa 3D vira uma camada raster do MapLibre; nos mapas 2D (SVG), as imagens vão por baixo dos lotes.
 */
export const SATELITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const SATELITE_CREDITO = "Imagem de satélite: Esri, Maxar, Earthstar Geographics";
const CHAVE = "mapa_satelite";

/** Liga/desliga o satélite; a escolha vale para todos os mapas deste aparelho */
export function useSatelite(): [boolean, (v: boolean) => void] {
  const [ligado, setLigado] = useState<boolean>(() => {
    try { return localStorage.getItem(CHAVE) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(CHAVE, ligado ? "1" : "0"); } catch { /* sem armazenamento: vale só nesta tela */ }
  }, [ligado]);
  return [ligado, setLigado];
}

const lonParaX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const latParaY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const xParaLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const yParaLat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

export type Limites = { minLon: number; minLat: number; maxLon: number; maxLat: number };

/** Tiles que cobrem a área (com uma margem), no maior zoom que não passe de `maxTiles` imagens */
export function tilesDaArea(l: Limites, maxTiles = 48): { url: string; oeste: number; leste: number; norte: number; sul: number }[] {
  const mLon = (l.maxLon - l.minLon) * 0.08, mLat = (l.maxLat - l.minLat) * 0.08;
  const a = { minLon: l.minLon - mLon, maxLon: l.maxLon + mLon, minLat: l.minLat - mLat, maxLat: l.maxLat + mLat };
  for (let z = 18; z >= 12; z--) {
    const x0 = lonParaX(a.minLon, z), x1 = lonParaX(a.maxLon, z), y0 = latParaY(a.maxLat, z), y1 = latParaY(a.minLat, z);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > maxTiles && z > 12) continue;
    const out = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      out.push({
        url: SATELITE_TILES.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)),
        oeste: xParaLon(x, z), leste: xParaLon(x + 1, z), norte: yParaLat(y, z), sul: yParaLat(y + 1, z),
      });
    }
    return out;
  }
  return [];
}

/** Imagens de satélite dentro de um mapa SVG (projeção lon/lat → pixels do próprio mapa) */
export function SateliteSvg({ limites, projetar }: { limites: Limites; projetar: (p: [number, number]) => [number, number] }) {
  return (
    <g pointerEvents="none" aria-hidden="true">
      {tilesDaArea(limites).map(t => {
        const [x0, y0] = projetar([t.oeste, t.norte]);
        const [x1, y1] = projetar([t.leste, t.sul]);
        // +0,6 px: sem frestas entre as imagens
        return <image key={t.url} href={t.url} x={x0} y={y0} width={x1 - x0 + 0.6} height={y1 - y0 + 0.6} preserveAspectRatio="none" />;
      })}
    </g>
  );
}

/** Botão "Satélite" (canto do mapa) + crédito da imagem quando ligado */
export function BotaoSatelite({ ligado, onChange, estilo }: { ligado: boolean; onChange: (v: boolean) => void; estilo?: React.CSSProperties }) {
  return (
    <button type="button" aria-pressed={ligado} onClick={() => onChange(!ligado)} title={ligado ? "Voltar ao mapa desenhado" : "Ver a foto de satélite"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--c-cfd8bf)",
        fontWeight: 700, fontSize: 12, cursor: "pointer", background: ligado ? "var(--c-0c3320)" : "var(--c-ffffff)", color: ligado ? "var(--c-ffffff)" : "var(--c-0c3320)",
        boxShadow: "0 2px 8px color-mix(in srgb, var(--c-000000) 18%, transparent)", ...estilo,
      }}>
      <Satellite size={14} /> Satélite
    </button>
  );
}

export function CreditoSatelite({ estilo }: { estilo?: React.CSSProperties }) {
  return <span style={{ fontSize: 10, color: "var(--c-ffffff)", textShadow: "0 0 3px var(--c-000000)", ...estilo }}>{SATELITE_CREDITO}</span>;
}
