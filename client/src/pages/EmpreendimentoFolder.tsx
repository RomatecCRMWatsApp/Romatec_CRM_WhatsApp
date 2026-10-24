import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import QRCode from "qrcode";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import MapaTematico from "@/components/empreendimento/MapaTematico";
import { ArrowLeft, Printer, Send } from "lucide-react";
import { toast } from "sonner";
import EnviarWhatsAppModal, { btnWhats } from "@/components/EnviarWhatsAppModal";
import { gerarImagemFolder } from "@/lib/imagemFolder";
import { exibirTelefoneBR } from "@shared/telefone";
import { SLUG_BOM_JARDIMS } from "@shared/chacaraLink";
import { PROJETO } from "@/components/bom-jardims/marca";

/**
 * Folder de divulgação (A4, para imprimir ou salvar em PDF/imagem): geral do empreendimento
 * ou de um lote. Sem preço e sem escassez — só fatos do projeto, mapa e contato.
 */
const n2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const VERDE = "#0C3320", OURO = "#C9A84C";

const IMPRESSAO = `
@media print {
  aside, header.lg\\:hidden, .nao-imprimir { display: none !important; }
  .lg\\:pl-64 { padding-left: 0 !important; }
  body { background: #fff !important; }
  .folha { box-shadow: none !important; margin: 0 !important; }
}
@page { size: A4; margin: 0; }
`;

const DIFERENCIAIS = [
  ["🏡", "Chácaras amplas, com área definida em projeto"],
  ["🛣️", "Ruas internas com nome e acesso a todos os lotes"],
  ["🌳", "Área de vivência e recreação"],
  ["💧", "Poço e reservatório de água"],
  ["🚪", "Portal de entrada e stand de atendimento"],
  ["📍", "Estrada do Piquiá dos Baianos — Açailândia/MA"],
];

const AVISO = "Imagens e mapa ilustrativos. Medidas do projeto de parcelamento; confira as condições com o corretor.";

/** "a Rua X" → "Frente para a Rua X"; "Lote B12" → "Divisa com lote B12" */
const rotuloLado = (confronta: string) =>
  confronta.startsWith("a ") ? `Frente para a ${confronta.slice(2)}` : confronta.startsWith("Lote") ? `Divisa com ${confronta.replace("Lote ", "lote ")}` : "Divisa";

export default function EmpreendimentoFolder() {
  const [, params] = useRoute("/empreendimentos/:slug/folder");
  const [, navigate] = useLocation();
  const slug = params?.slug ?? "";
  const codigo = new URLSearchParams(window.location.search).get("lote") || "";
  const { data: det } = trpc.empreendimentosAdmin.detalhe.useQuery({ slug }, { enabled: !!slug });
  const { data: mem } = trpc.empreendimentosAdmin.memoriais.useQuery({ slug, filtro: "todos", codigos: [codigo] }, { enabled: !!slug && !!codigo });
  const [qr, setQr] = useState<string>("");
  // Envio da visão da chácara (cabeçalho + mapa) como imagem, só para o número digitado
  const mapaRef = useRef<HTMLDivElement>(null);
  const [enviar, setEnviar] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [formato, setFormato] = useState<"imagem" | "pdf">("imagem");
  const envio = trpc.empreendimentosAdmin.enviarWhatsApp.useMutation({
    onSuccess: r => { toast.success(`Folder (${r.formato === "pdf" ? "PDF" : "imagem"}) enviado para ${exibirTelefoneBR(r.telefone)}`); setEnviar(false); },
    onError: e => toast.error(e.message),
  });

  const pagina = `${window.location.origin}/${slug}?utm_source=folder&utm_medium=impresso&utm_campaign=folder-${(codigo || "geral").toLowerCase()}`;
  useEffect(() => {
    QRCode.toDataURL(pagina, { margin: 1, width: 360, color: { dark: VERDE, light: "#FFFFFF" } }).then(setQr).catch(() => setQr(""));
  }, [pagina]);

  if (!det) return <p className="p-6 text-sm text-muted-foreground">Montando o folder…</p>;
  const emp = det.empreendimento;
  const lote = codigo ? det.lotes.find(l => l.codigo === codigo) : null;
  const m = mem?.memoriais[0];
  const disponiveis = det.lotes.filter(l => l.situacao === "disponivel");
  const areas = disponiveis.map(l => l.areaM2 ?? 0).filter(Boolean);
  const ruasDoLote = m ? Array.from(new Set(m.vertices.filter(v => v.confronta.startsWith("a ")).map(v => v.confronta.slice(2)))) : [];
  const zap = `https://wa.me/${det.whatsapp}?text=${encodeURIComponent(lote ? `Olá! Vi o folder do ${emp.nome} e quero saber da chácara ${lote.codigo}.` : `Olá! Vi o folder do ${emp.nome} e quero saber mais.`)}`;
  const zapFmt = det.whatsapp.replace(/^55(\d{2})(\d)(\d{4})(\d{4})$/, "($1) $2 $3-$4");
  const linhaCapa = lote
    ? `Chácara ${lote.codigo} · Quadra ${lote.quadra} · ${n2(lote.areaM2 ?? 0)} m²`
    : `${disponiveis.length} chácaras disponíveis${areas.length ? ` · de ${n2(Math.min(...areas))} a ${n2(Math.max(...areas))} m²` : ""}`;

  // Projeto do portal e do stand (por enquanto só o Bom Jardims tem as pranchas recortadas)
  const projeto = slug === SLUG_BOM_JARDIMS ? PROJETO : [];
  const sistemaUtm = `UTM · SIRGAS 2000 · fuso ${(emp as any).utmFuso ?? 23}S`;
  const resumoMedidas = m ? `Área: ${n2(m.areaM2)} m² · Perímetro: ${n2(m.perimetroM)} m${ruasDoLote.length ? ` · Acesso pela ${ruasDoLote.join(" e ")}` : ""}` : "";

  /** Folder inteiro (capa, mapa, medidas, coordenadas, QR, contato) em JPEG e envio no formato escolhido */
  async function enviarFolder(destino: string) {
    const svg = mapaRef.current?.querySelector("svg");
    if (!svg) { toast.error("O mapa ainda não carregou. Tente de novo em instantes."); return; }
    if (lote && !m) { toast.error("As medidas da chácara ainda estão carregando. Tente de novo em instantes."); return; }
    setGerando(true);
    try {
      const imagem = await gerarImagemFolder({
        slug, svg, nome: emp.nome, linha: linhaCapa,
        local: [emp.municipio, emp.uf].filter(Boolean).join(" — "),
        tituloMapa: lote ? "Localização da chácara" : "Mapa das chácaras disponíveis",
        medidas: lote && m ? m.vertices.map(v => ({ rotulo: rotuloLado(v.confronta), valor: `${n2(v.distancia)} m` })) : undefined,
        resumoMedidas: lote && m ? resumoMedidas : undefined,
        coordenadas: lote && m ? { titulo: sistemaUtm, linhas: m.vertices.map(v => ({ v: v.nome, e: n2(v.e), n: n2(v.n) })) } : undefined,
        diferenciais: DIFERENCIAIS as [string, string][],
        projeto: projeto.map(p => ({ src: p.src, w: p.w, h: p.h })),
        qr, textoQr: "Aponte a câmera para ver fotos, vídeo e o mapa",
        whatsapp: zapFmt,
        aviso: AVISO,
      });
      envio.mutate({ slug, codigo: lote?.codigo, telefone: destino, imagem, formato });
    } catch (e: any) {
      toast.error(`Não consegui montar o folder: ${e?.message || e}`);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="p-4 md:p-6">
      <style>{IMPRESSAO}</style>
      <div className="nao-imprimir mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => navigate(`/empreendimentos/${slug}`)}><ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar</Button>
        <Button onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" /> Imprimir / salvar PDF</Button>
        <Button variant="outline" onClick={() => setEnviar(true)} className="border-[#25d366]/40 text-[#1fa855] hover:text-[#1fa855]"><Send className="mr-1.5 h-4 w-4" /> Enviar no WhatsApp</Button>
        <select value={codigo} onChange={e => navigate(`/empreendimentos/${slug}/folder${e.target.value ? `?lote=${e.target.value}` : ""}`)} className="h-9 rounded-md border border-border bg-secondary px-2 text-sm">
          <option value="">Folder geral</option>
          {disponiveis.map(l => <option key={l.id} value={l.codigo}>Chácara {l.codigo}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">Sem preço. Para Instagram, salve o PDF e exporte como imagem.</span>
      </div>

      <div className="folha mx-auto w-full max-w-[794px] overflow-hidden rounded-xl bg-white text-[#16301f] shadow-xl" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        {/* Capa */}
        <div className="relative h-[260px] bg-cover bg-center" style={{ backgroundImage: `url(/${slug}/portal-frontal.webp), url(/${slug}/stand-aerea.webp)`, backgroundColor: VERDE }}>
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(12,51,32,0.15) 0%, rgba(12,51,32,0.85) 100%)` }} />
          <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: OURO }}>{[emp.municipio, emp.uf].filter(Boolean).join(" — ")}</p>
            <h1 className="mt-1 text-3xl font-bold leading-tight" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{emp.nome}</h1>
            <p className={lote ? "mt-2 text-xl font-semibold" : "mt-2 text-lg"}>{linhaCapa}</p>
          </div>
        </div>

        {/* Mapa */}
        <div ref={mapaRef} className="px-6 pt-5">
          <p className="mb-2 text-sm font-bold uppercase tracking-wider" style={{ color: VERDE }}>{lote ? "Localização da chácara" : "Mapa das chácaras disponíveis"}</p>
          <MapaTematico slug={slug} lotes={det.lotes as any} ruas={det.ruas} perimetro={det.perimetro?.poligono} realce={lote ? [lote.codigo] : undefined} destacar={lote ? undefined : ["disponivel"]} compacto semLegenda />
        </div>

        <div className="grid gap-5 px-6 py-5 md:grid-cols-2">
          {/* Lote: medidas / Geral: diferenciais */}
          {lote && m ? (
            <div>
              <p className="mb-2 text-sm font-bold uppercase tracking-wider" style={{ color: VERDE }}>Medidas</p>
              <ul className="space-y-1 text-[13px]">
                {m.vertices.map(v => (
                  <li key={v.nome} className="flex justify-between gap-2 border-b border-[#e6ecdf] pb-0.5">
                    <span>{rotuloLado(v.confronta)}</span>
                    <b className="tabular-nums">{n2(v.distancia)} m</b>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[13px]">Área: <b>{n2(m.areaM2)} m²</b> · Perímetro: <b>{n2(m.perimetroM)} m</b>{ruasDoLote.length ? <> · Acesso pela <b>{ruasDoLote.join(" e ")}</b></> : null}</p>
              <p className="mb-1 mt-4 text-sm font-bold uppercase tracking-wider" style={{ color: VERDE }}>Coordenadas dos vértices</p>
              <p className="mb-1 text-[11px] text-[#6b7a6f]">{sistemaUtm}</p>
              <ul className="space-y-0.5 text-[12px] tabular-nums">
                {m.vertices.map(v => (
                  <li key={v.nome} className="flex gap-3 border-b border-[#e6ecdf] pb-0.5">
                    <b className="w-7" style={{ color: VERDE }}>{v.nome}</b><span>E {n2(v.e)}</span><span>N {n2(v.n)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div>
              <p className="mb-2 text-sm font-bold uppercase tracking-wider" style={{ color: VERDE }}>O condomínio</p>
              <ul className="space-y-1.5 text-[13px]">{DIFERENCIAIS.map(([i, t]) => <li key={t}><span className="mr-2">{i}</span>{t}</li>)}</ul>
            </div>
          )}

          {/* Contato */}
          <div className="flex flex-col items-center justify-center rounded-2xl p-5 text-center text-white" style={{ background: VERDE }}>
            <p className="text-sm font-semibold" style={{ color: OURO }}>Agende sua visita</p>
            {qr && <img src={qr} alt="QR Code da página do empreendimento" className="my-3 h-36 w-36 rounded-lg bg-white p-1.5" />}
            <p className="text-xs opacity-80">Aponte a câmera para ver fotos, vídeo e o mapa</p>
            <a href={zap} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-full px-4 py-2 text-sm font-bold" style={{ background: OURO, color: VERDE }}>WhatsApp {zapFmt}</a>
            <p className="mt-3 text-[11px] opacity-80">Romatec Consultoria Total · José Romário — CRECI/MA 4.705</p>
          </div>
        </div>

        {/* Projeto do portal e do stand de vendas (fachada + planta baixa, sem corte) */}
        {projeto.length > 0 && (
          <div className="px-6 pb-5" style={{ breakInside: "avoid" }}>
            <p className="mb-2 text-sm font-bold uppercase tracking-wider" style={{ color: VERDE }}>Projeto — portal de entrada e stand de vendas</p>
            <div className="grid grid-cols-2 gap-3">
              {projeto.map(p => (
                <img key={p.src} src={p.src} alt={p.alt} className={`w-full rounded-lg border border-[#e6ecdf] bg-white object-contain ${p.h > p.w * 0.8 ? "col-span-2 mx-auto max-w-[62%]" : ""}`} />
              ))}
            </div>
          </div>
        )}

        {lote && (
          <div className="px-6 pb-5">
            <p className="mb-1 text-sm font-bold uppercase tracking-wider" style={{ color: VERDE }}>O condomínio</p>
            <p className="text-[12px] leading-relaxed">{DIFERENCIAIS.map(([i, t]) => `${i} ${t}`).join("   ·   ")}</p>
          </div>
        )}
        <p className="px-6 pb-4 text-[10px] text-[#6b7a6f]">{AVISO}</p>
      </div>

      {enviar && (
        <EnviarWhatsAppModal
          titulo={lote ? `Enviar a chácara ${lote.codigo} no WhatsApp` : "Enviar o mapa no WhatsApp"}
          descricao="Vai o folder inteiro — capa, mapa de localização, medidas e coordenadas, QR Code e contato — só para o número que você digitar: cliente, corretor, proprietário ou você mesmo."
          sugestao={det.destinoSugerido}
          enviando={gerando || envio.isPending}
          onFechar={() => setEnviar(false)}
          onEnviar={enviarFolder}
        >
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
