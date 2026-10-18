import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Headset, RefreshCw } from "lucide-react";

type Funil = "comprador" | "proprietario";

export const CLASSE_COR: Record<string, string> = {
  quente: "bg-red-500/15 text-red-300 border-red-500/40",
  morno: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  frio: "bg-sky-500/15 text-sky-300 border-sky-500/40",
};

export const MOTIVOS: Record<string, string> = {
  sem_credito: "Sem crédito", comprou_outro: "Comprou outro", preco: "Preço", sem_resposta: "Sem resposta", curioso: "Curioso", outro: "Outro",
};

export function desde(d?: string | Date | null): string {
  if (!d) return "";
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 60) return `${Math.max(min, 0)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

/** Modal de motivo de perda (obrigatório) */
export function MotivoPerda({ onConfirmar, onCancelar }: { onConfirmar: (motivo: string) => void; onCancelar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  return (
    <Dialog open onOpenChange={o => { if (!o) onCancelar(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Motivo da perda</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(MOTIVOS).map(([k, l]) => (
            <button key={k} onClick={() => setMotivo(k)}
              className={`rounded-lg border px-3 py-2 text-sm text-left ${motivo === k ? "border-emerald-500 bg-emerald-500/10 text-emerald-200" : "border-border text-foreground"}`}>{l}</button>
          ))}
        </div>
        {motivo === "outro" && <input value={obs} onChange={e => setObs(e.target.value)} maxLength={100} placeholder="Qual?" className="w-full h-9 px-3 rounded-md border border-border bg-secondary/30 text-sm" />}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
          <Button disabled={!motivo} className="bg-red-600 hover:bg-red-700 text-white" onClick={() => onConfirmar(motivo === "outro" && obs ? `outro: ${obs}` : motivo)}>Marcar perdido</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function LeadsFunil() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [funil, setFunil] = useState<Funil>("comprador");
  const { data, isLoading, refetch, isFetching } = trpc.crm.kanban.useQuery({ funil }, { refetchInterval: 60000 });
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [perder, setPerder] = useState<number | null>(null);

  const mover = trpc.crm.moverEtapa.useMutation({
    onSuccess: () => utils.crm.kanban.invalidate(),
    onError: e => toast.error(e.message),
  });

  const pedirMover = (id: number, etapa: string) => {
    if (etapa === "perdido") { setPerder(id); return; }
    mover.mutate({ id, etapa });
  };

  const cards = data?.cards ?? [];
  const etapas = data?.etapas ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 text-white">
        <div className="container py-4 flex flex-wrap items-center gap-3">
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/15" onClick={() => navigate("/leads")}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold">Funil de leads</h1>
            <p className="text-xs text-white/70">Arraste o card entre as colunas (ou use "Mover para") · clique para abrir o lead</p>
          </div>
          <div className="flex rounded-lg bg-white/10 p-1">
            {(["comprador", "proprietario"] as Funil[]).map(f => (
              <button key={f} onClick={() => setFunil(f)} className={`px-3 py-1.5 rounded-md text-sm font-semibold ${funil === f ? "bg-white text-emerald-800" : "text-white/80"}`}>
                {f === "comprador" ? "Comprador" : "Proprietário"}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/15" onClick={() => refetch()}><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /></Button>
        </div>
      </div>

      {isLoading ? (
        <p className="container py-8 text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex gap-3 p-4 min-w-max">
            {etapas.map(etapa => {
              const daColuna = cards.filter(c => c.etapa === etapa);
              return (
                <div key={etapa}
                  onDragOver={e => { e.preventDefault(); setSobre(etapa); }}
                  onDragLeave={() => setSobre(s => (s === etapa ? null : s))}
                  onDrop={e => { e.preventDefault(); setSobre(null); if (arrastando !== null) pedirMover(arrastando, etapa); setArrastando(null); }}
                  className={`w-72 shrink-0 rounded-xl border p-2 transition-colors ${sobre === etapa ? "border-emerald-500 bg-emerald-500/5" : "border-border bg-card/40"} ${etapa === "perdido" ? "opacity-80" : ""}`}>
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-sm font-semibold text-foreground">{data?.rotulos[etapa] ?? etapa}</span>
                    <span className="text-xs text-muted-foreground">{daColuna.length}</span>
                  </div>
                  <div className="space-y-2 min-h-16">
                    {daColuna.map(c => (
                      <div key={c.id} draggable onDragStart={() => setArrastando(c.id)} onDragEnd={() => setArrastando(null)}
                        onClick={() => navigate(`/leads/lead/${c.id}`)}
                        className="rounded-lg border border-border bg-card p-3 cursor-pointer hover:border-emerald-500/50">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">{c.nome}</p>
                          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${CLASSE_COR[c.classe] || CLASSE_COR.frio}`}>{c.score ?? "–"}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {c.imovel ? `${c.imovel.codigo ?? ""} ${c.imovel.titulo}` : c.imovelProprietario || "Sem imóvel definido"}
                        </p>
                        <p className="text-[11px] text-muted-foreground/80 mt-1">{c.canal} · {desde(c.ultimaAtividade)}</p>
                        {(c.tags.length > 0 || c.humano || c.motivoPerda) && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {c.humano && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 flex items-center gap-1"><Headset className="h-3 w-3" /> corretor</span>}
                            {c.motivoPerda && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300">{MOTIVOS[c.motivoPerda.split(":")[0]] || c.motivoPerda}</span>}
                            {c.tags.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300">{t.replace(/^oportunidade_/, "")}</span>)}
                          </div>
                        )}
                        <select value="" onClick={e => e.stopPropagation()} onChange={e => { if (e.target.value) pedirMover(c.id, e.target.value); }}
                          className="mt-2 w-full h-7 rounded border border-border bg-secondary/30 text-[11px] text-muted-foreground">
                          <option value="">Mover para…</option>
                          {etapas.filter(x => x !== c.etapa).map(x => <option key={x} value={x}>{data?.rotulos[x] ?? x}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {perder !== null && (
        <MotivoPerda onCancelar={() => setPerder(null)} onConfirmar={m => { mover.mutate({ id: perder, etapa: "perdido", motivoPerda: m }); setPerder(null); }} />
      )}
    </div>
  );
}
