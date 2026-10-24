import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { MapPin, Navigation, Copy, Play, ArrowLeft, Globe2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import LoteMap, { STATUS_LABEL, type LoteInfo, type MapaData } from "@/components/bom-jardims/LoteMap";
import { C, SERIF, SANS, GALERIA, VIDEO, useBrandFonts, ContatosBotoes, GaleriaProjeto } from "@/components/bom-jardims/marca";
import { codigoChacaraValido, localizacaoDoLote, tituloChacara, rotaAteEntrada, NOME_BOM_JARDIMS, SLUG_BOM_JARDIMS } from "@shared/chacaraLink";

/**
 * Link público de uma chácara — /bom-jardims/chacara/C05 (o corretor manda para o cliente).
 * Fotos e vídeo do empreendimento (não há galeria por chácara), mapa com a chácara destacada e a
 * localização exata (centro do lote oficial do KMZ) com botões do Google Maps. Sem preço.
 */
export default function BomJardimsChacara() {
  useBrandFonts();
  const [, params] = useRoute("/bom-jardims/chacara/:codigo");
  const codigo = (params?.codigo || "").toUpperCase();
  const valido = codigoChacaraValido(codigo);
  const { data: emp } = trpc.empreendimentos.publicBySlug.useQuery({ slug: SLUG_BOM_JARDIMS }, { enabled: valido });
  const [mapa, setMapa] = useState<MapaData | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    fetch(`/${SLUG_BOM_JARDIMS}/mapa.json`).then(r => (r.ok ? r.json() : Promise.reject())).then(setMapa).catch(() => setFalhou(true));
  }, []);

  useEffect(() => {
    document.title = valido ? `Chácara ${codigo} — Chácaras Bom Jardims, Açailândia/MA` : "Chácaras Bom Jardims";
  }, [codigo, valido]);

  return <ChacaraView codigo={codigo} mapa={mapa} lotes={(emp?.lotes ?? []) as LoteInfo[]} falhou={falhou} />;
}

/** A página em si, a partir dos dados (geometria pública e situação dos lotes) */
export function ChacaraView({ codigo, mapa, lotes, falhou = false }: { codigo: string; mapa: MapaData | null; lotes: LoteInfo[]; falhou?: boolean }) {
  const valido = codigoChacaraValido(codigo);
  const [copiado, setCopiado] = useState(false);

  const geo = mapa?.lotes.find(l => l.codigo === codigo);
  const info = lotes.find(l => l.codigo === codigo);
  const local = useMemo(() => (geo ? localizacaoDoLote(geo.poly) : null), [geo]);
  const quadra = info?.quadra ?? geo?.quadra ?? codigo[0];
  const area = info?.areaM2 ?? geo?.areaM2 ?? null;
  const tecnica = info?.status === "nao_comercializavel" || geo?.comercializavel === false;

  const secao: React.CSSProperties = { maxWidth: 1080, margin: "0 auto", padding: "40px 16px" };
  const h2: React.CSSProperties = { fontFamily: SERIF, color: C.verde, fontSize: "clamp(24px, 4.5vw, 32px)", margin: "0 0 8px", lineHeight: 1.15 };
  const botao = (fundo: string, cor: string): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 18px", borderRadius: 14, background: fundo, color: cor,
    fontWeight: 700, fontSize: 15, textDecoration: "none", border: "none", cursor: "pointer", fontFamily: SANS,
  });

  if (!valido || (mapa && !geo)) {
    return (
      <div style={{ background: C.creme, minHeight: "100vh", fontFamily: SANS, color: C.texto, display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <h1 style={{ fontFamily: SERIF, color: C.verde }}>Chácara não encontrada</h1>
          <p>Confira o código (ex.: C05) ou veja todas as chácaras no mapa do empreendimento.</p>
          <a href="/bom-jardims#mapa" style={botao(C.verde, "#fff")}>Ver o mapa das chácaras</a>
        </div>
      </div>
    );
  }

  const copiar = async () => {
    if (!local) return;
    try { await navigator.clipboard.writeText(local.latLonTexto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sem permissão: o texto está visível */ }
  };

  return (
    <div style={{ background: C.creme, color: C.texto, fontFamily: SANS, minHeight: "100vh" }}>
      {/* Capa: a chácara */}
      <header style={{ position: "relative", minHeight: 360, display: "flex", alignItems: "flex-end", overflow: "hidden", background: C.verde }}>
        <img src="/bom-jardims/portal-dia.webp" alt="Portal de entrada do Bom Jardims (perspectiva ilustrativa)"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(12,51,32,0.2) 0%, rgba(12,51,32,0.6) 45%, rgba(12,51,32,0.95) 100%)" }} />
        <div style={{ position: "relative", maxWidth: 1080, margin: "0 auto", padding: "28px 16px 32px", width: "100%", boxSizing: "border-box" }}>
          <a href="/bom-jardims" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#F3EEDF", fontSize: 14, textDecoration: "none", marginBottom: 14 }}>
            <ArrowLeft size={16} /> {NOME_BOM_JARDIMS}
          </a>
          <p style={{ margin: 0, color: C.dourado, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>AÇAILÂNDIA/MA · BR-222</p>
          <h1 style={{ fontFamily: SERIF, color: "#fff", fontSize: "clamp(36px, 8vw, 58px)", lineHeight: 1.05, margin: "8px 0 6px" }}>Chácara {codigo}</h1>
          <p style={{ color: "#F3EEDF", fontSize: "clamp(17px, 3vw, 21px)", margin: 0 }}>
            {tituloChacara({ codigo, quadra, areaM2: area }).replace(`Chácara ${codigo} · `, "")}
          </p>
          {info && (
            <span style={{ display: "inline-block", marginTop: 12, padding: "5px 12px", borderRadius: 999, background: info.status === "disponivel" ? C.dourado : "#E2D9BF", color: C.verde, fontWeight: 700, fontSize: 13 }}>
              {tecnica ? "Área técnica do condomínio" : STATUS_LABEL[info.status]}
            </span>
          )}
          <p style={{ color: "#D9D3BF", fontSize: 13, margin: "14px 0 0" }}>Corretor José Romário · CRECI/MA 4.705</p>
        </div>
      </header>

      {/* Localização exata */}
      <section style={secao}>
        <h2 style={h2}>Localização exata</h2>
        <p style={{ color: C.suave, margin: "0 0 18px" }}>Ponto central da chácara {codigo}, pelo levantamento georreferenciado do empreendimento.</p>
        {local ? (
          <div style={{ padding: 20, borderRadius: 18, background: "#fff", border: "1px solid #E2D9BF", display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 700, color: C.verde }}>
                <MapPin size={20} color={C.dourado} /> {local.latLonTexto}
              </p>
              <p style={{ margin: 0, fontSize: 14, color: C.suave }}>Latitude, longitude (graus decimais · WGS 84)</p>
              <p style={{ margin: "6px 0 0", fontSize: 14 }}>UTM: {local.utm.texto}</p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <a href={local.googleMaps} target="_blank" rel="noopener noreferrer" style={botao(C.verde, "#fff")}><MapPin size={18} /> Abrir no Google Maps</a>
              <a href={rotaAteEntrada()} target="_blank" rel="noopener noreferrer" style={botao(C.dourado, C.verde)}><Navigation size={18} /> Como chegar ao condomínio</a>
              <button onClick={copiar} style={{ ...botao("#fff", C.verde), border: `1.5px solid ${C.verde}` }}><Copy size={18} /> {copiado ? "Coordenadas copiadas" : "Copiar coordenadas"}</button>
            </div>
            <div style={{ borderTop: "1px solid #EEE7D2", paddingTop: 14, display: "grid", gap: 8 }}>
              <a href={`/bom-jardims/chacara/${codigo}.kml`} download style={{ ...botao("#fff", C.verde), border: `1.5px solid ${C.verde}`, justifySelf: "start" }}>
                <Globe2 size={18} /> Baixar KML (Google Earth)
              </a>
              <p style={{ margin: 0, fontSize: 13, color: C.suave }}>
                Arquivo com a chácara {codigo} marcada e a poligonal geral do empreendimento. Abre no Google Earth e em apps de mapas e GIS.
              </p>
            </div>
          </div>
        ) : (
          <p>{falhou ? "Não foi possível carregar a localização agora." : "Carregando localização…"}</p>
        )}
      </section>

      {/* Mapa com a chácara destacada */}
      <section style={{ ...secao, paddingTop: 0 }}>
        <h2 style={h2}>A chácara {codigo} no mapa</h2>
        <p style={{ color: C.suave, margin: "0 0 18px" }}>Em dourado. Portal de entrada, rio, APP, trilha ecológica e área de vivência e recreação.</p>
        {mapa ? (
          <LoteMap dados={mapa} lotes={lotes} selected={codigo} destaque
            onSelect={c => { if (c !== codigo) window.location.href = `/bom-jardims/chacara/${c}`; }} />
        ) : <p>Carregando mapa…</p>}
      </section>

      {/* Fotos e vídeo do empreendimento */}
      <section style={{ ...secao, paddingTop: 0 }}>
        <h2 style={h2}>O condomínio</h2>
        <p style={{ color: C.suave, margin: "0 0 18px" }}>Imagens do empreendimento (perspectivas ilustrativas).</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <figure style={{ margin: 0, gridRow: "span 2", borderRadius: 18, overflow: "hidden", background: "#000", position: "relative" }}>
            <video src={VIDEO.src} poster={VIDEO.poster} controls playsInline preload="none"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", maxHeight: 640 }} />
            <figcaption style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "rgba(12,51,32,0.8)", color: "#fff", fontSize: 12 }}>
              <Play size={12} /> Vídeo
            </figcaption>
          </figure>
          {GALERIA.map(g => (
            <figure key={g.src} style={{ margin: 0, borderRadius: 18, overflow: "hidden", background: "#DDD5BD" }}>
              <img src={g.src} alt={g.alt} loading="lazy" style={{ width: "100%", height: "100%", aspectRatio: "16 / 10", objectFit: "cover", display: "block" }} />
            </figure>
          ))}
        </div>
        <GaleriaProjeto />
      </section>

      {/* Atendimento */}
      <section style={{ background: C.verde }}>
        <div style={{ ...secao, display: "grid", gap: 16 }}>
          <h2 style={{ ...h2, color: "#fff" }}>Fale sobre a chácara {codigo}</h2>
          <p style={{ color: "#E8E2CE", margin: 0 }}>Condições e valores são apresentados pelo corretor no atendimento. Agende sua visita.</p>
          <ContatosBotoes codigo={codigo} />
          {!tecnica && (
            <a href={`/bom-jardims?chacara=${codigo}#cadastro`} style={{ ...botao(C.dourado, C.verde), justifySelf: "start" }}>Quero me cadastrar nesta chácara</a>
          )}
          <p style={{ color: "#B9C4B5", fontSize: 12, margin: 0 }}>
            Imagens e mapa ilustrativos; medidas do projeto de parcelamento. Romatec Consultoria Total · José Romário — CRECI/MA 4.705.
          </p>
        </div>
      </section>
    </div>
  );
}
