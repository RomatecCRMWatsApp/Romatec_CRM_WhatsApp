import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Inbox, Instagram, Link2, Loader2, MessageCircle, Search, Send } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Canal = "whatsapp" | "instagram";
const hora = (iso: string) => {
  const d = new Date(iso), hoje = new Date();
  return d.toDateString() === hoje.toDateString()
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};
const ROTULO_AUTOR: Record<string, string> = { lead: "", ia: "IA", bot: "Robô", sistema: "Sistema", corretor: "Você/equipe" };

function Conversa({ canal, id, info, onVoltar }: { canal: Canal; id: number; info: any; onVoltar: () => void }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.caixaEntrada.mensagens.useQuery({ canal, id }, { refetchInterval: 10_000 });
  const [texto, setTexto] = useState("");
  const [fone, setFone] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [data?.length]);
  const responder = trpc.caixaEntrada.responder.useMutation({
    onSuccess: () => { setTexto(""); utils.caixaEntrada.mensagens.invalidate({ canal, id }); utils.caixaEntrada.conversas.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const vincular = trpc.caixaEntrada.vincularInstagram.useMutation({
    onSuccess: r => { toast.success("Lead criado/ligado — agora dá para seguir pelo WhatsApp"); setFone(""); utils.caixaEntrada.conversas.invalidate(); if (r.leadId) navigate(`/leads/lead/${r.leadId}`); },
    onError: e => toast.error(e.message),
  });
  const bloqueado = canal === "instagram" && !info?.janelaAberta;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <div className="flex min-w-0 items-center gap-2">
          <button className="md:hidden" onClick={onVoltar} aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
          {canal === "instagram" ? <Instagram className="h-5 w-5 shrink-0 text-pink-400" /> : <MessageCircle className="h-5 w-5 shrink-0 text-emerald-400" />}
          <div className="min-w-0"><p className="truncate font-semibold">{info?.nome}</p><p className="truncate text-xs text-muted-foreground">{info?.contato}{info?.responsavel ? ` · ${info.responsavel}` : ""}</p></div>
        </div>
        {info?.leadId && <Button size="sm" variant="ghost" onClick={() => navigate(`/leads/lead/${info.leadId}`)}><ExternalLink className="h-4 w-4" /></Button>}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {data?.map(m => (
          <div key={m.id} className={`flex ${m.direcao === "in" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.direcao === "in" ? "bg-secondary" : "bg-emerald-700/60"}`}>
              {m.direcao === "out" && ROTULO_AUTOR[m.autor] && <p className="text-[10px] uppercase opacity-70">{ROTULO_AUTOR[m.autor]}</p>}
              <p className="whitespace-pre-wrap break-words">{m.texto}</p>
              <p className="mt-0.5 text-right text-[10px] opacity-60">{hora(m.em)}</p>
            </div>
          </div>
        ))}
        <div ref={fim} />
      </div>
      {canal === "instagram" && !info?.leadId && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border p-2 text-xs">
          <Link2 className="h-4 w-4 text-muted-foreground" /> O cliente passou o WhatsApp?
          <Input value={fone} onChange={e => setFone(e.target.value)} placeholder="(99) 9 9999-9999" className="h-8 w-44" inputMode="tel" />
          <Button size="sm" variant="outline" disabled={fone.replace(/\D/g, "").length < 10 || vincular.isPending} onClick={() => vincular.mutate({ id, telefone: fone })}>Criar/ligar lead</Button>
        </div>
      )}
      <div className="border-t border-border p-2">
        {bloqueado && <p className="mb-1 text-xs text-amber-300">A Meta só deixa responder no Direct até 24 h depois da última mensagem do cliente.</p>}
        <div className="flex gap-2">
          <Textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} disabled={bloqueado} placeholder={canal === "whatsapp" ? "Responder no WhatsApp (você assume a conversa; o robô para)" : "Responder no Instagram Direct"}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && texto.trim()) { e.preventDefault(); responder.mutate({ canal, id, texto }); } }} />
          <Button disabled={!texto.trim() || responder.isPending || bloqueado} onClick={() => responder.mutate({ canal, id, texto })} aria-label="Enviar">
            {responder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Leads › Caixa de entrada: WhatsApp e Instagram Direct numa lista só */
export default function CaixaEntrada() {
  const busca0 = new URLSearchParams(useSearch());
  const { data, isLoading } = trpc.caixaEntrada.conversas.useQuery(undefined, { refetchInterval: 15_000 });
  const [filtro, setFiltro] = useState<"todas" | "aguardando" | Canal>("todas");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<{ canal: Canal; id: number } | null>(busca0.get("ig") ? { canal: "instagram", id: Number(busca0.get("ig")) } : busca0.get("lead") ? { canal: "whatsapp", id: Number(busca0.get("lead")) } : null);
  const lista = useMemo(() => (data ?? []).filter(c =>
    (filtro === "todas" || (filtro === "aguardando" ? c.aguardando : c.canal === filtro)) &&
    (!q.trim() || `${c.nome} ${c.contato}`.toLowerCase().includes(q.trim().toLowerCase()))), [data, filtro, q]);
  const info = data?.find(c => sel && c.canal === sel.canal && c.id === sel.id);
  const n = (f: (c: any) => boolean) => (data ?? []).filter(f).length;
  return (
    <div>
      <PageHeader icone={Inbox} titulo="Caixa de entrada" subtitulo="WhatsApp e Instagram Direct numa lista só — responda daqui" />
      <div className="mx-auto max-w-[1500px] px-4 pb-6 md:px-6">
        <div className="grid h-[calc(100vh-190px)] min-h-[480px] overflow-hidden rounded-xl border border-border bg-card md:grid-cols-[360px_1fr]">
          <div className={`flex min-h-0 flex-col border-r border-border ${sel ? "hidden md:flex" : "flex"}`}>
            <div className="space-y-2 border-b border-border p-2">
              <div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar nome ou contato" className="pl-8" /></div>
              <div className="flex flex-wrap gap-1">
                {([["todas", `Todas (${n(() => true)})`], ["aguardando", `Aguardando (${n(c => c.aguardando)})`], ["whatsapp", "WhatsApp"], ["instagram", "Instagram"]] as const).map(([k, r]) => (
                  <button key={k} onClick={() => setFiltro(k)} className={`rounded-full border px-2.5 py-0.5 text-xs ${filtro === k ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}>{r}</button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {isLoading && <Loader2 className="m-3 h-5 w-5 animate-spin text-muted-foreground" />}
              {lista.map(c => (
                <button key={`${c.canal}-${c.id}`} onClick={() => setSel({ canal: c.canal, id: c.id })}
                  className={`flex w-full gap-2 border-b border-border/50 p-3 text-left hover:bg-secondary/40 ${sel?.canal === c.canal && sel.id === c.id ? "bg-secondary/60" : ""}`}>
                  {c.canal === "instagram" ? <Instagram className="mt-0.5 h-4 w-4 shrink-0 text-pink-400" /> : <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />}
                  <span className="min-w-0 flex-1">
                    <span className="flex justify-between gap-2"><span className={`truncate ${c.aguardando ? "font-semibold" : ""}`}>{c.nome}</span><span className="shrink-0 text-[11px] text-muted-foreground">{hora(c.ultimaEm)}</span></span>
                    <span className="flex items-center gap-1"><span className="truncate text-xs text-muted-foreground">{c.ultima}</span>{c.aguardando && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-emerald-400" />}</span>
                  </span>
                </button>
              ))}
              {data && !lista.length && <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa {filtro !== "todas" ? "neste filtro" : "nos últimos 30 dias"}.</p>}
            </div>
          </div>
          <div className={`min-h-0 ${sel ? "flex flex-col" : "hidden md:flex md:items-center md:justify-center"}`}>
            {sel ? <Conversa key={`${sel.canal}-${sel.id}`} canal={sel.canal} id={sel.id} info={info} onVoltar={() => setSel(null)} /> : <p className="text-sm text-muted-foreground">Escolha uma conversa</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
