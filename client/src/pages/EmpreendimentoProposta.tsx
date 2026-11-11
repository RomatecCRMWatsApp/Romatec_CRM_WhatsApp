import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";
import { brl, textoEntrada } from "@shared/simulador";
import { ROTULO_CONDICAO, planoCondicao, condicaoValida, type CondicaoPagamento, type PlanoCondicao } from "@shared/condicoesLancamento";
import { FotoCorretor, useCartaoVendas } from "@/lib/cartaoVendas";
import { AcoesPdf } from "@/components/sistema/AcoesPdf";

/**
 * Proposta da simulação (A4, "Imprimir → Salvar como PDF"): lote, entrada e plano escolhidos,
 * total a pagar, juros efetivos, aviso legal e corretor. Lote vendido não gera proposta.
 */
const VERDE = "#0C3320", OURO = "#C9A84C";
const m2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const IMPRESSAO = `
@media print {
  aside, header.lg\\:hidden, .nao-imprimir { display: none !important; }
  .lg\\:pl-64 { padding-left: 0 !important; }
  body { background: #fff !important; }
  .folha { box-shadow: none !important; margin: 0 !important; }
}
@page { size: A4; margin: 12mm; }
`;

export default function EmpreendimentoProposta() {
  const cartao = useCartaoVendas();
  const [, params] = useRoute("/empreendimentos/:slug/proposta");
  const [, navigate] = useLocation();
  const slug = params?.slug ?? "";
  const q = new URLSearchParams(window.location.search);
  const lote = (q.get("lote") || "").toUpperCase();
  const entrada = Number(q.get("entrada")) || 1;
  const prazo = Number(q.get("prazo")) || 120;
  // Plano da proposta: entrada de 30% (padrão) ou Planos A, B e C (entrada de R$ 10 mil no ato)
  const condicao: CondicaoPagamento = condicaoValida(q.get("condicao")) ? (q.get("condicao") as CondicaoPagamento) : "padrao";
  const { data, error, isLoading } = trpc.simulador.simular.useQuery({ slug, lote, entrada }, { enabled: !!slug && !!lote, retry: false });

  if (!lote) return <p className="p-6 text-sm text-danger-400">Informe a chácara.</p>;
  if (error) return <p className="p-6 text-sm text-danger-400">{error.message}</p>;
  if (isLoading || !data) return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  const sim = data.simulacao;
  const plano = condicao === "padrao" ? sim.planos.find(p => p.prazo === prazo) : undefined;
  let pc: PlanoCondicao | null = null;
  if (condicao !== "padrao") { try { pc = planoCondicao(sim.preco, condicao, prazo, data.condicoes); } catch { pc = null; } }
  if (data.lote.selo === "vendido") return <p className="p-6 text-sm text-danger-400">Chácara {data.lote.codigo} vendida — sem proposta.</p>;
  if (condicao === "padrao" ? !plano : !pc) return <p className="p-6 text-sm text-danger-400">Prazo de {prazo} meses não está nas condições{condicao !== "padrao" ? ` do ${ROTULO_CONDICAO[condicao].curto}` : ""}.</p>;
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });

  const Linha = ({ r, v, forte }: { r: string; v: string; forte?: boolean }) => (
    <tr style={{ borderBottom: "1px solid var(--c-e5e7eb)" }}>
      <td style={{ padding: "7px 0", color: "var(--c-4b5563)" }}>{r}</td>
      <td style={{ padding: "7px 0", textAlign: "right", fontWeight: forte ? 700 : 500, color: forte ? VERDE : "var(--c-111827)" }}>{v}</td>
    </tr>
  );

  return (
    <div className="py-6">
      <style>{IMPRESSAO}</style>
      <div className="nao-imprimir mx-auto mb-4 flex max-w-[210mm] flex-wrap gap-2 px-4">
        <Button variant="outline" onClick={() => navigate(`/empreendimentos/${slug}`)}><ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar</Button>
        <Button onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" /> Imprimir</Button>
        <AcoesPdf compacto rotulo="PDF: baixar, enviar, link" url={`/api/simulador/proposta.pdf?slug=${encodeURIComponent(slug)}&lote=${encodeURIComponent(lote)}&entrada=${entrada}&prazo=${prazo}&condicao=${condicao}`}
          nomeArquivo={`PROPOSTA-${lote}-${condicao === "padrao" ? "ENTRADA-30" : `PLANO-${condicao}`}-${prazo}X.pdf`} mensagem={`Proposta da Chácara ${lote} — Condomínio de Chácaras Bom Jardims`} />
      </div>
      <div className="folha mx-auto bg-white shadow-xl" style={{ width: "210mm", minHeight: "270mm", padding: "14mm", color: "var(--c-111827)", fontFamily: "Inter, Arial, sans-serif", fontSize: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", borderBottom: `3px solid ${OURO}`, paddingBottom: "10px" }}>
          <img src="/bom-jardims/logo.webp" alt="Bom Jardims" style={{ height: "56px", objectFit: "contain" }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: "18px", fontWeight: 800, color: VERDE, margin: 0 }}>Proposta de financiamento direto</p>
            <p style={{ margin: 0, color: "var(--c-4b5563)" }}>Condomínio de Chácaras Bom Jardims · Açailândia/MA</p>
          </div>
          <p style={{ margin: 0, color: "var(--c-6b7280)" }}>{hoje}</p>
        </div>

        <p style={{ fontSize: "14px", fontWeight: 700, margin: "14px 0 4px" }}>Chácara {data.lote.codigo}{data.lote.quadra ? ` · Quadra ${data.lote.quadra}` : ""} · {m2(data.lote.areaM2)} m²</p>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <Linha r="Preço da chácara" v={brl(sim.preco)} forte />
            {pc ? <>
              <Linha r="Forma de pagamento" v={ROTULO_CONDICAO[condicao].titulo} forte />
              <Linha r="Entrada no ato" v={brl(pc.entradaAto)} />
              {pc.complemento && <Linha r="Resto da entrada (sem juros)" v={`${pc.complemento.qtd}× de ${brl(pc.complemento.parcela)} — ${pc.modoC === "sequencial" ? "antes do financiamento" : "no mesmo boleto da parcela"}`} />}
              <Linha r="Saldo financiado" v={brl(pc.saldoFinanciado)} />
              <Linha r="Parcelas do saldo (fixas)" v={`${pc.prazo}× de ${brl(pc.parcela)}`} forte />
              {pc.reforco && <Linha r="Reforços anuais" v={`${pc.reforco.qtd}× de ${brl(pc.reforco.valor)} (a cada ${pc.reforco.intervaloMeses} meses)`} />}
              {pc.complemento && pc.modoC !== "sequencial" && <Linha r="Desembolso mensal nos primeiros meses" v={brl(pc.mensalInicial)} />}
              <Linha r="Juros no período" v={brl(pc.juros)} />
              <Linha r="Total a pagar" v={brl(pc.totalPago)} forte />
            </> : plano && <>
              <Linha r={`Entrada (${Math.round(data.condicoes.entradaPct * 100)}%)`} v={textoEntrada(sim)} />
              <Linha r={`Saldo financiado (${Math.round((1 - data.condicoes.entradaPct) * 100)}%)`} v={brl(sim.saldo)} />
              <Linha r="Parcelas do saldo (fixas)" v={`${plano.prazo}× de ${brl(plano.parcela)}`} forte />
              <Linha r="Total das parcelas do saldo" v={brl(plano.totalSaldo)} />
              <Linha r="Juros no período" v={brl(plano.juros)} />
              <Linha r="Total a pagar (entrada + saldo)" v={brl(plano.totalPago)} forte />
            </>}
          </tbody>
        </table>
        </div>
        <p style={{ margin: "8px 0 0", color: "var(--c-374151)" }}>{data.textoJuros}. {pc ? `1ª parcela do saldo no mês seguinte ao pagamento da entrada${pc.complemento && pc.modoC === "sequencial" ? ` — depois das ${pc.complemento.qtd} parcelas do resto da entrada` : ""}.` : `1ª parcela do saldo no mês seguinte à ${entrada === 1 ? "entrada à vista" : "última parcela da entrada"}.`}</p>

        <div style={{ marginTop: "14px", border: `1.5px solid ${OURO}`, borderRadius: "8px", padding: "10px 12px", background: "var(--c-fbf7ec)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: VERDE }}>Ou pagamento integral à vista</p>
            <p style={{ margin: 0, color: "var(--c-4b5563)" }}>Preço cheio {brl(sim.preco)} com desconto de {brl(sim.avistaTotal.desconto)}, pago de uma só vez.</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: VERDE }}>{brl(sim.avistaTotal.valor)}</p>
            <p style={{ margin: 0, color: "var(--c-047857)", fontWeight: 600 }}>economize {brl(sim.avistaTotal.desconto)}</p>
          </div>
        </div>

        <p style={{ marginTop: "18px", fontSize: "10.5px", color: "var(--c-4b5563)", lineHeight: 1.45 }}>{data.avisoLegal}</p>

        <div style={{ marginTop: "24px", borderTop: `1px solid ${OURO}`, paddingTop: "10px", display: "flex", alignItems: "center", gap: "14px" }}>
          {/* Foto de quem gerou a proposta (sem foto: selo da Romatec) */}
          <FotoCorretor cartao={cartao} />
          <div>
            <p style={{ margin: 0, fontWeight: 700 }}>{cartao.papel} {cartao.nome}{cartao.creci ? ` · ${cartao.creci}` : ""}</p>
            {cartao.telefones.length > 0 && <p style={{ margin: 0, color: "var(--c-374151)" }}>WhatsApp {cartao.telefones.join(" · ")}</p>}
            {cartao.email && <p style={{ margin: 0, color: "var(--c-374151)" }}>{cartao.email}</p>}
            {cartao.instagram && <p style={{ margin: 0, color: "var(--c-374151)" }}>Instagram @{cartao.instagram}</p>}
            <p style={{ margin: "4px 0 0", color: "var(--c-6b7280)" }}>Romatec Consultoria Total · CRECI J-1234 · Valores sujeitos a alteração e disponibilidade.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
