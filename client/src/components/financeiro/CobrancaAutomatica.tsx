/**
 * Financeiro › Cobrança automática: régua de avisos das parcelas no WhatsApp do comprador
 * (3 dias antes, no dia, 3 e 10 dias de atraso). Liga/desliga, o que sai hoje (prévia) e o histórico.
 */
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ETAPAS_REGUA, ROTULO_ETAPA } from "@shared/reguaCobranca";
import EmissaoAutomatica from "./EmissaoAutomatica";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (d: string) => d.split("-").reverse().join("/");
const horaBr = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

export default function CobrancaAutomatica() {
  const utils = trpc.useUtils();
  const { data: estado } = trpc.financeiro.reguaEstado.useQuery();
  const previa = trpc.financeiro.reguaPrevia.useQuery();
  const historico = trpc.financeiro.reguaHistorico.useQuery();
  const [aberto, setAberto] = useState<number | null>(null);
  const definir = trpc.financeiro.reguaDefinir.useMutation({
    onSuccess: (_r, v) => { utils.financeiro.reguaEstado.invalidate(); toast.success(v.ligada ? "Cobrança automática ligada" : "Cobrança automática desligada"); },
    onError: e => toast.error(e.message),
  });
  const enviar = trpc.financeiro.reguaEnviarAgora.useMutation({
    onSuccess: r => { toast.success(`${r.enviados} aviso(s) enviado(s)${r.falhas ? `, ${r.falhas} sem enviar` : ""}`); utils.financeiro.reguaPrevia.invalidate(); utils.financeiro.reguaHistorico.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const hoje = previa.data ?? [];
  const semFone = hoje.filter(a => !a.telefone).length;

  return (
    <div className="space-y-4">
      <EmissaoAutomatica />
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-foreground">Cobrança automática no WhatsApp</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              O comprador recebe um lembrete com o valor, o link do Pix/boleto e o carnê: {ETAPAS_REGUA.map(e => ROTULO_ETAPA[e].toLowerCase()).join(", ")}.
              Sai entre 9h e 19h, uma vez por parcela em cada etapa. Depois do último aviso, o escritório assume.
            </p>
          </div>
          <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
            <span className="text-sm text-foreground">{estado?.ligada ? "Ligada" : "Desligada"}</span>
            <Switch checked={!!estado?.ligada} disabled={!estado || definir.isPending} aria-label="Ligar a cobrança automática"
              onCheckedChange={v => { if (!v || confirm("Ligar a cobrança automática? Os compradores passam a receber os lembretes no WhatsApp.")) definir.mutate({ ligada: v }); }} />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="flex-1 text-sm font-semibold text-foreground">Avisos de hoje {hoje.length ? `(${hoje.length})` : ""}</h3>
          {hoje.length > 0 && (
            <Button size="sm" className="bg-ok-600 text-white hover:bg-ok-700" disabled={enviar.isPending}
              onClick={() => { if (confirm(`Enviar agora os ${hoje.length} aviso(s) de hoje?`)) enviar.mutate(); }}>
              {enviar.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Send className="mr-1.5 h-4 w-4" />} Enviar agora
            </Button>
          )}
        </div>
        {previa.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!previa.isLoading && !hoje.length && <p className="text-sm text-muted-foreground">Nenhum aviso para hoje.</p>}
        {semFone > 0 && <p className="mb-2 text-xs text-danger-300">{semFone} comprador(es) sem telefone no cadastro: o aviso não sai. Complete o telefone no contrato.</p>}
        <ul className="space-y-2">
          {hoje.map(a => (
            <li key={`${a.cobrancaId}-${a.etapa}`} className="rounded-md border border-border bg-secondary/20 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1"><b className="text-foreground">{a.comprador}</b>, contrato {a.contratoNumero}, {a.parcela}: {brl(a.valor)} vence {dataBr(a.vencimento)}</span>
                <span className="rounded-full border border-[var(--rt-gold)]/40 px-2 py-0.5 text-[11px] text-[var(--rt-gold-light)]">{a.rotuloEtapa}</span>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAberto(aberto === a.cobrancaId ? null : a.cobrancaId)}>{aberto === a.cobrancaId ? "Esconder" : "Ver mensagem"}</Button>
              </div>
              {aberto === a.cobrancaId && <pre className="mt-2 whitespace-pre-wrap rounded bg-ok-600/15 p-2 font-sans text-xs text-foreground">{a.texto}</pre>}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Últimos avisos enviados</h3>
        {!historico.data?.length && <p className="text-sm text-muted-foreground">Nenhum aviso enviado ainda.</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <tbody>
              {(historico.data ?? []).map(h => (
                <tr key={h.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-2 text-muted-foreground tabular-nums">{horaBr(h.quando)}</td>
                  <td className="py-1.5 pr-2">{h.comprador}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">contrato {h.contrato}, chácara {h.chacara}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{h.rotuloEtapa}</td>
                  <td className="py-1.5 text-right">{h.ok
                    ? <span className="inline-flex items-center gap-1 text-ok-300"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> enviado</span>
                    : <span className="inline-flex items-center gap-1 text-danger-300" title={h.erro ?? ""}><XCircle className="h-3.5 w-3.5" aria-hidden="true" /> {h.erro ?? "falhou"}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
