import { useEffect } from "react";
import { Droplets, Trees, Ruler, Waves } from "lucide-react";
import { C, SERIF, SANS, useBrandFonts, ContatosBotoes, useCorretorDoLink, rotuloCorretor } from "@/components/bom-jardims/marca";
import { BLOCOS_RIO, TITULO_RIO } from "@shared/rioBomJardims";

/**
 * O rio e a água — /bom-jardims/rio-e-agua
 * Responde a pergunta mais comum: o rio não passa dentro das chácaras, é área de preservação e área comum;
 * cada chácara tem 10 metros lineares à margem; e a água vem do poço artesiano.
 */
const ICONES = [Waves, Trees, Ruler, Droplets];
const VIDEO = { src: "/bom-jardims/ig/reel-deck-corrego.mp4", poster: "/bom-jardims/ig/reel-deck-corrego-capa.jpg" };

export default function BomJardimsRio() {
  useBrandFonts();
  const corretor = useCorretorDoLink();
  useEffect(() => { document.title = TITULO_RIO; }, []);
  const sec: React.CSSProperties = { maxWidth: 760, margin: "0 auto", padding: "0 16px" };

  return (
    <div style={{ background: C.creme, color: C.texto, fontFamily: SANS, minHeight: "100vh" }}>
      <header style={{ background: C.verde, color: "var(--c-ffffff)", textAlign: "center", padding: "28px 16px 24px", borderBottom: `4px solid ${C.dourado}` }}>
        <img src="/bom-jardims/logo-520.webp" alt="Logotipo do Condomínio de Chácaras Bom Jardims" width={520} height={293} style={{ width: "min(190px, 48vw)", height: "auto" }} />
        <h1 style={{ fontFamily: SERIF, fontSize: "clamp(32px, 8vw, 50px)", margin: "10px 0 4px", lineHeight: 1.05 }}>O rio e a água</h1>
        <p style={{ color: C.destaque, fontWeight: 700, margin: 0 }}>Tudo o que você precisa saber antes de escolher a sua chácara</p>
      </header>

      <main style={{ ...sec, padding: "20px 16px 40px", display: "grid", gap: 16 }}>
        <section style={{ background: "var(--c-ffffff)", borderRadius: 18, padding: 18, border: `2px solid ${C.dourado}` }}>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.55 }}>
            <b>Resumindo:</b> o rio <b>não passa dentro das chácaras</b>. Ele fica na área de preservação, que é uma <b>área comum para todos os condôminos</b>.
            Cada chácara tem um espaço exclusivo de <b>10 metros lineares à margem</b>, onde pode fazer deck ou bangalô de madeira, e a água da chácara vem do <b>poço artesiano do condomínio</b>.
          </p>
        </section>

        <section style={{ background: "var(--c-ffffff)", borderRadius: 18, padding: "12px 14px", border: "1px solid var(--c-e2d9bf)" }}>
          <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: C.verde }}>🔊 Ouça a explicação completa (1 min e 50 s)</p>
          <audio controls preload="none" src="/bom-jardims/audio-rio-e-agua.mp3" style={{ width: "100%" }}>Seu navegador não toca áudio.</audio>
        </section>

        {BLOCOS_RIO.map((b, i) => {
          const Icone = ICONES[i] ?? Waves;
          return (
            <section key={b.titulo} style={{ background: "var(--c-ffffff)", borderRadius: 18, padding: 18, border: "1px solid var(--c-e2d9bf)" }}>
              <h2 style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: SERIF, color: C.verde, fontSize: 24, margin: "0 0 10px", lineHeight: 1.2 }}>
                <Icone size={26} color={C.dourado} aria-hidden="true" style={{ flexShrink: 0 }} /> {b.titulo}
              </h2>
              <ul style={{ margin: 0, paddingLeft: 22, lineHeight: 1.6, fontSize: 16, listStyle: "disc" }}>
                {b.itens.map(t => <li key={t}>{t}</li>)}
              </ul>
            </section>
          );
        })}

        <section>
          <h2 style={{ fontFamily: SERIF, color: C.verde, fontSize: 24, margin: "4px 0 10px", textAlign: "center" }}>Veja o rio e a área comum</h2>
          <video src={VIDEO.src} poster={VIDEO.poster} controls playsInline preload="none"
            style={{ display: "block", width: "100%", maxWidth: 380, aspectRatio: "9 / 16", margin: "0 auto", borderRadius: 18, background: "var(--c-000000)", objectFit: "cover" }} />
          <p style={{ textAlign: "center", fontSize: 13, color: C.suave, margin: "8px 0 0" }}>O deck aparece em simulação ilustrativa; está em construção.</p>
        </section>

        <section>
          <h2 style={{ fontFamily: SERIF, color: C.verde, fontSize: 24, margin: "8px 0 12px", textAlign: "center" }}>Ficou com alguma dúvida?</h2>
          <ContatosBotoes />
        </section>
        <p style={{ textAlign: "center", fontSize: 12, color: C.suave, margin: 0 }}>Informações do projeto; as obras estão em andamento. {rotuloCorretor(corretor)}</p>
      </main>
    </div>
  );
}
