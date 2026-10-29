import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, ExternalLink, Landmark, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LINKS_CARTORIO, ROTULO_REGISTRO, STATUS_REGISTRO, registroAtrasado, type StatusRegistro } from "@shared/cartorio";

const br = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/** Contrato › Registro em cartório: kit para protocolar (ZIP) e acompanhamento do protocolo (server/cartorio.ts) */
export default function RegistroCartorio({ contratoId, statusContrato }: { contratoId: number; statusContrato: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.cartorio.situacao.useQuery({ contratoId });
  const [f, setF] = useState({ status: "preparando" as StatusRegistro, cartorio: "Cartório de Registro de Imóveis da Comarca de Açailândia/MA", protocolo: "", dataProtocolo: "", exigencias: "", matricula: "", emolumentos: "", registradoEm: "", observacoes: "" });
  useEffect(() => {
    if (data) setF({ status: data.status, cartorio: data.cartorio ?? "", protocolo: data.protocolo ?? "", dataProtocolo: data.dataProtocolo ?? "", exigencias: data.exigencias ?? "",
      matricula: data.matricula ?? "", emolumentos: data.emolumentos != null ? String(data.emolumentos).replace(".", ",") : "", registradoEm: data.registradoEm ?? "", observacoes: data.observacoes ?? "" });
  }, [data]);
  const salvar = trpc.cartorio.atualizar.useMutation({ onSuccess: () => { toast.success("Registro atualizado"); utils.cartorio.situacao.invalidate({ contratoId }); }, onError: e => toast.error(e.message) });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const assinado = ["assinado", "ativo", "quitado"].includes(statusContrato);
  const atrasado = data && registroAtrasado(data.status, data.dataProtocolo, hoje());
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold"><Landmark className="h-4 w-4" /> Registro em cartório {data && <span className="font-normal text-muted-foreground">· {data.rotulo}</span>}</p>
        <Button size="sm" variant="outline" disabled={!assinado} asChild={assinado} title={assinado ? "" : "Disponível depois do contrato assinado"}>
          {assinado ? <a href={`/api/contratos/${contratoId}/kit-registro.zip`}><Download className="mr-1 h-3.5 w-3.5" /> Kit para protocolo (ZIP)</a> : <span><Download className="mr-1 h-3.5 w-3.5" /> Kit para protocolo (ZIP)</span>}
        </Button>
      </div>
      {atrasado && <p className="flex items-center gap-2 rounded-md bg-amber-500/10 p-2 text-amber-200"><AlertTriangle className="h-4 w-4" /> Prazo de referência do registro ({br(data!.prazo)}) já passou — cobre o cartório.</p>}
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
        <>
          <div className="grid gap-2 md:grid-cols-3">
            <label className="text-xs text-muted-foreground">Situação
              <select value={f.status} onChange={set("status")} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                {STATUS_REGISTRO.map(s => <option key={s} value={s}>{ROTULO_REGISTRO[s]}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground md:col-span-2">Cartório<Input value={f.cartorio} onChange={set("cartorio")} /></label>
            <label className="text-xs text-muted-foreground">N.º do protocolo<Input value={f.protocolo} onChange={set("protocolo")} /></label>
            <label className="text-xs text-muted-foreground">Data do protocolo<Input type="date" value={f.dataProtocolo} onChange={set("dataProtocolo")} /></label>
            <label className="text-xs text-muted-foreground">Emolumentos (R$)<Input value={f.emolumentos} onChange={set("emolumentos")} inputMode="decimal" /></label>
            {f.status === "exigencia" && <label className="text-xs text-muted-foreground md:col-span-3">Exigência do cartório<Textarea rows={2} value={f.exigencias} onChange={set("exigencias")} /></label>}
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <Input value={f.matricula} onChange={set("matricula")} placeholder="Matrícula / n.º do registro (ex.: R-3/12.345)" />
            <label className="text-xs text-muted-foreground">Data do registro<Input type="date" value={f.registradoEm} onChange={set("registradoEm")} /></label>
            <label className="text-xs text-muted-foreground">Observações<Input value={f.observacoes} onChange={set("observacoes")} /></label>
          </div>
          <Button size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate({
            contratoId, status: f.status, cartorio: f.cartorio || null, protocolo: f.protocolo || null, dataProtocolo: f.dataProtocolo || null, exigencias: f.exigencias || null,
            matricula: f.matricula || null, emolumentos: f.emolumentos ? Number(f.emolumentos.replace(/\./g, "").replace(",", ".")) || 0 : null, registradoEm: f.registradoEm || null, observacoes: f.observacoes || null,
          })}>{salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}</Button>
          {!!data?.historico.length && (
            <div className="border-t border-border pt-2 text-xs text-muted-foreground">
              {[...data.historico].reverse().map((h, i) => <p key={i}>{new Date(h.em).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })} · {ROTULO_REGISTRO[h.status as StatusRegistro] ?? h.status}{h.nota ? ` · ${h.nota}` : ""}{h.por ? ` (${h.por})` : ""}</p>)}
            </div>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2 border-t border-border pt-2 text-xs">
        {LINKS_CARTORIO.map(l => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" title={l.descricao} className="inline-flex items-center gap-1 text-emerald-300 hover:underline"><ExternalLink className="h-3.5 w-3.5" /> {l.titulo}</a>)}
      </div>
      <p className="text-[11px] text-muted-foreground">O protocolo é feito no e-Protocolo do ONR com certificado ICP-Brasil (ou no balcão). A integração automática por API depende do credenciamento da Romatec como integradora no ONR.</p>
    </section>
  );
}
