import type { SVGProps } from "react";

const SHORT = [45, 135, 225, 315];
const LONG = [0, 90, 180, 270];

export interface RoseCompassProps extends Omit<SVGProps<SVGGElement>, "children"> {
  /** centro X no sistema de coordenadas do SVG pai */
  cx?: number;
  cy?: number;
  /** diâmetro desejado (unidades do SVG pai) */
  size?: number;
  spin?: boolean;
}

/** Rosa dos ventos vetorial da Romatec (pontas douradas/prata). Usar DENTRO de um <svg>. */
export function RoseCompass({ cx = 0, cy = 0, size = 200, spin = false, className, ...rest }: RoseCompassProps) {
  const s = size / 200;
  const cls = [spin ? "rt-spin" : "", className ?? ""].join(" ").trim() || undefined;
  return (
    <g transform={`translate(${cx} ${cy}) scale(${s})`} {...rest}>
      <g className={cls}>
        <circle r={74} fill="none" stroke="#C9A84C" strokeWidth={1.6} />
        {SHORT.map((a) => (
          <g key={`s${a}`} transform={`rotate(${a})`}>
            <path d="M0 -58 L-8 -8 L0 0 Z" fill="#A9B4AE" />
            <path d="M0 -58 L8 -8 L0 0 Z" fill="#66736C" />
          </g>
        ))}
        {LONG.map((a) => (
          <g key={`l${a}`} transform={`rotate(${a})`}>
            <path d="M0 -92 L-13 -13 L0 0 Z" fill="#E2C877" />
            <path d="M0 -92 L13 -13 L0 0 Z" fill="#A8862F" />
          </g>
        ))}
      </g>
    </g>
  );
}
