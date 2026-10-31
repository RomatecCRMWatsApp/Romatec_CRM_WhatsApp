import { useEffect, useState } from "react";
import { Navigation, Download, MapPin, Clock, Route as RouteIcon } from "lucide-react";
import { C, SERIF, SANS, useBrandFonts, ContatosBotoes, useCorretorDoLink, rotuloCorretor } from "@/components/bom-jardims/marca";
import { PONTOS_ROTA, TITULO_ROTA, linkAppleRota, linkGoogleRota, linkWazeRota } from "@shared/rotaBomJardims";
import { registrarEvento } from "@/lib/rastreamento";

/**
 * Como chegar — /bom-jardims/rota
 * Percurso do centro de Açailândia até o portal, pontos de referência, botões para os apps de navegação,
 * arquivo da rota (GPX/KML) e o folder para baixar e mandar no WhatsApp.
 */

const FOLDER = "/bom-jardims/divulgacao/como-chegar.png";

export default function BomJardimsRota() {
  useBrandFonts();
  const corretor = useCorretorDoLink();
  const [resumo, setResumo] = useState<{ km: number | null; minutos: number | null } | null>(null);
  useEffect(() => { document.title = TITULO_ROTA; }, []);
  useEffect(() => {
    let vivo = true;
    fetch("/api/public/bom-jardims/rota").then(r => r.json()).then(d => { if (vivo && d?.ok) setResumo({ km: d.km, minutos: d.minutos }); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  const abriu = (app: string) => registrarEvento("rota_bom_jardims", { app });

  const btn = (bg: string, cor: string): React.CSSProperties => ({ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "16px 18px", borderRadius: 14, background: bg, color: cor, fontWeight: 800, fontSize: 17, textDecoration: "none", fontFamily: SANS });
  const sec: React.CSSProperties = { maxWidth: 760, margin: "0 auto", padding: "0 16px" };

  return (
    <div style={{ background: C.creme, color: C.texto, fontFamily: SANS, minHeight: "100vh" }}>
      <header style={{ background: C.verde, color: "#fff", textAlign: "center", padding: "28px 16px 24px" }}>
        <img src="/bom-jardims/logo-520.webp" alt="Logotipo do Condomínio de Chácaras Bom Jardims" width={520} height={293} style={{ width: "min(200px, 50vw)", height: "auto" }} />
        <h1 style={{ fontFamily: SERIF, fontSize: "clamp(34px, 8vw, 52px)", margin: "10px 0 4px", lineHeight: 1.05 }}>Como chegar</h1>
        <p style={{ color: C.destaque, fontWeight: 700, margin: 0 }}>Do centro de Açailândia ao portal do Bom Jardims</p>
        {resumo?.km != null && (
          <p style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", margin: "14px 0 0", color: C.creme, fontSize: 15 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><RouteIcon size={16} /> cerca de {resumo.km.toLocaleString("pt-BR")} km</span>
            {resumo.minutos != null && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Clock size={16} /> uns {resumo.minutos} min de carro</span>}
          </p>
        )}
      </header>

      <section style={{ ...sec, paddingTop: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <a href={linkGoogleRota()} target="_blank" rel="noopener noreferrer" onClick={() => abriu("google")} style={btn(C.dourado, C.verde)}><Navigation size={20} /> Abrir no Google Maps</a>
          <a href={linkWazeRota()} target="_blank" rel="noopener noreferrer" onClick={() => abriu("waze")} style={btn("#33CCFF", "#05233A")}><Navigation size={20} /> Abrir no Waze</a>
          <a href={linkAppleRota()} target="_blank" rel="noopener noreferrer" onClick={() => abriu("apple")} style={btn("#fff", C.verde)}><MapPin size={20} /> Apple Maps (iPhone)</a>
        </div>
        <p style={{ fontSize: 13, color: C.suave, margin: "10px 0 0" }}>O Waze traça a rota a partir de onde você estiver. O Google Maps e o Apple Maps já abrem saindo da Prefeitura, no centro.</p>
      </section>

      <section style={{ ...sec, paddingTop: 24 }}>
        <h2 style={{ fontFamily: SERIF, color: C.verde, fontSize: 28, margin: "0 0 12px" }}>Pontos de referência</h2>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {PONTOS_ROTA.map((p, i) => {
            const fim = i === PONTOS_ROTA.length - 1;
            return (
              <li key={p.titulo} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "14px 16px", borderRadius: 16, background: fim ? C.verde : "#fff", border: `1px solid ${fim ? C.verde : "#E2D9BF"}` }}>
                <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 38, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, background: fim ? C.dourado : C.verde, color: fim ? C.verde : C.destaque, border: `3px solid ${fim ? C.verde : C.dourado}` }}>{i + 1}</span>
                <span>
                  <b style={{ display: "block", color: fim ? C.destaque : C.verde, fontSize: 18 }}>{p.titulo}</b>
                  <span style={{ color: fim ? C.creme : C.texto, lineHeight: 1.45 }}>{p.texto}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section style={{ ...sec, paddingTop: 24 }}>
        <h2 style={{ fontFamily: SERIF, color: C.verde, fontSize: 28, margin: "0 0 6px" }}>Arquivo da rota</h2>
        <p style={{ margin: "0 0 12px", color: C.suave }}>Abre em qualquer app de navegação (OsmAnd, Maps.me, Organic Maps, GPS de carro) e no Google Earth.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <a href="/bom-jardims/rota.gpx" download onClick={() => abriu("gpx")} style={btn(C.verde, "#fff")}><Download size={20} /> Baixar rota (GPX)</a>
          <a href="/bom-jardims/rota.kml" download onClick={() => abriu("kml")} style={btn("#fff", C.verde)}><Download size={20} /> Google Earth (KML)</a>
        </div>
      </section>

      <section style={{ ...sec, paddingTop: 24 }}>
        <h2 style={{ fontFamily: SERIF, color: C.verde, fontSize: 28, margin: "0 0 12px" }}>Folder para guardar no celular</h2>
        <a href={FOLDER} target="_blank" rel="noopener noreferrer" style={{ display: "block", borderRadius: 18, overflow: "hidden", border: "1px solid #E2D9BF", maxWidth: 420, margin: "0 auto" }}>
          <img src={FOLDER} alt="Folder Como chegar ao Bom Jardims, com os pontos de referência e o QR da rota" width={1080} height={1920} loading="lazy" style={{ width: "100%", height: "auto", display: "block" }} />
        </a>
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <a href={FOLDER} download="Como_chegar_Bom_Jardims.png" onClick={() => abriu("folder")} style={{ ...btn(C.dourado, C.verde), display: "inline-flex" }}><Download size={20} /> Baixar o folder</a>
        </div>
      </section>

      <section style={{ background: C.verde, marginTop: 32 }}>
        <div style={{ ...sec, padding: "28px 16px 32px" }}>
          <p style={{ color: C.creme, margin: "0 0 12px", fontWeight: 700 }}>Ficou com dúvida no caminho? Chame no WhatsApp:</p>
          <ContatosBotoes />
          <p style={{ color: "#BFC9B9", fontSize: 13, margin: "16px 0 0" }}>{rotuloCorretor(corretor)} · <a href="/bom-jardims" style={{ color: C.destaque }}>Ver as chácaras</a></p>
        </div>
      </section>
    </div>
  );
}
