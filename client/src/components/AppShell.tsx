import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { daEquipe, perfilDe, podeAbrir, ROTULO_PERFIL } from "@shared/equipe";
import { trpc } from "@/lib/trpc";
import AvisoRotinas from "./AvisoRotinas";
import { MobileTabBar, RomatecAppIcon, RomatecLockup, TAB_ICONS, type TabItem } from "@/brand";
import {
  BarChart3, Building2, Flame, Images, KanbanSquare, LayoutDashboard, LineChart, LogOut, Megaphone, Menu, Send,
  Settings, UserCog, Users, X, Eye, ClipboardList, CalendarDays, Map as MapIcon, Smartphone, Wallet, IdCard, FolderOpen, Bell, FileSignature, Mic, CalendarCheck, UserPlus, BookCopy, BadgeDollarSign, Hourglass, Bot, Trophy, Link2, Zap,
  ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { abrirNovidades, SinoNovidades, useNovidadesNaoLidas } from "./sistema/Novidades";
import { useNotificacoes } from "./sistema/Notificacoes";
import { APP_VERSION } from "@/brand";

/**
 * modulo = chave em shared/permissoes.ts (some do menu quando o módulo está desligado para o corretor).
 * cor = cor do ícone (o grupo dá a cor; o item pode trocar, ex.: Financeiro dourado).
 */
type Item = { rotulo: string; rota: string; icone: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; exato?: boolean; modulo?: string; cor?: string };
type Grupo = { titulo?: string; cor: string; itens: Item[] };

const COR = { geral: "#F472B6", leads: "#F97316", vendas: "#22C55E", financeiro: "#D4A62A", admin: "#3B82F6" };

const MENU: Grupo[] = [
  {
    cor: COR.geral,
    itens: [
      { rotulo: "Painel", rota: "/dashboard", icone: LayoutDashboard },
      { rotulo: "Área do corretor", rota: "/corretor", icone: Smartphone },
      { rotulo: "Meu cadastro", rota: "/meu-cadastro", icone: IdCard },
      { rotulo: "Notificações", rota: "#novidades", icone: Bell },
      // Administrador e secretária (shared/equipe.ts → podeAbrir)
      { rotulo: "Recrutamento", rota: "/recrutamento", icone: UserPlus },
    ],
  },
  {
    titulo: "Leads",
    cor: COR.leads,
    itens: [
      { rotulo: "Atender agora", rota: "/leads/atender", icone: Zap, modulo: "leads" },
      { rotulo: "Leads", rota: "/leads", icone: Flame, exato: true, modulo: "leads" },
      { rotulo: "Funil", rota: "/leads/funil", icone: KanbanSquare, modulo: "leads" },
      { rotulo: "Agenda de visitas", rota: "/leads/agenda", icone: CalendarDays, modulo: "leads" },
      { rotulo: "Reuniões", rota: "/reunioes", icone: Mic, modulo: "leads" },
      { rotulo: "Convites de reunião", rota: "/convites", icone: CalendarCheck },
      { rotulo: "Campanhas de captação", rota: "/leads/campanhas", icone: Megaphone, modulo: "leads" },
      { rotulo: "Links de divulgação", rota: "/leads/campanhas?aba=links", icone: Link2, modulo: "leads" },
      { rotulo: "Relatório", rota: "/leads/relatorio", icone: BarChart3, modulo: "leads" },
      { rotulo: "Lista de interesse", rota: "/leads/lista-interesse", icone: ClipboardList, modulo: "leads" },
    ],
  },
  {
    titulo: "Vendas",
    cor: COR.vendas,
    itens: [
      { rotulo: "Empreendimentos", rota: "/empreendimentos", icone: MapIcon, modulo: "empreendimentos" },
      { rotulo: "Contratos", rota: "/contratos", icone: FileSignature, modulo: "contratos" },
      { rotulo: "Ranking de vendas", rota: "/ranking", icone: Trophy },
      // Administrador e secretária (shared/equipe.ts → podeAbrir)
      { rotulo: "Fila de reservas", rota: "/reservas", icone: Hourglass },
      { rotulo: "Carteirinhas", rota: "/carteirinhas", icone: IdCard, modulo: "contratos" },
      { rotulo: "Links de contratos e documentos", rota: "/contratos?aba=links", icone: FolderOpen, modulo: "contratos" },
      { rotulo: "Talonários", rota: "/talonarios", icone: BookCopy },
      { rotulo: "Financeiro", rota: "/financeiro", icone: Wallet, modulo: "financeiro", cor: COR.financeiro },
      { rotulo: "Imóveis", rota: "/properties", icone: Building2, modulo: "imoveis" },
      { rotulo: "Materiais", rota: "/materiais", icone: Images, modulo: "materiais" },
      { rotulo: "Clientes", rota: "/contacts", icone: Users, modulo: "contatos" },
      { rotulo: "Disparos WhatsApp", rota: "/campaigns", icone: Send, modulo: "campanhas" },
      { rotulo: "Desempenho", rota: "/performance", icone: LineChart, modulo: "desempenho" },
    ],
  },
  {
    titulo: "Administração",
    cor: COR.admin,
    itens: [
      { rotulo: "Equipe", rota: "/equipe", icone: UserCog },
      // Administrador e secretária (shared/equipe.ts → podeAbrir)
      { rotulo: "Respostas automáticas", rota: "/respostas-automaticas", icone: Bot },
      { rotulo: "SaaS e assinaturas", rota: "/saas", icone: BadgeDollarSign },
      // "Ver como" (só o administrador): o sistema exatamente como cada pessoa vê, só leitura
      { rotulo: "Visão portal do corretor", rota: "/ver-como?perfil=corretor", icone: Smartphone },
      { rotulo: "Visão da secretária", rota: "/ver-como?perfil=secretario", icone: UserCog },
      { rotulo: "Visão do empreendedor", rota: "/ver-como?perfil=empreendedor", icone: Eye },
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

/** Preferência do menu guardada no navegador (falha silenciosa: modo privado, armazenamento bloqueado) */
function lerPref<T>(chave: string, padrao: T): T {
  try { const v = localStorage.getItem(chave); return v == null ? padrao : (JSON.parse(v) as T); } catch { return padrao; }
}
function gravarPref(chave: string, v: unknown) {
  try { localStorage.setItem(chave, JSON.stringify(v)); } catch { /* sem armazenamento: vale só nesta visita */ }
}

/** Ícone num quadradinho com a cor do grupo (mais forte na tela atual) */
function IconeMenu({ icone: Icone, cor, on }: { icone: Item["icone"]; cor: string; on: boolean }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors"
      style={{ background: `color-mix(in srgb, ${cor} ${on ? 30 : 15}%, transparent)` }}>
      <Icone className="h-4 w-4" style={{ color: cor }} />
    </span>
  );
}

function Navegacao({ onNavegar, recolhido = false }: { onNavegar?: () => void; recolhido?: boolean }) {
  const [loc, navigate] = useLocation();
  const { user } = useAuth();
  const perfil = perfilDe(user as any);
  const { data: minhas } = trpc.permissoes.minhas.useQuery(undefined, { enabled: daEquipe(perfil), staleTime: 60_000 });
  const grupos = menuDoPerfil(perfil, minhas?.modulos);
  // Grupos fechados pelo usuário (o da tela atual fica sempre aberto)
  const [fechados, setFechados] = useState<string[]>(() => lerPref("menu.gruposFechados", []));
  const alternar = (titulo: string) => setFechados(f => { const n = f.includes(titulo) ? f.filter(x => x !== titulo) : [...f, titulo]; gravarPref("menu.gruposFechados", n); return n; });
  // Bolinha vermelha em "Meu cadastro": credencial ausente, vencida ou a vencer
  const { data: pendencias } = trpc.cadastro.minhasPendencias.useQuery(undefined, { enabled: !!user, staleTime: 5 * 60_000 });
  const novidades = useNovidadesNaoLidas(!!user) + useNotificacoes(!!user).naoLidas;
  return (
    <nav className={`flex-1 overflow-y-auto py-2 ${recolhido ? "px-2 space-y-2" : "px-3 space-y-3"}`}>
      {grupos.map((g, gi) => {
        const temAtual = g.itens.some(it => ativo(loc, it));
        const fechado = !recolhido && !!g.titulo && fechados.includes(g.titulo) && !temAtual;
        return (
          <div key={gi} className="space-y-0.5">
            {g.titulo && (recolhido
              ? <div className="mx-auto my-1 h-px w-8 rounded" style={{ background: `color-mix(in srgb, ${g.cor} 50%, transparent)` }} title={g.titulo} />
              : (
                <button type="button" onClick={() => alternar(g.titulo!)} aria-expanded={!fechado}
                  className="flex w-full items-center gap-1.5 rounded-md px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45 hover:text-sidebar-foreground/80">
                  <ChevronRight className={`h-3 w-3 transition-transform ${fechado ? "" : "rotate-90"}`} />
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.cor }} />
                  {g.titulo}
                  {fechado && <span className="ml-auto font-normal normal-case tracking-normal">{g.itens.length}</span>}
                </button>
              ))}
            {!fechado && g.itens.map(it => {
              const on = ativo(loc, it);
              const alerta = (it.rota === "/meu-cadastro" && !!pendencias?.length) || (it.rota === "#novidades" && novidades > 0);
              return (
                <button
                  key={it.rota}
                  title={recolhido ? it.rotulo : undefined}
                  aria-label={it.rotulo}
                  onClick={() => { if (it.rota === "#novidades") abrirNovidades(); else navigate(it.rota); onNavegar?.(); }}
                  className={`relative w-full flex items-center rounded-lg text-sm transition-colors ${recolhido ? "justify-center p-1.5" : "gap-3 px-2 py-1.5"} ${on
                    ? "bg-primary/15 text-primary font-semibold shadow-[inset_3px_0_0_var(--primary)]"
                    : "text-sidebar-foreground/75 hover:bg-white/5 hover:text-sidebar-foreground"}`}
                >
                  <IconeMenu icone={it.icone} cor={it.cor ?? g.cor} on={on} />
                  {!recolhido && <span className="truncate">{it.rotulo}</span>}
                  {recolhido && alerta && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />}
                  {!recolhido && it.rota === "/meu-cadastro" && !!pendencias?.length && (
                    <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-red-500" title={pendencias.join(" · ")} />
                  )}
                  {!recolhido && it.rota === "#novidades" && novidades > 0 && (
                    <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{novidades}</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

/** Foto de perfil do usuário logado (todos os perfis); clicar abre "Meu cadastro" (foto com recorte/selfie) */
export function FotoUsuario({ tamanho = "h-9 w-9", editavel = true }: { tamanho?: string; editavel?: boolean }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const nome = String((user as any)?.name || "Usuário");
  const foto = (user as any)?.fotoUrl as string | null | undefined;
  const conteudo = foto ? <img src={foto} alt={nome} className={`${tamanho} shrink-0 rounded-full object-cover`} />
    : <div className={`${tamanho} shrink-0 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold`}>{nome.charAt(0).toUpperCase()}</div>;
  if (!editavel) return conteudo;
  return <button type="button" onClick={() => navigate("/meu-cadastro")} title="Meu cadastro" className="rounded-full">{conteudo}</button>;
}

function Rodape({ recolhido = false }: { recolhido?: boolean }) {
  const { user, logout } = useAuth();
  const perfil = perfilDe(user as any);
  const nome = String((user as any)?.name || "Usuário");
  if (recolhido) return (
    <div className="flex flex-col items-center gap-2 border-t border-sidebar-border px-2 py-3">
      <FotoUsuario />
      <SinoNovidades />
      <button onClick={() => logout()} title="Sair" aria-label="Sair" className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-white/10 hover:text-red-300"><LogOut className="h-4 w-4" /></button>
      <p className="text-[9px] text-sidebar-foreground/40">v{APP_VERSION}</p>
    </div>
  );
  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
        <FotoUsuario />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-sidebar-foreground truncate">{nome}</p>
          <p className="text-[10px] text-sidebar-foreground/50 truncate">{perfil ? ROTULO_PERFIL[perfil] : ""}</p>
        </div>
        <SinoNovidades />
        <button onClick={() => logout()} title="Sair" className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-white/10 hover:text-red-300"><LogOut className="h-4 w-4" /></button>
      </div>
      <p className="mt-2 text-center text-[10px] tracking-wide text-sidebar-foreground/40">CRM Romatec v{APP_VERSION}</p>
    </div>
  );
}

/** Logo oficial no topo do menu (rosa + ROMATEC + CRM) — identidade visual v1.0 */
function Marca({ recolhido = false }: { recolhido?: boolean }) {
  if (recolhido) return <div className="flex justify-center py-4"><RomatecAppIcon size={40} /></div>;
  return (
    <div className="px-4 py-4">
      <RomatecLockup variant="menu" height={48} />
    </div>
  );
}

/** Botão de recolher/expandir o menu (desktop) */
function BotaoRecolher({ recolhido, onAlternar }: { recolhido: boolean; onAlternar: () => void }) {
  return (
    <button type="button" onClick={onAlternar} title={recolhido ? "Expandir o menu" : "Recolher o menu"} aria-label={recolhido ? "Expandir o menu" : "Recolher o menu"}
      className={`mx-2 mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-sidebar-foreground/55 hover:bg-white/5 hover:text-sidebar-foreground ${recolhido ? "justify-center" : ""}`}>
      {recolhido ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Recolher menu</>}
    </button>
  );
}

/**
 * Barra inferior no celular (< 900 px): Painel · Leads · [R] · Funil · Agenda. O R abre a Área do corretor
 * (atalhos de cadastro) — o CRM ainda não tem tela de lead manual (/leads/novo).
 */
function BarraInferior({ modulos }: { modulos?: Record<string, boolean> | null }) {
  const [loc, navigate] = useLocation();
  const { user } = useAuth();
  const perfil = perfilDe(user as any);
  // Corretor sem o módulo de leads: a barra (só de leads) não aparece
  if (perfil !== "admin" && modulos && modulos.leads === false) return null;
  const ativa = loc.startsWith("/leads/funil") ? "funil" : loc.startsWith("/leads/agenda") ? "agenda" : loc.startsWith("/leads") ? "leads" : loc.startsWith("/dashboard") ? "painel" : "";
  const tabs = [
    { key: "painel", label: "Painel", href: "/dashboard", icon: TAB_ICONS.painel },
    { key: "leads", label: "Leads", href: "/leads", icon: TAB_ICONS.leads },
    { key: "funil", label: "Funil", href: "/leads/funil", icon: TAB_ICONS.funil },
    { key: "agenda", label: "Agenda", href: "/leads/agenda", icon: TAB_ICONS.agenda },
  ] as [TabItem, TabItem, TabItem, TabItem];
  return <MobileTabBar activeKey={ativa} tabs={tabs} onNavigate={navigate} onFab={() => navigate("/corretor")} fabLabel="Atalhos de cadastro" />;
}

/** Layout das telas internas: menu lateral fixo (desktop) / gaveta (celular) + barra do topo */
/** Camada SaaS: contagem regressiva do teste/cortesia (últimos 7 dias) e inadimplência dentro da tolerância */
function BannerLicenca({ licenca }: { licenca?: { exigida: boolean; liberado: boolean; status: string | null; origem: string | null; diasRestantes: number | null } | null }) {
  if (!licenca?.exigida || !licenca.liberado) return null;
  const teste = licenca.status === "TRIAL", cortesia = licenca.status === "ATIVA" && licenca.origem === "CORTESIA";
  const atraso = licenca.status === "INADIMPLENTE";
  const d = licenca.diasRestantes;
  if (!atraso && !((teste || cortesia) && d != null && d <= 7)) return null;
  const texto = atraso ? "Pagamento em atraso: regularize para não perder o acesso."
    : `${teste ? "Teste grátis" : "Cortesia"}: ${d === 0 ? "termina hoje" : `faltam ${d} dia(s)`}.`;
  return (
    <div className={`flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-sm ${atraso || (d ?? 9) <= 1 ? "bg-red-500/15 text-red-200" : "bg-[var(--rt-gold)]/15 text-[var(--rt-gold-light,#E8C766)]"}`}>
      <span>{texto}</span>
      <Link href="/assinatura" className="rounded-full bg-[var(--rt-gold)] px-3 py-1 text-xs font-semibold text-black">Assinar</Link>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();
  const [aberto, setAberto] = useState(false);
  useEffect(() => setAberto(false), [loc]);
  const { user } = useAuth();
  const { data: minhas } = trpc.permissoes.minhas.useQuery(undefined, { enabled: daEquipe(perfilDe(user as any)), staleTime: 60_000 });
  // Menu recolhido só nos ícones (desktop); a escolha fica guardada no navegador
  const [recolhido, setRecolhido] = useState<boolean>(() => lerPref("menu.recolhido", false));
  const alternarMenu = () => setRecolhido(r => { gravarPref("menu.recolhido", !r); return !r; });

  return (
    <div className={`min-h-screen bg-background transition-[padding] duration-200 print:!pl-0 ${recolhido ? "lg:pl-[72px]" : "lg:pl-64"}`}>
      {/* Menu fixo (desktop) */}
      <aside className={`hidden lg:flex fixed inset-y-0 left-0 z-30 flex-col bg-sidebar border-r border-sidebar-border transition-[width] duration-200 ${recolhido ? "w-[72px]" : "w-64"}`}>
        <Marca recolhido={recolhido} />
        <Navegacao recolhido={recolhido} />
        <BotaoRecolher recolhido={recolhido} onAlternar={alternarMenu} />
        <Rodape recolhido={recolhido} />
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
        <RomatecAppIcon size={28} />
        <p className="font-semibold truncate flex-1">{tituloDaRota(loc)}</p>
        <SinoNovidades className="text-foreground/70" />
        <FotoUsuario tamanho="h-8 w-8" />
      </header>

      <AvisoRotinas />
      <BannerLicenca licenca={(user as any)?.licenca} />
      {/* No celular, espaço para a barra inferior (96 px) */}
      <main className="min-w-0 pb-24 min-[900px]:pb-0">{children}</main>
      <BarraInferior modulos={minhas?.modulos} />
    </div>
  );
}
