import { useState } from "react";
import { toast } from "sonner";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { brl } from "@shared/simulador";

const br = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");

/**
 * Cobrança por WhatsApp — sempre manual: lista quem está vencido ou vence em breve, com a mensagem pronta; o administrador
 * marca e envia (fila com intervalo). Nada é enviado sozinho.
 */
export default function CobrancaWhatsapp() {
  const { user } = useAuth();
  const admin = perfilDe(user as any) === "admin";
  const [dias, setDias] = useState(5);
  const { data, isLoading, refetch } = trpc.financeiro.aCobrar.useQuery({ dias });
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [aberta, setAberta] = useState<number | null>(null);
  const enviar = trpc.financeiro.enviarCobrancas.useMutation({
    onSuccess: r => {
      toast.success(`Enviando ${r.enviando} cobrança(s) pelo WhatsApp (uma a cada poucos segundos)${r.semTelefone.length ? ` · sem telefone: ${r.semTelefone.join(", ")}` : ""}`);
      setMarcados(new Set()); setTimeout(() => refetch(), 8000);
    },
    onError: e => toast.error(e.message),
  });
  const lista = data ?? [];
  const marcar = (id: number, v: boolean) => setMarcados(s => { const n = new Set(s); v ? n.add(id) : n.delete(id); return n; });

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><MessageCircle className="h-4 w-4 text-primary" /> Cobrança por WhatsApp</h2>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">Vencidas e as que vencem em até
          <select value={dias} onChange={e => setDias(Number(e.target.value))} className="h-8 rounded-md border border-border bg-background px-1 text-sm">
            {[0, 3, 5, 7, 10, 15].map(n => <option key={n} value={n}>{n} dias</option>)}
          </select>
        </label>
        {admin && (
          <Button size="sm" disabled={!marcados.size || enviar.isPending}
            onClick={() => { if (confirm(`Enviar a cobrança pelo WhatsApp para ${marcados.size} comprador(es)?`)) enviar.mutate({ contratoIds: Array.from(marcados), dias }); }}>
            {enviar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Enviar aos marcados ({marcados.size})
          </Button>
        )}
      </div>
      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {data && !lista.length && <p className="text-xs text-muted-foreground">Ninguém a cobrar neste prazo.</p>}
      <div className="space-y-1.5">
        {lista.map(x => (
          <div key={x.contratoId} className="rounded-lg border border-border/60 p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {admin && <input type="checkbox" aria-label={`Marcar ${x.comprador}`} disabled={!x.telefone} checked={marcados.has(x.contratoId)} onChange={e => marcar(x.contratoId, e.target.checked)} />}
              <b>{x.comprador}</b><span className="text-xs text-muted-foreground">{x.contratoNumero} · Chácara {x.loteCodigo}</span>
              <span className={`text-xs ${x.diasAtraso ? "text-red-300" : "text-amber-200"}`}>{x.diasAtraso ? `${x.diasAtraso} dia(s) em atraso` : "a vencer"} · {x.parcelas.length} parcela(s) · {brl(x.total)}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">{x.telefone ? (x.ultimoEnvio ? `último envio ${br(x.ultimoEnvio)}` : "nunca cobrado") : "sem WhatsApp no cadastro"}</span>
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setAberta(aberta === x.contratoId ? null : x.contratoId)}>{aberta === x.contratoId ? "fechar" : "ver mensagem"}</button>
            </div>
            {aberta === x.contratoId && <pre className="mt-2 whitespace-pre-wrap rounded bg-secondary/40 p-2 text-xs">{x.mensagem}</pre>}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        A mensagem leva o link do carnê digital do comprador (boleto, PIX e 2ª via atualizada). Só o administrador envia; cada envio fica registrado. Negativação não é feita pelo sistema.
      </p>
    </section>
  );
}
