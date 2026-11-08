import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ListaNotificacoes, useNotificacoes } from "./Notificacoes";
import { Bell, ChevronDown, ChevronRight, RefreshCw, Sparkles, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { RomatecSeal } from "@/brand";
import { SECOES_RELEASE, type ItensRelease } from "@shared/releases";

type ReleaseTela = { id: number; versao: string; tipo: string; titulo: string; itens: ItensRelease; obrigatoria: boolean; publicadoEm: string; lida?: boolean };

const dataBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", year: "numeric" });

type Aba = "avisos" | "versoes";
/** Abre o painel do sino (notificações / novidades da versão) */
export const abrirNovidades = (aba?: Aba) => window.dispatchEvent(new CustomEvent("romatec:novidades", { detail: { aba } }));

/** Itens da release em grupos coloridos (Novo, Melhorias, Correções, Avisos) */
export function ItensDaRelease({ itens }: { itens: ItensRelease }) {
  return (
    <div className="space-y-3">
      {SECOES_RELEASE.filter(s => itens[s.chave]?.length).map(s => (
        <div key={s.chave}>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold" style={{ color: s.cor }}>
            <span className="h-2 w-2 rounded-full" style={{ background: s.cor }} /> {s.rotulo}
          </p>
          <ul className="space-y-1 pl-3.5">
            {itens[s.chave].map((t, i) => <li key={i} className="list-disc text-sm text-foreground/90 marker:text-muted-foreground">{t}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Faixa "Nova versão disponível" no topo. Obrigatória: sem "Depois" e recarrega sozinha em 60 s.
 */
export function UpdateBanner({ nova, onAtualizar }: { nova: { versao: string; obrigatoria: boolean } | null; onAtualizar: () => void }) {
  const [escondida, setEscondida] = useState<string | null>(null);
  const [restam, setRestam] = useState(60);
  useEffect(() => {
    if (!nova?.obrigatoria) return;
    setRestam(60);
    const t = setInterval(() => setRestam(s => {
      if (s <= 1) { clearInterval(t); onAtualizar(); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [nova?.versao, nova?.obrigatoria, onAtualizar]);
  if (!nova || (!nova.obrigatoria && escondida === nova.versao)) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[60] border-b-2 border-[var(--rt-gold)] bg-[color:var(--c-050b08)]/95 px-4 py-2 shadow-lg backdrop-blur" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <Sparkles className="h-4 w-4 shrink-0 text-[var(--rt-gold-light)]" />
        <p className="flex-1 text-[var(--rt-text)]">
          {nova.obrigatoria
            ? <>Atualização obrigatória <b className="text-[var(--rt-gold-light)]">v{nova.versao}</b>: recarregando em {restam} s</>
            : <>Nova versão disponível: <b className="text-[var(--rt-gold-light)]">v{nova.versao}</b></>}
        </p>
        <Button size="sm" onClick={onAtualizar} className="bg-[var(--rt-gold)] text-black hover:bg-[var(--rt-gold-light)]"><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar agora</Button>
        {!nova.obrigatoria && <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setEscondida(nova.versao)}>Depois</Button>}
      </div>
    </div>
  );
}

/** "Novidades da versão": não lidas, da mais antiga para a mais nova; "Entendi" grava a leitura */
export function WhatsNewModal({ habilitado }: { habilitado: boolean }) {
  const utils = trpc.useUtils();
  const { data } = trpc.novidades.naoLidas.useQuery(undefined, { enabled: habilitado, staleTime: 10 * 60_000, refetchOnWindowFocus: false });
  const [i, setI] = useState(0);
  const [fechado, setFechado] = useState(false);
  const marcar = trpc.novidades.marcarLida.useMutation();
  const todas = trpc.novidades.marcarTodas.useMutation();
  const lista = (data ?? []) as ReleaseTela[];
  const aberto = habilitado && !fechado && lista.length > 0;
  const r = lista[Math.min(i, lista.length - 1)];

  const concluir = async (tudo = false) => {
    setFechado(true);
    try {
      if (tudo) await todas.mutateAsync();
      else await marcar.mutateAsync({ ids: lista.map(x => x.id) });
    } finally {
      utils.novidades.invalidate();
    }
  };

  if (!r) return null;
  const ultima = i >= lista.length - 1;
  return (
    <Dialog open={aberto} onOpenChange={o => !o && concluir()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <RomatecSeal size={52} />
            <div className="text-left">
              <DialogTitle className="text-base">Novidades da versão <span className="text-[var(--rt-gold-light)]">{r.versao}</span></DialogTitle>
              <p className="text-sm text-foreground/90">{r.titulo}</p>
              <p className="text-xs text-muted-foreground">{dataBr(r.publicadoEm)}</p>
            </div>
          </div>
        </DialogHeader>
        {lista.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {lista.map((x, k) => (
              <button key={x.id} type="button" onClick={() => setI(k)}
                className={`rounded px-2 py-0.5 text-xs ${k === i ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>v{x.versao}</button>
            ))}
          </div>
        )}
        <div className="max-h-[55vh] overflow-auto pr-1"><ItensDaRelease itens={r.itens} /></div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {lista.length > 1
            ? <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => concluir(true)}>Marcar todas como lidas</button>
            : <span />}
          {ultima
            ? <Button onClick={() => concluir()} className="bg-[var(--rt-gold)] text-black hover:bg-[var(--rt-gold-light)]">Entendi</Button>
            : <Button onClick={() => setI(k => k + 1)}>Próxima <ChevronRight className="ml-1 h-4 w-4" /></Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Quantas versões a pessoa ainda não leu (badge do sino e do menu) */
export function useNovidadesNaoLidas(habilitado = true) {
  const { data } = trpc.novidades.historico.useQuery(undefined, { enabled: habilitado, staleTime: 5 * 60_000 });
  return ((data ?? []) as ReleaseTela[]).filter(r => !r.lida).length;
}

/** Sino com o número de não lidas (notificações + novidades da versão); abre o painel */
export function SinoNovidades({ className = "" }: { className?: string }) {
  const versoes = useNovidadesNaoLidas();
  const { naoLidas: avisos } = useNotificacoes();
  const n = versoes + avisos;
  return (
    <button type="button" onClick={() => abrirNovidades(avisos || !versoes ? "avisos" : "versoes")} title="Notificações" aria-label={`Notificações${n ? ` (${n} não lidas)` : ""}`}
      className={`relative rounded-lg p-2 text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground ${className}`}>
      <Bell className="h-4 w-4" />
      {n > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-bold text-white">{n}</span>}
    </button>
  );
}

/** Painel lateral do sino: notificações (reserva, venda, liberação, sistema) e novidades das versões */
export function PainelNovidades({ habilitado }: { habilitado: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<Aba>("avisos");
  const [expandida, setExpandida] = useState<number | null>(null);
  // Lista longa (130+ versões): mostra as 20 mais recentes e carrega mais sob demanda — evita travar no celular
  const [mostrar, setMostrar] = useState(20);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data } = trpc.novidades.historico.useQuery(undefined, { enabled: habilitado && aberto });
  const marcar = trpc.novidades.marcarLida.useMutation({ onSuccess: () => utils.novidades.invalidate() });
  const todas = trpc.novidades.marcarTodas.useMutation({ onSuccess: () => utils.novidades.invalidate() });
  const { naoLidas: avisosNaoLidos } = useNotificacoes(habilitado);
  useEffect(() => {
    const abrir = (e: Event) => { const a = (e as CustomEvent).detail?.aba; if (a) setAba(a); setAberto(true); };
    window.addEventListener("romatec:novidades", abrir);
    return () => window.removeEventListener("romatec:novidades", abrir);
  }, []);
  // Mais nova primeiro pelo número da versão (várias versões no mesmo dia não trocam de ordem)
  const lista = ((data ?? []) as ReleaseTela[]).slice().sort((x, y) => {
    const a = x.versao.split(".").map(Number), c = y.versao.split(".").map(Number);
    for (let k = 0; k < 3; k++) if ((a[k] ?? 0) !== (c[k] ?? 0)) return (c[k] ?? 0) - (a[k] ?? 0);
    return 0;
  });
  const naoLidas = lista.filter(r => !r.lida).length;
  const BotaoAba = ({ id, rotulo, n }: { id: Aba; rotulo: string; n: number }) => (
    <button type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
      className={`flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-sm ${aba === id ? "bg-primary/15 font-semibold text-foreground" : "text-muted-foreground hover:bg-secondary/50"}`}>
      {rotulo}{n > 0 && <span className="ml-1.5 rounded-full bg-danger-500 px-1.5 text-[10px] font-bold text-white">{n}</span>}
    </button>
  );

  // Cabeçalho fixo (título, fechar e abas) e só a lista rola: no celular nada fica escondido atrás do relógio
  // nem some ao rolar; o botão de fechar é grande (44 px) e fica sempre à mão
  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetContent side="right" semFechar
        className="z-[70] w-full max-w-md gap-0 overflow-hidden p-0 sm:max-w-md"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="shrink-0 border-b border-border bg-background px-4 pb-3 pt-3">
          <div className="flex items-center gap-2">
            <SheetTitle className="flex flex-1 items-center gap-2 text-lg"><Bell className="h-5 w-5 text-[var(--rt-gold)]" /> Notificações</SheetTitle>
            <SheetDescription className="sr-only">Avisos do sistema e novidades das versões</SheetDescription>
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar notificações"
              className="flex h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold text-foreground hover:bg-secondary active:scale-95">
              <X className="h-5 w-5" /> Fechar
            </button>
          </div>
          <div role="tablist" className="mt-3 flex gap-1 rounded-xl border border-border p-1">
            <BotaoAba id="avisos" rotulo="Avisos" n={avisosNaoLidos} />
            <BotaoAba id="versoes" rotulo="Novidades" n={naoLidas} />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 pt-3" style={{ WebkitOverflowScrolling: "touch" }}>
          {aba === "avisos" && (
            <ListaNotificacoes habilitado={habilitado && aberto} onAbrir={url => { setAberto(false); if (url && !url.includes("notificacoes=1")) navigate(url); }} />
          )}
          {aba === "versoes" && <div className="space-y-3">
            {naoLidas > 0 && <button type="button" className="min-h-10 text-sm text-primary hover:underline" onClick={() => todas.mutate()}>Marcar todas como lidas ({naoLidas})</button>}
            {lista.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma novidade ainda.</p>}
            {lista.slice(0, mostrar).map(r => {
              const on = expandida === r.id;
              return (
                <div key={r.id} className={`rounded-xl border ${r.lida ? "border-border" : "border-[var(--rt-gold)]/60 bg-[var(--rt-gold)]/5"}`}>
                  <button type="button" className="flex w-full items-start gap-2 p-3.5 text-left"
                    onClick={() => { setExpandida(on ? null : r.id); if (!r.lida) marcar.mutate({ ids: [r.id] }); }}>
                    {on ? <ChevronDown className="mt-0.5 h-5 w-5 shrink-0" /> : <ChevronRight className="mt-0.5 h-5 w-5 shrink-0" />}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-base font-semibold">
                        v{r.versao}
                        {!r.lida && <span className="rounded bg-danger-500 px-1.5 text-[10px] font-bold text-white">NOVA</span>}
                        <span className="ml-auto text-xs font-normal text-muted-foreground">{dataBr(r.publicadoEm)}</span>
                      </span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{r.titulo}</span>
                    </span>
                  </button>
                  {on && <div className="border-t border-border px-3.5 pb-3.5 pt-3"><ItensDaRelease itens={r.itens} /></div>}
                </div>
              );
            })}
            {lista.length > mostrar && (
              <button type="button" onClick={() => setMostrar(n => n + 20)}
                className="min-h-11 w-full rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary">
                Ver versões anteriores ({lista.length - mostrar})
              </button>
            )}
          </div>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
