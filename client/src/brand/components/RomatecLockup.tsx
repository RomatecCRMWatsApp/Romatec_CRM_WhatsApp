import { brandAssets } from "../assets";

export type LockupVariant = "full" | "compact" | "stack" | "menu";

export interface RomatecLockupProps {
  variant?: LockupVariant;
  /** altura da rosa em px; o restante escala junto */
  height?: number;
  subtitle?: string;
  className?: string;
}

/**
 * Logo oficial mesclado com o CRM.
 * full    → rosa + ROMATEC/CONSULTORIA TOTAL + "CRM | Gestão de Leads Imobiliários" (login, site)
 * compact → rosa + wordmark + "CRM" (menu lateral / cabeçalho)
 * stack   → versão centralizada (splash / rodapé mobile)
 * menu    → rosa + wordmark com "CRM | GESTÃO DE LEADS" embaixo (menu lateral de 256 px; o compact não cabe)
 */
export function RomatecLockup({ variant = "full", height = 120, subtitle = "Gestão de Leads Imobiliários", className }: RomatecLockupProps) {
  if (variant === "menu") {
    const wm = Math.round(height * 3.1);
    return (
      <div className={["rt-lockup", className].filter(Boolean).join(" ")} style={{ gap: Math.round(height * 0.25) }} aria-label="Romatec CRM — Gestão de Leads" role="img">
        <img src={brandAssets.rosa} alt="" style={{ width: Math.round(height * 1.014), height }} />
        <div style={{ display: "flex", flexDirection: "column", gap: Math.round(height * 0.12) }}>
          <img src={brandAssets.wordmark} alt="" style={{ width: wm }} />
          <div className="rt-lockup__crm" style={{ fontSize: Math.round(height * 0.36), gap: 8 }}>
            <span>CRM</span>
            <span className="rt-lockup__sep" />
            <span style={{ font: `800 ${Math.max(8, Math.round(height * 0.17))}px/1 var(--rt-font-body)`, letterSpacing: 1.5, color: "var(--rt-gold)" }}>GESTÃO DE LEADS</span>
          </div>
        </div>
      </div>
    );
  }
  const rosaH = height;
  const wmW = Math.round(height * (variant === "compact" ? 2.7 : 2.9));
  const crmSize = Math.round(height * (variant === "compact" ? 0.42 : 0.27));
  const subSize = Math.round(height * 0.14);

  if (variant === "stack") {
    return (
      <div className={["rt-lockup", className].filter(Boolean).join(" ")} style={{ flexDirection: "column", gap: 10 }}>
        <img src={brandAssets.wordmark} alt="Romatec Consultoria Total" style={{ width: wmW }} />
        <span className="rt-lockup__crm" style={{ fontSize: Math.round(height * 0.3), letterSpacing: 3 }}>CRM</span>
        <span style={{ font: `700 ${Math.max(10, Math.round(height * 0.1))}px/1 var(--rt-font-body)`, letterSpacing: 4, color: "var(--rt-gold)", textTransform: "uppercase" }}>
          {subtitle}
        </span>
      </div>
    );
  }

  return (
    <div className={["rt-lockup", className].filter(Boolean).join(" ")} aria-label={`Romatec CRM — ${subtitle}`} role="img">
      <img src={brandAssets.rosa} alt="" style={{ width: Math.round(rosaH * 1.014), height: rosaH }} />
      {variant === "full" ? (
        <div className="rt-lockup__text">
          <img src={brandAssets.wordmark} alt="" style={{ width: wmW }} />
          <div className="rt-lockup__crm" style={{ fontSize: crmSize }}>
            <span>CRM</span>
            <span className="rt-lockup__sep" />
            <span style={{ fontSize: Math.round(crmSize * 0.53) }}>{subtitle}</span>
          </div>
        </div>
      ) : (
        <>
          <img src={brandAssets.wordmark} alt="" style={{ width: wmW }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, borderLeft: "2px solid var(--rt-gold)", paddingLeft: 14 }}>
            <span className="rt-lockup__crm" style={{ fontSize: crmSize, letterSpacing: 2 }}>CRM</span>
            <span style={{ font: `800 ${Math.max(9, subSize - 4)}px/1 var(--rt-font-body)`, letterSpacing: 3, color: "var(--rt-glow)" }}>GESTÃO DE LEADS</span>
          </div>
        </>
      )}
    </div>
  );
}
