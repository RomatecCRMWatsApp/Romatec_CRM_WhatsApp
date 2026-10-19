import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe, podeAbrir, ROTULO_PERFIL } from "@shared/equipe";
import AvisoRotinas from "./AvisoRotinas";
import {
  BarChart3, Building2, Flame, Images, KanbanSquare, LayoutDashboard, LineChart, LogOut, Megaphone, Menu, Send,
  Settings, UserCog, Users, X, Eye, ClipboardList, CalendarDays,
} from "lucide-react";

type Item = { rotulo: string; rota: string; icone: React.ComponentType<{ className?: string }>; exato?: boolean };
type Grupo = { titulo?: string; itens: Item[] };

const MENU: Grupo[] = [
  { itens: [{ rotulo: "Painel", rota: "/dashboard", icone: LayoutDashboard }] },
  {
    titulo: "Leads",
    itens: [
      { rotulo: "Leads", rota: "/leads", icone: Flame, exato: true },
      { rotulo: "Funil", rota: "/leads/funil", icone: KanbanSquare },
      { rotulo: "Agenda de visitas", rota: "/leads/agenda", icone: CalendarDays },
      { rotulo: "Campanhas de captação", rota: "/leads/campanhas", icone: Megaphone },
      { rotulo: "Relatório", rota: "/leads/relatorio", icone: BarChart3 },
      { rotulo: "Lista de interesse", rota: "/leads/lista-interesse", icone: ClipboardList },
    ],
  },
  {
    titulo: "Vendas",
    itens: [
      { rotulo: "Imóveis", rota: "/properties", icone: Building2 },
      { rotulo: "Materiais", rota: "/materiais", icone: Images },
      { rotulo: "Clientes", rota: "/contacts", icone: Users },
      { rotulo: "Disparos WhatsApp", rota: "/campaigns", icone: Send },
      { rotulo: "Desempenho", rota: "/performance", icone: LineChart },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { rotulo: "Equipe", rota: "/equipe", icone: UserCog },
      { rotulo: "Visão do empreendedor", rota: "/empreendedor", icone: Eye },
      { rotulo: "Configurações", rota: "/settings", icone: Settings },
    ],
  },
];

const ativo = (loc: string, it: Item) => (it.exato ? loc === it.rota : loc === it.rota || loc.startsWith(`${it.rota}/`));

/** Itens que o perfil pode abrir (mesma regra do servidor/rotas: shared/equipe.ts) */
export function menuDoPerfil(perfil: ReturnType<typeof perfilDe>): Grupo[] {
  return MENU.map(g => ({ ...g, itens: g.itens.filter(i => podeAbrir(perfil, i.rota)) })).filter(g => g.itens.length);
}

export function tituloDaRota(loc: string): string {
  for (const g of MENU) for (const i of g.itens) if (ativo(loc, i)) return i.rotulo;
  if (loc.startsWith("/leads/lead/")) return "Lead";
  return "Romatec CRM";
}

function Navegacao({ onNavegar }: { onNavegar?: () => void }) {
  const [loc, navigate] = useLocation();
  const { user } = useAuth();
  const grupos = menuDoPerfil(perfilDe(user as any));
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
      {grupos.map((g, gi) => (
        <div key={gi} className="space-y-0.5">
          {g.titulo && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">{g.titulo}</p>}
          {g.itens.map(it => {
            const on = ativo(loc, it);
            const Icone = it.icone;
            return (
              <button
                key={it.rota}
                onClick={() => { navigate(it.rota); onNavegar?.(); }}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${on
                  ? "bg-primary/15 text-primary font-semibold shadow-[inset_3px_0_0_var(--primary)]"
                  : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-sidebar-foreground"}`}
              >
                <Icone className="h-4 w-4 shrink-0" />
                <span className="truncate">{it.rotulo}</span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Rodape() {
  const { user, logout } = useAuth();
  const perfil = perfilDe(user as any);
  const nome = String((user as any)?.name || "Usuário");
  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
        <div className="h-9 w-9 shrink-0 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">{nome.charAt(0).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-sidebar-foreground truncate">{nome}</p>
          <p className="text-[10px] text-sidebar-foreground/50 truncate">{perfil ? ROTULO_PERFIL[perfil] : ""}</p>
        </div>
        <button onClick={() => logout()} title="Sair" className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-white/10 hover:text-red-300"><LogOut className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function Marca() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-4">
      <img src="/icon-192x192.png" alt="" className="h-9 w-9 rounded-xl" />
      <div className="leading-tight">
        <p className="font-bold text-sidebar-foreground">Romatec CRM</p>
        <p className="text-[10px] text-sidebar-foreground/50">Consultoria Imobiliária</p>
      </div>
    </div>
  );
}

/** Layout das telas internas: menu lateral fixo (desktop) / gaveta (celular) + barra do topo */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();
  const [aberto, setAberto] = useState(false);
  useEffect(() => setAberto(false), [loc]);

  return (
    <div className="min-h-screen bg-background lg:pl-64">
      {/* Menu fixo (desktop) */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 flex-col bg-sidebar border-r border-sidebar-border">
        <Marca />
        <Navegacao />
        <Rodape />
      </aside>

      {/* Gaveta (celular/tablet) */}
      {aberto && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setAberto(false)} />
          <aside className="relative z-10 flex w-72 max-w-[85vw] flex-col bg-sidebar border-r border-sidebar-border">
            <div className="flex items-center justify-between pr-3"><Marca /><button onClick={() => setAberto(false)} className="p-2 text-sidebar-foreground/70"><X className="h-5 w-5" /></button></div>
            <Navegacao onNavegar={() => setAberto(false)} />
            <Rodape />
          </aside>
        </div>
      )}

      {/* Barra do topo (celular): abre a gaveta */}
      <header className="lg:hidden sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/90 backdrop-blur px-3 py-2">
        <button onClick={() => setAberto(true)} className="rounded-lg p-2 hover:bg-white/5" aria-label="Abrir menu"><Menu className="h-5 w-5" /></button>
        <img src="/icon-192x192.png" alt="" className="h-7 w-7 rounded-lg" />
        <p className="font-semibold truncate">{tituloDaRota(loc)}</p>
      </header>

      <AvisoRotinas />
      <main className="min-w-0">{children}</main>
    </div>
  );
}
