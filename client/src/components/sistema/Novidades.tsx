import { useEffect, useState } from "react";
import { Bell, ChevronDown, ChevronRight, RefreshCw, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RomatecSeal } from "@/brand";
import { SECOES_RELEASE, type ItensRelease } from "@shared/releases";

type ReleaseTela = { id: number; versao: string; tipo: string; titulo: string; itens: ItensRelease; obrigatoria: boolean; publicadoEm: string; lida?: boolean };

const dataBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", year: "numeric" });

/** Abre o painel "Novidades do sistema" (sino, item do menu) */
export const abrirNovidades = () => window.dispatchEvent(new CustomEvent("romatec:novidades"));

/** Itens da release em grupos coloridos (Novo, Melhorias, Correções, Avisos) */
export function ItensDaRelease({ itens }: { itens: ItensRelease }) {
  return (
    <div className="space-y-3">
      {SECOES_RELEASE.filter(s => itens[s.chave]?.length).map(s => (
        <div key={s.chave}>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: s.cor }}>
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
    <div className="fixed inset-x-0 top-0 z-[60] border-b-2 border-[var(--rt-gold)] bg-[#050b08]/95 px-4 py-2 shadow-lg backdrop-blur" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <Sparkles className="h-4 w-4 shrink-0 text-[var(--rt-gold-light)]" />
        <p className="flex-1 text-[var(--rt-text)]">
          {nova.obrigatoria
            ? <>Atualização obrigatória <b className="text-[var(--rt-gold-light)]">v{nova.versao}</b> — recarregando em {restam} s</>
            : <>Nova versão disponível — <b className="text-[var(--rt-gold-light)]">v{nova.versao}</b></>}
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

/** Sino com o número de não lidas; abre o painel */
export function SinoNovidades({ className = "" }: { className?: string }) {
  const n = useNovidadesNaoLidas();
  return (
    <button type="button" onClick={abrirNovidades} title="Novidades do sistema" aria-label={`Novidades do sistema${n ? ` (${n} não lidas)` : ""}`}
      className={`relative rounded-lg p-2 text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground ${className}`}>
      <Bell className="h-4 w-4" />
      {n > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{n}</span>}
    </button>
  );
}

/** Painel lateral "Novidades do sistema": histórico das versões (expandir mostra os itens) */
export function PainelNovidades({ habilitado }: { habilitado: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [expandida, setExpandida] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const { data } = trpc.novidades.historico.useQuery(undefined, { enabled: habilitado && aberto });
  const marcar = trpc.novidades.marcarLida.useMutation({ onSuccess: () => utils.novidades.invalidate() });
  const todas = trpc.novidades.marcarTodas.useMutation({ onSuccess: () => utils.novidades.invalidate() });
  useEffect(() => {
    const abrir = () => setAberto(true);
    window.addEventListener("romatec:novidades", abrir);
    return () => window.removeEventListener("romatec:novidades", abrir);
  }, []);
  const lista = (data ?? []) as ReleaseTela[];
  const naoLidas = lista.filter(r => !r.lida).length;

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Bell className="h-4 w-4 text-[var(--rt-gold)]" /> Novidades do sistema</SheetTitle>
        </SheetHeader>
        <div className="space-y-2 px-4 pb-6">
          {naoLidas > 0 && <button type="button" className="text-xs text-primary hover:underline" onClick={() => todas.mutate()}>Marcar todas como lidas ({naoLidas})</button>}
          {lista.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma novidade ainda.</p>}
          {lista.map(r => {
            const on = expandida === r.id;
            return (
              <div key={r.id} className={`rounded-lg border p-3 ${r.lida ? "border-border" : "border-[var(--rt-gold)]/60 bg-[var(--rt-gold)]/5"}`}>
                <button type="button" className="flex w-full items-start gap-2 text-left"
                  onClick={() => { setExpandida(on ? null : r.id); if (!r.lida) marcar.mutate({ ids: [r.id] }); }}>
                  {on ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      v{r.versao}
                      {!r.lida && <span className="rounded bg-red-500 px-1.5 text-[10px] font-bold text-white">NOVA</span>}
                      <span className="ml-auto text-xs font-normal text-muted-foreground">{dataBr(r.publicadoEm)}</span>
                    </span>
                    <span className="block text-sm text-muted-foreground">{r.titulo}</span>
                  </span>
                </button>
                {on && <div className="mt-3 border-t border-border pt-3"><ItensDaRelease itens={r.itens} /></div>}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

