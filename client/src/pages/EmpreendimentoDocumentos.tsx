import { useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import MapaTematico from "@/components/empreendimento/MapaTematico";
import EnviarWhatsAppModal, { btnWhats } from "@/components/EnviarWhatsAppModal";
import { gerarImagemMemorial } from "@/lib/imagemMemorial";
import { ROTULO_SITUACAO, AVISO_RASCUNHO_MEMORIAL, type SituacaoLote } from "@shared/lotes";
import { exibirTelefoneBR } from "@shared/telefone";
import { ArrowLeft, Printer, Send } from "lucide-react";

const n = (v: number, casas = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

const IMPRESSAO = `
@media print {
  aside, header.lg\\:hidden, .nao-imprimir { display: none !important; }
  .lg\\:pl-64 { padding-left: 0 !important; }
  body { background: #fff !important; }
  .quebra { break-before: page; }
  .doc { padding: 0 !important; }
  .vertices-cartoes { display: none !important; }
  .vertices-tabela { display: block !important; overflow: visible !important; }
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

  // Envio do memorial (página inteira, imagem ou PDF) só para o número digitado
  const mapaRef = useRef<HTMLDivElement>(null);
  const [enviar, setEnviar] = useState(false);
  const [alvo, setAlvo] = useState("");
  const [formato, setFormato] = useState<"imagem" | "pdf">("imagem");
  const [gerando, setGerando] = useState(false);
  const envio = trpc.empreendimentosAdmin.enviarMemorialWhatsApp.useMutation({
    onSuccess: r => { toast.success(`Memorial (${r.formato === "pdf" ? "PDF" : "imagem"}) enviado para ${exibirTelefoneBR(r.telefone)}`); setEnviar(false); },
    onError: e => toast.error(e.message),
  });

  if (error) return <p className="p-6 text-sm text-red-400">{error.message}</p>;
  if (isLoading || !data || !det) return <p className="p-6 text-sm text-muted-foreground">Gerando documentos…</p>;
  const emp = data.empreendimento;
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });
  const titulo = codigos.length ? `Lote ${codigos.join(", ")}` : filtro === "todos" ? "Todos os lotes" : "Lotes disponíveis à venda";
  const areaTotal = data.memoriais.reduce((s, m) => s + m.areaM2, 0);
  const local = [emp.municipio, emp.uf].filter(Boolean).join("/");

  async function enviarMemorial(destino: string) {
    const m = data!.memoriais.find(x => x.codigo === alvo) ?? data!.memoriais[0];
    if (!m) return;
    setGerando(true);
    try {
      // Mapa só quando o lote está destacado nele (página aberta para esse lote)
      const svg = codigos.includes(m.codigo) ? mapaRef.current?.querySelector("svg") : null;
      const imagem = await gerarImagemMemorial({
        empreendimento: emp.nome,
        subtitulo: `${local} · Lote ${m.codigo} · emitido em ${hoje}`,
        matricula: `Matrícula do empreendimento: ${emp.registroMatricula || "sem registro informado"}`,
        svg, titulo: m.titulo, cabecalho: m.cabecalho, descricao: m.descricao,
        vertices: m.vertices.map(v => ({ nome: v.nome, n: n(v.n, 3), e: n(v.e, 3), azimute: v.azimute, distancia: n(v.distancia), confronta: v.confronta })),
        localData: `${local}, ${hoje}.`,
        responsavel: emp.responsavelTecnico || "Responsável técnico (nome, título e registro profissional)",
      });
      envio.mutate({ slug, codigo: m.codigo, telefone: destino, imagem, formato });
    } catch (e: any) {
      toast.error(`Não consegui montar o memorial: ${e?.message || e}`);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="doc p-4 md:p-6">
      <style>{IMPRESSAO}</style>
      <div className="nao-imprimir mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => navigate(`/empreendimentos/${slug}`)}><ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar</Button>
        <Button onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" /> Imprimir / salvar PDF</Button>
        {data.memoriais.length > 0 && (
          <Button variant="outline" onClick={() => { setAlvo(a => a || data.memoriais[0].codigo); setEnviar(true); }} className="border-[#25d366]/40 text-[#1fa855] hover:text-[#1fa855]">
            <Send className="mr-1.5 h-4 w-4" /> Enviar no WhatsApp
          </Button>
        )}
        {data.semGeometria > 0 && <span className="text-xs text-amber-300">{data.semGeometria} lote(s) sem desenho importado ficaram de fora — importe o DXF na aba Arquivos.</span>}
      </div>

      <div className="mx-auto max-w-[900px] rounded-xl bg-white p-6 text-[#111] shadow print:shadow-none">
        {/* Capa: mapa */}
        <h1 className="text-xl font-bold">{emp.nome}</h1>
        <p className="text-sm">{[emp.municipio, emp.uf].filter(Boolean).join("/")} · {titulo} · emitido em {hoje}</p>
        <p className="text-xs text-[#555]">Matrícula do empreendimento: {emp.registroMatricula || "sem registro informado"}</p>
        <div ref={mapaRef} className="mt-3">
          <MapaTematico slug={slug} lotes={det.lotes as any} ruas={det.ruas} perimetro={det.perimetro?.poligono}
            realce={codigos.length ? codigos : undefined} destacar={codigos.length || filtro === "todos" ? undefined : ["disponivel"]} compacto />
        </div>

        {/* Anexo */}
        <h2 className="quebra mt-6 text-lg font-bold">Anexo — {titulo.toLowerCase()} ({data.memoriais.length})</h2>
        <div className="overflow-x-auto">
        <table className="mt-2 w-full border-collapse text-xs">
          <thead><tr className="border-b border-[#999]">
            {["Lote", "Quadra", "Área (m²)", "Área (ha)", "Perímetro (m)", "Situação"].map(h => <th key={h} className="whitespace-nowrap px-1 py-1 text-left">{h}</th>)}
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
        </div>

        {/* Memoriais */}
        {data.memoriais.map(m => (
          <section key={m.codigo} className="quebra mt-8">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#a33]">{AVISO_RASCUNHO_MEMORIAL}</p>
            <h2 className="text-base font-bold">Memorial descritivo — {m.titulo}</h2>
            <ul className="mt-1 text-xs">{m.cabecalho.map(c => <li key={c}>{c}</li>)}</ul>
            <p className="mt-2 text-justify text-xs leading-relaxed">{m.descricao}</p>
            {/* Celular: um cartão por vértice (nada corta) */}
            <ul className="vertices-cartoes mt-2 space-y-2 sm:hidden">
              {m.vertices.map(v => (
                <li key={v.nome} className="rounded-md border border-[#ddd] p-2 text-[11px]">
                  <p className="mb-1 text-xs font-bold">{v.nome}</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                    <dt className="text-[#555]">N (m)</dt><dd className="tabular-nums">{n(v.n, 3)}</dd>
                    <dt className="text-[#555]">E (m)</dt><dd className="tabular-nums">{n(v.e, 3)}</dd>
                    <dt className="text-[#555]">Azimute</dt><dd>{v.azimute}</dd>
                    <dt className="text-[#555]">Distância</dt><dd className="tabular-nums">{n(v.distancia)} m</dd>
                    <dt className="text-[#555]">Confrontação</dt><dd className="break-words">{v.confronta}</dd>
                  </dl>
                </li>
              ))}
            </ul>
            {/* Telas maiores e impressão: tabela (com rolagem horizontal se ainda faltar espaço) */}
            <div className="vertices-tabela mt-2 hidden overflow-x-auto sm:block">
              <table className="w-full border-collapse text-[10px]">
                <thead><tr className="border-b border-[#999]">
                  {["Vértice", "N (m)", "E (m)", "Azimute", "Distância (m)", "Confrontação"].map(h => <th key={h} className="whitespace-nowrap px-1 py-0.5 text-left">{h}</th>)}
                </tr></thead>
                <tbody>
                  {m.vertices.map(v => (
                    <tr key={v.nome} className="border-b border-[#eee]">
                      <td className="px-1 py-0.5">{v.nome}</td>
                      <td className="whitespace-nowrap px-1 py-0.5 tabular-nums">{n(v.n, 3)}</td>
                      <td className="whitespace-nowrap px-1 py-0.5 tabular-nums">{n(v.e, 3)}</td>
                      <td className="whitespace-nowrap px-1 py-0.5">{v.azimute}</td>
                      <td className="whitespace-nowrap px-1 py-0.5 tabular-nums">{n(v.distancia)}</td>
                      <td className="min-w-[160px] px-1 py-0.5">{v.confronta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-6 text-xs">{[emp.municipio, emp.uf].filter(Boolean).join("/")}, {hoje}.</p>
            <p className="mt-8 border-t border-[#999] pt-1 text-xs">{emp.responsavelTecnico || "Responsável técnico (nome, título e registro profissional)"}</p>
          </section>
        ))}
      </div>

      {enviar && (
        <EnviarWhatsAppModal
          titulo="Enviar o memorial no WhatsApp"
          descricao="Vai a página inteira do memorial (com o aviso de RASCUNHO, dados do imóvel, descrição, tabela dos vértices, data e responsável técnico), só para o número que você digitar."
          sugestao={det.destinoSugerido}
          enviando={gerando || envio.isPending}
          onFechar={() => setEnviar(false)}
          onEnviar={enviarMemorial}
        >
          {data.memoriais.length > 1 && (
            <select value={alvo} onChange={e => setAlvo(e.target.value)} aria-label="Lote do memorial"
              className="mb-3 h-9 w-full rounded-md border border-border bg-secondary px-2 text-sm">
              {data.memoriais.map(m => <option key={m.codigo} value={m.codigo}>{m.titulo}</option>)}
            </select>
          )}
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
            {(["imagem", "pdf"] as const).map(f => (
              <button key={f} type="button" onClick={() => setFormato(f)} style={{
                ...btnWhats(formato === f ? "#3ec87a" : "#5a8a65", formato === f ? "rgba(62,200,122,0.15)" : "rgba(255,255,255,0.04)", formato === f ? "rgba(62,200,122,0.35)" : "rgba(255,255,255,0.12)"),
              }}>
                {f === "imagem" ? "🖼️ Enviar como imagem" : "📄 Enviar como PDF"}
              </button>
            ))}
          </div>
        </EnviarWhatsAppModal>
      )}
    </div>
  );
}
