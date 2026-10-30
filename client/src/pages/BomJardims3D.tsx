import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Instagram, MapPin, Play, Box, HardHat } from "lucide-react";
import { trpc } from "@/lib/trpc";
import LoteMap, { formatArea, STATUS_LABEL, type LoteInfo } from "@/components/bom-jardims/LoteMap";
import { webglDisponivel } from "@/components/bom-jardims/Mapa3D";
const Mapa3D = lazy(() => import("@/components/bom-jardims/Mapa3D"));
import { C, SERIF, SANS, useBrandFonts, ContatosBotoes, useCorretorDoLink, rotuloCorretor } from "@/components/bom-jardims/marca";
import { Formulario } from "@/pages/BomJardims";
import { INSTAGRAM_PADRAO, linkInstagram } from "@shared/cartaoVendas";
import { AGENDAR_BOM_JARDIMS } from "@shared/bomJardimsSeo";
import { TITULO_MAPA3D, VIDEOS_FIXOS, type VideoGaleria } from "@shared/mapa3dBomJardims";
import { EVENTOS } from "@shared/rastreamento";
import { registrarEvento } from "@/lib/rastreamento";

/**
 * Campanha "Mapa 3D" — /bom-jardims/3d
 * Faixa para seguir o Instagram @avalieimob, mapa 3D em destaque, vídeos da galeria e o andamento da obra.
 * Mesmas regras da landing: sem preço, CRECI e os dois contatos.
 */

const OBRA = [
  { src: "/bom-jardims/obra/2026-10-28-abertura-das-ruas.webp", titulo: "Abertura das ruas" },
  { src: "/bom-jardims/obra/2026-10-28-demarcacao-das-chacaras.webp", titulo: "Demarcação das chácaras" },
  { src: "/bom-jardims/obra/2026-10-28-chacaras-de-cima.webp", titulo: "Chácaras demarcadas vistas de cima" },
  { src: "/bom-jardims/obra/2026-10-28-acessos-area-de-vivencia.webp", titulo: "Acessos da área de vivência" },
];

const CSS = `
@keyframes bj3d-pisca { 0%,100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(221,42,123,.7); } 50% { transform: scale(1.06); box-shadow: 0 0 0 12px rgba(221,42,123,0); } }
@keyframes bj3d-brilho { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
.bj3d-seguir { animation: bj3d-pisca 1.3s ease-in-out infinite; }
.bj3d-seguir:hover { animation-play-state: paused; }
.bj3d-ponto { animation: bj3d-brilho 1.3s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .bj3d-seguir { animation-duration: 2.6s; } }
`;

/** Faixa do topo: seguir o Instagram institucional, com o botão piscando */
function FaixaInstagram() {
  return (
    <div style={{ background: "linear-gradient(90deg,#3B1A5C,#8134AF 40%,#DD2A7B 75%,#F58529)", color: "#fff" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "12px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "10px 16px", textAlign: "center" }}>
        <span style={{ fontSize: 15, lineHeight: 1.35 }}>
          <span className="bj3d-ponto" aria-hidden style={{ display: "inline-block", width: 9, height: 9, borderRadius: 9, background: "#FFE27A", marginRight: 8, verticalAlign: "middle" }} />
          Siga o <b>@{INSTAGRAM_PADRAO}</b> no Instagram e acompanhe as obras e as novidades do Bom Jardims
        </span>
        <a className="bj3d-seguir" href={linkInstagram(INSTAGRAM_PADRAO)} target="_blank" rel="noopener noreferrer"
          onClick={() => registrarEvento("seguir_instagram", { pagina: "bom-jardims-3d", perfil: INSTAGRAM_PADRAO })}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 999, background: "#fff", color: "#C1356F", fontWeight: 800, fontSize: 15, textDecoration: "none", fontFamily: SANS, whiteSpace: "nowrap" }}>
          <Instagram size={19} /> Seguir @{INSTAGRAM_PADRAO}
        </a>
      </div>
    </div>
  );
}

function useVideos(): VideoGaleria[] {
  const [videos, setVideos] = useState<VideoGaleria[]>(VIDEOS_FIXOS);
  useEffect(() => {
    let vivo = true;
    fetch("/api/public/bom-jardims/videos").then(r => r.json()).then(d => { if (vivo && Array.isArray(d?.videos) && d.videos.length) setVideos(d.videos); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  return videos;
}

function CartaoVideo({ v, grande }: { v: VideoGaleria; grande?: boolean }) {
  const contou = useRef(false);
  return (
    <figure style={{ margin: 0, borderRadius: 18, overflow: "hidden", background: "#000", position: "relative", gridColumn: grande ? "1 / -1" : undefined,
      ...(v.vertical ? { width: "min(100%, 360px)", flexShrink: 0 } : {}) }}>
      <video src={v.url} poster={v.poster ?? undefined} controls playsInline preload={grande || v.vertical ? "metadata" : "none"}
        onPlay={() => { if (!contou.current) { contou.current = true; registrarEvento("play_video", { pagina: "bom-jardims-3d", video: v.titulo }); } }}
        style={{ width: "100%", aspectRatio: v.vertical ? "9 / 16" : "16 / 9", objectFit: "cover", display: "block", background: "#000" }} />
      <figcaption style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "rgba(12,51,32,0.85)", color: "#fff", fontSize: 12, maxWidth: "calc(100% - 20px)" }}>
        <Play size={12} style={{ flexShrink: 0 }} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.titulo}</span>
      </figcaption>
    </figure>
  );
}

export default function BomJardims3D() {
  useBrandFonts();
  const corretor = useCorretorDoLink();
  const videos = useVideos();
  const reels = videos.filter(v => v.vertical), outros = videos.filter(v => !v.vertical);
  const { data: emp, isFetched } = trpc.empreendimentos.publicBySlug.useQuery({ slug: "bom-jardims" });
  const [fallbackLotes, setFallbackLotes] = useState<LoteInfo[]>([]);
  const [selected, setSelected] = useState<string>();
  const [tres] = useState(() => typeof window !== "undefined" && webglDisponivel());
  const formRef = useRef<HTMLElement>(null);
  const semSituacao = isFetched && !emp;
  const lotes = (emp?.lotes ?? (semSituacao ? fallbackLotes : [])) as LoteInfo[];
  const disponiveis = emp?.resumo.disponivel;
  const selLote = lotes.find(l => l.codigo === selected);

  useEffect(() => { document.title = TITULO_MAPA3D; }, []);

  const escolher = (c: string) => { setSelected(c); if (c) registrarEvento(EVENTOS.mapa, { empreendimento: "bom-jardims", chacara: c, pagina: "bom-jardims-3d" }); };
  const goForm = () => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const section: React.CSSProperties = { maxWidth: 1080, margin: "0 auto", padding: "48px 16px" };
  const h2: React.CSSProperties = { fontFamily: SERIF, color: C.verde, fontSize: "clamp(26px, 5vw, 36px)", margin: "0 0 8px", lineHeight: 1.15 };

  return (
    <div style={{ background: C.creme, color: C.texto, fontFamily: SANS, minHeight: "100vh" }}>
      <style>{CSS}</style>
      <FaixaInstagram />

      {/* Topo + mapa 3D em destaque */}
      <header style={{ background: C.verde }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <img src="/bom-jardims/logo-520.webp" alt="Logotipo do Condomínio de Chácaras Bom Jardims" width={520} height={293} decoding="async" style={{ width: "min(150px, 38vw)", height: "auto" }} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, background: C.dourado, color: C.verde, fontWeight: 700, fontSize: 13 }}>
              <Box size={15} /> NOVO · MAPA 3D
            </span>
          </div>
          <h1 style={{ margin: "14px 0 6px" }}>
            <span style={{ display: "block", fontFamily: SERIF, color: "#fff", fontSize: "clamp(30px, 6.5vw, 52px)", lineHeight: 1.08 }}>Escolha a sua chácara no mapa 3D</span>
            <span style={{ display: "block", color: C.destaque, fontSize: "clamp(15px, 2.6vw, 20px)", fontWeight: 700, marginTop: 8 }}>Condomínio de Chácaras Bom Jardims · Açailândia/MA</span>
          </h1>
          <p style={{ color: C.creme, margin: "0 0 4px", maxWidth: 700, fontSize: "clamp(15px, 2.4vw, 18px)" }}>
            Gire, aproxime e toque numa chácara: ela sobe no mapa com a área e a situação.
            {disponiveis !== undefined && <> Hoje são <b style={{ color: C.destaque }}>{disponiveis} chácaras disponíveis</b>.</>}
          </p>
        </div>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 16px 24px" }}>
          <div style={{ borderRadius: 18, overflow: "hidden", background: C.creme, padding: tres ? 0 : 8 }}>
            {tres
              ? <Suspense fallback={<p style={{ padding: 24 }}>Carregando o mapa 3D…</p>}><Mapa3D lotes={lotes} selected={selected} onSelect={escolher} altura="min(72vh, 640px)" /></Suspense>
              : <LoteMap lotes={lotes} selected={selected} onSelect={escolher} onMapLoaded={setFallbackLotes} />}
          </div>
          {semSituacao && <p style={{ fontSize: 13, color: "#F2C04B", marginTop: 8 }}>Não foi possível confirmar a situação das chácaras agora. Fale com o corretor para confirmar a disponibilidade.</p>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
            {selLote?.status === "disponivel" ? (
              <button onClick={goForm} style={{ padding: "14px 20px", borderRadius: 14, border: "none", background: C.dourado, color: C.verde, fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: SANS }}>
                Tenho interesse na {selLote.codigo} · {formatArea(selLote.areaM2)}
              </button>
            ) : (
              <button onClick={goForm} style={{ padding: "14px 20px", borderRadius: 14, border: "none", background: C.dourado, color: C.verde, fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: SANS }}>
                Receber o mapa de vendas no WhatsApp
              </button>
            )}
            {selLote && selLote.status !== "disponivel" && <span style={{ alignSelf: "center", color: C.creme, fontSize: 14 }}>{selLote.codigo}: <b>{STATUS_LABEL[selLote.status]}</b> — escolha uma disponível</span>}
            {selLote && selLote.status !== "nao_comercializavel" && (
              <a href={`/bom-jardims/chacara/${selLote.codigo}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 18px", borderRadius: 14, border: "1.5px solid #fff", color: "#fff", fontWeight: 700, textDecoration: "none" }}>
                <MapPin size={17} /> Localização da {selLote.codigo}
              </a>
            )}
            <a href={AGENDAR_BOM_JARDIMS} style={{ display: "inline-flex", alignItems: "center", padding: "13px 18px", borderRadius: 14, border: "1.5px solid #fff", color: "#fff", fontWeight: 700, textDecoration: "none" }}>
              Agendar visita
            </a>
          </div>
          <p style={{ color: "#BFC9B9", fontSize: 12, margin: "12px 0 0" }}>Mapa ilustrativo a partir do levantamento georreferenciado (SIRGAS 2000). {rotuloCorretor(corretor)}</p>
        </div>
      </header>

      {/* Vídeos da galeria */}
      <section style={section}>
        <h2 style={h2}>Veja o Bom Jardims em vídeo</h2>
        <p style={{ color: C.suave, margin: "0 0 20px" }}>As imagens mais recentes do condomínio e das obras.</p>
        {reels.map(v => (
          <div key={v.url} style={{ display: "flex", flexWrap: "wrap", gap: "20px 28px", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <CartaoVideo v={v} />
            <div style={{ flex: "1 1 280px", maxWidth: 480 }}>
              <h3 style={{ fontFamily: SERIF, color: C.verde, fontSize: 26, margin: "0 0 8px" }}>O Bom Jardims em 3D em 1 minuto</h3>
              <p style={{ margin: "0 0 16px", lineHeight: 1.55 }}>
                O terreno real em alto relevo, as 82 chácaras nos três tamanhos — 3.025 m², 3.140 m² e 3.600 m² junto à mata — e as imagens do início das obras.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ padding: "13px 18px", borderRadius: 14, border: "none", background: C.verde, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: SANS, fontSize: 15 }}>
                  Abrir o mapa 3D
                </button>
                <button onClick={goForm} style={{ padding: "13px 18px", borderRadius: 14, border: "none", background: C.dourado, color: C.verde, fontWeight: 700, cursor: "pointer", fontFamily: SANS, fontSize: 15 }}>
                  Reserve sua chácara
                </button>
              </div>
            </div>
          </div>
        ))}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 14 }}>
          {outros.map((v, i) => <CartaoVideo key={v.url} v={v} grande={i === 0} />)}
        </div>
      </section>

      {/* Andamento da obra */}
      <section style={{ ...section, paddingTop: 0 }}>
        <h2 style={{ ...h2, display: "flex", alignItems: "center", gap: 10 }}><HardHat size={30} color={C.dourado} /> As obras já começaram</h2>
        <p style={{ color: C.suave, margin: "0 0 20px" }}>Fotos do drone em 28/10/2026.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12 }}>
          {OBRA.map(o => (
            <figure key={o.src} style={{ margin: 0, borderRadius: 16, overflow: "hidden", background: "#fff", border: "1px solid #E2D9BF" }}>
              <img src={o.src} alt={`Obras do Bom Jardims — ${o.titulo}`} loading="lazy" decoding="async" style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block" }} />
              <figcaption style={{ padding: "10px 12px", fontWeight: 700, color: C.verde, fontSize: 14 }}>{o.titulo}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Cadastro */}
      <section ref={formRef} id="cadastro" style={{ background: C.verde }}>
        <div style={{ ...section, maxWidth: 720 }}>
          <h2 style={{ ...h2, color: "#fff" }}>Receba o mapa pelo WhatsApp</h2>
          <p style={{ color: C.creme, margin: "0 0 24px" }}>Deixe seu contato e receba o mapa das chácaras e as informações do condomínio.</p>
          <Formulario loteCodigo={selected} onClearLote={() => setSelected(undefined)} lotes={lotes} />
          <p style={{ color: C.creme, margin: "24px 0 12px", fontWeight: 700 }}>Prefere conversar agora?</p>
          <ContatosBotoes codigo={selLote?.status === "disponivel" ? selLote.codigo : undefined} />
          <p style={{ color: C.creme, margin: "24px 0 0", fontSize: 14 }}>
            <a href="/bom-jardims" style={{ color: C.destaque, fontWeight: 700 }}>Ver a página completa do Bom Jardims</a>
          </p>
        </div>
      </section>

      <footer style={{ background: "#08261A", color: "#BFC9B9", fontSize: 13, lineHeight: 1.6 }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px" }}>
          <p style={{ margin: 0 }}>Romatec Consultoria Total · CNPJ 17.261.987/0001-09 · Rua São Raimundo, n.º 10, Centro, Açailândia/MA</p>
          <p style={{ margin: 0 }}>José Romário Pinto Bezerra — Corretor CRECI/MA 4.705</p>
        </div>
      </footer>
    </div>
  );
}
