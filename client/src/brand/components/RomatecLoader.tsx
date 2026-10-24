import { useId } from "react";
import { brandAssets } from "../assets";
import { RoseCompass } from "./RoseCompass";

export const INFINITY_PATH =
  "M0 0 C 22 -42, 92 -42, 92 0 C 92 42, 22 42, 0 0 C -22 -42, -92 -42, -92 0 C -92 42, -22 42, 0 0 Z";

export interface RomatecLoaderProps {
  /** largura em px (altura = 0,9 x largura). Padrão 240 */
  size?: number;
  /** texto abaixo; passe null para ocultar */
  label?: string | null;
  className?: string;
}

/** Loader oficial (modelo A): selo verde + rosa girando + infinito com luz verde correndo + R oficial. */
export function RomatecLoader({ size = 240, label = "Carregando", className }: RomatecLoaderProps) {
  const uid = useId().replace(/:/g, "");
  const glow = `rt-glow-${uid}`;
  const grad = `rt-grad-${uid}`;
  const h = Math.round(size * 0.9);
  return (
    <div className={["rt-loader", className].filter(Boolean).join(" ")} role="status" aria-live="polite">
      <div className="rt-loader__stage" style={{ width: size, height: h }}>
        <svg viewBox="-120 -108 240 216" aria-hidden="true">
          <defs>
            <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={4} />
            </filter>
            <linearGradient id={grad} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#0E6B3C" />
              <stop offset="0.5" stopColor="#2BD47A" />
              <stop offset="1" stopColor="#0E6B3C" />
            </linearGradient>
          </defs>
          <circle r={72} fill="#0C3320" />
          <circle r={72} fill="none" stroke="#C9A84C" strokeWidth={1.2} opacity={0.7} />
          <RoseCompass size={128} spin opacity={0.55} />
          <path d={INFINITY_PATH} fill="none" stroke="#123826" strokeWidth={7} strokeLinecap="round" />
          <path className="rt-run" d={INFINITY_PATH} pathLength={360} fill="none" stroke="#2BD47A" strokeWidth={10}
            strokeLinecap="round" strokeDasharray="70 290" filter={`url(#${glow})`} opacity={0.8} />
          <path className="rt-run" d={INFINITY_PATH} pathLength={360} fill="none" stroke={`url(#${grad})`} strokeWidth={6}
            strokeLinecap="round" strokeDasharray="70 290" />
          <circle r={21} fill="#0C3320" stroke="#C9A84C" strokeWidth={1.6} />
        </svg>
        <img className="rt-loader__r" src={brandAssets.r} alt="" draggable={false} />
      </div>
      {label !== null && <span className="rt-loader__label">{label}</span>}
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {label ?? "Carregando"}
      </span>
    </div>
  );
}

/** Mini infinito para dentro de botões (30x16 px). */
export function InfinityMini({ width = 30 }: { width?: number }) {
  return (
    <svg width={width} height={Math.round(width * 0.53)} viewBox="-100 -48 200 96" aria-hidden="true">
      <path d={INFINITY_PATH} fill="none" stroke="#1B4A33" strokeWidth={16} />
      <path className="rt-run-fast" d={INFINITY_PATH} pathLength={360} fill="none" stroke="#2BD47A" strokeWidth={16}
        strokeLinecap="round" strokeDasharray="90 270" />
    </svg>
  );
}
