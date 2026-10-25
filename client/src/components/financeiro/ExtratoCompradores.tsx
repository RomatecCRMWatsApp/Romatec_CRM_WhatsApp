import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { FileSpreadsheet } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { brl } from "@shared/simulador";

const SITUACAO: Record<string, [string, string]> = {
  EM_ATRASO: ["Em atraso", "bg-red-500/15 text-red-300"], EM_DIA: ["Em dia", "bg-emerald-500/15 text-emerald-300"],
  QUITADO: ["Quitado", "bg-sky-500/15 text-sky-300"], AGUARDANDO_ASSINATURA: ["Aguardando assinatura", "bg-secondary text-muted-foreground"],
};
const br = (iso?: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

/** Extrato por comprador: um contrato por linha, com os totais e a planilha */
export default function ExtratoCompradores() {
  const [, navigate] = useLocation();
  const { data, isLoading, error } = trpc.financeiro.extrato.useQuery();
  const [filtro, setFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const linhas = useMemo(() => (data?.linhas ?? []).filter(l => (!filtro || l.situacao === filtro)
    && (!busca.trim() || [l.contratoNumero, l.comprador, l.loteCodigo].some(v => v.toLowerCase().includes(busca.trim().toLowerCase())))), [data, filtro, busca]);
  const t = data?.totais;
  return (
    <section className="space-y-3">
      {error && <p className="text-sm text-red-400">{error.message}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {t && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[["Contratado", t.contratado], ["Recebido", t.recebido], ["Em aberto", t.emAberto], ["Vencido", t.vencido], ["A vencer", t.aVencer]].map(([r, v]) => (
            <div key={r as string} className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">{r}</p><p className={`text-lg font-bold ${r === "Vencido" && (v as number) > 0 ? "text-red-300" : ""}`}>{brl(v as number)}</p>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar contrato, comprador ou chácara…" aria-label="Buscar"
          className="h-9 min-w-[220px] flex-1 rounded-lg border border-border bg-background px-3 text-sm" />
        <select value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Situação" className="h-9 rounded-lg border border-border bg-background px-2 text-sm">
          <option value="">Todas as situações</option>{Object.entries(SITUACAO).map(([k, [r]]) => <option key={k} value={k}>{r}</option>)}
        </select>
        <Button variant="outline" onClick={() => window.open("/api/financeiro/extrato.xlsx", "_blank")}><FileSpreadsheet className="mr-1 h-4 w-4" /> Planilha (Excel)</Button>
      </div>
      {t && <p className="text-xs text-muted-foreground">{t.contratos} contrato(s) · {t.emAtraso} em atraso · {t.quitados} quitado(s)</p>}
      {linhas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="p-2">Contrato</th><th className="p-2">Comprador</th><th className="p-2">Situação</th><th className="p-2 text-right">Recebido</th>
              <th className="p-2 text-right">Vencido</th><th className="p-2 text-right">A vencer</th><th className="p-2 text-right">% pago</th><th className="p-2">Último pgto.</th><th className="p-2">Próximo venc.</th>
            </tr></thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.contratoId} onClick={() => navigate(`/contratos/${l.contratoId}`)} className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-secondary/30">
                  <td className="p-2 whitespace-nowrap"><b>{l.contratoNumero}</b><p className="text-[11px] text-muted-foreground">Chácara {l.loteCodigo}</p></td>
                  <td className="p-2">{l.comprador}</td>
                  <td className="p-2"><span className={`rounded-full px-2 py-0.5 text-[11px] ${SITUACAO[l.situacao][1]}`}>{SITUACAO[l.situacao][0]}{l.diasAtraso ? ` · ${l.diasAtraso} d` : ""}</span></td>
                  <td className="p-2 text-right">{brl(l.recebido)}</td>
                  <td className={`p-2 text-right ${l.vencido > 0 ? "text-red-300" : ""}`}>{brl(l.vencido)}</td>
                  <td className="p-2 text-right">{brl(l.aVencer)}</td>
                  <td className="p-2 text-right">{l.pctPago.toLocaleString("pt-BR")}%<p className="text-[11px] text-muted-foreground">{l.parcelasPagas}/{l.parcelasTotal}</p></td>
                  <td className="p-2 whitespace-nowrap">{br(l.ultimoPagamento)}</td>
                  <td className="p-2 whitespace-nowrap">{br(l.proximoVencimento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && !linhas.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum contrato {filtro || busca ? "neste filtro" : "com cobrança ainda"}.</p>}
    </section>
  );
}
