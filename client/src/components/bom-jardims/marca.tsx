import { useEffect } from "react";
import { MessageCircle } from "lucide-react";

/**
 * Identidade e conteúdo comuns das páginas públicas do Bom Jardims (/bom-jardims e /bom-jardims/chacara/:codigo).
 * Regras do pacote (README §0): sem preço, CRECI e os dois contatos com o mesmo destaque.
 */

export const C = { verde: "#0C3320", dourado: "#C9A84C", destaque: "#F2C04B", creme: "#F3EEDF", texto: "#23352A", suave: "#5C6B5F" };
export const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
export const SANS = "Lato, 'Segoe UI', Arial, sans-serif";

export const CONTATOS = [
  { papel: "Corretor · CRECI/MA 4.705", nome: "José Romário", telefone: "(99) 9 9181-1246", whatsapp: "5599991811246" },
  { papel: "Empreendimento", nome: "Bom Jardims", telefone: "(99) 9 9101-1970", whatsapp: "5599991011970" },
];

/** Fotos e vídeo do empreendimento (não há galeria por chácara) */
export const GALERIA = [
  { src: "/bom-jardims/portal-noite.webp", alt: "Portal de entrada à noite (perspectiva ilustrativa)" },
  { src: "/bom-jardims/portal-frontal.webp", alt: "Portal de entrada — vista frontal (perspectiva ilustrativa)" },
  { src: "/bom-jardims/stand-perspectiva.webp", alt: "Stand de vendas e administração na chácara B14 (perspectiva ilustrativa)" },
  { src: "/bom-jardims/stand-aerea.webp", alt: "Stand de vendas e administração — vista aérea (perspectiva ilustrativa)" },
];
export const VIDEO = { src: "/bom-jardims/video.mp4", poster: "/bom-jardims/video-poster.webp" };

/**
 * Projeto arquitetônico (recortes das pranchas PA-01 Portal/Guarita e PA-02 Administração/Stand B14):
 * fachada e planta baixa, já com o título da prancha na imagem. Mostrados inteiros (sem corte).
 */
export const PROJETO = [
  { src: "/bom-jardims/projeto-portal-fachada.webp", alt: "Fachada frontal — portal de entrada (projeto PA-01)", w: 1600, h: 530 },
  { src: "/bom-jardims/projeto-portal-planta.webp", alt: "Planta baixa — implantação do portal e guarita (projeto PA-01)", w: 1600, h: 542 },
  { src: "/bom-jardims/projeto-stand-fachada.webp", alt: "Fachada frontal — administração e stand de vendas (projeto PA-02)", w: 1600, h: 549 },
  { src: "/bom-jardims/projeto-stand-planta.webp", alt: "Planta baixa — administração e stand de vendas na chácara B14 (projeto PA-02)", w: 1600, h: 1590 },
];

/** Bloco "Projeto — portal e stand de vendas": imagens inteiras, cada uma abre em tamanho grande */
export function GaleriaProjeto() {
  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ fontFamily: SERIF, color: C.verde, fontSize: 22, margin: "0 0 4px" }}>Projeto — portal de entrada e stand de vendas</h3>
      <p style={{ color: C.suave, margin: "0 0 14px", fontSize: 14 }}>Fachadas e plantas baixas do projeto arquitetônico. Toque para ampliar.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 12, alignItems: "center" }}>
        {PROJETO.map(p => (
          <a key={p.src} href={p.src} target="_blank" rel="noopener noreferrer" title={p.alt}
            style={{ display: "block", borderRadius: 14, overflow: "hidden", background: "#fff", border: "1px solid #E2D9BF" }}>
            <img src={p.src} alt={p.alt} loading="lazy" width={p.w} height={p.h}
              style={{ width: "100%", height: "auto", maxHeight: 460, objectFit: "contain", display: "block" }} />
          </a>
        ))}
      </div>
    </div>
  );
}

export function waLink(numero: string, codigo?: string) {
  const msg = codigo
    ? `Olá! Tenho interesse na chácara ${codigo} do Condomínio de Chácaras Bom Jardims.`
    : "Olá! Tenho interesse no Condomínio de Chácaras Bom Jardims.";
  return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
}

export function useBrandFonts() {
  useEffect(() => {
    const id = "bomjardims-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Playfair+Display:wght@600;700&display=swap";
    document.head.appendChild(link);
  }, []);
}

export function ContatosBotoes({ codigo }: { codigo?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
      {CONTATOS.map(c => (
        <a key={c.whatsapp} href={waLink(c.whatsapp, codigo)} target="_blank" rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14, background: "#1F8A4C", color: "#fff", textDecoration: "none" }}>
          <MessageCircle size={26} />
          <span style={{ lineHeight: 1.25 }}>
            <span style={{ display: "block", fontSize: 12, opacity: 0.9 }}>{c.papel}</span>
            <span style={{ display: "block", fontWeight: 700 }}>{c.nome} · {c.telefone}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
