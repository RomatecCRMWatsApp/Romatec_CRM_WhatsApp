import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { rotaDeMarketing } from "@shared/rastreamento";
import { carregarTags, configRastreamento, escolhaCookies, escutarCliquesWhatsapp, registrarEscolha } from "@/lib/rastreamento";

/**
 * Aviso de cookies (LGPD) das páginas públicas de marketing. Só aparece quando há Google Analytics/Ads
 * configurado no servidor; até o visitante aceitar, nada do Google é carregado.
 */
export default function AvisoCookies() {
  const [location] = useLocation();
  const publico = rotaDeMarketing(location) && !!configRastreamento();
  const [aberto, setAberto] = useState(() => publico && escolhaCookies() === null);

  useEffect(() => {
    if (!publico) return;
    escutarCliquesWhatsapp();
    carregarTags();
    setAberto(escolhaCookies() === null);
  }, [publico]);

  if (!publico || !aberto) return null;
  const escolher = (e: "aceito" | "recusado") => { registrarEscolha(e); setAberto(false); };
  const botao: React.CSSProperties = { padding: "9px 16px", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };
  return (
    <div role="dialog" aria-label="Aviso de cookies"
      style={{ position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 9999, maxWidth: 560, margin: "0 auto", padding: "14px 16px", borderRadius: 14,
        background: "color-mix(in srgb, var(--c-08261a) 97%, transparent)", color: "var(--c-f3eedf)", boxShadow: "0 8px 30px color-mix(in srgb, var(--c-000000) 35%, transparent)", fontSize: 13, lineHeight: 1.5,
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
      <p style={{ margin: 0, flex: "1 1 260px" }}>
        Usamos cookies do Google Analytics e do Google Ads para medir as visitas e os anúncios desta página (Lei n.º 13.709/2018).
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => escolher("recusado")} style={{ ...botao, background: "transparent", color: "var(--c-f3eedf)", border: "1px solid var(--c-8fa394)" }}>Recusar</button>
        <button type="button" onClick={() => escolher("aceito")} style={{ ...botao, background: "var(--c-c9a24a)", color: "var(--c-0c3320)", border: "none" }}>Aceitar</button>
      </div>
    </div>
  );
}
