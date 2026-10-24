import { useId } from "react";
import { brandAssets } from "../assets";
import { RoseCompass } from "./RoseCompass";

/** Brasão oficial (selo A): texto em arco completo, rosa ao fundo e R oficial ao centro. */
export function RomatecSeal({ size = 160, className }: { size?: number; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const top = `rt-seal-top-${uid}`;
  const bot = `rt-seal-bot-${uid}`;
  return (
    <span className={["rt-seal", className].filter(Boolean).join(" ")} style={{ width: size, height: size }} role="img"
      aria-label="Selo Romatec Consultoria Total — Açailândia, MA, 2012">
      <svg viewBox="0 0 300 300" aria-hidden="true">
        <defs>
          <path id={top} d="M 44.8 188.3 A 112 112 0 1 1 255.2 188.3" />
          <path id={bot} d="M 61.7 201 A 102 102 0 0 0 238.3 201" />
        </defs>
        <circle cx={150} cy={150} r={146} fill="#0C3320" />
        <circle cx={150} cy={150} r={140} fill="none" stroke="#C9A84C" strokeWidth={2} />
        <circle cx={150} cy={150} r={134} fill="none" stroke="#C9A84C" strokeWidth={0.8} />
        <circle cx={150} cy={150} r={88} fill="none" stroke="#C9A84C" strokeWidth={1.2} />
        <text fontFamily="Cinzel, serif" fontWeight={700} fontSize={16.5} letterSpacing={3} fill="#E2C877">
          <textPath href={`#${top}`} startOffset="50%" textAnchor="middle">ROMATEC CONSULTORIA TOTAL</textPath>
        </text>
        <text fontFamily="Manrope, sans-serif" fontWeight={700} fontSize={10.5} letterSpacing={1.5} fill="#C9A84C">
          <textPath href={`#${bot}`} startOffset="50%" textAnchor="middle">AÇAILÂNDIA · MA · 2012</textPath>
        </text>
        <circle cx={48.5} cy={197.3} r={3} fill="#C9A84C" />
        <circle cx={251.5} cy={197.3} r={3} fill="#C9A84C" />
        <RoseCompass cx={150} cy={150} size={168} opacity={0.38} />
      </svg>
      <img className="rt-seal__r" src={brandAssets.r} alt="" draggable={false} />
    </span>
  );
}
