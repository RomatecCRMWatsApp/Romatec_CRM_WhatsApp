import type { ReactNode } from "react";
import { brandAssets } from "../assets";
import { RomatecSeal } from "./RomatecSeal";

export interface FooterLink {
  label: string;
  href: string;
}

export interface AppFooterProps {
  version: string;
  /** status do WhatsApp/Z-API; false mostra ponto vermelho; omitido = chip só com a versão */
  online?: boolean;
  links?: FooterLink[];
  /** renderizador de link (ex.: <Link> do react-router / next) */
  renderLink?: (link: FooterLink, children: ReactNode) => ReactNode;
}

// Rotas deste CRM (o kit vinha com /agenda, /imoveis e /disparos)
const DEFAULT_LINKS: FooterLink[] = [
  { label: "Painel", href: "/dashboard" },
  { label: "Leads e funil", href: "/leads" },
  { label: "Agenda de visitas", href: "/leads/agenda" },
  { label: "Imóveis e empreendimentos", href: "/empreendimentos" },
  { label: "Disparos WhatsApp", href: "/campaigns" },
];

export const ROMATEC_CONTACT = {
  whatsappLabel: "(99) 9 9181-1246",
  whatsappHref: "https://wa.me/5599991811246",
  email: "contato@consultoriaromatec.com.br",
  site: "https://consultoriaromatec.com.br",
  endereco1: "Rua São Raimundo, n.º 10, Centro",
  endereco2: "Açailândia/MA — CEP 65.930-000",
  horario: "Seg a Sex · 09h–12h e 14h–17h",
  cnpj: "17.261.987/0001-09",
  razao: "J R P Bezerra Ltda",
  rt: "José Romário Pinto Bezerra",
  registros: ["CRECI/MA 4.705", "CNAI 031161", "CFT/MA 01209185369", "INCRA FQNS"],
} as const;

export function AppFooter({ version, online, links = DEFAULT_LINKS, renderLink }: AppFooterProps) {
  const year = new Date().getFullYear();
  const link = (l: FooterLink) => (renderLink ? renderLink(l, l.label) : <a href={l.href}>{l.label}</a>);
  return (
    <footer className="rt-footer">
      <div className="rt-footer__rule" />
      <div className="rt-footer__grid">
        <div className="rt-footer__col">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src={brandAssets.rosa} alt="" style={{ width: 64, height: 63 }} />
            <img src={brandAssets.wordmark} alt="Romatec Consultoria Total" style={{ width: 190, height: "auto" }} />
          </div>
          <span style={{ font: "700 18px/1.2 var(--rt-font-brand)", color: "var(--rt-gold-light)" }}>CRM | Gestão de Leads Imobiliários</span>
          <span style={{ lineHeight: 1.6 }}>Captação, qualificação e acompanhamento de leads de lotes, casas, chácaras, fazendas e galpões — direto no WhatsApp.</span>
        </div>
        {links.length > 0 && (
          <nav className="rt-footer__col" aria-label="Sistema">
            <h2 className="rt-footer__title">SISTEMA</h2>
            {links.map((l) => (
              <span key={l.href}>{link(l)}</span>
            ))}
          </nav>
        )}
        <div className="rt-footer__col">
          <h2 className="rt-footer__title">CONTATO</h2>
          <a href={ROMATEC_CONTACT.whatsappHref} target="_blank" rel="noopener noreferrer">WhatsApp {ROMATEC_CONTACT.whatsappLabel}</a>
          <a href={`mailto:${ROMATEC_CONTACT.email}`}>{ROMATEC_CONTACT.email}</a>
          <span style={{ color: "#D9DFDB", lineHeight: 1.5 }}>{ROMATEC_CONTACT.endereco1}<br />{ROMATEC_CONTACT.endereco2}</span>
          <span style={{ fontSize: 13, color: "var(--rt-text-3)" }}>{ROMATEC_CONTACT.horario}</span>
        </div>
        <div className="rt-footer__col">
          <h2 className="rt-footer__title">RESPONSÁVEL TÉCNICO</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <RomatecSeal size={64} />
            <span style={{ fontWeight: 700, color: "var(--rt-text)", lineHeight: 1.4 }}>{ROMATEC_CONTACT.rt}</span>
          </div>
          <span style={{ fontSize: 13, lineHeight: 1.7 }}>{ROMATEC_CONTACT.registros.join(" · ")}</span>
          <a href={ROMATEC_CONTACT.site} target="_blank" rel="noopener noreferrer" style={{ color: "var(--rt-glow)", fontSize: 13 }}>consultoriaromatec.com.br</a>
        </div>
      </div>
      <div className="rt-footer__bottom">
        <div className="rt-footer__bottom-in">
          <span>© {year} Romatec Consultoria Total · {ROMATEC_CONTACT.razao} · CNPJ {ROMATEC_CONTACT.cnpj}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <span className="rt-chip">
              {online !== undefined && <span className="rt-chip__dot" data-off={!online} />}
              v{version}{online !== undefined ? ` · ${online ? "online" : "offline"}` : ""}
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}
