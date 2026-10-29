import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, HardHat, ImagePlus, Loader2, MessageSquare, Trash2, UserRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const br = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const FILTROS = [["aberto", "Aguardando resposta"], ["respondido", "Respondidos"], ["fechado", "Encerrados"], [null, "Todos"]] as const;

function Chamado({ c, onFeito }: { c: any; onFeito: () => void }) {
  const [texto, setTexto] = useState("");
  const responder = trpc.portalComprador.responder.useMutation({
    onSuccess: r => { toast.success(r.avisado ? "Resposta enviada — o comprador foi avisado no WhatsApp" : "Resposta salva (sem WhatsApp do comprador)"); setTexto(""); onFeito(); },
    onError: e => toast.error(e.message),
  });
  return (
    <div className={`space-y-2 rounded-xl border p-3 text-sm ${c.status === "aberto" ? "border-amber-400/50 bg-amber-500/5" : "border-border bg-card"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{c.assunto}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><UserRound className="h-3.5 w-3.5" /> {c.comprador} · contrato {c.contrato} · chácara {c.lote} · {c.rotulo} · {quando(c.criadoEm)}</p>
        </div>
        <span className="rounded border border-border px-2 py-0.5 text-[11px] uppercase text-muted-foreground">{c.status}</span>
      </div>
      <p className="whitespace-pre-wrap">{c.mensagem}</p>
      {c.resposta && <p className="whitespace-pre-wrap rounded-md bg-emerald-500/10 p-2"><b>Resposta</b>{c.respondidoPor ? ` (${c.respondidoPor}, ${quando(c.respondidoEm)})` : ""}: {c.resposta}</p>}
      {c.status !== "fechado" && (
        <div className="space-y-2">
          <Textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} placeholder={c.tipo === "antecipacao" ? "Ex.: Confirmado! O boleto/PIX da antecipação vai no seu WhatsApp até amanhã." : "Escreva a resposta ao comprador"} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={texto.trim().length < 2 || responder.isPending} onClick={() => responder.mutate({ id: c.id, resposta: texto, fechar: false })}>
              {responder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="mr-1.5 h-4 w-4" />} Responder
            </Button>
            <Button size="sm" variant="outline" disabled={texto.trim().length < 2 || responder.isPending} onClick={() => responder.mutate({ id: c.id, resposta: texto, fechar: true })}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Responder e encerrar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Chamados() {
  const [filtro, setFiltro] = useState<"aberto" | "respondido" | "fechado" | null>("aberto");
  const { data, isLoading, refetch } = trpc.portalComprador.chamados.useQuery({ status: filtro }, { refetchInterval: 60_000 });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {FILTROS.map(([k, r]) => (
          <button key={String(k)} onClick={() => setFiltro(k)} className={`rounded-full border px-3 py-1 text-xs ${filtro === k ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}>{r}</button>
        ))}
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {data && !data.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum chamado {filtro ? "nesta situação" : "ainda"}.</p>}
      {data?.map(c => <Chamado key={c.id} c={c} onFeito={() => refetch()} />)}
    </div>
  );
}

function Obra() {
  const { data: emps } = trpc.empreendimentosAdmin.lista.useQuery(undefined, { staleTime: 60_000 });
  const [empId, setEmpId] = useState<number | null>(null);
  useEffect(() => { if (!empId && emps?.length) setEmpId(Number((emps as any[]).find(e => e.slug === "bom-jardims")?.id ?? (emps as any[])[0].id)); }, [emps, empId]);
  const { data: itens, refetch } = trpc.portalComprador.obra.useQuery({ empreendimentoId: empId ?? 0 }, { enabled: !!empId });
  const [f, setF] = useState({ titulo: "", texto: "", percentual: "", data: hoje() });
  const [foto, setFoto] = useState<string | null>(null);
  const publicar = trpc.portalComprador.publicarObra.useMutation({
    onSuccess: () => { toast.success("Atualização publicada no portal dos compradores"); setF({ titulo: "", texto: "", percentual: "", data: hoje() }); setFoto(null); refetch(); },
    onError: e => toast.error(e.message),
  });
  const excluir = trpc.portalComprador.excluirObra.useMutation({ onSuccess: () => refetch(), onError: e => toast.error(e.message) });
  const lerFoto = (file?: File) => {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { toast.error("Foto maior que 12 MB"); return; }
    const r = new FileReader(); r.onload = () => setFoto(String(r.result)); r.readAsDataURL(file);
  };
  return (
    <div className="space-y-4">
      <select value={empId ?? ""} onChange={e => setEmpId(Number(e.target.value))} className="h-9 rounded-md border border-border bg-background px-2 text-sm" aria-label="Empreendimento">
        {(emps as any[] | undefined)?.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
      </select>
      <form className="space-y-2 rounded-xl border border-border bg-card p-3" onSubmit={e => { e.preventDefault(); if (empId) publicar.mutate({ empreendimentoId: empId, titulo: f.titulo, texto: f.texto, percentual: f.percentual ? Number(f.percentual) : null, data: f.data, fotoBase64: foto }); }}>
        <p className="flex items-center gap-2 font-semibold"><HardHat className="h-4 w-4" /> Nova atualização da obra</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_120px_150px]">
          <Input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} placeholder="Título (ex.: Rede de água concluída na Rua 3)" required minLength={3} maxLength={160} />
          <Input value={f.percentual} onChange={e => setF({ ...f, percentual: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder="% da obra" inputMode="numeric" />
          <Input type="date" value={f.data} onChange={e => setF({ ...f, data: e.target.value })} required />
        </div>
        <Textarea value={f.texto} onChange={e => setF({ ...f, texto: e.target.value })} rows={3} placeholder="O que foi feito, o que vem a seguir" required minLength={5} />
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm"><ImagePlus className="h-4 w-4" /> {foto ? "Trocar foto" : "Foto (opcional)"}
            <input type="file" accept="image/*" className="hidden" onChange={e => lerFoto(e.target.files?.[0])} /></label>
          {foto && <img src={foto} alt="" className="h-12 w-16 rounded object-cover" />}
          <Button type="submit" disabled={publicar.isPending}>{publicar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publicar"}</Button>
        </div>
      </form>
      {itens?.map(o => (
        <div key={o.id} className="flex items-start justify-between gap-2 rounded-xl border border-border bg-card p-3 text-sm">
          <div><p className="text-xs text-muted-foreground">{br(o.data)}{o.percentual != null ? ` · ${o.percentual}%` : ""}{o.temFoto ? " · com foto" : ""}</p><p className="font-semibold">{o.titulo}</p><p className="whitespace-pre-wrap text-muted-foreground">{o.texto}</p></div>
          <Button size="sm" variant="ghost" className="text-red-300" onClick={() => { if (confirm(`Excluir "${o.titulo}"?`)) excluir.mutate({ id: o.id }); }}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      {itens && !itens.length && <p className="text-sm text-muted-foreground">Nenhuma atualização publicada ainda.</p>}
    </div>
  );
}

/** Vendas › Portal do comprador: chamados dos compradores (/c/:codigo) e o andamento da obra que eles veem */
export default function PortalComprador() {
  const [aba, setAba] = useState<"chamados" | "obra">("chamados");
  return (
    <div>
      <PageHeader icone={MessageSquare} titulo="Portal do comprador" subtitulo="Chamados e pedidos de antecipação dos compradores e o andamento da obra que eles acompanham pelo carnê digital" />
      <div className="mx-auto max-w-[1100px] space-y-3 px-4 pb-8 md:px-6">
        <div className="flex gap-1 border-b border-border">
          {([["chamados", "Chamados"], ["obra", "Andamento da obra"]] as const).map(([k, r]) => (
            <button key={k} onClick={() => setAba(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === k ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground"}`}>{r}</button>
          ))}
        </div>
        {aba === "chamados" ? <Chamados /> : <Obra />}
      </div>
    </div>
  );
}
