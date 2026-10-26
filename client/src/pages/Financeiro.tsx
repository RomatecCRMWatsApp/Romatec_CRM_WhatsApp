import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { ROTULO_SITUACAO, type SituacaoLote } from "@shared/lotes";
import { brl } from "@shared/simulador";
import { Wallet } from "lucide-react";
import TabelasFinanciamento from "@/components/financeiro/TabelasFinanciamento";
import TesteAsaas from "@/components/financeiro/TesteAsaas";
import LancarPagamento from "@/components/financeiro/LancarPagamento";
import ExtratoCompradores from "@/components/financeiro/ExtratoCompradores";
import FluxoCaixa from "@/components/financeiro/FluxoCaixa";
import Despesas from "@/components/financeiro/Despesas";
import CobrancaWhatsapp from "@/components/financeiro/CobrancaWhatsapp";
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { podeOperarCobranca } from "@shared/contratos";

const ABAS = [["vendas", "Vendas e cobrança"], ["extrato", "Extrato por comprador"], ["fluxo", "Fluxo de caixa"], ["despesas", "Despesas"]] as const;

const data = (d: unknown) => (d ? new Date(d as any).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "—");
const v = (n: number | null | undefined) => (n == null ? "—" : brl(n));

/**
 * Financeiro: vendas dos empreendimentos habilitados. Admin vê a comissão completa; corretor vê tudo
 * da venda, menos comissão — e, nas vendas dele, só a comissão dele com a regra de pagamento.
 */
export default function Financeiro() {
  const { data: d, isLoading, error } = trpc.financeiro.vendas.useQuery();
  const vendas = d?.vendas ?? [];
  const admin = vendas.some(x => x.comissao);
  const { user } = useAuth();
  const operador = podeOperarCobranca(perfilDe(user as any));
  const [aba, setAba] = useState<(typeof ABAS)[number][0]>("vendas");
  return (
    <div>
      <PageHeader icone={Wallet} titulo="Financeiro" subtitulo="Vendas com sinal, parceladas, à vista e quitadas dos empreendimentos que você acessa" />
      {operador && (
        <div className="px-4 md:px-6 max-w-[1400px] mx-auto mb-3 flex flex-wrap gap-1 border-b border-border">
          {ABAS.map(([k, r]) => (
            <button key={k} type="button" onClick={() => setAba(k)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === k ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{r}</button>
          ))}
        </div>
      )}
      {operador && aba === "extrato" && <div className="px-4 md:px-6 pb-8 max-w-[1400px] mx-auto"><ExtratoCompradores /></div>}
      {operador && aba === "fluxo" && <div className="px-4 md:px-6 pb-8 max-w-[1400px] mx-auto"><FluxoCaixa /></div>}
      {operador && aba === "despesas" && <div className="px-4 md:px-6 pb-8 max-w-[1400px] mx-auto"><Despesas /></div>}
      <div className={`px-4 md:px-6 pb-8 max-w-[1400px] mx-auto space-y-3 ${operador && aba !== "vendas" ? "hidden" : ""}`}>
        {error && <p className="text-sm text-red-400">{error.message}</p>}
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {d && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Vendas</p><p className="text-2xl font-bold">{d.resumo.quantidade}</p></div>
            <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Valor vendido</p><p className="text-xl font-bold">{brl(d.resumo.valorVendido)}</p></div>
            {!admin && <div className="rounded-xl border border-primary/40 bg-card p-3"><p className="text-xs text-muted-foreground">Suas comissões</p><p className="text-xl font-bold text-primary">{brl(d.resumo.minhasComissoes)}</p></div>}
          </div>
        )}
        {d && vendas.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhuma venda registrada nos empreendimentos que você acessa.</p>}
        <div className="space-y-2">
          {vendas.map(x => (
            <div key={x.loteId} className={`rounded-xl border bg-card p-3 text-sm ${x.minhaVenda ? "border-primary/50" : "border-border"}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold">{String(x.empreendimento ?? "")} · {x.codigo}</span>
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">{ROTULO_SITUACAO[x.situacao as SituacaoLote] ?? x.situacao}</span>
                <span className="text-xs text-muted-foreground">{data(x.dataSituacao)}</span>
                {x.minhaVenda && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[11px] text-primary">sua venda</span>}
              </div>
              <div className="mt-1 grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <p>Cliente: <b>{String(x.cliente ?? "—")}</b></p>
                <p>Corretor: <b>{String(x.corretorNome ?? "venda direta")}</b></p>
                <p>Venda: <b>{v(x.valorVenda)}</b> · entrada {v(x.valorEntrada as number | null)}</p>
                <p>Parcelas: <b>{String(x.numParcelas ?? "—")}</b>{x.parcelada ? " · parcelada" : ""}</p>
              </div>
              {x.comissao && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Comissão {brl(x.comissao.total)} — corretor {brl(x.comissao.corretor)} · Romatec {brl(x.comissao.romatec)} ·
                  1º pagamento {brl(x.comissao.no1oPagamento.total)}{x.comissao.no2oPagamento.total > 0 ? ` · 2º pagamento ${brl(x.comissao.no2oPagamento.total)}` : ""}
                </p>
              )}
              {x.minhaComissao && (
                <div className="mt-1.5 rounded-lg bg-primary/10 p-2 text-xs">
                  <p className="font-semibold">Sua comissão: {brl(x.minhaComissao.valor)} ({(x.minhaComissao.pct * 100).toLocaleString("pt-BR")}%)</p>
                  <p>{x.minhaComissao.pagamentos.map(p => `${p.quando}: ${brl(p.valor)}`).join(" · ")}</p>
                  <p className="text-muted-foreground">{x.minhaComissao.regra}</p>
                </div>
              )}
            </div>
          ))}
        </div>
        <LancarPagamento />
        {operador && <CobrancaWhatsapp />}
        <TesteAsaas />
        <TabelasFinanciamento />
      </div>
    </div>
  );
}
