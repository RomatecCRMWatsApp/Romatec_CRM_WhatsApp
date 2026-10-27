import { useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { CalendarCheck, Copy, FileText, Loader2, Pencil, Plus, Send, Trash2, Upload, Users, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { ROTULO_STATUS_CONVIDADO, lerLista, type StatusConvidado } from "@shared/convites";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";

const campo = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";
const dataHora = (d: unknown) => new Date(d as any).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const copiar = async (t: string, o = "Link") => { try { await navigator.clipboard.writeText(t); toast.success(`${o} copiado`); } catch { window.prompt("Copie:", t); } };
const fone = (t: string) => { const d = t.replace(/^55/, ""); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; };
const COR: Record<StatusConvidado, string> = { confirmado: "text-emerald-400", recusado: "text-red-400", pendente: "text-amber-300" };

/** Data/hora no fuso do Maranhão para os campos do formulário */
function partes(d?: Date | string | null) {
  if (!d) return { data: "", hora: "09:00" };
  const x = new Date(new Date(d).getTime() - 3 * 3600_000).toISOString();
  return { data: x.slice(0, 10), hora: x.slice(11, 16) };
}

function FormReuniao({ inicial, onSalvo, onCancelar }: { inicial?: any; onSalvo: (id: number) => void; onCancelar: () => void }) {
  const { data: emps } = trpc.convites.empreendimentos.useQuery();
  const [f, setF] = useState(() => ({
    titulo: inicial?.titulo ?? "", empreendimentoId: inicial?.empreendimentoId ?? (null as number | null), ...partes(inicial?.quando),
    local: inicial?.local ?? "", linkVideo: inicial?.linkVideo ?? "", descricao: inicial?.descricao ?? "",
  }));
  const utils = trpc.useUtils();
  const ok = (id: number) => { utils.convites.invalidate(); toast.success("Reunião salva"); onSalvo(id); };
  const criar = trpc.convites.criar.useMutation({ onSuccess: r => ok(r.id), onError: e => toast.error(e.message) });
  const editar = trpc.convites.editar.useMutation({ onSuccess: () => ok(inicial.id), onError: e => toast.error(e.message) });
  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const dados = { ...f, local: f.local || null, linkVideo: f.linkVideo || null, descricao: f.descricao || null };
    if (inicial) editar.mutate({ id: inicial.id, ...dados }); else criar.mutate(dados);
  };
  const ocupado = criar.isPending || editar.isPending;
  return (
    <form onSubmit={salvar} className="rounded-xl border border-border bg-card p-4 grid gap-3 md:grid-cols-2">
      <label className="text-xs md:col-span-2">Título<input required className={campo} value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: Apresentação do Bom Jardims" /></label>
      <label className="text-xs">Empreendimento
        <select className={campo} value={f.empreendimentoId ?? ""} onChange={e => setF({ ...f, empreendimentoId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">— nenhum (só o escritório vê) —</option>
          {(emps ?? []).map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">Data<input required type="date" className={campo} value={f.data} onChange={e => setF({ ...f, data: e.target.value })} /></label>
        <label className="text-xs">Hora<input required type="time" className={campo} value={f.hora} onChange={e => setF({ ...f, hora: e.target.value })} /></label>
      </div>
      <label className="text-xs">Local<input className={campo} value={f.local} onChange={e => setF({ ...f, local: e.target.value })} placeholder="Endereço ou ponto de encontro" /></label>
      <label className="text-xs">Link da videochamada<input className={campo} value={f.linkVideo} onChange={e => setF({ ...f, linkVideo: e.target.value })} placeholder="https://meet.google.com/…" /></label>
      <label className="text-xs md:col-span-2">Descrição<textarea rows={3} className="w-full rounded-md border border-border bg-background p-2 text-sm" value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} /></label>
      <div className="md:col-span-2 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>
        <Button type="submit" disabled={ocupado}>{ocupado && <Loader2 className="h-4 w-4 animate-spin" />}Salvar</Button>
      </div>
    </form>
  );
}

function Lista() {
  const [, navigate] = useLocation();
  const [emp, setEmp] = useState<number | null>(null);
  const [nova, setNova] = useState(false);
  const { data: emps } = trpc.convites.empreendimentos.useQuery();
  const { data, isLoading, error } = trpc.convites.listar.useQuery({ empreendimentoId: emp });
  const { user } = useAuth();
  const podeCriar = ["admin", "secretario"].includes(perfilDe(user as any) ?? "");
  return (
    <div>
      <PageHeader icone={CalendarCheck} titulo="Convites de reunião" voltar={perfilDe(user as any) === "empreendedor" ? { rotulo: "Portal do empreendedor", onClick: () => navigate("/empreendedor") } : undefined} subtitulo="Link de confirmação de presença por WhatsApp: quem vai de fato, por reunião e por empreendimento"
        acoes={podeCriar && <Button onClick={() => setNova(true)}><Plus className="h-4 w-4" />Nova reunião</Button>} />
      <div className="px-4 md:px-6 max-w-[1500px] mx-auto grid gap-4 pb-10">
        {nova && <FormReuniao onSalvo={id => navigate(`/convites/${id}`)} onCancelar={() => setNova(false)} />}
        <div className="flex items-center gap-2">
          <select className={`${campo} max-w-xs`} value={emp ?? ""} onChange={e => setEmp(e.target.value ? Number(e.target.value) : null)} aria-label="Filtrar por empreendimento">
            <option value="">Todos os empreendimentos</option>
            {(emps ?? []).map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        </div>
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : error ? <p className="text-sm text-red-400">{error.message}</p>
          : !data?.length ? <p className="text-sm text-muted-foreground">Nenhuma reunião ainda.</p> : (
            <div className="grid gap-2">
              {data.map(r => (
                <button key={r.id} onClick={() => navigate(`/convites/${r.id}`)} className={`text-left rounded-xl border border-border bg-card p-3 hover:border-primary/60 ${r.cancelada ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <b className="block truncate">{r.titulo}{r.cancelada && " (cancelada)"}</b>
                      <span className="text-xs text-muted-foreground">{dataHora(r.quando)}{r.empreendimento ? ` · ${r.empreendimento}` : ""}{r.local ? ` · ${r.local}` : ""}</span>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <span className="text-emerald-400 font-semibold">{r.contagem.confirmado} confirmado(s)</span>
                      <span className="text-red-400">{r.contagem.recusado} não vão</span>
                      <span className="text-amber-300">{r.contagem.pendente} pendente(s)</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

function Detalhe({ id }: { id: number }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: r, isLoading, error } = trpc.convites.detalhe.useQuery({ id });
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviandoFolder, setEnviandoFolder] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const recarregar = () => utils.convites.invalidate();
  const adicionar = trpc.convites.adicionarConvidados.useMutation({
    onSuccess: x => { toast.success(`${x.adicionados} convidado(s) adicionado(s)${x.repetidos ? ` · ${x.repetidos} repetido(s) ignorado(s)` : ""}`); setTexto(""); recarregar(); },
    onError: e => toast.error(e.message),
  });
  const enviar = trpc.convites.enviar.useMutation({
    onSuccess: x => { if (x.enviados) toast.success(`${x.enviados} convite(s) enviado(s) pelo WhatsApp`); x.falhas.forEach(f => toast.error(f)); if (!x.enviados && !x.falhas.length) toast.info("Ninguém pendente para enviar"); recarregar(); },
    onError: e => toast.error(e.message),
  });
  const remover = trpc.convites.removerConvidado.useMutation({ onSuccess: recarregar, onError: e => toast.error(e.message) });
  const cancelar = trpc.convites.cancelar.useMutation({ onSuccess: () => { toast.success("Reunião cancelada"); recarregar(); }, onError: e => toast.error(e.message) });
  const removerFolder = trpc.convites.removerFolder.useMutation({ onSuccess: recarregar, onError: e => toast.error(e.message) });
  const lista = useMemo(() => lerLista(texto), [texto]);

  const subirFolder = async (f?: File | null) => {
    if (!f) return;
    setEnviandoFolder(true);
    try {
      const j = await fetch(`/api/convites/${id}/folder?nome=${encodeURIComponent(f.name)}`, { method: "POST", body: f, credentials: "include" }).then(x => x.json());
      if (!j.ok) throw new Error(j.error);
      toast.success("Folder anexado"); recarregar();
    } catch (e: any) { toast.error(e?.message || "Falha ao enviar o folder"); } finally { setEnviandoFolder(false); if (arquivo.current) arquivo.current.value = ""; }
  };

  if (isLoading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (error || !r) return <div className="p-6 text-sm text-red-400">{error?.message ?? "Reunião não encontrada"}</div>;
  const grupos: StatusConvidado[] = ["confirmado", "pendente", "recusado"];
  return (
    <div>
      <PageHeader icone={CalendarCheck} titulo={r.titulo} voltar={{ rotulo: "Convites de reunião", onClick: () => navigate("/convites") }}
        subtitulo={<>{dataHora(r.quando)}{r.empreendimento ? ` · ${r.empreendimento}` : ""}{r.cancelada ? " · CANCELADA" : ""}</>}
        acoes={r.podeEditar && !r.cancelada && <>
          <Button variant="outline" onClick={() => setEditando(v => !v)}><Pencil className="h-4 w-4" />Editar</Button>
          <Button variant="outline" onClick={() => { if (confirm("Cancelar esta reunião? O link deixa de aceitar respostas.")) cancelar.mutate({ id }); }}><X className="h-4 w-4" />Cancelar reunião</Button>
        </>} />
      <div className="px-4 md:px-6 max-w-[1500px] mx-auto grid gap-4 pb-10">
        {editando && <FormReuniao inicial={r} onSalvo={() => setEditando(false)} onCancelar={() => setEditando(false)} />}

        <div className="grid gap-3 sm:grid-cols-3">
          {grupos.map(g => (
            <div key={g} className="rounded-xl border border-border bg-card p-3 text-center">
              <div className={`text-3xl font-bold ${COR[g]}`}>{r.contagem[g]}</div>
              <div className="text-xs text-muted-foreground">{g === "confirmado" ? "confirmados (vão participar)" : g === "pendente" ? "sem resposta" : "não poderão ir"}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 grid gap-2 text-sm">
          {r.local && <div><span className="text-muted-foreground">Local:</span> {r.local}</div>}
          {r.linkVideo && <div><span className="text-muted-foreground">Videochamada:</span> <a className="text-primary underline break-all" href={r.linkVideo} target="_blank" rel="noreferrer">{r.linkVideo}</a></div>}
          {r.descricao && <div className="whitespace-pre-wrap text-muted-foreground">{r.descricao}</div>}
          {r.podeEditar && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-muted-foreground">Folder:</span>
              {r.folder ? <span className="inline-flex items-center gap-1"><FileText className="h-4 w-4" />{r.folder.nome}</span> : <span className="text-muted-foreground">nenhum</span>}
              <input ref={arquivo} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={e => subirFolder(e.target.files?.[0])} />
              <Button size="sm" variant="outline" disabled={enviandoFolder} onClick={() => arquivo.current?.click()}>
                {enviandoFolder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{r.folder ? "Trocar" : "Anexar imagem/PDF"}
              </Button>
              {r.folder && <Button size="sm" variant="ghost" onClick={() => removerFolder.mutate({ id })}><Trash2 className="h-4 w-4" /></Button>}
            </div>
          )}
          {r.linkGeral && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-muted-foreground">Link geral (para grupos — a pessoa informa nome e WhatsApp):</span>
              <code className="text-xs break-all">{r.linkGeral}</code>
              <Button size="sm" variant="outline" onClick={() => copiar(r.linkGeral!)}><Copy className="h-4 w-4" />Copiar link</Button>
            </div>
          )}
        </div>

        {r.podeEditar && !r.cancelada && (
          <div className="rounded-xl border border-border bg-card p-4 grid gap-2">
            <b className="text-sm flex items-center gap-2"><Users className="h-4 w-4" />Adicionar convidados</b>
            <textarea rows={4} value={texto} onChange={e => setTexto(e.target.value)} className="w-full rounded-md border border-border bg-background p-2 text-sm font-mono"
              placeholder={"Um por linha: nome e WhatsApp\nMaria Souza, (99) 99111-0001\nJoão Lima; 99 99111-0002"} />
            {texto.trim() && <p className="text-xs text-muted-foreground">{lista.ok.length} pronto(s) para adicionar{lista.erros.length ? ` · ${lista.erros.length} linha(s) sem nome ou WhatsApp válido: ${lista.erros.slice(0, 3).join(" | ")}` : ""}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" disabled={!lista.ok.length || adicionar.isPending} onClick={() => adicionar.mutate({ reuniaoId: id, convidados: lista.ok })}><Plus className="h-4 w-4" />Adicionar</Button>
              <Button disabled={enviar.isPending || !r.contagem.pendente} onClick={() => { if (confirm(`Enviar o convite pelo WhatsApp para ${r.contagem.pendente} convidado(s) sem resposta?`)) enviar.mutate({ reuniaoId: id }); }}>
                {enviar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar convite aos pendentes
              </Button>
            </div>
          </div>
        )}

        {grupos.map(g => {
          const pessoas = r.convidados.filter(c => c.status === g);
          if (!pessoas.length) return null;
          return (
            <div key={g} className="rounded-xl border border-border bg-card">
              <div className={`px-4 py-2 border-b border-border text-sm font-semibold ${COR[g]}`}>{ROTULO_STATUS_CONVIDADO[g]} · {pessoas.length}</div>
              <div className="divide-y divide-border">
                {pessoas.map(c => (
                  <div key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <b>{c.nome}</b> <span className="text-xs text-muted-foreground">{fone(c.telefone)}{c.origem === "link_geral" ? " · pelo link geral" : ""}</span>
                      <div className="text-xs text-muted-foreground">
                        {c.respondidoEm ? `Respondeu em ${dataHora(c.respondidoEm)}` : c.conviteEnviadoEm ? `Convite enviado em ${dataHora(c.conviteEnviadoEm)}` : "Convite ainda não enviado"}
                      </div>
                    </div>
                    {c.link && <>
                      <Button size="sm" variant="ghost" title="Copiar o link individual" onClick={() => copiar(c.link!)}><Copy className="h-4 w-4" /></Button>
                      {!r.cancelada && <Button size="sm" variant="ghost" title={c.conviteEnviadoEm ? "Reenviar convite pelo WhatsApp" : "Enviar convite pelo WhatsApp"} disabled={enviar.isPending}
                        onClick={() => enviar.mutate({ reuniaoId: id, convidadoIds: [c.id] })}><Send className="h-4 w-4" /></Button>}
                      <Button size="sm" variant="ghost" title="Remover convidado" onClick={() => { if (confirm(`Remover ${c.nome} da lista?`)) remover.mutate({ id: c.id }); }}><Trash2 className="h-4 w-4" /></Button>
                    </>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Convites de reunião: lista (filtro por empreendimento) e painel da reunião com quem confirmou */
export default function Convites() {
  const [, params] = useRoute("/convites/:id");
  const id = Number(params?.id);
  return id > 0 ? <Detalhe id={id} /> : <Lista />;
}
