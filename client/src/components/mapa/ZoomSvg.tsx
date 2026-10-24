import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";

/**
 * SVG com zoom e arrasto confinados ao quadro do mapa (não mexe no zoom da página):
 * botões + / − / enquadrar, roda do mouse, pinça com dois dedos e arrasto quando ampliado.
 * O conteúdo vai num <g> com translate + scale; o clique nos lotes continua valendo em
 * qualquer zoom, e um arrasto não vira clique.
 */
export type Vista = { s: number; tx: number; ty: number };

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;
export const VISTA_INICIAL: Vista = { s: 1, tx: 0, ty: 0 };

/** Mantém o desenho cobrindo o quadro: sem sobrar borda vazia ao arrastar */
export function limitar(v: Vista, W: number, H: number): Vista {
  const s = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.s));
  const lim = (t: number, tam: number) => Math.min(0, Math.max(tam - tam * s, t));
  return { s, tx: lim(v.tx, W), ty: lim(v.ty, H) };
}

/** Zoom por `fator` mantendo parado o ponto (x, y) do quadro (coordenadas do viewBox) */
export function ampliarEm(v: Vista, fator: number, x: number, y: number, W: number, H: number): Vista {
  const s = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.s * fator));
  const r = s / v.s;
  return limitar({ s, tx: x - (x - v.tx) * r, ty: y - (y - v.ty) * r }, W, H);
}

const ARRASTO_MIN_PX = 5;

const botao: React.CSSProperties = {
  width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(255,255,255,0.95)", color: "#0C3320", border: "1px solid rgba(12,51,32,0.25)", cursor: "pointer", padding: 0,
};

export default function ZoomSvg({ W, H, rotulo, children, fundo }: {
  W: number; H: number; rotulo: string; children: ReactNode;
  /** Cor de fundo do quadro (aparece só enquanto o desenho carrega) */
  fundo?: string;
}) {
  const [vista, setVistaEstado] = useState<Vista>(VISTA_INICIAL);
  const quadro = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  // Atualizada na hora: vários eventos de toque chegam antes do próximo render
  const vistaRef = useRef(vista);
  const setVista = useCallback((v: Vista) => { vistaRef.current = v; setVistaEstado(v); }, []);
  const dedos = useRef(new Map<number, { x: number; y: number }>());
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const arrastou = useRef(false);

  /** Pixels da tela → unidades do viewBox (o SVG ocupa a largura toda, sem distorção) */
  const paraViewBox = useCallback((clientX: number, clientY: number) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H, k: W / r.width };
  }, [W, H]);

  // Roda do mouse: listener nativo (o onWheel do React é passivo e não deixa cancelar a rolagem)
  useEffect(() => {
    const el = quadro.current;
    if (!el) return;
    const roda = (e: WheelEvent) => {
      const v = vistaRef.current;
      const fator = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      // Sem zoom e afastando: deixa a página rolar normalmente
      if (fator < 1 && v.s <= ZOOM_MIN) return;
      e.preventDefault();
      const p = paraViewBox(e.clientX, e.clientY);
      setVista(ampliarEm(v, fator, p.x, p.y, W, H));
    };
    el.addEventListener("wheel", roda, { passive: false });
    return () => el.removeEventListener("wheel", roda);
  }, [paraViewBox, setVista, W, H]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dedos.current.size === 1) { inicio.current = { x: e.clientX, y: e.clientY }; arrastou.current = false; }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const antes = dedos.current.get(e.pointerId);
    if (!antes) return;
    const agora = { x: e.clientX, y: e.clientY };
    if (dedos.current.size >= 2) {
      // Pinça: escala pela distância entre os dedos e arrasta pelo ponto médio
      const [a, b] = Array.from(dedos.current.entries()).map(([id, p]) => (id === e.pointerId ? agora : p));
      const [a0, b0] = Array.from(dedos.current.values());
      const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y) || 1, d1 = Math.hypot(a.x - b.x, a.y - b.y);
      const m0 = paraViewBox((a0.x + b0.x) / 2, (a0.y + b0.y) / 2), m1 = paraViewBox((a.x + b.x) / 2, (a.y + b.y) / 2);
      const v = ampliarEm(vistaRef.current, d1 / d0, m0.x, m0.y, W, H);
      setVista(limitar({ ...v, tx: v.tx + (m1.x - m0.x), ty: v.ty + (m1.y - m0.y) }, W, H));
      arrastou.current = true;
    } else if (vistaRef.current.s > ZOOM_MIN && inicio.current) {
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
  const ampliado = vista.s > ZOOM_MIN + 1e-3;

  return (
    <div ref={quadro} style={{ position: "relative", overflow: "hidden", background: fundo, touchAction: ampliado ? "none" : "pan-x pan-y", userSelect: "none" }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={soltar} onPointerCancel={soltar}
      // Arrasto/pinça não conta como clique no lote
      onClickCapture={e => { if (arrastou.current) { e.stopPropagation(); e.preventDefault(); arrastou.current = false; } }}>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={rotulo}
        style={{ display: "block", width: "100%", height: "auto", cursor: ampliado ? "grab" : undefined }}>
        <g transform={`translate(${vista.tx} ${vista.ty}) scale(${vista.s})`}>{children}</g>
      </svg>
      <div style={{ position: "absolute", right: 10, bottom: 10, display: "flex", flexDirection: "column", borderRadius: 10, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
        onPointerDown={e => e.stopPropagation()}>
        <button type="button" style={botao} aria-label="Ampliar o mapa" title="Ampliar" disabled={vista.s >= ZOOM_MAX} onClick={() => porBotao(1.6)}><ZoomIn size={18} /></button>
        <button type="button" style={{ ...botao, borderTop: 0 }} aria-label="Reduzir o mapa" title="Reduzir" disabled={!ampliado} onClick={() => porBotao(1 / 1.6)}><ZoomOut size={18} /></button>
        <button type="button" style={{ ...botao, borderTop: 0, opacity: ampliado ? 1 : 0.55 }} aria-label="Voltar ao mapa inteiro" title="Mapa inteiro" disabled={!ampliado} onClick={() => setVista(VISTA_INICIAL)}><Maximize2 size={16} /></button>
      </div>
    </div>
  );
}
