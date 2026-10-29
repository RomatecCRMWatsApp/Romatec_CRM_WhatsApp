import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Copy, Gift, Loader2, Lock, Medal, Send, Trophy } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EnviarWhatsAppModal from "@/components/EnviarWhatsAppModal";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { MODOS_TERMINO, ROTULO_MODO_TERMINO, type ModoTermino } from "@shared/ranking";

const campo = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";
const TODOS = "todos";
const MEDALHA = ["text-amber-300", "text-slate-300", "text-orange-400"];
const dataBr = (d: string) => d.split("-").reverse().join("/");
const dataHora = (d: unknown) => new Date(d as any).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const LS_EMP = "ranking.empreendimento";

/** Prazo da campanha (só o administrador): indeterminado, data de encerramento ou esgotamento do estoque — confirma com a senha */
function PrazoCampanha({ empreendimentoId, atual, onFechar }: { empreendimentoId: number; atual: { modo: ModoTermino; dataEncerramento: string | null }; onFechar: () => void }) {
  const [modo, setModo] = useState<ModoTermino>(atual.modo);
  const [data, setData] = useState(atual.dataEncerramento ?? "");
  const [senha, setSenha] = useState("");
  const utils = trpc.useUtils();
  const salvar = trpc.ranking.definirPrazo.useMutation({
    onSuccess: () => { utils.ranking.invalidate(); toast.success("Prazo da campanha salvo"); onFechar(); },
    onError: e => toast.error(e.message),
  });
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const valido = !!senha && (modo !== "data" || /^\d{4}-\d{2}-\d{2}$/.test(data));
  return (
    <Dialog open onOpenChange={v => !v && !salvar.isPending && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-primary" /> Prazo da campanha</DialogTitle>
          <DialogDescription>Vale só para este empreendimento. Quando o prazo chega (ou o estoque esgota), a campanha encerra e o ranking congela para a apuração.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (valido && !salvar.isPending) salvar.mutate({ empreendimentoId, modo, dataEncerramento: modo === "data" ? data : null, senha }); }}>
          <div className="space-y-2">
            {MODOS_TERMINO.map(m => (
              <label key={m} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${modo === m ? "border-primary bg-primary/10" : "border-border"}`}>
                <input type="radio" name="modo" checked={modo === m} onChange={() => setModo(m)} /> {ROTULO_MODO_TERMINO[m]}
              </label>
            ))}
          </div>
          {modo === "data" && (
            <label className="block text-xs text-muted-foreground">Data de encerramento (encerra às 23h59 deste dia)
              <input type="date" className={`${campo} mt-1`} min={hoje} value={data} onChange={e => setData(e.target.value)} required />
            </label>
          )}
          <label className="block text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Sua senha de login para confirmar</span>
            <Input className="mt-1" type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={salvar.isPending} onClick={onFechar}>Voltar</Button>
            <Button type="submit" disabled={!valido || salvar.isPending}>{salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar prazo</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Ranking de vendas por corretor + campanha "Bonificação Surpresa", por empreendimento (ou todos).
 * Venda válida = contrato assinado + sinal pago. O escopo (empreendimentos visíveis) é conferido no servidor.
 */
export default function Ranking() {
  const { user } = useAuth();
  const perfil = perfilDe(user as any);
  const escritorio = perfil === "admin" || perfil === "secretario";
  const { data: emps } = trpc.ranking.empreendimentos.useQuery();
  const [sel, setSel] = useState<string>(() => { try { return localStorage.getItem(LS_EMP) ?? ""; } catch { return ""; } });
  // Padrão: por empreendimento (o primeiro visível, de preferência o Bom Jardims)
  useEffect(() => {
    if (!emps?.length) return;
    if (sel === TODOS || emps.some(e => String(e.id) === sel)) return;
    const bj = emps.find(e => /bom-jardim/.test(e.slug ?? ""));
    setSel(String((bj ?? emps[0]).id));
  }, [emps, sel]);
  useEffect(() => { if (sel) try { localStorage.setItem(LS_EMP, sel); } catch { /* sem armazenamento */ } }, [sel]);
  const empreendimentoId = sel && sel !== TODOS ? Number(sel) : null;
  const q = trpc.ranking.classificacao.useQuery({ empreendimentoId }, { enabled: !!sel, refetchInterval: 60_000 });
  const r = q.data;
  const [prazoAberto, setPrazoAberto] = useState(false);
  const [whats, setWhats] = useState(false);
  const envio = trpc.ranking.enviarWhatsApp.useMutation({ onSuccess: () => { toast.success("Ranking enviado pelo WhatsApp"); setWhats(false); }, onError: e => toast.error(e.message) });
  const copiar = async () => { if (!r) return; try { await navigator.clipboard.writeText(r.texto); toast.success("Mensagem copiada"); } catch { window.prompt("Copie:", r.texto); } };

  const prazoTexto = !r ? "" : r.encerrada ? `Encerrada${r.encerradaEm ? ` em ${dataHora(r.encerradaEm)}` : ""}${r.motivoEncerramento === "estoque" ? " · estoque esgotado" : r.motivoEncerramento === "data" ? " · data de encerramento" : ""} — ranking congelado`
    : r.prazo.modo === "data" && r.prazo.dataEncerramento ? `Encerra em ${dataBr(r.prazo.dataEncerramento)}`
    : ROTULO_MODO_TERMINO[r.prazo.modo];

  return (
    <div>
      <PageHeader icone={Trophy} titulo="Ranking de vendas" subtitulo="Campanha Bonificação Surpresa · venda válida = contrato assinado + sinal pago · atualiza em tempo real"
        acoes={r && (
          <>
            <Button size="sm" variant="outline" onClick={copiar}><Copy className="h-4 w-4 mr-1" /> Copiar mensagem</Button>
            {escritorio && <Button size="sm" onClick={() => setWhats(true)}><Send className="h-4 w-4 mr-1" /> Enviar no WhatsApp</Button>}
          </>
        )} />
      <div className="px-4 md:px-6 pb-8 max-w-[1100px] mx-auto space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-xs text-muted-foreground">Empreendimento
            <select className={`${campo} mt-1`} value={sel} onChange={e => setSel(e.target.value)}>
              {emps?.map(e => <option key={e.id} value={String(e.id)}>{e.nome}</option>)}
              <option value={TODOS}>Todos os empreendimentos</option>
            </select>
          </label>
          <div className="text-xs text-muted-foreground">Prazo da campanha
            <div className="mt-1 flex h-9 items-center justify-between gap-2 rounded-md border border-border bg-card px-2 text-sm">
              <span className={`truncate ${r?.encerrada ? "text-amber-300" : "text-foreground"}`}>{empreendimentoId ? prazoTexto || "…" : "Escolha um empreendimento"}</span>
              {r?.podeConfigurar && <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setPrazoAberto(true)}><CalendarClock className="h-4 w-4 mr-1" /> Definir</Button>}
            </div>
          </div>
        </div>

        {q.error && <p className="text-sm text-red-400">{q.error.message}</p>}
        {(q.isLoading || !sel) && <p className="text-sm text-muted-foreground">Carregando…</p>}

        {r && (
          <>
            <div className="rounded-xl border border-primary/40 bg-gradient-to-br from-primary/15 to-transparent p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--rt-gold-light)]"><Gift className="h-4 w-4" /> Prêmio ao 1º lugar</p>
              <p className="mt-1 text-lg font-bold">{r.premio}</p>
              <p className="text-xs text-muted-foreground">Bonificação adicional aos 2% de comissão do corretor · vencedor = maior nº de chácaras vendidas.</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Chácaras vendidas</p><p className="text-2xl font-bold">{r.totalVendas}</p></div>
              <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Corretores</p><p className="text-2xl font-bold">{r.linhas.length}</p></div>
              <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Disponíveis</p><p className="text-2xl font-bold">{r.estoqueRestante ?? "—"}</p></div>
            </div>
            {r.encerrada && <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">🏁 Campanha encerrada — classificação congelada para a apuração do vencedor.</p>}
            <div className="space-y-2">
              {r.linhas.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum corretor ativo habilitado neste empreendimento.</p>}
              {r.linhas.map(l => (
                <div key={l.id} className={`flex items-center gap-3 rounded-xl border bg-card p-3 ${l.posicao === 1 && l.vendas > 0 ? "border-amber-300/60" : "border-border"}`}>
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background font-bold ${l.vendas > 0 ? MEDALHA[l.posicao - 1] ?? "" : "text-muted-foreground"}`}>
                    {l.vendas > 0 && l.posicao <= 3 ? <Medal className="h-5 w-5" /> : `${l.posicao}º`}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{l.posicao}º · {l.nome}</p>
                    <p className="text-xs text-muted-foreground">{l.creci ? `CRECI ${l.creci}` : "CRECI não informado"}{l.ultimaVendaEm ? ` · última venda ${dataHora(l.ultimaVendaEm)}` : ""}</p>
                  </div>
                  <div className="text-right"><p className="text-2xl font-bold">{l.vendas}</p><p className="text-[11px] text-muted-foreground">{l.vendas === 1 ? "chácara" : "chácaras"}</p></div>
                </div>
              ))}
            </div>
            <details className="rounded-xl border border-border bg-card p-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">Prévia da mensagem de WhatsApp</summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-xs">{r.texto}</pre>
            </details>
          </>
        )}
      </div>
      {prazoAberto && r && empreendimentoId && <PrazoCampanha empreendimentoId={empreendimentoId} atual={r.prazo} onFechar={() => setPrazoAberto(false)} />}
      {whats && r && (
        <EnviarWhatsAppModal titulo="Enviar ranking pelo WhatsApp" descricao={`Classificação de ${r.empreendimento}.`} sugestao="5599991811246"
          enviando={envio.isPending} onFechar={() => setWhats(false)} onEnviar={destino => envio.mutate({ empreendimentoId, destino })} />
      )}
    </div>
  );
}
