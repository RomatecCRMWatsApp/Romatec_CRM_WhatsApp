/**
 * Visualizador de PDF dentro do sistema (tela cheia): rola as páginas, zoom +/−, baixar, imprimir e Voltar.
 * Usa o pdf.js (client/src/lib/pdf.ts) — no iPhone o PDF num iframe mostra só a 1ª página; aqui saem todas.
 * As páginas são desenhadas conforme aparecem na tela (não pesa em PDFs grandes).
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Download, Loader2, Minus, Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { abrirPdf, desenharPagina, type DocumentoPdf } from "@/lib/pdf";

const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5, 2, 2.5];

function Pagina({ doc, n, largura }: { doc: DocumentoPdf; n: number; largura: number }) {
  const caixa = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visivel, setVisivel] = useState(n <= 2);
  const [altura, setAltura] = useState(largura * 1.414);
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisivel(true); }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visivel || !canvas.current) return;
    let vivo = true;
    desenharPagina(doc, n, canvas.current, largura).then(r => { if (vivo) setAltura(r.altura); }).catch(() => {});
    return () => { vivo = false; };
  }, [visivel, doc, n, largura]);
  return (
    <div ref={caixa} className="relative mx-auto bg-white shadow-lg" style={{ width: largura, minHeight: altura }}>
      <canvas ref={canvas} className="block" aria-label={`Página ${n}`} />
      {!visivel && <div className="absolute inset-0 grid place-items-center text-xs text-neutral-400">Página {n}</div>}
    </div>
  );
}

export default function VisualizadorPdf({ url, titulo, nomeArquivo, onFechar }: { url: string; titulo: string; nomeArquivo: string; onFechar: () => void }) {
  const area = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<DocumentoPdf | null>(null);
  const [blob, setBlob] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [larguraTela, setLarguraTela] = useState(() => Math.min(window.innerWidth, 1100));

  // Baixa uma vez (o mesmo arquivo serve para ver, baixar e imprimir)
  useEffect(() => {
    let vivo = true, objUrl: string | null = null;
    (async () => {
      try {
        const r = await fetch(url, { credentials: "include" });
        if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "Não foi possível gerar o documento"); }
        const b = await r.blob();
        objUrl = URL.createObjectURL(b);
        const d = await abrirPdf(objUrl);
        if (vivo) { setBlob(objUrl); setDoc(d); }
      } catch (e: any) { if (vivo) setErro(e?.message || "Falha ao abrir o documento"); }
    })();
    return () => { vivo = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [url]);

  useEffect(() => {
    const medir = () => setLarguraTela(Math.min((area.current?.clientWidth ?? window.innerWidth), 1100));
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);
  // Esc fecha; a rolagem da página de trás fica travada enquanto o visualizador está aberto
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", tecla); document.body.style.overflow = antes; };
  }, [onFechar]);

  const largura = Math.round((larguraTela - 24) * zoom);
  const i = ZOOMS.indexOf(zoom);
  const baixar = () => { if (!blob) return; const a = document.createElement("a"); a.href = blob; a.download = nomeArquivo; document.body.appendChild(a); a.click(); a.remove(); };
  const imprimir = () => { if (blob) window.open(blob, "_blank", "noopener"); };

  // Portal no body: acima da barra inferior e de qualquer camada da página
  return createPortal(
    <div className="fixed inset-0 z-[9000] flex flex-col bg-neutral-800" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-2 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <Button variant="outline" size="sm" onClick={onFechar}><ArrowLeft className="h-4 w-4" /> Voltar</Button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{titulo}{doc ? <span className="ml-1 font-normal text-muted-foreground">· {doc.numPages} páginas</span> : null}</p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Diminuir" disabled={!doc || i <= 0} onClick={() => setZoom(ZOOMS[i - 1])}><Minus className="h-4 w-4" /></Button>
          <button type="button" className="w-12 text-center text-xs text-muted-foreground" onClick={() => setZoom(1)} title="Ajustar à largura">{Math.round(zoom * 100)}%</button>
          <Button variant="ghost" size="icon" aria-label="Aumentar" disabled={!doc || i >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[i + 1])}><Plus className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" aria-label="Baixar" disabled={!blob} onClick={baixar}><Download className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" aria-label="Imprimir" className="hidden sm:inline-flex" disabled={!blob} onClick={imprimir}><Printer className="h-4 w-4" /></Button>
        </div>
      </div>
      <div ref={area} className="min-h-0 flex-1 overflow-auto overscroll-contain px-3 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" style={{ WebkitOverflowScrolling: "touch" }}>
        {erro ? <div className="mx-auto mt-16 max-w-sm rounded-lg bg-background p-4 text-center text-sm text-danger-400">{erro}</div>
          : !doc ? (
            <div className="mx-auto mt-24 flex max-w-xs flex-col items-center gap-3 text-center text-sm text-neutral-200">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--rt-gold)] motion-reduce:animate-none" />
              Montando o documento com o contrato atual… pode levar alguns segundos.
            </div>
          ) : (
            <div className="flex flex-col gap-4" style={{ width: Math.max(largura, 0), margin: "0 auto" }}>
              {Array.from({ length: doc.numPages }, (_, k) => <Pagina key={`${k}-${largura}`} doc={doc} n={k + 1} largura={largura} />)}
            </div>
          )}
      </div>
    </div>,
    document.body,
  );
}
