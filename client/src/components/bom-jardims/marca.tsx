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
