import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, Copy, Download, Loader2, PenLine, Send } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { sel } from "@/components/cadastro/campos";

const METODOS = [["avancada", "Eletrônica avançada (link + código no WhatsApp)"], ["govbr", "gov.br (assinador.iti.br)"], ["icp_a1", "Certificado ICP-Brasil A1"]] as const;
const EVENTO: Record<string, string> = {
  enviado_para_assinatura: "Enviado para assinatura", convite_enviado: "Convite enviado", link_aberto: "Link aberto", otp_enviado: "Código enviado",
  otp_errado: "Código incorreto", assinado: "Assinou", erro: "Erro", lembrete_d1: "Lembrete (1 dia)", lembrete_d3: "Lembrete (3 dias)", manifesto_gerado: "Manifesto gerado",
};

/** Aba Assinaturas da ficha: métodos por signatário, envio, acompanhamento, links e manifesto */
export default function PainelAssinaturas({ id, status, podeEnviar }: { id: number; status: string; podeEnviar: boolean }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.contratos.assinaturas.useQuery({ id });
  const [metodos, setMetodos] = useState<Record<string, string>>({});
  useEffect(() => { if (data?.previstos) setMetodos(Object.fromEntries(data.previstos.map((p: any) => [p.papel, p.metodo]))); }, [data]);
  const recarregar = () => { utils.contratos.assinaturas.invalidate({ id }); utils.contratos.detalhe.invalidate({ id }); };
  const enviar = trpc.contratos.enviarParaAssinatura.useMutation({
    onSuccess: r => { const falhas = r.convites.filter((c: any) => !c.enviado); falhas.length ? toast.warning(`${falhas.length} convite(s) não enviados — copie o link`) : toast.success("Convites enviados por WhatsApp"); recarregar(); },
    onError: e => toast.error(e.message),
  });
  const reenviar = trpc.contratos.reenviarConvite.useMutation({ onSuccess: r => { r.enviado ? toast.success("Convite reenviado") : toast.error(r.erro ?? "Não enviado"); recarregar(); }, onError: e => toast.error(e.message) });
  const copiar = async (t: string) => { try { await navigator.clipboard.writeText(t); toast.success("Link copiado"); } catch { toast.message(t); } };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (error || !data) return <p className="text-sm text-red-400">{error?.message}</p>;

  if (!data.enviado) {
    const apto = status === "apto_assinatura";
    return (
      <div className="space-y-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold">Quem assina</h2>
          <p className="mb-3 text-xs text-muted-foreground">Escolha como cada um assina. As avançadas vêm primeiro; ICP-Brasil e gov.br assinam em seguida, um de cada vez.</p>
          <div className="divide-y divide-border/50">
            {data.previstos.map((p: any) => (
              <div key={p.papel} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <div className="min-w-[220px] flex-1"><b>{p.nome || "—"}</b><span className="block text-xs text-muted-foreground">{p.papelRotulo}{p.whatsapp ? "" : " · sem WhatsApp"}</span></div>
                <select className={`${sel} sm:max-w-sm`} value={metodos[p.papel] ?? "avancada"} disabled={!podeEnviar || !apto} onChange={e => setMetodos(m => ({ ...m, [p.papel]: e.target.value }))} aria-label={`Método de ${p.papelRotulo}`}>
                  {METODOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
              </div>
            ))}
          </div>
          {!!data.pendencias.length && (
            <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
              <p className="flex items-center gap-1 font-semibold"><AlertTriangle className="h-4 w-4" /> Complete antes de enviar:</p>
              <ul className="list-disc pl-5">{data.pendencias.map((x: string) => <li key={x}>{x}</li>)}</ul>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate(`/contratos/${id}/assinaturas`)}><PenLine className="h-4 w-4" /> Posicionar assinaturas no PDF</Button>
            {podeEnviar && (
              <Button disabled={!apto || enviar.isPending || !!data.pendencias.length}
                onClick={() => { if (confirm("Enviar o contrato para assinatura? O PDF fica congelado e cada signatário recebe o link pelo WhatsApp.")) enviar.mutate({ id, metodos: metodos as any }); }}>
                {enviar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar para assinatura
              </Button>
            )}
          </div>
          {!apto && <p className="mt-2 text-xs text-muted-foreground">O envio é liberado com o contrato definitivo gerado (status “Apto para assinatura”).</p>}
        </section>
      </div>
    );
  }

  const assinados = data.signatarios.filter((s: any) => s.status === "assinado").length;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Assinaturas · {assinados} de {data.signatarios.length}</h2>
          {data.manifesto && <Button size="sm" variant="outline" onClick={() => window.open(`/api/contratos/${id}/manifesto.pdf`, "_blank")}><Download className="h-4 w-4" /> Manifesto (Anexo VII)</Button>}
        </div>
        <div className="divide-y divide-border/50">
          {data.signatarios.map((s: any) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              {s.status === "assinado" ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <Clock className="h-5 w-5 text-muted-foreground" />}
              <div className="min-w-[200px] flex-1">
                <b>{s.nome}</b>
                <span className="block text-xs text-muted-foreground">{s.papelRotulo} · {s.metodoRotulo}</span>
                {s.status === "assinado"
                  ? <span className="text-xs text-emerald-400">assinou em {new Date(s.assinadoEm).toLocaleString("pt-BR")}{s.revisaoManual ? " · conferir: certificado sem CPF" : ""}</span>
                  : <span className="text-xs text-muted-foreground">{s.status === "convidado" ? "convite enviado" : "pendente"}{s.expiraEm ? ` · link vale até ${new Date(s.expiraEm).toLocaleDateString("pt-BR")}` : ""}</span>}
              </div>
              {s.status !== "assinado" && s.link && (
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => copiar(s.link)}><Copy className="h-4 w-4" /> Link</Button>
                  <Button size="sm" variant="outline" disabled={!s.whatsapp || reenviar.isPending} onClick={() => reenviar.mutate({ id, signatarioId: s.id })}><Send className="h-4 w-4" /> Reenviar</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      <aside className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Trilha de auditoria</h2>
        <ul className="space-y-1.5 text-xs">
          {data.eventos.map((e: any, i: number) => {
            const quem = data.signatarios.find((s: any) => s.id === e.signatarioId);
            return (
              <li key={i} className="flex justify-between gap-2">
                <span>{EVENTO[e.evento] ?? e.evento}{quem ? ` · ${quem.nome.split(" ")[0]}` : ""}</span>
                <span className="shrink-0 text-muted-foreground">{new Date(e.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
