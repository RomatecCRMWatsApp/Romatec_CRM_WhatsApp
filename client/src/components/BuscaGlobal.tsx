/**
 * Busca única do CRM: no celular, o R da barra de baixo abre um balão grande para digitar (JanelaBusca modo "balao");
 * no computador, o campo do menu lateral ou Ctrl+K / ⌘K. Uma caixa para achar lead, comprador,
 * contrato, chácara, imóvel, gente da equipe, material ou a tela do sistema. Cada perfil só vê o que já pode ver.
 */
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useLocation } from "wouter";
import { FileSignature, Images, LayoutGrid, Loader2, Map as MapIcon, Search, UserRound, Users, UserCog, Building2 } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { MIN_CARACTERES_BUSCA, normalizar, type TipoBusca } from "@shared/buscaGlobal";

export type TelaBusca = { rotulo: string; rota: string; icone: ComponentType<{ className?: string }> };

const ICONE: Record<TipoBusca, ComponentType<{ className?: string }>> = {
  lead: UserRound, cliente: Users, contrato: FileSignature, chacara: MapIcon, imovel: Building2, equipe: UserCog, material: Images,
};
const ESPERA_MS = 250;
const RECENTES = "busca_recentes";

function lerRecentes(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENTES) || "[]"); return Array.isArray(v) ? v.filter(x => typeof x === "string").slice(0, 5) : []; } catch { return []; }
}
function guardarRecente(t: string) {
  try { localStorage.setItem(RECENTES, JSON.stringify([t, ...lerRecentes().filter(x => x !== t)].slice(0, 5))); } catch { /* sem armazenamento */ }
}

/** Botão da lupa (abre a busca) + atalho Ctrl+K / ⌘K + a janela de busca */
export default function BuscaGlobal({ telas, variante = "icone", atalho = true }: { telas: TelaBusca[]; variante?: "icone" | "campo"; atalho?: boolean }) {
  const [aberto, setAberto] = useState(false);
  // Só uma lupa da tela responde ao Ctrl+K (a do topo); a do menu lateral só abre no clique
  useEffect(() => {
    if (!atalho) return;
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setAberto(v => !v); }
      // "/" abre a busca quando não se está digitando em um campo
      const alvo = e.target as HTMLElement;
      if (e.key === "/" && !aberto && !/^(INPUT|TEXTAREA|SELECT)$/.test(alvo?.tagName) && !alvo?.isContentEditable) { e.preventDefault(); setAberto(true); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberto, atalho]);

  return (
    <>
      {variante === "campo" ? (
        <button type="button" onClick={() => setAberto(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-white/5 px-3 py-2 text-left text-sm text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-[var(--rt-gold)]">
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 truncate">Buscar no CRM</span>
          <kbd className="hidden rounded border border-sidebar-border px-1.5 text-[10px] text-sidebar-foreground/50 lg:inline">Ctrl K</kbd>
        </button>
      ) : (
        <button type="button" onClick={() => setAberto(true)} aria-label="Buscar no CRM" title="Buscar (Ctrl+K)"
          className="rounded-lg p-2 text-foreground/70 hover:bg-white/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--rt-gold)]">
          <Search className="h-5 w-5" />
        </button>
      )}
      {aberto && <JanelaBusca telas={telas} onFechar={() => setAberto(false)} />}
    </>
  );
}

/** Altura do teclado do celular (visualViewport): o balão sobe junto e não fica escondido atrás dele */
function useAlturaTeclado(ativo: boolean) {
  const [altura, setAltura] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!ativo || !vv) return;
    const medir = () => setAltura(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    medir();
    vv.addEventListener("resize", medir); vv.addEventListener("scroll", medir);
    return () => { vv.removeEventListener("resize", medir); vv.removeEventListener("scroll", medir); };
  }, [ativo]);
  return altura;
}

export function JanelaBusca({ telas, onFechar, modo = "topo" }: { telas: TelaBusca[]; onFechar: () => void; modo?: "topo" | "balao" }) {
  const balao = modo === "balao";
  const teclado = useAlturaTeclado(balao);
  const [, navegar] = useLocation();
  const [texto, setTexto] = useState("");
  const [termo, setTermo] = useState("");
  const [recentes] = useState(lerRecentes);
  useEffect(() => { const t = setTimeout(() => setTermo(texto.trim()), ESPERA_MS); return () => clearTimeout(t); }, [texto]);

  const pronto = termo.length >= MIN_CARACTERES_BUSCA;
  const { data, isFetching } = trpc.busca.global.useQuery({ termo }, { enabled: pronto, staleTime: 15_000, placeholderData: prev => prev });
  const telasAchadas = useMemo(() => {
    const n = normalizar(termo);
    return n ? telas.filter(t => normalizar(t.rotulo).includes(n)).slice(0, 5) : [];
  }, [termo, telas]);

  const abrir = (url: string) => { if (termo) guardarRecente(termo); onFechar(); navegar(url); };
  const grupos = pronto ? data?.grupos ?? [] : [];
  const nada = pronto && !isFetching && !grupos.length && !telasAchadas.length;

  return (
    <Dialog open onOpenChange={v => { if (!v) onFechar(); }}>
      <DialogContent showCloseButton={false}
        className={balao
          ? "top-auto w-[calc(100%-1.25rem)] max-w-xl translate-y-0 overflow-hidden rounded-3xl border-[var(--rt-gold)]/50 bg-background/80 p-0 shadow-2xl backdrop-blur-xl"
          : "top-[calc(env(safe-area-inset-top)+4rem)] w-[calc(100%-1.5rem)] max-w-xl translate-y-0 overflow-hidden p-0 sm:top-[15%]"}
        style={balao ? { bottom: teclado > 80 ? teclado + 12 : "calc(6.5rem + env(safe-area-inset-bottom))" } : undefined}>
        <DialogTitle className="sr-only">Buscar no CRM</DialogTitle>
        <DialogDescription className="sr-only">Procure lead, comprador, contrato, chácara, imóvel, equipe, material ou uma tela do sistema</DialogDescription>
        <Command shouldFilter={false} loop
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5">
          <div className="relative">
            <CommandInput value={texto} onValueChange={setTexto} autoFocus placeholder={balao ? "Buscar: nome, telefone, chácara, contrato…" : "Nome, telefone, CPF, chácara (B13), contrato, CRECI…"}
              className={balao ? "h-14 text-lg outline-none focus-visible:outline-none" : "h-12 text-base outline-none focus-visible:outline-none"} />
            {isFetching && pronto && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Buscando" />}
          </div>
          <CommandList className={balao ? "max-h-[min(45dvh,420px)]" : "max-h-[min(60dvh,460px)]"}>
            {!pronto && (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                <p>Digite pelo menos {MIN_CARACTERES_BUSCA} letras. A busca procura em leads, compradores, contratos, chácaras, imóveis, equipe e materiais.</p>
                {balao && (
                  <button type="button" onClick={() => abrir("/corretor")}
                    className="mt-3 flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-left text-sm text-foreground hover:bg-white/5">
                    <LayoutGrid className="h-4 w-4 text-[var(--rt-gold)]" /> Área do corretor (novo lead, novo cliente, agendar visita…)
                  </button>
                )}
                {recentes.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="w-full text-xs">Buscas recentes</span>
                    {recentes.map(r => (
                      <button key={r} type="button" onClick={() => setTexto(r)} className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground hover:bg-white/5">{r}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {nada && <CommandEmpty>Nada encontrado para “{termo}”.</CommandEmpty>}
            {telasAchadas.length > 0 && (
              <CommandGroup heading="Telas do sistema">
                {telasAchadas.map(t => {
                  const Icone = t.icone;
                  return (
                    <CommandItem key={t.rota} value={`tela:${t.rota}`} onSelect={() => abrir(t.rota)}>
                      <Icone className="h-4 w-4 text-muted-foreground" /> <span>{t.rotulo}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {grupos.map(g => {
              const Icone = ICONE[g.tipo] ?? LayoutGrid;
              return (
                <CommandGroup key={g.tipo} heading={g.rotulo}>
                  {g.itens.map(r => (
                    <CommandItem key={r.id} value={r.id} onSelect={() => abrir(r.url)}>
                      <Icone className="h-4 w-4 shrink-0 text-[var(--rt-gold)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">{r.titulo}</span>
                        {r.detalhe && <span className="block truncate text-xs text-muted-foreground">{r.detalhe}</span>}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
          <div className="hidden items-center gap-3 border-t border-border px-3 py-2 text-[11px] text-muted-foreground sm:flex">
            <span>↑↓ navegar</span><span>Enter abrir</span><span>Esc fechar</span><span className="ml-auto">Ctrl+K abre de qualquer tela</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
