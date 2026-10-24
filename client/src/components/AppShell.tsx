import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { enviarArquivo } from "./equipe/CadastroUsuario";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe, podeAbrir, ROTULO_PERFIL } from "@shared/equipe";
import { trpc } from "@/lib/trpc";
import AvisoRotinas from "./AvisoRotinas";
import {
  BarChart3, Building2, Flame, Images, KanbanSquare, LayoutDashboard, LineChart, LogOut, Megaphone, Menu, Send,
  Settings, UserCog, Users, X, Eye, ClipboardList, CalendarDays, Map as MapIcon, Smartphone, Wallet,
} from "lucide-react";

/** modulo = chave em shared/permissoes.ts (some do menu quando o módulo está desligado para o corretor) */
type Item = { rotulo: string; rota: string; icone: React.ComponentType<{ className?: string }>; exato?: boolean; modulo?: string };
type Grupo = { titulo?: string; itens: Item[] };

const MENU: Grupo[] = [
  { itens: [{ rotulo: "Painel", rota: "/dashboard", icone: LayoutDashboard }, { rotulo: "Área do corretor", rota: "/corretor", icone: Smartphone }] },
  {
    titulo: "Leads",
    itens: [
      { rotulo: "Leads", rota: "/leads", icone: Flame, exato: true, modulo: "leads" },
      { rotulo: "Funil", rota: "/leads/funil", icone: KanbanSquare, modulo: "leads" },
      { rotulo: "Agenda de visitas", rota: "/leads/agenda", icone: CalendarDays, modulo: "leads" },
      { rotulo: "Campanhas de captação", rota: "/leads/campanhas", icone: Megaphone, modulo: "leads" },
      { rotulo: "Relatório", rota: "/leads/relatorio", icone: BarChart3, modulo: "leads" },
      { rotulo: "Lista de interesse", rota: "/leads/lista-interesse", icone: ClipboardList, modulo: "leads" },
    ],
  },
  {
    titulo: "Vendas",
    itens: [
      { rotulo: "Empreendimentos", rota: "/empreendimentos", icone: MapIcon, modulo: "empreendimentos" },
      { rotulo: "Financeiro", rota: "/financeiro", icone: Wallet, modulo: "financeiro" },
      { rotulo: "Imóveis", rota: "/properties", icone: Building2, modulo: "imoveis" },
      { rotulo: "Materiais", rota: "/materiais", icone: Images, modulo: "materiais" },
      { rotulo: "Clientes", rota: "/contacts", icone: Users, modulo: "contatos" },
      { rotulo: "Disparos WhatsApp", rota: "/campaigns", icone: Send, modulo: "campanhas" },
      { rotulo: "Desempenho", rota: "/performance", icone: LineChart, modulo: "desempenho" },
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
export function menuDoPerfil(perfil: ReturnType<typeof perfilDe>, modulos?: Record<string, boolean> | null): Grupo[] {
  return MENU.map(g => ({ ...g, itens: g.itens.filter(i => podeAbrir(perfil, i.rota) && (perfil === "admin" || !i.modulo || !modulos || modulos[i.modulo] !== false)) }))
    .filter(g => g.itens.length);
}

export function tituloDaRota(loc: string): string {
  for (const g of MENU) for (const i of g.itens) if (ativo(loc, i)) return i.rotulo;
  if (loc.startsWith("/leads/lead/")) return "Lead";
  return "Romatec CRM";
}

function Navegacao({ onNavegar }: { onNavegar?: () => void }) {
  const [loc, navigate] = useLocation();
  const { user } = useAuth();
  const perfil = perfilDe(user as any);
  const { data: minhas } = trpc.permissoes.minhas.useQuery(undefined, { enabled: perfil === "equipe", staleTime: 60_000 });
  const grupos = menuDoPerfil(perfil, minhas?.modulos);
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

/** Foto de perfil do usuário logado (todos os perfis); clicar troca a foto */
export function FotoUsuario({ tamanho = "h-9 w-9", editavel = true }: { tamanho?: string; editavel?: boolean }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const ref = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const nome = String((user as any)?.name || "Usuário");
  const foto = (user as any)?.fotoUrl as string | null | undefined;
  const trocar = async (f: File | undefined) => {
    if (!f) return;
    setEnviando(true);
    try {
      await enviarArquivo("/api/usuarios/me/foto", f);
      await utils.auth.me.invalidate();
      toast.success("Foto atualizada");
    } catch (e: any) { toast.error(e.message); }
    finally { setEnviando(false); if (ref.current) ref.current.value = ""; }
  };
  const conteudo = foto ? <img src={foto} alt={nome} className={`${tamanho} shrink-0 rounded-full object-cover ${enviando ? "opacity-50" : ""}`} />
    : <div className={`${tamanho} shrink-0 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold`}>{nome.charAt(0).toUpperCase()}</div>;
  if (!editavel) return conteudo;
  return (
    <>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => trocar(e.target.files?.[0])} />
      <button type="button" onClick={() => ref.current?.click()} title="Trocar foto de perfil" disabled={enviando} className="rounded-full">{conteudo}</button>
    </>
  );
}

function Rodape() {
  const { user, logout } = useAuth();
  const perfil = perfilDe(user as any);
  const nome = String((user as any)?.name || "Usuário");
  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
        <FotoUsuario />
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
        <p className="font-semibold truncate flex-1">{tituloDaRota(loc)}</p>
        <FotoUsuario tamanho="h-8 w-8" />
      </header>

      <AvisoRotinas />
      <main className="min-w-0">{children}</main>
    </div>
  );
}
