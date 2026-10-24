import { useCallback, useEffect, useRef, useState } from "react";

const EVENTOS = ["mousemove", "mousedown", "keydown", "touchstart", "wheel", "scroll", "pointerdown"] as const;

/**
 * A tela de descanso não abre durante upload, câmera aberta, áudio/vídeo tocando ou modal marcado
 * com data-block-idle="true" (renderize <span data-block-idle="true" hidden /> enquanto a ação dura).
 */
export function descansoBloqueado(): boolean {
  if (document.querySelector('[data-block-idle="true"]')) return true;
  return Array.from(document.querySelectorAll<HTMLMediaElement>("video, audio")).some(m => !m.paused && !m.ended);
}

/**
 * Ocioso depois de `minutos` sem interação (0 = desativado). Movimento do mouse abaixo de 10 px não conta.
 * Com a aba em segundo plano o tempo segue contando; a tela só abre quando a pessoa volta e passou do limite.
 */
export function useIdle(minutos: number) {
  const [ocioso, setOcioso] = useState(false);
  const ultimo = useRef(Date.now());
  const ultimoXY = useRef<{ x: number; y: number } | null>(null);
  const limite = minutos > 0 ? minutos * 60_000 : Infinity;

  const atividade = useCallback((e?: Event) => {
    if (e?.type === "mousemove") {
      const m = e as MouseEvent;
      const p = ultimoXY.current;
      ultimoXY.current = { x: m.clientX, y: m.clientY };
      if (p && Math.hypot(m.clientX - p.x, m.clientY - p.y) < 10) return; // tremor do mouse
    }
    ultimo.current = Date.now();
  }, []);

  useEffect(() => {
    if (limite === Infinity || ocioso) return;
    ultimo.current = Date.now();
    EVENTOS.forEach(ev => window.addEventListener(ev, atividade, { passive: true, capture: true }));
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (descansoBloqueado()) { ultimo.current = Date.now(); return; }
      if (Date.now() - ultimo.current >= limite) setOcioso(true);
    }, 1000);
    return () => {
      EVENTOS.forEach(ev => window.removeEventListener(ev, atividade, { capture: true }));
      clearInterval(t);
    };
  }, [limite, atividade, ocioso]);

  const acordar = useCallback(() => { ultimo.current = Date.now(); setOcioso(false); }, []);
  return { ocioso, acordar };
}
