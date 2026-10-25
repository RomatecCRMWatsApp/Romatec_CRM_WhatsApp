import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy, ExternalLink, FileText, Loader2, PlugZap, RefreshCw, TriangleAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { brl } from "@shared/simulador";

type Diag = { chaveValida: boolean; ambiente: string | null; titular?: string; documentoFinal?: string; agenciaConta?: string; webhookToken: boolean; erro?: string };
type Teste = { paymentId: string; valor: number; vencimento: string; status?: string; pagoEm?: string | null; faturaAsaas?: string | null };
const CHAVE = "asaas_boleto_teste";
const br = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

/**
 * Integração Asaas (só administrador): situação da conta (chave, ambiente, titular = beneficiário dos boletos) e o
 * boleto de TESTE de R$ 5,00 em nome do próprio administrador — gera, abre o PDF, confere a baixa e cancela.
 */
export default function TesteAsaas() {
  const { user } = useAuth();
  const admin = perfilDe(user as any) === "admin";
  const [diag, setDiag] = useState<Diag | null>(null);
  const [teste, setTeste] = useState<Teste | null>(() => { try { return JSON.parse(localStorage.getItem(CHAVE) || "null"); } catch { return null; } });
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [valor, setValor] = useState("5,00");
  const guardar = (t: Teste | null) => { setTeste(t); try { t ? localStorage.setItem(CHAVE, JSON.stringify(t)) : localStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ } };

  useEffect(() => {
    if (!admin) return;
    fetch("/api/financeiro/diagnostico", { credentials: "include" }).then(r => r.json()).then(setDiag).catch(() => setDiag(null));
  }, [admin]);
  if (!admin) return null;

  const chamar = async (chave: string, url: string, metodo = "GET") => {
    setOcupado(chave);
    try {
      const r = await fetch(url, { method: metodo, credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || "Falha na comunicação com o Asaas");
      return j;
    } catch (e: any) { toast.error(e.message); return null; } finally { setOcupado(null); }
  };
  const gerar = async () => {
    const v = Math.round(Number(valor.replace(",", ".")) * 100) / 100;
    if (!(v >= 1 && v <= 50)) { toast.error("Valor do teste entre R$ 1,00 e R$ 50,00"); return; }
    if (!confirm(`Criar um boleto REAL de ${brl(v)} no Asaas, em seu nome, só para testar a integração? Ele pode ser pago (para testar a baixa) ou cancelado aqui.`)) return;
    const r = await chamar("gerar", `/api/financeiro/teste-boleto?valor=${v}`, "POST");
    if (r) { guardar(r); toast.success("Boleto de teste criado no Asaas"); window.open(`/api/financeiro/teste-boleto/${r.paymentId}.pdf`, "_blank", "noopener"); }
  };
  const conferir = async () => {
    if (!teste) return;
    const r = await chamar("conferir", `/api/financeiro/teste-boleto/${teste.paymentId}`);
    if (r) { guardar({ ...teste, ...r }); toast.message(`Situação no Asaas: ${r.status}`); }
  };
  const cancelar = async () => {
    if (!teste || !confirm("Cancelar o boleto de teste no Asaas?")) return;
    const r = await chamar("cancelar", `/api/financeiro/teste-boleto/${teste.paymentId}/cancelar`, "POST");
    if (r) { toast.success("Boleto de teste cancelado"); guardar(null); }
  };
  const pago = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(String(teste?.status));

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold"><PlugZap className="h-4 w-4 text-primary" /> Integração Asaas (administrador)</h2>
      {!diag ? <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Conferindo a conta…</p>
        : diag.chaveValida ? (
          <div className="grid gap-1 text-xs sm:grid-cols-2">
            <p className="flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Chave aceita · {diag.ambiente === "producao" ? "produção" : "teste (sandbox)"}</p>
            <p>Beneficiário dos boletos: <b>{diag.titular}</b>{diag.documentoFinal ? ` (…${diag.documentoFinal.slice(-4)})` : ""}</p>
            <p>Agência/conta: {diag.agenciaConta ?? "—"}</p>
            <p className={diag.webhookToken ? "" : "text-amber-300"}>Webhook: {diag.webhookToken ? "token configurado" : "sem token — a baixa automática não funciona"}</p>
          </div>
        ) : <p className="flex items-center gap-1.5 text-xs text-amber-300"><TriangleAlert className="h-3.5 w-3.5" /> {diag.erro ?? "Chave do Asaas não aceita"}</p>}

      {diag?.chaveValida && (
        teste ? (
          <div className="rounded-lg border border-border p-3 space-y-2 text-sm">
            <p>Boleto de teste <span className="font-mono text-xs">{teste.paymentId}</span> · {brl(teste.valor)} · vence {br(teste.vencimento)}
              {teste.status && <> · <b className={pago ? "text-emerald-300" : ""}>{pago ? `pago em ${br(teste.pagoEm)}` : teste.status}</b></>}</p>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => window.open(`/api/financeiro/teste-boleto/${teste.paymentId}.pdf`, "_blank", "noopener")}><FileText className="mr-1 h-3.5 w-3.5" /> Boleto (PDF)</Button>
              {teste.faturaAsaas && <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => window.open(teste.faturaAsaas!, "_blank", "noopener")}><ExternalLink className="mr-1 h-3.5 w-3.5" /> Fatura no Asaas</Button>}
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={async () => { try { await navigator.clipboard.writeText(teste.paymentId); toast.success("Id copiado"); } catch { /* */ } }}><Copy className="mr-1 h-3.5 w-3.5" /> Id</Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!!ocupado} onClick={conferir}>{ocupado === "conferir" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />} Conferir pagamento</Button>
              {!pago && <Button size="sm" variant="outline" className="h-8 text-xs text-red-400" disabled={!!ocupado} onClick={cancelar}><XCircle className="mr-1 h-3.5 w-3.5" /> Cancelar</Button>}
              {pago && <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => guardar(null)}>Concluir teste</Button>}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">Valor R$
              <input value={valor} onChange={e => setValor(e.target.value.replace(/[^\d,.]/g, ""))} inputMode="decimal" aria-label="Valor do boleto de teste"
                className="h-8 w-20 rounded-md border border-border bg-background px-2 text-sm text-foreground" />
            </label>
            <Button size="sm" disabled={!!ocupado} onClick={gerar}>{ocupado === "gerar" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />} Gerar boleto de teste</Button>
            <p className="text-xs text-muted-foreground">Em seu nome (dados de Meu cadastro), sem multa/juros e sem aviso do Asaas. Não é cobrança de contrato. Se o valor for menor que o mínimo da conta, o Asaas recusa e mostra o motivo.</p>
          </div>
        )
      )}
    </section>
  );
}
