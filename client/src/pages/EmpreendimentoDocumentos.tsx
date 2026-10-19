import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import MapaTematico from "@/components/empreendimento/MapaTematico";
import { ROTULO_SITUACAO, type SituacaoLote } from "@shared/lotes";
import { ArrowLeft, Printer } from "lucide-react";

const n = (v: number, casas = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

const IMPRESSAO = `
@media print {
  aside, header.lg\\:hidden, .nao-imprimir { display: none !important; }
  .lg\\:pl-64 { padding-left: 0 !important; }
  body { background: #fff !important; }
  .quebra { break-before: page; }
  .doc { padding: 0 !important; }
}
@page { size: A4; margin: 15mm; }
`;

/** Mapa dos lotes, anexo (lista) e memoriais descritivos — para imprimir / salvar em PDF */
export default function EmpreendimentoDocumentos() {
  const [, params] = useRoute("/empreendimentos/:slug/documentos");
  const [, navigate] = useLocation();
  const slug = params?.slug ?? "";
  const busca = new URLSearchParams(window.location.search);
  const codigos = (busca.get("codigos") || "").split(",").map(s => s.trim()).filter(Boolean);
  const filtro = busca.get("filtro") === "todos" || codigos.length ? "todos" : "disponiveis";
  const { data, isLoading, error } = trpc.empreendimentosAdmin.memoriais.useQuery({ slug, filtro, ...(codigos.length ? { codigos } : {}) }, { enabled: !!slug });
  const { data: det } = trpc.empreendimentosAdmin.detalhe.useQuery({ slug }, { enabled: !!slug });

  if (error) return <p className="p-6 text-sm text-red-400">{error.message}</p>;
  if (isLoading || !data || !det) return <p className="p-6 text-sm text-muted-foreground">Gerando documentos…</p>;
  const emp = data.empreendimento;
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });
  const titulo = codigos.length ? `Lote ${codigos.join(", ")}` : filtro === "todos" ? "Todos os lotes" : "Lotes disponíveis à venda";
  const areaTotal = data.memoriais.reduce((s, m) => s + m.areaM2, 0);

  return (
    <div className="doc p-4 md:p-6">
      <style>{IMPRESSAO}</style>
      <div className="nao-imprimir mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => navigate(`/empreendimentos/${slug}`)}><ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar</Button>
        <Button onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" /> Imprimir / salvar PDF</Button>
        {data.semGeometria > 0 && <span className="text-xs text-amber-300">{data.semGeometria} lote(s) sem desenho importado ficaram de fora — importe o DXF na aba Arquivos.</span>}
      </div>

      <div className="mx-auto max-w-[900px] rounded-xl bg-white p-6 text-[#111] shadow print:shadow-none">
        {/* Capa: mapa */}
        <h1 className="text-xl font-bold">{emp.nome}</h1>
        <p className="text-sm">{[emp.municipio, emp.uf].filter(Boolean).join("/")} · {titulo} · emitido em {hoje}</p>
        <p className="text-xs text-[#555]">Matrícula do empreendimento: {emp.registroMatricula || "sem registro informado"}</p>
        <div className="mt-3">
          <MapaTematico slug={slug} lotes={det.lotes as any} ruas={det.ruas} perimetro={det.perimetro?.poligono} destacar={filtro === "todos" ? undefined : ["disponivel"]} compacto />
        </div>

        {/* Anexo */}
        <h2 className="quebra mt-6 text-lg font-bold">Anexo — {titulo.toLowerCase()} ({data.memoriais.length})</h2>
        <table className="mt-2 w-full border-collapse text-xs">
          <thead><tr className="border-b border-[#999]">
            {["Lote", "Quadra", "Área (m²)", "Área (ha)", "Perímetro (m)", "Situação"].map(h => <th key={h} className="px-1 py-1 text-left">{h}</th>)}
          </tr></thead>
          <tbody>
            {data.memoriais.map(m => (
              <tr key={m.codigo} className="border-b border-[#ddd]">
                <td className="px-1 py-0.5 font-semibold">{m.codigo}</td>
                <td className="px-1 py-0.5">{m.quadra}</td>
                <td className="px-1 py-0.5 tabular-nums">{n(m.areaM2)}</td>
                <td className="px-1 py-0.5 tabular-nums">{n(m.areaM2 / 10000, 4)}</td>
                <td className="px-1 py-0.5 tabular-nums">{n(m.perimetroM)}</td>
                <td className="px-1 py-0.5">{ROTULO_SITUACAO[m.situacao as SituacaoLote] ?? m.situacao}</td>
              </tr>
            ))}
            <tr className="font-semibold"><td className="px-1 py-1" colSpan={2}>Total</td><td className="px-1 py-1 tabular-nums">{n(areaTotal)}</td><td className="px-1 py-1 tabular-nums">{n(areaTotal / 10000, 4)}</td><td colSpan={2} /></tr>
          </tbody>
        </table>

        {/* Memoriais */}
        {data.memoriais.map(m => (
          <section key={m.codigo} className="quebra mt-8">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#a33]">Rascunho para conferência — não vale como documento oficial sem assinatura do responsável técnico</p>
            <h2 className="text-base font-bold">Memorial descritivo — {m.titulo}</h2>
            <ul className="mt-1 text-xs">{m.cabecalho.map(c => <li key={c}>{c}</li>)}</ul>
            <p className="mt-2 text-justify text-xs leading-relaxed">{m.descricao}</p>
            <table className="mt-2 w-full border-collapse text-[10px]">
              <thead><tr className="border-b border-[#999]">
                {["Vértice", "N (m)", "E (m)", "Azimute", "Distância (m)", "Confrontação"].map(h => <th key={h} className="px-1 py-0.5 text-left">{h}</th>)}
              </tr></thead>
              <tbody>
                {m.vertices.map(v => (
                  <tr key={v.nome} className="border-b border-[#eee]">
                    <td className="px-1 py-0.5">{v.nome}</td>
                    <td className="px-1 py-0.5 tabular-nums">{n(v.n, 3)}</td>
                    <td className="px-1 py-0.5 tabular-nums">{n(v.e, 3)}</td>
                    <td className="px-1 py-0.5">{v.azimute}</td>
                    <td className="px-1 py-0.5 tabular-nums">{n(v.distancia)}</td>
                    <td className="px-1 py-0.5">{v.confronta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-6 text-xs">{[emp.municipio, emp.uf].filter(Boolean).join("/")}, {hoje}.</p>
            <p className="mt-8 border-t border-[#999] pt-1 text-xs">{emp.responsavelTecnico || "Responsável técnico (nome, título e registro profissional)"}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
