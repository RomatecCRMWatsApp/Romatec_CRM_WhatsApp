import { useRef, useState } from "react";
import { toast } from "sonner";
import { BookCopy, Eye, FileUp, Loader2, Printer, Send, UserPlus } from "lucide-react";
import VisualizadorPdf from "@/components/VisualizadorPdf";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { maskCPF, maskPhone } from "@shared/masks";
import { numeroCreciPF } from "@shared/cartaoVendas";

const campo = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const COR_FOLHA: Record<string, string> = { EM_BRANCO: "bg-secondary/40", UTILIZADA: "bg-ok-500/25 text-ok-200", CANCELADA: "bg-grafite-500/30 text-grafite-300 line-through", EXTRAVIADA: "bg-danger-500/25 text-danger-200" };

function Externos() {
  const utils = trpc.useUtils();
  const { data } = trpc.saas.externos.useQuery();
  const [f, setF] = useState({ nome: "", cpf: "", creci: "", telefone: "" });
  const criar = trpc.saas.criarExterno.useMutation({ onSuccess: () => { toast.success("Corretor externo cadastrado"); setF({ nome: "", cpf: "", creci: "", telefone: "" }); utils.saas.externos.invalidate(); }, onError: e => toast.error(e.message) });
  const convidar = trpc.saas.convidarExterno.useMutation({
    onSuccess: r => { toast.success(r.enviado ? "Convite para o digital enviado pelo WhatsApp" : "Convite criado — WhatsApp do sistema indisponível: veja em Recrutamento"); utils.saas.externos.invalidate(); },
    onError: e => toast.error(e.message),
  });
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Corretores externos (sem login)</h2>
      <div className="grid items-end gap-2 md:grid-cols-5">
        <label className="text-xs text-muted-foreground md:col-span-2">Nome<input className={campo} value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></label>
        <label className="text-xs text-muted-foreground">CPF<input className={campo} value={f.cpf} onChange={e => setF({ ...f, cpf: maskCPF(e.target.value) })} inputMode="numeric" /></label>
        <label className="text-xs text-muted-foreground">CRECI<input className={campo} value={f.creci} onChange={e => setF({ ...f, creci: e.target.value })} /></label>
        <label className="text-xs text-muted-foreground">WhatsApp<input className={campo} value={f.telefone} onChange={e => setF({ ...f, telefone: maskPhone(e.target.value) })} inputMode="tel" /></label>
      </div>
      <Button size="sm" disabled={f.nome.trim().length < 3 || f.cpf.replace(/\D/g, "").length !== 11 || criar.isPending} onClick={() => criar.mutate({ nome: f.nome, cpf: f.cpf, creci: f.creci || null, telefone: f.telefone || null })}>
        <UserPlus className="mr-1 h-4 w-4" /> Cadastrar externo
      </Button>
      <div className="space-y-1">
        {(data ?? []).map(x => (
          <p key={x.id} className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-1 text-sm">
            <b>{x.nome}</b><span className="text-xs text-muted-foreground">CPF {maskCPF(x.cpf)}{x.creci ? ` · CRECI ${numeroCreciPF(x.creci)}` : ""}{x.telefone ? ` · ${maskPhone(x.telefone)}` : ""}</span>
            {x.recrutamentoId ? <span className="ml-auto text-xs text-ok-300">convidado para o digital</span>
              : <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" disabled={convidar.isPending} onClick={() => { if (confirm(`Convidar ${x.nome} para o digital (formulário + trial de 7 dias)?`)) convidar.mutate({ externoId: x.id }); }}><Send className="mr-1 h-3.5 w-3.5" /> Convidar para o digital</Button>}
          </p>
        ))}
      </div>
    </section>
  );
}

function EntregarBloco() {
  const utils = trpc.useUtils();
  const { data: externos } = trpc.saas.externos.useQuery();
  const { data: comLogin } = trpc.saas.corretoresComLogin.useQuery();
  const [f, setF] = useState({ tipo: "CONTRATO" as "CONTRATO" | "RECIBO", ini: "", fim: "", corretor: "", entregueEm: hoje(), observacao: "" });
  const entregar = trpc.saas.entregarBloco.useMutation({ onSuccess: r => { toast.success(`Bloco registrado (${r.folhas} folhas)`); setF({ ...f, ini: "", fim: "" }); utils.saas.talonarios.invalidate(); utils.saas.pendencias.invalidate(); }, onError: e => toast.error(e.message) });
  const [tipoC, idC] = f.corretor.split(":");
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Entregar bloco numerado</h2>
      <div className="grid items-end gap-2 md:grid-cols-6">
        <label className="text-xs text-muted-foreground">Tipo<select className={campo} value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value as any })}><option value="CONTRATO">Contratos</option><option value="RECIBO">Recibos</option></select></label>
        <label className="text-xs text-muted-foreground">Do nº<input className={campo} value={f.ini} onChange={e => setF({ ...f, ini: e.target.value.replace(/\D/g, "") })} inputMode="numeric" /></label>
        <label className="text-xs text-muted-foreground">Até o nº<input className={campo} value={f.fim} onChange={e => setF({ ...f, fim: e.target.value.replace(/\D/g, "") })} inputMode="numeric" /></label>
        <label className="text-xs text-muted-foreground md:col-span-2">Corretor
          <select className={campo} value={f.corretor} onChange={e => setF({ ...f, corretor: e.target.value })}>
            <option value="">— escolha —</option>
            {(externos ?? []).length > 0 && <optgroup label="Externos (sem login)">{externos!.map(x => <option key={`x${x.id}`} value={`x:${x.id}`}>{x.nome}</option>)}</optgroup>}
            {(comLogin ?? []).length > 0 && <optgroup label="Corretores com login">{comLogin!.map(u => <option key={`u${u.id}`} value={`u:${u.id}`}>{u.nome}</option>)}</optgroup>}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">Entregue em<input type="date" className={campo} value={f.entregueEm} onChange={e => setF({ ...f, entregueEm: e.target.value })} /></label>
      </div>
      <Button size="sm" disabled={!f.ini || !f.fim || !f.corretor || entregar.isPending} onClick={() => entregar.mutate({
        tipo: f.tipo, numeroInicial: Number(f.ini), numeroFinal: Number(f.fim), entregueEm: f.entregueEm,
        externoId: tipoC === "x" ? Number(idC) : null, usuarioId: tipoC === "u" ? Number(idC) : null, observacao: f.observacao || null,
      })}><BookCopy className="mr-1 h-4 w-4" /> Registrar entrega</Button>
    </section>
  );
}

const pad6 = (n: number) => String(n).padStart(6, "0");
const nomeArquivo = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Baixa um PDF por talão (arquivos separados), na ordem da sequência */
async function baixarSeparados(talonarioId: number, de: number, ate: number, corretor: string, progresso: (feitos: number, total: number) => void) {
  const total = ate - de + 1;
  for (let n = de; n <= ate; n++) {
    progresso(n - de, total);
    const r = await fetch(`/api/talonarios/contrato.pdf?talonario=${talonarioId}&de=${n}&ate=${n}`, { credentials: "include" });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Falha ao gerar o talão ${pad6(n)}`); }
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url; a.download = `talao-${pad6(n)}${corretor ? `-${nomeArquivo(corretor)}` : ""}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  progresso(total, total);
}

/**
 * Talões para imprimir: a secretária escolhe o corretor e a quantidade; o sistema pega os próximos números da sequência
 * (ex.: 000011 a 000020), registra o bloco no nome do corretor (prestação de contas) e baixa um PDF por talão.
 */
function ImprimirTaloes() {
  const utils = trpc.useUtils();
  const { data: externos } = trpc.saas.externos.useQuery();
  const { data: comLogin } = trpc.saas.corretoresComLogin.useQuery();
  const { data: prox } = trpc.saas.proximoTalao.useQuery({ tipo: "CONTRATO" });
  const [corretor, setCorretor] = useState("");
  const [qtd, setQtd] = useState("10");
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const [vendo, setVendo] = useState(false);
  const emitir = trpc.saas.emitirTaloes.useMutation();
  const [tipoC, idC] = corretor.split(":");
  const nomeCorretor = tipoC === "x" ? externos?.find(x => x.id === Number(idC))?.nome ?? "" : comLogin?.find(u => u.id === Number(idC))?.nome ?? "";
  const n = Number(qtd);
  const ok = !!corretor && n >= 1 && n <= 50 && !progresso;
  const gerar = async () => {
    if (!confirm(`Registrar ${n} talão(ões) para ${nomeCorretor} (nº ${pad6(prox?.numero ?? 1)} a ${pad6((prox?.numero ?? 1) + n - 1)}) e baixar os PDFs?`)) return;
    try {
      const r = await emitir.mutateAsync({ tipo: "CONTRATO", quantidade: n, externoId: tipoC === "x" ? Number(idC) : null, usuarioId: tipoC === "u" ? Number(idC) : null });
      utils.saas.talonarios.invalidate(); utils.saas.pendencias.invalidate(); utils.saas.proximoTalao.invalidate();
      await baixarSeparados(r.talonarioId, r.numeroInicial, r.numeroFinal, nomeCorretor, (feitos, total) => setProgresso({ feitos, total }));
      toast.success(`Talões ${pad6(r.numeroInicial)} a ${pad6(r.numeroFinal)} baixados e registrados para ${nomeCorretor}`);
    } catch (e: any) { toast.error(e?.message || "Não foi possível gerar os talões"); } finally { setProgresso(null); }
  };
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="text-base font-semibold">Talões de contrato</h2>
        <p className="mt-1 text-sm text-muted-foreground">Para atender sem sistema: o corretor preenche à mão e devolve ao escritório.</p>
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background/40 p-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 text-sm">
          <b>1. Veja o modelo</b>
          <p className="text-xs text-muted-foreground">Capa, sumário, ficha, condições, contrato completo, Estatuto, Diretrizes, intermediação e checklist de anexos. Sai sempre com o contrato matriz atual (cláusulas, registro e licença).</p>
        </div>
        <Button variant="outline" onClick={() => setVendo(true)}><Eye className="mr-1 h-4 w-4" /> Visualizar modelo</Button>
      </div>
      {vendo && <VisualizadorPdf url="/api/talonarios/contrato.pdf" titulo="Talão de contrato — modelo" nomeArquivo="talao-contrato-modelo.pdf" onFechar={() => setVendo(false)} />}
      <div className="text-sm">
        <b>2. Gere os talões do corretor</b>
        <p className="text-xs text-muted-foreground">Os números seguem a sequência e ficam no nome do corretor, para a prestação de contas. Sai um PDF por talão.</p>
      </div>
      <div className="grid items-end gap-3 sm:grid-cols-4">
        <label className="text-xs text-muted-foreground sm:col-span-2">Corretor
          <select className={campo} value={corretor} onChange={e => setCorretor(e.target.value)}>
            <option value="">— escolha —</option>
            {(externos ?? []).length > 0 && <optgroup label="Externos (sem login)">{externos!.map(x => <option key={`x${x.id}`} value={`x:${x.id}`}>{x.nome}</option>)}</optgroup>}
            {(comLogin ?? []).length > 0 && <optgroup label="Corretores com login">{comLogin!.map(u => <option key={`u${u.id}`} value={`u:${u.id}`}>{u.nome}</option>)}</optgroup>}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">Quantidade de talões<input className={campo} value={qtd} onChange={e => setQtd(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" /></label>
        <Button disabled={!ok || emitir.isPending} onClick={gerar}>
          {progresso ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Gerando {Math.min(progresso.feitos + 1, progresso.total)} de {progresso.total}…</> : <><Printer className="mr-1 h-4 w-4" /> Gerar e baixar</>}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {prox ? <>Próximos números: <b>{pad6(prox.numero)}</b>{n > 1 ? <> a <b>{pad6(prox.numero + n - 1)}</b></> : null}. </> : null}
        De 1 a 50 por vez; cada talão leva uns 5 segundos. Se o navegador perguntar, permita baixar vários arquivos.
      </p>
    </section>
  );
}

/** Reimprimir folhas de um bloco de contratos (um PDF por talão) */
function ImprimirFolhas({ t }: { t: any }) {
  const [de, setDe] = useState(String(t.numeroInicial));
  const [ate, setAte] = useState(String(t.numeroFinal));
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const [vendo, setVendo] = useState<number | null>(null);
  const a = Number(de), b = Number(ate);
  const erro = !a || !b ? "Informe as folhas" : a > b ? "A primeira folha vem antes da última" : a < t.numeroInicial || b > t.numeroFinal ? `Só folhas do bloco (${t.numeroInicial} a ${t.numeroFinal})` : b - a + 1 > 50 ? "No máximo 50 por vez" : null;
  const baixar = async () => {
    try { await baixarSeparados(t.id, a, b, t.corretor ?? "", (feitos, total) => setProgresso({ feitos, total })); toast.success("Talões baixados"); }
    catch (e: any) { toast.error(e?.message || "Falhou"); } finally { setProgresso(null); }
  };
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-border/60 p-2">
      <span className="text-sm font-semibold">Baixar de novo os talões</span>
      <label className="text-xs text-muted-foreground">Do nº<input className={`${campo} w-24`} value={de} onChange={e => setDe(e.target.value.replace(/\D/g, ""))} inputMode="numeric" /></label>
      <label className="text-xs text-muted-foreground">Até o nº<input className={`${campo} w-24`} value={ate} onChange={e => setAte(e.target.value.replace(/\D/g, ""))} inputMode="numeric" /></label>
      <Button size="sm" disabled={!!erro || !!progresso} onClick={baixar}>
        {progresso ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> {Math.min(progresso.feitos + 1, progresso.total)} de {progresso.total}…</> : <><Printer className="mr-1 h-4 w-4" /> Baixar PDFs</>}
      </Button>
      <Button size="sm" variant="outline" disabled={!!erro} onClick={() => setVendo(a)}><Eye className="mr-1 h-4 w-4" /> Visualizar nº {String(a).padStart(6, "0")}</Button>
      <span className="text-xs text-muted-foreground">{erro ?? `${b - a + 1} arquivo(s), um por talão`}</span>
      {vendo != null && <VisualizadorPdf url={`/api/talonarios/contrato.pdf?talonario=${t.id}&de=${vendo}&ate=${vendo}`} titulo={`Talão nº ${String(vendo).padStart(6, "0")} · ${t.corretor ?? ""}`}
        nomeArquivo={`talao-${String(vendo).padStart(6, "0")}.pdf`} onFechar={() => setVendo(null)} />}
    </div>
  );
}

/** Folhas de um bloco: lançar (nº + cópia digitalizada + contrato/referência), cancelar ou marcar extraviada */
function Folhas({ t, onMudou }: { t: any; onMudou: () => void }) {
  const { data: folhas, refetch } = trpc.saas.folhas.useQuery({ talonarioId: t.id });
  const [numero, setNumero] = useState<number | null>(null);
  const [referencia, setReferencia] = useState("");
  const [enviando, setEnviando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const lancar = async (status: "UTILIZADA" | "CANCELADA" | "EXTRAVIADA", arquivo?: File | null) => {
    if (numero == null) return;
    setEnviando(true);
    try {
      const corretor = t.externoId ? `externoId=${t.externoId}` : `usuarioId=${t.usuarioId}`;
      const r = await fetch(`/api/talonarios/${t.id}/folhas/${numero}/lancar?status=${status}&${corretor}&referencia=${encodeURIComponent(referencia)}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/octet-stream", "x-nome-arquivo": encodeURIComponent(arquivo?.name ?? "") }, body: arquivo ?? undefined,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Não foi possível lançar");
      toast.success(`Folha ${numero} lançada`); setNumero(null); setReferencia(""); refetch(); onMudou();
    } catch (e: any) { toast.error(e?.message || "Falhou"); } finally { setEnviando(false); if (input.current) input.current.value = ""; }
  };
  return (
    <div className="mt-2 space-y-2">
      {t.tipo === "CONTRATO" && <ImprimirFolhas t={t} />}
      <div className="flex flex-wrap gap-1">
        {(folhas ?? []).map(f => (
          <button key={f.numero} type="button" title={f.referencia ?? f.status} disabled={f.status !== "EM_BRANCO"} onClick={() => setNumero(f.numero)}
            className={`h-7 min-w-[44px] rounded px-1.5 text-xs ${COR_FOLHA[f.status]} ${numero === f.numero ? "ring-2 ring-primary" : ""}`}>
            {f.status === "UTILIZADA" ? <a href={`/api/talonarios/${t.id}/folhas/${f.numero}/arquivo`} target="_blank" rel="noreferrer">{f.numero}</a> : f.numero}
          </button>
        ))}
      </div>
      {numero != null && (
        <div className="flex flex-wrap items-end gap-2 rounded-md bg-secondary/30 p-2">
          <span className="text-sm font-semibold">Folha {numero}</span>
          <label className="text-xs text-muted-foreground">Contrato / cliente / unidade<input className={campo} value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Ex.: Chácara A01 — Fulano" /></label>
          <input ref={input} type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => lancar("UTILIZADA", e.target.files?.[0])} />
          <Button size="sm" disabled={!referencia.trim() || enviando} onClick={() => input.current?.click()}>{enviando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileUp className="mr-1 h-4 w-4" />} Anexar cópia e lançar</Button>
          <Button size="sm" variant="outline" disabled={enviando} onClick={() => { if (confirm(`Marcar a folha ${numero} como CANCELADA?`)) lancar("CANCELADA"); }}>Cancelada</Button>
          <Button size="sm" variant="ghost" className="text-danger-300" disabled={enviando} onClick={() => { if (confirm(`Marcar a folha ${numero} como EXTRAVIADA?`)) lancar("EXTRAVIADA"); }}>Extraviada</Button>
        </div>
      )}
    </div>
  );
}

/** Talonários e corretores externos (modo arcaico) — administrador e secretária */
export default function Talonarios() {
  const utils = trpc.useUtils();
  const { data: blocos } = trpc.saas.talonarios.useQuery();
  const { data: pend } = trpc.saas.pendencias.useQuery();
  const [aberto, setAberto] = useState<number | null>(null);
  const atualizar = () => { utils.saas.talonarios.invalidate(); utils.saas.pendencias.invalidate(); };
  return (
    <div>
      <PageHeader icone={BookCopy} titulo="Talonários" subtitulo="Blocos numerados de contratos e recibos para corretores sem assinatura" />
      <div className="mx-auto max-w-[1300px] space-y-4 px-4 pb-8 md:px-6">
        <ImprimirTaloes />
        <div className="grid gap-4 lg:grid-cols-2"><Externos /><EntregarBloco /></div>
        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Blocos entregues</h2>
          {(blocos ?? []).map(t => (
            <div key={t.id} className="rounded-lg border border-border/60 p-2 text-sm">
              <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => setAberto(aberto === t.id ? null : t.id)}>
                <b>{t.tipo === "CONTRATO" ? "Contratos" : "Recibos"} {t.numeroInicial}–{t.numeroFinal}</b>
                <span className="text-xs text-muted-foreground">{t.corretor}{t.externo ? " (externo)" : ""}, entregue em {String(t.entregueEm).split("-").reverse().join("/")}</span>
                <span className="ml-auto text-xs">{t.utilizadas} usada(s), {t.emBranco} em branco{t.canceladas ? `, ${t.canceladas} cancelada(s)` : ""}{t.extraviadas ? `, ${t.extraviadas} extraviada(s)` : ""}</span>
              </button>
              {aberto === t.id && <Folhas t={t} onMudou={atualizar} />}
            </div>
          ))}
          {blocos && !blocos.length && <p className="text-sm text-muted-foreground">Nenhum bloco entregue ainda.</p>}
        </section>
        <section className="space-y-1 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Folhas entregues e ainda não devolvidas</h2>
          {(pend ?? []).map(p => (
            <p key={p.corretor} className="border-t border-border/50 pt-1 text-sm first:border-0">
              <b>{p.corretor}</b>{p.externo ? <span className="text-xs text-muted-foreground"> (externo)</span> : null}
              <span className="block text-xs text-muted-foreground">{p.contratos.length ? `Contratos: ${p.contratos.join(", ")}` : ""}{p.contratos.length && p.recibos.length ? " · " : ""}{p.recibos.length ? `Recibos: ${p.recibos.join(", ")}` : ""}</span>
            </p>
          ))}
          {pend && !pend.length && <p className="text-sm text-muted-foreground">Nada pendente.</p>}
        </section>
      </div>
    </div>
  );
}
