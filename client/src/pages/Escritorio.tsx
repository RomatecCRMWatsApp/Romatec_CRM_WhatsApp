import { useEffect } from "react";
import { Clock, MapPin, Navigation, MessageCircle } from "lucide-react";
import { C, SERIF, SANS, useBrandFonts, useCorretorDoLink } from "@/components/bom-jardims/marca";
import { ESCRITORIO, REFERENCIA_ESCRITORIO, HORARIO_ESCRITORIO, HORARIO_ESCRITORIO_EXTRA, LINHA_OFICIAL, LINKS_MAPA_ESCRITORIO, TITULO_ESCRITORIO } from "@shared/escritorio";

/** /escritorio — endereço do escritório com os botões dos apps de mapa (prévia própria no WhatsApp) */
export default function Escritorio() {
  useBrandFonts();
  const corretor = useCorretorDoLink();
  useEffect(() => { document.title = TITULO_ESCRITORIO; }, []);
  const btn = (bg: string, cor: string): React.CSSProperties => ({ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "15px 18px", borderRadius: 14, background: bg, color: cor, fontWeight: 800, fontSize: 17, textDecoration: "none", fontFamily: SANS });
  const zap = corretor.whatsapp ? `https://wa.me/${corretor.whatsapp}?text=${encodeURIComponent("Olá! Quero combinar uma visita ao escritório.")}` : null;
  return (
    <div style={{ background: C.creme, color: C.texto, fontFamily: SANS, minHeight: "100vh" }}>
      <header style={{ background: C.verde, color: "var(--c-ffffff)", textAlign: "center", padding: "28px 16px 26px", borderBottom: `4px solid ${C.dourado}` }}>
        <img src="/brand/wordmark-dourado.png" alt="Romatec Consultoria Total" width={1664} height={465} style={{ width: "min(240px, 60vw)", height: "auto" }} />
        <h1 style={{ fontFamily: SERIF, fontSize: "clamp(32px, 8vw, 48px)", margin: "14px 0 6px", lineHeight: 1.05 }}>Nosso escritório</h1>
        <p style={{ color: C.destaque, fontWeight: 700, margin: 0, display: "inline-flex", alignItems: "center", gap: 6 }}><MapPin size={18} /> {ESCRITORIO.endereco}</p>
        <p style={{ color: C.creme, margin: "6px 0 0", fontSize: 16 }}>📍 Ponto de referência: <b>{REFERENCIA_ESCRITORIO.toLowerCase()}</b></p>
      </header>
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "22px 16px 40px", display: "grid", gap: 12 }}>
        <div style={{ background: "var(--c-ffffff)", borderRadius: 16, padding: "14px 16px", border: `2px solid ${C.dourado}`, textAlign: "center" }}>
          <p style={{ margin: 0, fontWeight: 800, color: C.verde, display: "inline-flex", alignItems: "center", gap: 6 }}><Clock size={18} /> Horário de atendimento</p>
          <p style={{ margin: "6px 0 0", fontSize: 17 }}>{HORARIO_ESCRITORIO}</p>
          <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700 }}>{HORARIO_ESCRITORIO_EXTRA}</p>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: C.suave }}>Avise antes o dia e o horário da sua visita para eu te receber com atenção.</p>
        </div>
        <div style={{ background: "var(--c-ffffff)", borderRadius: 16, padding: "12px 14px", border: "1px solid var(--c-e2d9bf)" }}>
          <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: C.verde }}>🔊 Ouça como funciona o atendimento (45 s)</p>
          <audio controls preload="none" src="/brand/audio-escritorio.mp3" style={{ width: "100%" }}>Seu navegador não toca áudio.</audio>
        </div>
        <a href={LINKS_MAPA_ESCRITORIO.google} target="_blank" rel="noopener noreferrer" style={btn(C.verde, "var(--c-ffffff)")}><Navigation size={20} /> Abrir no Google Maps</a>
        <a href={LINKS_MAPA_ESCRITORIO.waze} target="_blank" rel="noopener noreferrer" style={btn("var(--c-ffffff)", C.verde)}><Navigation size={20} /> Abrir no Waze</a>
        <a href={LINKS_MAPA_ESCRITORIO.apple} target="_blank" rel="noopener noreferrer" style={btn("var(--c-ffffff)", C.verde)}><Navigation size={20} /> Abrir no Apple Maps (iPhone)</a>
        {zap && <a href={zap} target="_blank" rel="noopener noreferrer" style={btn("var(--c-1f8a4c)", "var(--c-ffffff)")}><MessageCircle size={20} /> Combinar a visita pelo WhatsApp</a>}
        <p style={{ textAlign: "center", fontSize: 14, color: C.suave, margin: "10px 0 0" }}>{corretor.nome}{corretor.creci ? ` · ${corretor.creci}` : ""}</p>
        <p style={{ textAlign: "center", fontSize: 12, color: C.suave, margin: 0 }}>{LINHA_OFICIAL}</p>
      </main>
    </div>
  );
}
