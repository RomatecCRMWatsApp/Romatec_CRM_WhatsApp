import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, Footprints, MessageCircle, Power } from "lucide-react";

/**
 * Passeio no Mapa (CRM): o corretor gera o link público /p/<token> do empreendimento (com um lote em destaque, se quiser),
 * copia, manda no WhatsApp e acompanha quantas vezes o cliente abriu e se tocou em "Quero este lote".
 */
type LoteOpcao = { id: number; codigo: string };
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const urlDe = (caminho: string) => `${window.location.origin}${caminho}`;
const ROTULO: Record<string, string> = { ativo: "Ativo", expirado: "Expirado", desativado: "Desativado" };
const campo = "h-10 w-full rounded-md border border-border bg-secondary px-2 text-sm";

function textoWhatsApp(nome: string, url: string, lote?: string | null) {
  return `Olá! Preparei um passeio pelo mapa do ${nome}${lote ? `, com o lote ${lote} em destaque` : ""}. Abra no celular: ${url}`;
}

export function GerarPasseio({ empreendimentoId, nome, lotes, loteInicial = null, precosPublicos }: {
  empreendimentoId: number; nome: string; lotes: LoteOpcao[]; loteInicial?: number | null; precosPublicos: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: ligado } = trpc.passeio.ligado.useQuery();
  const [loteId, setLoteId] = useState<number | null>(loteInicial);
  const [mostrarPreco, setMostrarPreco] = useState(true);
  const [gerado, setGerado] = useState<{ caminho: string; lote: string | null } | null>(null);
  const criar = trpc.passeio.criar.useMutation({
    onSuccess: r => {
      const lote = lotes.find(l => l.id === loteId)?.codigo ?? null;
      setGerado({ caminho: r.caminho, lote });
      utils.passeio.listar.invalidate({ empreendimentoId });
      toast.success("Link do passeio gerado");
    },
    onError: e => toast.error(e.message),
  });
  if (ligado && !ligado.ligado) return <p className="text-sm text-muted-foreground">O Passeio no Mapa está desligado neste servidor.</p>;

  const copiar = async (t: string) => { try { await navigator.clipboard.writeText(t); toast.success("Copiado"); } catch { toast.error("Não consegui copiar; selecione o link e copie."); } };

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex items-center gap-2"><Footprints className="h-4 w-4 text-primary" /><p className="font-semibold">Gerar passeio para o cliente</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 min-w-0">
          <span className="text-xs text-muted-foreground">Lote em destaque (opcional)</span>
          <select value={loteId ?? ""} onChange={e => setLoteId(e.target.value ? Number(e.target.value) : null)} className={campo}>
            <option value="">Nenhum (mostra o empreendimento)</option>
            {lotes.map(l => <option key={l.id} value={l.id}>Lote {l.codigo}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={mostrarPreco} onChange={e => setMostrarPreco(e.target.checked)} className="h-4 w-4" />
          Mostrar preço
        </label>
      </div>
      {mostrarPreco && !precosPublicos && <p className="text-xs text-muted-foreground">Os preços deste empreendimento não estão liberados para o público; o cliente verá "preço com o corretor".</p>}
      <Button onClick={() => criar.mutate({ empreendimentoId, loteId, mostrarPreco })} disabled={criar.isPending} className="w-full sm:w-auto">
        {criar.isPending ? "Gerando…" : "Gerar link"}
      </Button>
      {gerado && (
        <div className="space-y-2 rounded-lg bg-secondary/50 p-2.5">
          <p className="break-all text-sm font-mono">{urlDe(gerado.caminho)}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => copiar(urlDe(gerado.caminho))}><Copy className="mr-1 h-4 w-4" />Copiar</Button>
            <Button size="sm" variant="outline" asChild><a href={`https://wa.me/?text=${encodeURIComponent(textoWhatsApp(nome, urlDe(gerado.caminho), gerado.lote))}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-1 h-4 w-4" />WhatsApp</a></Button>
            <Button size="sm" variant="outline" asChild><a href={gerado.caminho} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-4 w-4" />Ver como o cliente</a></Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ListaPasseios({ empreendimentoId, nome }: { empreendimentoId: number; nome: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.passeio.listar.useQuery({ empreendimentoId });
  const desativar = trpc.passeio.desativar.useMutation({
    onSuccess: () => { utils.passeio.listar.invalidate({ empreendimentoId }); toast.success("Link desativado"); },
    onError: e => toast.error(e.message),
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">Nenhum passeio gerado ainda.</p>;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {data.map(l => (
        <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{l.lote ? `Lote ${l.lote}` : "Empreendimento"}{l.lead ? ` · ${l.lead}` : ""}</p>
            <p className="text-xs text-muted-foreground">
              {ROTULO[l.situacao]} · {l.aberturas} {l.aberturas === 1 ? "abertura" : "aberturas"} · última {quando(l.ultimaAbertura)} · {l.cliques} {l.cliques === 1 ? "clique" : "cliques"} em "Quero"
              {l.corretor ? ` · ${l.corretor}` : ""}
            </p>
          </div>
          {l.situacao === "ativo" && (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="ghost" asChild><a href={`https://wa.me/?text=${encodeURIComponent(textoWhatsApp(nome, urlDe(l.caminho), l.lote))}`} target="_blank" rel="noopener noreferrer" aria-label="Enviar no WhatsApp"><MessageCircle className="h-4 w-4" /></a></Button>
              <Button size="sm" variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(urlDe(l.caminho)); toast.success("Copiado"); } catch { toast.error("Não consegui copiar"); } }} aria-label="Copiar link"><Copy className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => desativar.mutate({ id: l.id })} aria-label="Desativar link"><Power className="h-4 w-4" /></Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
