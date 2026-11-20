import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import BotaoInstalarApp from "@/components/sistema/BotaoInstalarApp";
import { daEquipe, perfilDe, podeAbrir, ROTULO_PERFIL } from "@shared/equipe";
import { trpc } from "@/lib/trpc";
import AvisoRotinas from "./AvisoRotinas";
import { MobileTabBar, RomatecAppIcon, RomatecLockup, TAB_ICONS, type TabItem } from "@/brand";
import BuscaGlobal, { JanelaBusca, type TelaBusca } from "@/components/BuscaGlobal";
import { Scale,
  BarChart3, Building2, Flame, Images, KanbanSquare, LayoutDashboard, LineChart, LogOut, Megaphone, Menu, Send,
  Settings, UserCog, Users, X, Eye, ClipboardList, CalendarDays, Map as MapIcon, Smartphone, Wallet, IdCard, FolderOpen, Bell, FileSignature, Handshake, Mic, CalendarCheck, UserPlus, BookCopy, BadgeDollarSign, Hourglass, Bot, Trophy, Link2, Zap, MessagesSquare, ListOrdered, Plug, Inbox, Building, Rotate3d, Box, Video,
  ChevronDown, ChevronLeft, ChevronRight,
  Radar, BookOpen,
 Shuffle, CheckCheck, ShieldCheck, Search, Camera, Sun, Moon, Monitor, Volume2, VolumeX, SlidersHorizontal,
} from "lucide-react";
import { abrirNovidades, SinoNovidades, useNovidadesNaoLidas } from "./sistema/Novidades";
import { definirAparencia, definirSom, tocarNavegacao, usePreferenciasVisuais, useTemaDoApp, type Aparencia } from "@/lib/aparencia";
import { useNotificacoes } from "./sistema/Notificacoes";
import { APP_VERSION } from "@/brand";

/**
 * modulo = chave em shared/permissoes.ts (some do menu quando o módulo está desligado para o corretor).
 * cor = cor do ícone (o grupo dá a cor; o item pode trocar, ex.: Financeiro dourado).
 */
type Item = { rotulo: string; rota: string; icone: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; exato?: boolean; modulo?: string; cor?: string };
type Grupo = { titulo?: string; cor: string; itens: Item[] };

const COR = { geral: "#F472B6", leads: "#F97316", vendas: "#22C55E", financeiro: "#D4A62A", conteudo: "#2DD4BF", admin: "#3B82F6" };

/**
 * Menu em grupos por finalidade (upgrade visual). Só a organização mudou: rotas, ícones, módulos e regras de acesso
 * (podeAbrir + módulos ligados) são os mesmos de antes. Nenhum item foi removido.
 */
const MENU: Grupo[] = [
  {
    cor: COR.geral,
    itens: [
      { rotulo: "Painel", rota: "/dashboard", icone: LayoutDashboard },
    ],
  },
  {
    titulo: "Relacionamento",
    cor: COR.leads,
    itens: [
      { rotulo: "Atender agora", rota: "/leads/atender", icone: Zap, modulo: "leads" },
      { rotulo: "Caixa de entrada", rota: "/caixa-entrada", icone: Inbox, modulo: "leads" },
      { rotulo: "Leads recebidos", rota: "/leads/recebidos", icone: CheckCheck, modulo: "leads" },
      { rotulo: "Leads", rota: "/leads", icone: Flame, exato: true, modulo: "leads" },
      { rotulo: "Distribuição de leads", rota: "/leads/distribuicao", icone: Shuffle, modulo: "leads" },
      { rotulo: "Funil", rota: "/leads/funil", icone: KanbanSquare, modulo: "leads" },
      { rotulo: "Campanhas de captação", rota: "/leads/campanhas", icone: Megaphone, modulo: "leads" },
      { rotulo: "Links de divulgação", rota: "/leads/campanhas?aba=links", icone: Link2, modulo: "leads" },
      { rotulo: "Sequências de follow-up", rota: "/leads/sequencias", icone: ListOrdered, modulo: "leads" },
      { rotulo: "Relatório", rota: "/leads/relatorio", icone: BarChart3, modulo: "leads" },
      { rotulo: "Lista de interesse", rota: "/leads/lista-interesse", icone: ClipboardList, modulo: "leads" },
      { rotulo: "Agenda de visitas", rota: "/leads/agenda", icone: CalendarDays, modulo: "leads" },
      { rotulo: "Reuniões", rota: "/reunioes", icone: Mic, modulo: "leads" },
      { rotulo: "Convites de reunião", rota: "/convites", icone: CalendarCheck },
      { rotulo: "Sala de vídeo", rota: "/sala-video", icone: Video },
      { rotulo: "Clientes", rota: "/contacts", icone: Users, modulo: "contatos" },
      { rotulo: "Disparos WhatsApp", rota: "/campaigns", icone: Send, modulo: "campanhas" },
      { rotulo: "Desempenho", rota: "/performance", icone: LineChart, modulo: "desempenho" },
    ],
  },
  {
    titulo: "Vendas e empreendimentos",
    cor: COR.vendas,
    itens: [
      { rotulo: "Empreendimentos", rota: "/empreendimentos", icone: MapIcon, modulo: "empreendimentos" },
      { rotulo: "Imóveis", rota: "/properties", icone: Building2, modulo: "imoveis" },
      { rotulo: "Cadastro pelo WhatsApp", rota: "/imoveis/whatsapp", icone: Smartphone, modulo: "imoveis" },
      { rotulo: "Contratos", rota: "/contratos", icone: FileSignature, modulo: "contratos" },
      { rotulo: "Contrato de gestão", rota: "/contrato-gestao", icone: Handshake },
      { rotulo: "Autorizações da proprietária", rota: "/autorizacoes", icone: ShieldCheck },
      { rotulo: "Ranking de vendas", rota: "/ranking", icone: Trophy },
      { rotulo: "Fila de reservas", rota: "/reservas", icone: Hourglass },
      { rotulo: "Carteirinhas", rota: "/carteirinhas", icone: IdCard, modulo: "contratos" },
      { rotulo: "Links de contratos e documentos", rota: "/contratos?aba=links", icone: FolderOpen, modulo: "contratos" },
      { rotulo: "Portal do comprador", rota: "/portal-comprador", icone: MessagesSquare },
      { rotulo: "Imobiliárias parceiras", rota: "/imobiliarias-parceiras", icone: Building },
      { rotulo: "Prospecção B2B", rota: "/prospeccao", icone: Radar },
      { rotulo: "Tour 360°", rota: "/tour-360", icone: Rotate3d },
      { rotulo: "Talonários", rota: "/talonarios", icone: BookCopy },
    ],
  },
  {
    titulo: "Financeiro e jurídico",
    cor: COR.financeiro,
    itens: [
      { rotulo: "Financeiro", rota: "/financeiro", icone: Wallet, modulo: "financeiro", cor: COR.financeiro, exato: true },
      { rotulo: "Painel financeiro", rota: "/financeiro/painel", icone: LayoutDashboard, modulo: "financeiro", cor: COR.financeiro },
      { rotulo: "Portal jurídico", rota: "/juridico", icone: Scale },
    ],
  },
  {
    titulo: "Conteúdo e atividades",
    cor: COR.conteudo,
    itens: [
      { rotulo: "Materiais", rota: "/materiais", icone: Images, modulo: "materiais", exato: true },
      { rotulo: "Tour 3D (fotos)", rota: "/materiais/tour-3d", icone: Box, modulo: "materiais" },
      { rotulo: "Relatórios fotográficos", rota: "/relatorios-fotograficos", icone: Camera },
    ],
  },
  {
    titulo: "Equipe e administração",
    cor: COR.admin,
    itens: [
      { rotulo: "Área do corretor", rota: "/corretor", icone: Smartphone },
      { rotulo: "Meu cadastro", rota: "/meu-cadastro", icone: IdCard },
      { rotulo: "Notificações", rota: "#novidades", icone: Bell },
      { rotulo: "Central de suporte", rota: "/ajuda", icone: BookOpen },
      { rotulo: "Recrutamento", rota: "/recrutamento", icone: UserPlus },
      { rotulo: "Equipe", rota: "/equipe", icone: UserCog },
      { rotulo: "Controle de acessos", rota: "/controle-acessos", icone: ShieldCheck },
      { rotulo: "Respostas automáticas", rota: "/respostas-automaticas", icone: Bot },
      { rotulo: "SaaS e assinaturas", rota: "/saas", icone: BadgeDollarSign },
      { rotulo: "Integrações", rota: "/integracoes", icone: Plug },
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
  if (loc.startsWith("/clientes/")) return "Ficha do cliente";
  return "Romatec CRM";
}

/** Preferência do menu guardada no navegador (falha silenciosa: modo privado, armazenamento bloqueado) */
function lerPref<T>(chave: string, padrao: T): T {
  try { const v = localStorage.getItem(chave); return v == null ? padrao : (JSON.parse(v) as T); } catch { return padrao; }
}
function gravarPref(chave: string, v: unknown) {
  try { localStorage.setItem(chave, JSON.stringify(v)); } catch { /* sem armazenamento: vale só nesta visita */ }
}

/** Ícone de cada grupo (menu recolhido e cabeçalho do grupo) */
const ICONE_GRUPO: Record<string, Item["icone"]> = {
  "Relacionamento": Users,
  "Vendas e empreendimentos": Building2,
  "Financeiro e jurídico": Wallet,
  "Conteúdo e atividades": Images,
  "Equipe e administração": UserCog,
  "Meu empreendimento": Building2,
  "Documentos e artes": FileSignature,
  "Equipe e agenda": Trophy,
};
const idGrupo = (titulo: string) => `menu-grupo-${titulo.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase()}`;
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Bolinhas reais de pendência (Meu cadastro) e notificações não lidas; nada inventado */
function useAlertasMenu() {
  const { user } = useAuth();
  const { data: pendencias } = trpc.cadastro.minhasPendencias.useQuery(undefined, { enabled: !!user, staleTime: 5 * 60_000 });
  const novidades = useNovidadesNaoLidas(!!user) + useNotificacoes(!!user).naoLidas;
  return { pendencias: pendencias ?? [], novidades };
}

/**
 * Outro portal (ex.: empreendedor) usa o mesmo menu com os seus próprios destinos:
 * grupos, qual item está ativo e o que fazer ao escolher (rolar até a seção, abrir rota…).
 */
export type ItemMenuLateral = Item;
export type GrupoMenuLateral = Grupo;
type ContextoMenu = { grupos: Grupo[]; estaAtivo: (it: Item) => boolean; irPara: (it: Item) => void };
const MenuCtx = createContext<ContextoMenu | null>(null);

function useGruposDoMenu() {
  const ctx = useContext(MenuCtx);
  const { user } = useAuth();
  const perfil = perfilDe(user as any);
  const { data: minhas } = trpc.permissoes.minhas.useQuery(undefined, { enabled: !ctx && daEquipe(perfil), staleTime: 60_000 });
  return ctx ? ctx.grupos : menuDoPerfil(perfil, minhas?.modulos);
}

function useEstaAtivo() {
  const ctx = useContext(MenuCtx);
  const [loc] = useLocation();
  return ctx ? ctx.estaAtivo : (it: Item) => ativo(loc, it);
}

const linkBase = "relative flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rt-gold)]";
const linkAtivo = "border border-[var(--rt-gold)]/45 bg-[var(--rt-gold)]/12 font-semibold text-[var(--rt-gold-light)]";
const linkInativo = "border border-transparent text-[var(--rt-text)]/85 hover:bg-[var(--rt-glow)]/[0.07] hover:text-[var(--rt-text)]";

/** Um destino do menu (link real; "#novidades" abre a central de notificações) */
function ItemMenu({ it, onIr, alertas }: { it: Item; loc?: string; onIr: (it: Item) => void; alertas: ReturnType<typeof useAlertasMenu> }) {
  const on = useEstaAtivo()(it);
  const Icone = it.icone;
  return (
    <button type="button" onClick={() => onIr(it)} aria-current={on ? "page" : undefined} className={`rt-nav-item ${linkBase} ${on ? linkAtivo : linkInativo}`}>
      {on && <span aria-hidden className="absolute -left-[3px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--rt-glow)] shadow-[0_0_8px_var(--rt-glow)]" />}
      <Icone className={`h-[18px] w-[18px] shrink-0 ${on ? "text-[var(--rt-gold-light)]" : "text-[var(--rt-text-2)]"}`} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{it.rotulo}</span>
      {it.rota === "/meu-cadastro" && alertas.pendencias.length > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-danger-500" title={alertas.pendencias.join(" · ")} />}
      {it.rota === "#novidades" && alertas.novidades > 0 && <span className="rounded-full bg-danger-500 px-1.5 text-[10px] font-bold text-white">{alertas.novidades}</span>}
    </button>
  );
}

function useIrPara(onNavegar?: () => void) {
  const [, navigate] = useLocation();
  const ctx = useContext(MenuCtx);
  return (it: Item) => {
    if (ctx) { ctx.irPara(it); tocarNavegacao(); }
    else if (it.rota === "#novidades") abrirNovidades();
    else { navigate(it.rota); tocarNavegacao(); }
    onNavegar?.();
  };
}

/** Menu expandido: busca só entre os recursos do menu, grupos recolhíveis e o grupo da tela atual sempre aberto */
function Navegacao({ onNavegar }: { onNavegar?: () => void }) {
  const [loc] = useLocation();
  const { user } = useAuth();
  const grupos = useGruposDoMenu();
  const estaAtivo = useEstaAtivo();
  const alertas = useAlertasMenu();
  const irPara = useIrPara(onNavegar);
  const chave = `menu.gruposAbertos.${(user as any)?.id ?? "anon"}`;
  const [abertos, setAbertos] = useState<string[]>(() => lerPref(chave, []));
  const [busca, setBusca] = useState("");
  const alternar = (titulo: string) => setAbertos(a => { const n = a.includes(titulo) ? a.filter(x => x !== titulo) : [...a, titulo]; gravarPref(chave, n); return n; });
  const termo = semAcento(busca.trim());
  const achados = termo ? grupos.flatMap(g => g.itens).filter(it => semAcento(it.rotulo).includes(termo)) : [];

  return (
    <>
      <div className="shrink-0 px-4 pb-3">
        <label className="relative block">
          <span className="sr-only">Pesquisar recursos do menu</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--rt-text-2)]" aria-hidden />
          <input type="search" value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => { if (e.key === "Escape") setBusca(""); }}
            placeholder="Pesquisar recursos"
            className="h-11 w-full rounded-xl border border-[var(--rt-text-2)]/25 bg-[var(--rt-bg)]/40 pl-10 pr-3 text-sm text-[var(--rt-text)] placeholder:text-[var(--rt-text-2)]/80 focus-visible:border-[var(--rt-gold)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rt-gold)]/40" />
        </label>
      </div>
      <nav aria-label="Menu principal" className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 pb-3">
        {termo ? (
          achados.length ? achados.map(it => <ItemMenu key={it.rota} it={it} loc={loc} onIr={irPara} alertas={alertas} />)
            : <p className="px-3 py-4 text-sm text-[var(--rt-text-2)]">Nenhum recurso com “{busca}”.</p>
        ) : grupos.map((g, gi) => {
          if (!g.titulo) return <div key={gi} className="space-y-1">{g.itens.map(it => <ItemMenu key={it.rota} it={it} loc={loc} onIr={irPara} alertas={alertas} />)}</div>;
          const temAtual = g.itens.some(it => estaAtivo(it));
          const aberto = temAtual || abertos.includes(g.titulo);
          const IconeG = ICONE_GRUPO[g.titulo] ?? Users;
          const id = idGrupo(g.titulo);
          return (
            <div key={gi}>
              <button type="button" onClick={() => alternar(g.titulo!)} aria-expanded={aberto} aria-controls={id} disabled={temAtual}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rt-gold)] disabled:cursor-default ${temAtual ? "font-semibold text-[var(--rt-gold-light)]" : "text-[var(--rt-text)] hover:bg-[var(--rt-glow)]/[0.07]"}`}>
                <IconeG className={`h-[18px] w-[18px] shrink-0 ${temAtual ? "text-[var(--rt-gold-light)]" : "text-[var(--rt-text-2)]"}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{g.titulo}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--rt-text-2)] transition-transform motion-reduce:transition-none ${aberto ? "" : "-rotate-90"}`} aria-hidden />
              </button>
              {aberto && (
                <div id={id} className="ml-[21px] mt-0.5 space-y-0.5 border-l border-[var(--rt-text-2)]/20 pl-3">
                  {g.itens.map(it => <ItemMenu key={it.rota} it={it} loc={loc} onIr={irPara} alertas={alertas} />)}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );
}

/** Dica ao lado do trilho recolhido (hover e foco); fica fixa para não ser cortada pela rolagem do menu */
function Dica({ texto, top }: { texto: string; top: number }) {
  return createPortal(
    <span role="tooltip" style={{ top, left: 112 }}
      className="pointer-events-none fixed z-[70] -translate-y-1/2 whitespace-nowrap rounded-lg border border-[var(--rt-gold)]/60 bg-[var(--rt-surface)] px-3 py-1.5 text-sm text-[var(--rt-text)] shadow-lg">
      {texto}
    </span>,
    document.body,
  );
}

/** Menu recolhido (80 px): ícones dos grupos; clicar abre a lista do grupo ao lado (flyout), Escape fecha */
function NavegacaoRecolhida() {
  const [loc] = useLocation();
  const grupos = useGruposDoMenu();
  const estaAtivo = useEstaAtivo();
  const alertas = useAlertasMenu();
  const [dica, setDica] = useState<{ texto: string; top: number } | null>(null);
  const [flyout, setFlyout] = useState<{ gi: number; top: number } | null>(null);
  const botoes = useRef<Record<number, HTMLButtonElement | null>>({});
  const painel = useRef<HTMLDivElement | null>(null);
  const fechar = (devolverFoco = true) => { if (flyout && devolverFoco) botoes.current[flyout.gi]?.focus(); setFlyout(null); };
  const irPara = useIrPara(() => setFlyout(null));
  useEffect(() => setFlyout(null), [loc]);
  useEffect(() => {
    if (!flyout) return;
    painel.current?.querySelector<HTMLElement>("button")?.focus();
    const fora = (e: MouseEvent) => { const t = e.target as Node; if (!painel.current?.contains(t) && !botoes.current[flyout.gi]?.contains(t)) setFlyout(null); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [flyout]);
  const mostrar = (texto: string) => (e: React.SyntheticEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); setDica({ texto, top: r.top + r.height / 2 }); };
  const alertaGrupo = (g: Grupo) => g.itens.some(it => (it.rota === "/meu-cadastro" && alertas.pendencias.length > 0) || (it.rota === "#novidades" && alertas.novidades > 0));
  const g = flyout ? grupos[flyout.gi] : null;

  return (
    <nav aria-label="Menu principal" className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
      {grupos.map((gr, gi) => {
        const unico = !gr.titulo && gr.itens.length === 1 ? gr.itens[0] : null;
        const rotulo = unico ? unico.rotulo : gr.titulo ?? "Menu";
        const on = gr.itens.some(it => estaAtivo(it));
        const Icone = unico ? unico.icone : ICONE_GRUPO[rotulo] ?? Users;
        const aberto = flyout?.gi === gi;
        return (
          <button key={gi} type="button" ref={el => { botoes.current[gi] = el; }} aria-label={rotulo}
            aria-current={unico && on ? "page" : undefined} aria-expanded={unico ? undefined : aberto} aria-haspopup={unico ? undefined : "true"}
            onMouseEnter={mostrar(rotulo)} onMouseLeave={() => setDica(null)} onFocus={mostrar(rotulo)} onBlur={() => setDica(null)}
            onClick={e => { setDica(null); if (unico) irPara(unico); else { const r = e.currentTarget.getBoundingClientRect(); setFlyout(aberto ? null : { gi, top: r.top }); } }}
            className={`relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rt-gold)] ${on || aberto ? "border border-[var(--rt-gold)]/55 bg-[var(--rt-gold)]/12 text-[var(--rt-gold-light)]" : "border border-transparent text-[var(--rt-text-2)] hover:bg-[var(--rt-glow)]/[0.07] hover:text-[var(--rt-text)]"}`}>
            <Icone className="h-5 w-5" aria-hidden />
            {on && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--rt-glow)] shadow-[0_0_6px_var(--rt-glow)]" />}
            {!on && alertaGrupo(gr) && <span aria-hidden className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger-500" />}
          </button>
        );
      })}
      {dica && !flyout && <Dica texto={dica.texto} top={dica.top} />}
      {g && flyout && createPortal(
        <div ref={painel} role="group" aria-label={g.titulo ?? "Menu"} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); fechar(); } }}
          style={{ top: Math.max(16, Math.min(flyout.top - 8, window.innerHeight - 360)), left: 112 }}
          className="fixed z-[70] flex max-h-[min(70vh,560px)] w-72 flex-col rounded-[20px] border border-[var(--rt-gold)]/40 bg-[color-mix(in_srgb,var(--rt-surface)_96%,transparent)] p-2 shadow-2xl backdrop-blur-md">
          <p className="px-3 pb-1 pt-2 text-sm font-semibold text-[var(--rt-gold-light)]">{g.titulo}</p>
          <div className="min-h-0 space-y-0.5 overflow-y-auto p-1">
            {g.itens.map(it => <ItemMenu key={it.rota} it={it} loc={loc} onIr={irPara} alertas={alertas} />)}
          </div>
        </div>,
        document.body,
      )}
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

const APARENCIAS: { valor: Aparencia; rotulo: string; icone: Item["icone"] }[] = [
  { valor: "claro", rotulo: "Claro", icone: Sun },
  { valor: "escuro", rotulo: "Escuro", icone: Moon },
  { valor: "sistema", rotulo: "Sistema", icone: Monitor },
];

/** Aparência (Claro/Escuro/Sistema) e Som de navegação (começa desligado). Só preferências deste navegador. */
function PreferenciasMenu() {
  const { aparencia, som } = usePreferenciasVisuais();
  return (
    <div className="space-y-2 rounded-2xl border border-[var(--rt-text-2)]/15 bg-[var(--rt-bg)]/30 p-2.5">
      <div role="radiogroup" aria-label="Aparência" className="space-y-1.5">
        <p className="flex items-center gap-2 px-1 text-xs text-[var(--rt-text-2)]"><Sun className="h-3.5 w-3.5" aria-hidden />Aparência</p>
        <div className="grid grid-cols-3 gap-1">
          {APARENCIAS.map(({ valor, rotulo, icone: Icone }) => {
            const sel = aparencia === valor;
            return (
              <button key={valor} type="button" role="radio" aria-checked={sel} onClick={() => definirAparencia(valor)}
                className={`flex min-h-11 items-center justify-center gap-1 rounded-xl border px-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rt-gold)] ${sel ? "rt-pref-sel border-[var(--rt-gold)]/55 bg-[var(--rt-gold)]/15 font-semibold text-[var(--rt-gold-light)]" : "border-[var(--rt-text-2)]/20 text-[var(--rt-text-2)] hover:text-[var(--rt-text)]"}`}>
                <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden />{rotulo}
              </button>
            );
          })}
        </div>
      </div>
      <button type="button" role="switch" aria-checked={som} onClick={() => definirSom(!som)}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-1 text-left text-sm text-[var(--rt-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rt-gold)]">
        {som ? <Volume2 className="h-4 w-4 text-[var(--rt-text-2)]" aria-hidden /> : <VolumeX className="h-4 w-4 text-[var(--rt-text-2)]" aria-hidden />}
        <span className="flex-1">Som de navegação</span>
        <span aria-hidden className={`relative h-6 w-10 shrink-0 rounded-full transition-colors motion-reduce:transition-none ${som ? "bg-[var(--rt-glow)]" : "bg-[var(--rt-text-2)]/35"}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${som ? "translate-x-[18px]" : "translate-x-0.5"}`} />
        </span>
        <span className="w-16 text-right text-xs text-[var(--rt-text-2)]">{som ? "Ligado" : "Desligado"}</span>
      </button>
    </div>
  );
}

/** Menu recolhido: botão que abre as preferências ao lado (não cabe formulário num trilho de ícones) */
function BotaoPreferencias() {
  const [aberto, setAberto] = useState<{ bottom: number } | null>(null);
  const botao = useRef<HTMLButtonElement | null>(null);
  const painel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!aberto) return;
    painel.current?.querySelector<HTMLElement>("button")?.focus();
    const fora = (e: MouseEvent) => { const t = e.target as Node; if (!painel.current?.contains(t) && !botao.current?.contains(t)) setAberto(null); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);
  return (
    <>
      <button ref={botao} type="button" aria-label="Preferências: aparência e som" title="Preferências" aria-expanded={!!aberto} aria-haspopup="true"
        onClick={() => { const r = botao.current!.getBoundingClientRect(); setAberto(aberto ? null : { bottom: Math.max(16, window.innerHeight - r.bottom) }); }}
        className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--rt-text-2)] hover:bg-[var(--rt-glow)]/[0.07] hover:text-[var(--rt-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rt-gold)]">
        <SlidersHorizontal className="h-5 w-5" />
      </button>
      {aberto && createPortal(
        <div ref={painel} role="dialog" aria-label="Preferências" style={{ bottom: aberto.bottom, left: 112 }}
          onKeyDown={e => { if (e.key === "Escape") { setAberto(null); botao.current?.focus(); } }}
          className="fixed z-[70] w-72 rounded-[20px] border border-[var(--rt-gold)]/40 bg-[var(--rt-surface)] p-2 shadow-2xl">
          <PreferenciasMenu />
        </div>,
        document.body,
      )}
    </>
  );
}

/** Rodapé do menu: pessoa logada (dados da sessão), Meu cadastro, notificações e Sair */
function Rodape({ recolhido = false, onNavegar }: { recolhido?: boolean; onNavegar?: () => void }) {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const perfil = perfilDe(user as any);
  const nome = String((user as any)?.name || "Usuário");
  const sair = "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-[var(--rt-text)]/85 transition-colors hover:bg-danger-500/10 hover:text-danger-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rt-gold)]";
  if (recolhido) return (
    <div className="flex shrink-0 flex-col items-center gap-2 border-t border-[var(--rt-gold)]/25 px-2 py-3">
      <FotoUsuario />
      <SinoNovidades />
      <BotaoPreferencias />
      <button type="button" onClick={() => logout()} aria-label="Sair" title="Sair" className="flex h-11 w-11 items-center justify-center rounded-xl text-[var(--rt-text-2)] hover:bg-danger-500/10 hover:text-danger-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rt-gold)]"><LogOut className="h-5 w-5" /></button>
      <p className="text-[10px] text-[var(--rt-text-2)]/70">v{APP_VERSION}</p>
    </div>
  );
  return (
    <div className="shrink-0 space-y-1.5 border-t border-[var(--rt-gold)]/25 px-3 pb-3 pt-3">
      <PreferenciasMenu />
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--rt-text-2)]/15 bg-[var(--rt-bg)]/30 p-2.5">
        <FotoUsuario tamanho="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--rt-text)]">{nome}</p>
          {perfil && <p className="truncate text-[11px] text-[var(--rt-text-2)]/80">{ROTULO_PERFIL[perfil]}</p>}
          <button type="button" onClick={() => { navigate("/meu-cadastro"); onNavegar?.(); }} className="inline-flex min-h-7 items-center gap-1 text-xs text-[var(--rt-text-2)] hover:text-[var(--rt-gold-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rt-gold)]">
            Meu cadastro <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <SinoNovidades />
      </div>
      <button type="button" onClick={() => logout()} className={`${sair} w-full`}><LogOut className="h-[18px] w-[18px]" aria-hidden />Sair</button>
      <p className="text-center text-[10px] text-[var(--rt-text-2)]/70">CRM Romatec v{APP_VERSION}</p>
    </div>
  );
}

/** Topo do menu: logo oficial (lockup no expandido, R no recolhido) e o botão de recolher/expandir */
function TopoMenu({ recolhido, onAlternar }: { recolhido: boolean; onAlternar: () => void }) {
  const botao = "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--rt-text-2)]/25 text-[var(--rt-text-2)] transition-colors hover:border-[var(--rt-gold)]/50 hover:text-[var(--rt-gold-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rt-gold)]";
  const rotulo = recolhido ? "Expandir o menu" : "Recolher o menu";
  if (recolhido) return (
    <div className="flex shrink-0 flex-col items-center gap-3 px-2 pb-3 pt-5">
      <RomatecAppIcon size={44} />
      <button type="button" onClick={onAlternar} aria-label={rotulo} title={rotulo} aria-expanded={false} aria-controls="menu-lateral" className={botao}><ChevronRight className="h-5 w-5" /></button>
    </div>
  );
  return (
    <div className="flex shrink-0 items-start justify-between gap-2 px-4 pb-3 pt-5">
      <span className="rt-capsula-marca min-w-0"><RomatecLockup variant="menu" height={34} /></span>
      <button type="button" onClick={onAlternar} aria-label={rotulo} title={rotulo} aria-expanded={true} aria-controls="menu-lateral" className={botao}><ChevronLeft className="h-5 w-5" /></button>
    </div>
  );
}

/** Gaveta do celular (< 900 px): foco preso enquanto aberta, Escape/clique fora fecham e o foco volta ao botão do menu */
function Gaveta({ onFechar }: { onFechar: () => void }) {
  const caixa = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    caixa.current?.querySelector<HTMLElement>("[data-fechar]")?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onFechar(); return; }
      if (e.key !== "Tab" || !caixa.current) return;
      const focaveis = Array.from(caixa.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])')).filter(el => el.offsetParent !== null);
      if (!focaveis.length) return;
      const [primeiro, ultimo] = [focaveis[0], focaveis[focaveis.length - 1]];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("keydown", tecla); document.body.style.overflow = overflow; anterior?.focus?.(); };
  }, [onFechar]);

  return (
    // z-[60]: acima da barra inferior (z-50). Altura da tela visível (dvh) e margens do iPhone (entalhe e barra de gestos).
    <div className="fixed inset-0 z-[60] flex min-[900px]:hidden">
      <div className="absolute inset-0 bg-black/65" onClick={onFechar} aria-hidden />
      <aside ref={caixa} id="menu-gaveta" role="dialog" aria-modal="true" aria-label="Menu"
        className="relative z-10 my-[max(8px,env(safe-area-inset-top))] flex max-h-[calc(100dvh-16px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[min(320px,calc(100vw-32px))] flex-col overflow-hidden rounded-r-[28px] border border-l-0 border-[var(--rt-gold)]/55 bg-[color-mix(in_srgb,var(--rt-surface)_96%,transparent)] shadow-2xl backdrop-blur-md">
        <div className="flex shrink-0 items-start justify-between gap-2 px-4 pb-3 pt-4">
          <span className="rt-capsula-marca min-w-0"><RomatecLockup variant="menu" height={36} /></span>
          <button type="button" data-fechar onClick={onFechar} aria-label="Fechar menu"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--rt-text-2)]/25 text-[var(--rt-text)] hover:border-[var(--rt-gold)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rt-gold)]"><X className="h-5 w-5" /></button>
        </div>
        <Navegacao onNavegar={onFechar} />
        <BotaoInstalarApp />
        <Rodape onNavegar={onFechar} />
      </aside>
    </div>
  );
}

/**
 * Barra inferior no celular (< 900 px): Painel · Leads · [R] · Funil · Agenda. O R abre a Área do corretor
 * (atalhos de cadastro) — o CRM ainda não tem tela de lead manual (/leads/novo).
 */
/** Corretor sem o módulo de leads: a barra (só de leads) não aparece */
const temBarraInferior = (perfil: string | null, modulos?: Record<string, boolean> | null) => !(perfil !== "admin" && modulos && modulos.leads === false);

function BarraInferior({ modulos, onBuscar }: { modulos?: Record<string, boolean> | null; onBuscar: () => void }) {
  const [loc, navigate] = useLocation();
  const { user } = useAuth();
  const perfil = perfilDe(user as any);
  if (!temBarraInferior(perfil, modulos)) return null;
  const ativa = loc.startsWith("/leads/funil") ? "funil" : loc.startsWith("/leads/agenda") ? "agenda" : loc.startsWith("/leads") ? "leads" : loc.startsWith("/dashboard") ? "painel" : "";
  const tabs = [
    { key: "painel", label: "Painel", href: "/dashboard", icon: TAB_ICONS.painel },
    { key: "leads", label: "Leads", href: "/leads", icon: TAB_ICONS.leads },
    { key: "funil", label: "Funil", href: "/leads/funil", icon: TAB_ICONS.funil },
    { key: "agenda", label: "Agenda", href: "/leads/agenda", icon: TAB_ICONS.agenda },
  ] as [TabItem, TabItem, TabItem, TabItem];
  return <MobileTabBar activeKey={ativa} tabs={tabs} onNavigate={(href: string) => { navigate(href); tocarNavegacao(); }} onFab={onBuscar} fabLabel="Buscar no CRM" fabSelo={<Search className="h-3.5 w-3.5" strokeWidth={3} />} />;
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
    <div className={`flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-sm ${atraso || (d ?? 9) <= 1 ? "bg-danger-500/15 text-danger-200" : "bg-[var(--rt-gold)]/15 text-[var(--rt-gold-light)]"}`}>
      <span>{texto}</span>
      <Link href="/assinatura" className="rounded-full bg-[var(--rt-gold)] px-3 py-1 text-xs font-semibold text-black">Assinar</Link>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();
  const [aberto, setAberto] = useState(false);
  const [buscaBalao, setBuscaBalao] = useState(false);
  const botaoMenu = useRef<HTMLButtonElement | null>(null);
  useTemaDoApp();
  useEffect(() => setAberto(false), [loc]);
  const { user } = useAuth();
  const { data: minhas } = trpc.permissoes.minhas.useQuery(undefined, { enabled: daEquipe(perfilDe(user as any)), staleTime: 60_000 });
  // Menu recolhido só nos ícones (desktop); a escolha fica guardada no navegador
  const [recolhido, setRecolhido] = useState<boolean>(() => lerPref("menu.recolhido", false));
  const alternarMenu = () => setRecolhido(r => { gravarPref("menu.recolhido", !r); return !r; });
  // Espaço que o menu flutuante ocupa à esquerda (16 + largura + 16); a barra de versão usa o mesmo valor
  useEffect(() => {
    document.documentElement.style.setProperty("--rt-menu-offset", recolhido ? "112px" : "312px");
  }, [recolhido]);
  const fecharGaveta = useCallback(() => { setAberto(false); requestAnimationFrame(() => botaoMenu.current?.focus()); }, []);
  // Telas que a pessoa pode abrir, para a busca única também achar telas pelo nome
  const telasBusca: TelaBusca[] = menuDoPerfil(perfilDe(user as any), minhas?.modulos).flatMap(g => g.itens.map(i => ({ rotulo: i.rotulo, rota: i.rota, icone: i.icone })));

  return (
    <div className={`min-h-screen bg-background transition-[padding] duration-200 motion-reduce:transition-none print:!pl-0 ${recolhido ? "min-[900px]:pl-[112px]" : "min-[900px]:pl-[312px]"}`}>
      {/* Menu flutuante (desktop >= 900 px): ocupa uma coluna real (padding do conteúdo), nunca cobre formulários */}
      <aside id="menu-lateral" aria-label="Menu lateral"
        className={`fixed bottom-4 left-4 top-4 z-30 hidden flex-col overflow-hidden rounded-[28px] border border-[var(--rt-gold)]/45 bg-[color-mix(in_srgb,var(--rt-surface)_94%,transparent)] shadow-[0_20px_60px_-20px_rgba(0,0,0,.8)] backdrop-blur-md transition-[width] duration-200 motion-reduce:transition-none min-[900px]:flex print:hidden ${recolhido ? "w-20" : "w-[280px]"}`}>
        <TopoMenu recolhido={recolhido} onAlternar={alternarMenu} />
        {recolhido ? <NavegacaoRecolhida /> : <Navegacao />}
        <BotaoInstalarApp recolhido={recolhido} />
        <Rodape recolhido={recolhido} />
      </aside>

      {/* Gaveta (celular) */}
      {aberto && <Gaveta onFechar={fecharGaveta} />}

      {/* Barra do topo (celular): abre a gaveta */}
      <header className="sticky top-[env(safe-area-inset-top)] z-20 flex items-center gap-3 border-b border-[var(--rt-green)] bg-[var(--rt-shell)] px-3 py-2 text-[var(--rt-text)] min-[900px]:hidden">
        <button ref={botaoMenu} onClick={() => setAberto(true)} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rt-gold)]" aria-label="Abrir menu" aria-expanded={aberto} aria-controls="menu-gaveta"><Menu className="h-6 w-6" /></button>
        <RomatecAppIcon size={28} />
        <p className="font-semibold truncate flex-1">{tituloDaRota(loc)}</p>
        {/* Celular: a busca é o R da barra de baixo; a lupa do topo fica para quem não tem a barra.
            Ela continua montada para o atalho Ctrl+K / "/" valer em qualquer tamanho de tela. */}
        <div className={temBarraInferior(perfilDe(user as any), minhas?.modulos) ? "hidden" : ""}><BuscaGlobal telas={telasBusca} /></div>
        <SinoNovidades className="text-[var(--rt-gold-light)]" />
        <FotoUsuario tamanho="h-8 w-8" />
      </header>

      <AvisoRotinas />
      <BannerLicenca licenca={(user as any)?.licenca} />
      {/* No celular, espaço para a barra inferior (96 px) */}
      <main className="min-w-0 pb-[calc(6rem+env(safe-area-inset-bottom))] min-[900px]:pb-0">{children}</main>
      <BarraInferior modulos={minhas?.modulos} onBuscar={() => setBuscaBalao(true)} />
      {buscaBalao && <JanelaBusca telas={telasBusca} modo="balao" onFechar={() => setBuscaBalao(false)} />}
    </div>
  );
}

/**
 * Mesmo menu lateral do CRM (flutuante, recolhível, gaveta no celular, Aparência e Som) para outro portal,
 * com os destinos dele. Usado pelo Portal do empreendedor.
 */
export function PortalLateral({ grupos, estaAtivo, irPara, titulo, children }: {
  grupos: GrupoMenuLateral[];
  estaAtivo: (it: ItemMenuLateral) => boolean;
  irPara: (it: ItemMenuLateral) => void;
  titulo: string;
  children: React.ReactNode;
}) {
  const [loc] = useLocation();
  const [aberto, setAberto] = useState(false);
  const botaoMenu = useRef<HTMLButtonElement | null>(null);
  useTemaDoApp();
  useEffect(() => setAberto(false), [loc]);
  const [recolhido, setRecolhido] = useState<boolean>(() => lerPref("menu.recolhido", false));
  const alternarMenu = () => setRecolhido(r => { gravarPref("menu.recolhido", !r); return !r; });
  useEffect(() => {
    document.documentElement.style.setProperty("--rt-menu-offset", recolhido ? "112px" : "312px");
  }, [recolhido]);
  const fecharGaveta = useCallback(() => { setAberto(false); requestAnimationFrame(() => botaoMenu.current?.focus()); }, []);
  const ctx: ContextoMenu = { grupos, estaAtivo, irPara: it => { irPara(it); setAberto(false); } };

  return (
    <MenuCtx.Provider value={ctx}>
      <div className={`min-h-screen bg-background transition-[padding] duration-200 motion-reduce:transition-none print:!pl-0 ${recolhido ? "min-[900px]:pl-[112px]" : "min-[900px]:pl-[312px]"}`}>
        <aside id="menu-lateral" aria-label="Menu lateral"
          className={`fixed bottom-4 left-4 top-4 z-30 hidden flex-col overflow-hidden rounded-[28px] border border-[var(--rt-gold)]/45 bg-[color-mix(in_srgb,var(--rt-surface)_94%,transparent)] shadow-[0_20px_60px_-20px_rgba(0,0,0,.8)] backdrop-blur-md transition-[width] duration-200 motion-reduce:transition-none min-[900px]:flex print:hidden ${recolhido ? "w-20" : "w-[280px]"}`}>
          <TopoMenu recolhido={recolhido} onAlternar={alternarMenu} />
          {recolhido ? <NavegacaoRecolhida /> : <Navegacao />}
          <BotaoInstalarApp recolhido={recolhido} />
          <Rodape recolhido={recolhido} />
        </aside>

        {aberto && <Gaveta onFechar={fecharGaveta} />}

        <header className="sticky top-[env(safe-area-inset-top)] z-20 flex items-center gap-3 border-b border-[var(--rt-green)] bg-[var(--rt-shell)] px-3 py-2 text-[var(--rt-text)] min-[900px]:hidden">
          <button ref={botaoMenu} onClick={() => setAberto(true)} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rt-gold)]" aria-label="Abrir menu" aria-expanded={aberto} aria-controls="menu-gaveta"><Menu className="h-6 w-6" /></button>
          <RomatecAppIcon size={28} />
          <p className="min-w-0 flex-1 truncate font-semibold">{titulo}</p>
          <SinoNovidades className="text-[var(--rt-gold-light)]" />
          <FotoUsuario tamanho="h-8 w-8" />
        </header>

        <main className="min-w-0">{children}</main>
      </div>
    </MenuCtx.Provider>
  );
}
