import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";
import { brl, CORRETOR_SIMULACAO, textoEntrada } from "@shared/simulador";

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
  const [, params] = useRoute("/empreendimentos/:slug/proposta");
  const [, navigate] = useLocation();
  const slug = params?.slug ?? "";
  const q = new URLSearchParams(window.location.search);
  const lote = (q.get("lote") || "").toUpperCase();
  const entrada = Number(q.get("entrada")) || 1;
  const prazo = Number(q.get("prazo")) || 120;
  const { data, error, isLoading } = trpc.simulador.simular.useQuery({ slug, lote, entrada }, { enabled: !!slug && !!lote, retry: false });

  if (!lote) return <p className="p-6 text-sm text-red-400">Informe a chácara.</p>;
  if (error) return <p className="p-6 text-sm text-red-400">{error.message}</p>;
  if (isLoading || !data) return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  const sim = data.simulacao;
  const plano = sim.planos.find(p => p.prazo === prazo);
  if (data.lote.selo === "vendido") return <p className="p-6 text-sm text-red-400">Chácara {data.lote.codigo} vendida — sem proposta.</p>;
  if (!plano) return <p className="p-6 text-sm text-red-400">Prazo de {prazo} meses não está nas condições.</p>;
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });

  const Linha = ({ r, v, forte }: { r: string; v: string; forte?: boolean }) => (
    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
      <td style={{ padding: "7px 0", color: "#4b5563" }}>{r}</td>
      <td style={{ padding: "7px 0", textAlign: "right", fontWeight: forte ? 700 : 500, color: forte ? VERDE : "#111827" }}>{v}</td>
    </tr>
  );

  return (
    <div className="py-6">
      <style>{IMPRESSAO}</style>
      <div className="nao-imprimir mx-auto mb-4 flex max-w-[210mm] flex-wrap gap-2 px-4">
        <Button variant="outline" onClick={() => navigate(`/empreendimentos/${slug}`)}><ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar</Button>
        <Button onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" /> Imprimir / salvar PDF</Button>
      </div>
      <div className="folha mx-auto bg-white shadow-xl" style={{ width: "210mm", minHeight: "270mm", padding: "14mm", color: "#111827", fontFamily: "Inter, Arial, sans-serif", fontSize: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", borderBottom: `3px solid ${OURO}`, paddingBottom: "10px" }}>
          <img src="/bom-jardims/logo.webp" alt="Bom Jardims" style={{ height: "56px", objectFit: "contain" }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: "18px", fontWeight: 800, color: VERDE, margin: 0 }}>Proposta de financiamento direto</p>
            <p style={{ margin: 0, color: "#4b5563" }}>Condomínio de Chácaras Bom Jardims · Açailândia/MA</p>
          </div>
          <p style={{ margin: 0, color: "#6b7280" }}>{hoje}</p>
        </div>

        <p style={{ fontSize: "14px", fontWeight: 700, margin: "14px 0 4px" }}>Chácara {data.lote.codigo}{data.lote.quadra ? ` · Quadra ${data.lote.quadra}` : ""} · {m2(data.lote.areaM2)} m²</p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <Linha r="Preço da chácara" v={brl(sim.preco)} forte />
            <Linha r={`Entrada (${Math.round(data.condicoes.entradaPct * 100)}%)`} v={textoEntrada(sim)} />
            <Linha r={`Saldo financiado (${Math.round((1 - data.condicoes.entradaPct) * 100)}%)`} v={brl(sim.saldo)} />
            <Linha r="Parcelas do saldo (fixas)" v={`${plano.prazo}× de ${brl(plano.parcela)}`} forte />
            <Linha r="Total das parcelas do saldo" v={brl(plano.totalSaldo)} />
            <Linha r="Juros no período" v={brl(plano.juros)} />
            <Linha r="Total a pagar (entrada + saldo)" v={brl(plano.totalPago)} forte />
          </tbody>
        </table>
        <p style={{ margin: "8px 0 0", color: "#374151" }}>{data.textoJuros}. 1ª parcela do saldo no mês seguinte à {entrada === 1 ? "entrada à vista" : "última parcela da entrada"}.</p>

        <p style={{ marginTop: "18px", fontSize: "10.5px", color: "#4b5563", lineHeight: 1.45 }}>{data.avisoLegal}</p>

        <div style={{ marginTop: "24px", borderTop: `1px solid ${OURO}`, paddingTop: "10px", display: "flex", alignItems: "center", gap: "14px" }}>
          {/* Selo oficial da Romatec (identidade visual v1.0) */}
          <img src="/brand/selo-romatec.svg" alt="Selo Romatec Consultoria Total" style={{ width: "62px", height: "62px", flexShrink: 0 }} />
          <div>
            <p style={{ margin: 0, fontWeight: 700 }}>Corretor {CORRETOR_SIMULACAO.nome} · {CORRETOR_SIMULACAO.creci}</p>
            <p style={{ margin: 0, color: "#374151" }}>WhatsApp {CORRETOR_SIMULACAO.telefones.join(" · ")}</p>
            <p style={{ margin: "4px 0 0", color: "#6b7280" }}>Romatec Consultoria Total · Valores sujeitos a alteração e disponibilidade.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
