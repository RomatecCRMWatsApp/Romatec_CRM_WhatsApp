import type { ReactNode } from "react";
import { brandAssets } from "../assets";

export interface TabItem {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const TAB_ICONS = {
  painel: (<svg width={22} height={22} viewBox="0 0 24 24" {...stroke} aria-hidden="true"><rect x={3} y={3} width={7} height={7} rx={1.5} /><rect x={14} y={3} width={7} height={7} rx={1.5} /><rect x={3} y={14} width={7} height={7} rx={1.5} /><rect x={14} y={14} width={7} height={7} rx={1.5} /></svg>),
  leads: (<svg width={22} height={22} viewBox="0 0 24 24" {...stroke} aria-hidden="true"><circle cx={9} cy={8} r={4} /><path d="M2 21c0-4 3-6 7-6s7 2 7 6" /><path d="M19 8v6M16 11h6" /></svg>),
  funil: (<svg width={22} height={22} viewBox="0 0 24 24" {...stroke} aria-hidden="true"><path d="M3 4h18l-7 8v6l-4 2v-8z" /></svg>),
  agenda: (<svg width={22} height={22} viewBox="0 0 24 24" {...stroke} aria-hidden="true"><rect x={3} y={5} width={18} height={16} rx={2} /><path d="M3 10h18M8 3v4M16 3v4" /></svg>),
};

export const DEFAULT_TABS: [TabItem, TabItem, TabItem, TabItem] = [
  { key: "painel", label: "Painel", href: "/dashboard", icon: TAB_ICONS.painel },
  { key: "leads", label: "Leads", href: "/leads", icon: TAB_ICONS.leads },
  { key: "funil", label: "Funil", href: "/funil", icon: TAB_ICONS.funil },
  { key: "agenda", label: "Agenda", href: "/agenda", icon: TAB_ICONS.agenda },
];

export interface MobileTabBarProps {
  activeKey: string;
  tabs?: [TabItem, TabItem, TabItem, TabItem];
  onNavigate?: (href: string) => void;
  /** ação do botão central (novo lead / disparo) */
  onFab: () => void;
  fabLabel?: string;
}

/** Barra inferior do app (some acima de 900 px). Botão central com o R oficial. */
export function MobileTabBar({ activeKey, tabs = DEFAULT_TABS, onNavigate, onFab, fabLabel = "Novo lead" }: MobileTabBarProps) {
  const renderTab = (t: TabItem) => (
    <a
      key={t.key}
      href={t.href}
      className="rt-tab"
      aria-current={t.key === activeKey ? "page" : undefined}
      onClick={(e) => {
        if (onNavigate) {
          e.preventDefault();
          onNavigate(t.href);
        }
      }}
    >
      <span className="rt-tab__mark" />
      {t.icon}
      <span>{t.label}</span>
    </a>
  );
  return (
    <nav className="rt-tabbar" aria-label="Navegação do app">
      {renderTab(tabs[0])}
      {renderTab(tabs[1])}
      <button type="button" className="rt-tab__fab" aria-label={fabLabel} onClick={onFab}>
        <img src={brandAssets.r} alt="" />
      </button>
      {renderTab(tabs[2])}
      {renderTab(tabs[3])}
    </nav>
  );
}
