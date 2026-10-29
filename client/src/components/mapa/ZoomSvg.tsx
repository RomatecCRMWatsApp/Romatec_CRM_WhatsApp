import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";

/**
 * SVG com zoom, arrasto e ROTAÇÃO confinados ao quadro do mapa (não mexe no zoom da página):
 * botões + / − / girar / enquadrar, bússola (toque = volta ao norte), roda do mouse (Shift + roda gira),
 * pinça com dois dedos (girar os dedos gira o mapa, como no Google Maps) e arrasto quando ampliado ou girado.
 * O conteúdo vai num <g> com translate + scale e, dentro, rotate em torno do centro; os rótulos (<text> sem
 * transform próprio) ficam sempre de pé. O clique nos lotes continua valendo, e um arrasto não vira clique.
 */
export type Vista = { s: number; tx: number; ty: number; /** graus, sentido horário */ r?: number };

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;
export const VISTA_INICIAL: Vista = { s: 1, tx: 0, ty: 0 };
/** Passo dos botões de girar */
export const PASSO_GIRO = 15;

const girado = (v: Vista) => Math.abs((((v.r ?? 0) % 360) + 360) % 360) > 0.5 && Math.abs((((v.r ?? 0) % 360) + 360) % 360 - 360) > 0.5;

/** Menor zoom: inteiro sem girar; girado, cabe o desenho inteiro no quadro */
export function zoomMinimo(r: number, W: number, H: number): number {
  const a = (r * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  if (s < 1e-3) return ZOOM_MIN;
  return Math.min(ZOOM_MIN, W / (W * c + H * s), H / (W * s + H * c));
}

/**
 * Sem girar: o desenho cobre o quadro (sem borda vazia ao arrastar). Girado: o centro do desenho fica dentro
 * do quadro (os cantos do mapa girado sempre deixam algum vazio, como no Google Maps).
 */
export function limitar(v: Vista, W: number, H: number): Vista {
  const r = v.r ?? 0;
  const s = Math.min(ZOOM_MAX, Math.max(zoomMinimo(r, W, H), v.s));
  if (!girado(v)) {
    const lim = (t: number, tam: number) => Math.min(0, Math.max(tam - tam * s, t));
    // Norte para cima: a vista fica sem o campo de giro
    return Math.abs(r) < 1e-9 ? { s, tx: lim(v.tx, W), ty: lim(v.ty, H) } : { s, tx: lim(v.tx, W), ty: lim(v.ty, H), r };
  }
  const lim = (t: number, tam: number) => Math.min(tam - (tam * s) / 2, Math.max(-(tam * s) / 2, t));
  return { s, tx: lim(v.tx, W), ty: lim(v.ty, H), r };
}

/** Zoom por `fator` mantendo parado o ponto (x, y) do quadro (coordenadas do viewBox) */
export function ampliarEm(v: Vista, fator: number, x: number, y: number, W: number, H: number): Vista {
  const s = Math.min(ZOOM_MAX, Math.max(zoomMinimo(v.r ?? 0, W, H), v.s * fator));
  const k = s / v.s;
  return limitar({ s, tx: x - (x - v.tx) * k, ty: y - (y - v.ty) * k, r: v.r ?? 0 }, W, H);
}

/**
 * Gira `graus` mantendo parado o ponto (x, y) do quadro. O <g> interno gira em torno do centro C do desenho;
 * ponto de tela m = s·(R(q−C)+C)+t ⇒ t' = m − s·(Rd·((m−t)/s − C) + C).
 */
export function girarEm(v: Vista, graus: number, x: number, y: number, W: number, H: number): Vista {
  const a = (graus * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const cx = W / 2, cy = H / 2;
  const ux = (x - v.tx) / v.s - cx, uy = (y - v.ty) / v.s - cy;
  const rx = cos * ux - sin * uy, ry = sin * ux + cos * uy;
  let r = ((v.r ?? 0) + graus) % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return limitar({ s: v.s, tx: x - v.s * (rx + cx), ty: y - v.s * (ry + cy), r }, W, H);
}

const ARRASTO_MIN_PX = 5;
/** Giro dos dedos abaixo disso é ruído da pinça (não gira o mapa) */
const GIRO_MIN_GRAUS = 4;

const botao: React.CSSProperties = {
  width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(255,255,255,0.95)", color: "#0C3320", border: "1px solid rgba(12,51,32,0.25)", cursor: "pointer", padding: 0,
};

/** Bússola: a agulha vermelha aponta o norte do mapa; toque volta o mapa ao norte */
function Bussola({ r, onNorte }: { r: number; onNorte: () => void }) {
  return (
    <button type="button" onClick={onNorte} aria-label={`Mapa girado ${Math.round(r)} graus. Tocar para voltar ao norte`} title="Voltar ao norte"
      style={{ ...botao, width: 40, height: 40, borderRadius: 999, boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
      <svg width={30} height={30} viewBox="-15 -15 30 30" aria-hidden="true" style={{ transform: `rotate(${r}deg)`, transition: "transform 80ms linear" }}>
        <polygon points="0,-12 4,0 -4,0" fill="#C0392B" />
        <polygon points="0,12 4,0 -4,0" fill="#9AA3AB" />
        <text x={0} y={-12.5} textAnchor="middle" fontSize={6} fontWeight={800} fill="#0C3320" dominantBaseline="text-after-edge">N</text>
      </svg>
    </button>
  );
}

export default function ZoomSvg({ W, H, rotulo, children, fundo }: {
  W: number; H: number; rotulo: string; children: ReactNode;
  /** Cor de fundo do quadro (aparece só enquanto o desenho carrega) */
  fundo?: string;
}) {
  const [vista, setVistaEstado] = useState<Vista>(VISTA_INICIAL);
  const quadro = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const conteudo = useRef<SVGGElement>(null);
  // Atualizada na hora: vários eventos de toque chegam antes do próximo render
  const vistaRef = useRef(vista);
  const setVista = useCallback((v: Vista) => { vistaRef.current = v; setVistaEstado(v); }, []);
  const dedos = useRef(new Map<number, { x: number; y: number }>());
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const arrastou = useRef(false);
  // Giro da pinça só começa depois de passar do limiar (zoom puro não gira sem querer)
  const giroLiberado = useRef(false);
  const giroAcumulado = useRef(0);

  /** Pixels da tela → unidades do viewBox (o SVG ocupa a largura toda, sem distorção) */
  const paraViewBox = useCallback((clientX: number, clientY: number) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H, k: W / r.width };
  }, [W, H]);

  // Rótulos de pé: cada <text> sem transform próprio gira ao contrário em volta do próprio ponto
  useLayoutEffect(() => {
    const g = conteudo.current;
    if (!g) return;
    const r = vista.r ?? 0;
    g.querySelectorAll("text").forEach(t => {
      if (t.hasAttribute("transform") && !t.hasAttribute("data-zoomsvg")) return; // rótulo alinhado à rua: gira com o mapa
      if (Math.abs(r) < 0.5) { t.removeAttribute("transform"); t.removeAttribute("data-zoomsvg"); return; }
      const x = t.getAttribute("x") ?? "0", y = t.getAttribute("y") ?? "0";
      t.setAttribute("data-zoomsvg", "1");
      t.setAttribute("transform", `rotate(${-r} ${x} ${y})`);
    });
  });

  // Roda do mouse: zoom; Shift + roda: gira. Listener nativo (o onWheel do React é passivo e não deixa cancelar a rolagem)
  useEffect(() => {
    const el = quadro.current;
    if (!el) return;
    const roda = (e: WheelEvent) => {
      const v = vistaRef.current;
      const p = paraViewBox(e.clientX, e.clientY);
      if (e.shiftKey) {
        e.preventDefault();
        const delta = (e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 2 : 0.15);
        setVista(girarEm(v, delta, p.x, p.y, W, H));
        return;
      }
      const fator = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      // Sem zoom, sem giro e afastando: deixa a página rolar normalmente
      if (fator < 1 && v.s <= ZOOM_MIN && !girado(v)) return;
      e.preventDefault();
      setVista(ampliarEm(v, fator, p.x, p.y, W, H));
    };
    el.addEventListener("wheel", roda, { passive: false });
    return () => el.removeEventListener("wheel", roda);
  }, [paraViewBox, setVista, W, H]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dedos.current.size === 1) { inicio.current = { x: e.clientX, y: e.clientY }; arrastou.current = false; }
    if (dedos.current.size === 2) { giroLiberado.current = false; giroAcumulado.current = 0; }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const antes = dedos.current.get(e.pointerId);
    if (!antes) return;
    const agora = { x: e.clientX, y: e.clientY };
    if (dedos.current.size >= 2) {
      // Pinça: escala pela distância, gira pelo ângulo entre os dedos e arrasta pelo ponto médio
      const [a, b] = Array.from(dedos.current.entries()).map(([id, p]) => (id === e.pointerId ? agora : p));
      const [a0, b0] = Array.from(dedos.current.values());
      const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y) || 1, d1 = Math.hypot(a.x - b.x, a.y - b.y);
      const m0 = paraViewBox((a0.x + b0.x) / 2, (a0.y + b0.y) / 2), m1 = paraViewBox((a.x + b.x) / 2, (a.y + b.y) / 2);
      let dAng = (Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x)) * (180 / Math.PI);
      if (dAng > 180) dAng -= 360;
      if (dAng < -180) dAng += 360;
      let v = ampliarEm(vistaRef.current, d1 / d0, m0.x, m0.y, W, H);
      if (!giroLiberado.current) {
        giroAcumulado.current += dAng;
        if (Math.abs(giroAcumulado.current) >= GIRO_MIN_GRAUS) { giroLiberado.current = true; dAng = giroAcumulado.current; }
      }
      if (giroLiberado.current) v = girarEm(v, dAng, m0.x, m0.y, W, H);
      setVista(limitar({ ...v, tx: v.tx + (m1.x - m0.x), ty: v.ty + (m1.y - m0.y) }, W, H));
      arrastou.current = true;
    } else if ((vistaRef.current.s > ZOOM_MIN || girado(vistaRef.current)) && inicio.current) {
      if (!arrastou.current && Math.hypot(agora.x - inicio.current.x, agora.y - inicio.current.y) < ARRASTO_MIN_PX) return;
      if (!arrastou.current) {
        arrastou.current = true;
        // Só captura depois que virou arrasto: um toque simples ainda chega ao lote como clique
        quadro.current?.setPointerCapture?.(e.pointerId);
      }
      const k = paraViewBox(0, 0).k;
      const v = vistaRef.current;
      setVista(limitar({ ...v, tx: v.tx + (agora.x - antes.x) * k, ty: v.ty + (agora.y - antes.y) * k }, W, H));
    }
    dedos.current.set(e.pointerId, agora);
  };

  const soltar = (e: React.PointerEvent) => {
    dedos.current.delete(e.pointerId);
    if (!dedos.current.size) inicio.current = null;
  };

  const porBotao = (fator: number) => setVista(ampliarEm(vistaRef.current, fator, W / 2, H / 2, W, H));
  const girarBotao = (graus: number) => setVista(girarEm(vistaRef.current, graus, W / 2, H / 2, W, H));
  const r = vista.r ?? 0;
  const rodado = girado(vista);
  const ativo = vista.s > ZOOM_MIN + 1e-3 || rodado;

  return (
    <div ref={quadro} style={{ position: "relative", overflow: "hidden", background: fundo, touchAction: ativo ? "none" : "pan-x pan-y", userSelect: "none" }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={soltar} onPointerCancel={soltar}
      // Arrasto/pinça não conta como clique no lote
      onClickCapture={e => { if (arrastou.current) { e.stopPropagation(); e.preventDefault(); arrastou.current = false; } }}>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={rotulo}
        style={{ display: "block", width: "100%", height: "auto", cursor: ativo ? "grab" : undefined }}>
        <g ref={conteudo} transform={`translate(${vista.tx} ${vista.ty}) scale(${vista.s})${rodado ? ` rotate(${r} ${W / 2} ${H / 2})` : ""}`}>{children}</g>
      </svg>
      <div style={{ position: "absolute", right: 10, top: 10 }} onPointerDown={e => e.stopPropagation()}>
        <Bussola r={r} onNorte={() => setVista(girarEm(vistaRef.current, -r, W / 2, H / 2, W, H))} />
      </div>
      <div style={{ position: "absolute", right: 10, bottom: 10, display: "flex", flexDirection: "column", borderRadius: 10, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
        onPointerDown={e => e.stopPropagation()}>
        <button type="button" style={botao} aria-label="Ampliar o mapa" title="Ampliar" disabled={vista.s >= ZOOM_MAX} onClick={() => porBotao(1.6)}><ZoomIn size={18} /></button>
        <button type="button" style={{ ...botao, borderTop: 0 }} aria-label="Reduzir o mapa" title="Reduzir" disabled={vista.s <= zoomMinimo(r, W, H) + 1e-3} onClick={() => porBotao(1 / 1.6)}><ZoomOut size={18} /></button>
        <button type="button" style={{ ...botao, borderTop: 0 }} aria-label="Girar o mapa para a esquerda" title="Girar para a esquerda (ou Shift + roda do mouse)" onClick={() => girarBotao(-PASSO_GIRO)}><RotateCcw size={17} /></button>
        <button type="button" style={{ ...botao, borderTop: 0 }} aria-label="Girar o mapa para a direita" title="Girar para a direita (ou dois dedos girando)" onClick={() => girarBotao(PASSO_GIRO)}><RotateCw size={17} /></button>
        <button type="button" style={{ ...botao, borderTop: 0, opacity: ativo ? 1 : 0.55 }} aria-label="Voltar ao mapa inteiro" title="Mapa inteiro (norte para cima)" disabled={!ativo} onClick={() => setVista(VISTA_INICIAL)}><Maximize2 size={16} /></button>
      </div>
    </div>
  );
}
