import { brandAssets } from "../assets";
import { RoseCompass } from "./RoseCompass";

/** Ícone oficial (modelo B): squircle verde, aro dourado, rosa d'água e R oficial. */
export function RomatecAppIcon({ size = 48, className }: { size?: number; className?: string }) {
  const detail = size >= 48;
  return (
    <span className={["rt-appicon", className].filter(Boolean).join(" ")} style={{ width: size, height: size }} role="img" aria-label="Romatec CRM">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <rect x={4} y={4} width={192} height={192} rx={46} fill="#0C3320" />
        {detail && <rect x={12} y={12} width={176} height={176} rx={40} fill="none" stroke="#C9A84C" strokeWidth={1.4} opacity={0.7} />}
        {detail && <RoseCompass cx={100} cy={100} size={168} opacity={0.2} />}
      </svg>
      <img className="rt-appicon__r" src={brandAssets.r} alt="" draggable={false} />
    </span>
  );
}
