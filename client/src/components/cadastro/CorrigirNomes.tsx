import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Smartphone } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Sugestao = { id: number; telefone: string; atual: string; sugerido: string | null; outros: string[]; compativel: boolean };

/**
 * Nomes com "?" (carga inicial do Manus estragou acentos e emojis): busca o nome original pelo telefone na agenda do
 * celular conectado à Z-API ou num .vcf. Vem marcado só o que bate com o padrão do nome estragado; o resto você decide.
 */
export default function CorrigirNomes({ onAplicado }: { onAplicado: () => void }) {
  const { data: sit, refetch } = trpc.contatosNomes.situacao.useQuery();
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState<Sugestao[] | null>(null);
  const [marcados, setMarcados] = useState<Record<number, string>>({});
  const [filtro, setFiltro] = useState<"compativel" | "diferente" | "sem">("compativel");
  const receber = (s: Sugestao[]) => {
    setLista(s);
    setMarcados(Object.fromEntries(s.filter(x => x.compativel && x.sugerido).map(x => [x.id, x.sugerido!])));
    setFiltro(s.some(x => x.compativel) ? "compativel" : "diferente");
  };
  const zapi = trpc.contatosNomes.pelaAgendaZapi.useMutation({ onSuccess: receber, onError: e => toast.error(e.message) });
  const vcf = trpc.contatosNomes.peloVcf.useMutation({ onSuccess: receber, onError: e => toast.error(e.message) });
  const aplicar = trpc.contatosNomes.aplicar.useMutation({
    onSuccess: r => { toast.success(`${r.aplicadas} nome(s) corrigido(s)`); setAberto(false); setLista(null); refetch(); onAplicado(); },
    onError: e => toast.error(e.message),
  });
  if (!sit?.corrompidos) return null;
  const n = (k: typeof filtro) => (lista ?? []).filter(x => (k === "compativel" ? x.compativel : k === "diferente" ? !x.compativel && x.sugerido : !x.sugerido)).length;
  const visiveis = (lista ?? []).filter(x => (filtro === "compativel" ? x.compativel : filtro === "diferente" ? !x.compativel && x.sugerido : !x.sugerido));
  const ocupado = zapi.isPending || vcf.isPending;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
        <span className="flex-1">{sit.corrompidos} contato(s) com o nome estragado ("?" no lugar de acentos e emojis) — vieram da carga inicial dos contatos.</span>
        <Button size="sm" variant="outline" onClick={() => setAberto(true)}>Corrigir nomes</Button>
      </div>
      <Dialog open={aberto} onOpenChange={v => !aplicar.isPending && setAberto(v)}>
        <DialogContent className="bg-card border-border sm:max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Corrigir nomes com "?"</DialogTitle>
            <DialogDescription>
              O nome original não ficou guardado. Ele é recuperado pelo telefone, na agenda do celular conectado ao WhatsApp do sistema ou num arquivo .vcf
              (contatos exportados do celular ou do Google). Vem marcado só o nome que bate com o que restou (ex.: "Zez??o" aceita "Zezão").
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={ocupado} onClick={() => zapi.mutate()}>
              {zapi.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Smartphone className="mr-1 h-4 w-4" />} Buscar na agenda do WhatsApp
            </Button>
            <label className={`inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-secondary ${ocupado ? "pointer-events-none opacity-50" : ""}`}>
              {vcf.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Enviar arquivo .vcf
              <input type="file" accept=".vcf,text/vcard,text/x-vcard" className="hidden" onChange={async e => {
                const f = e.target.files?.[0]; e.target.value = "";
                if (!f) return;
                if (f.size > 14 * 1024 * 1024) { toast.error("Arquivo grande demais (máx. 14 MB)"); return; }
                vcf.mutate({ texto: await f.text() });
              }} />
            </label>
          </div>
          {lista && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {([["compativel", "Batem com o nome"], ["diferente", "Nome diferente na agenda"], ["sem", "Não achados"]] as const).map(([k, r]) => (
                  <button key={k} onClick={() => setFiltro(k)} className={`rounded-full border px-3 py-1 text-xs ${filtro === k ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}>{r} ({n(k)})</button>
                ))}
              </div>
              {filtro === "diferente" && <p className="text-xs text-amber-300">O nome salvo na agenda é outro — confira antes de marcar.</p>}
              <div className="max-h-[45vh] space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                {!visiveis.length && <p className="p-3 text-xs text-muted-foreground">Nada aqui.</p>}
                {visiveis.map(x => (
                  <label key={x.id} className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-secondary/50">
                    <input type="checkbox" disabled={!x.sugerido} checked={!!marcados[x.id]}
                      onChange={e => setMarcados(m => { const n2 = { ...m }; if (e.target.checked && x.sugerido) n2[x.id] = x.sugerido; else delete n2[x.id]; return n2; })} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-muted-foreground line-through decoration-red-400/60">{x.atual}</span>
                      {x.sugerido ? <span className="block truncate font-medium">{x.sugerido}</span> : <span className="block text-xs text-muted-foreground">não está na agenda</span>}
                      {x.outros.length > 0 && <span className="block truncate text-[11px] text-muted-foreground">também: {x.outros.join(" · ")}</span>}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{x.telefone}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={aplicar.isPending} onClick={() => setAberto(false)}>Fechar</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={!Object.keys(marcados).length || aplicar.isPending}
              onClick={() => aplicar.mutate({ correcoes: Object.entries(marcados).map(([id, nome]) => ({ id: Number(id), nome })) })}>
              {aplicar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />} Corrigir {Object.keys(marcados).length} nome(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
