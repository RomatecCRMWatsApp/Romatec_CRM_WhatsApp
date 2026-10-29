import { useEffect, useRef, useState } from "react";
import { Loader2, Rotate3d, X } from "lucide-react";

export interface Tour { id: number; titulo: string; loteCodigo: string | null; url: string }

/**
 * Visualizador 360° (pannellum, carregado só quando abre): arraste para olhar em volta, pinça/rolagem para zoom.
 * Com várias fotos, as miniaturas embaixo trocam de ponto.
 */
export function Visualizador360({ tours, inicial = 0, onFechar }: { tours: Tour[]; inicial?: number; onFechar: () => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  const viewer = useRef<any>(null);
  const [i, setI] = useState(inicial);
  const [carregando, setCarregando] = useState(true);
  useEffect(() => {
    let vivo = true;
    (async () => {
      setCarregando(true);
      await import("pannellum/build/pannellum.css");
      await import("pannellum/build/pannellum.js");
      if (!vivo || !caixa.current) return;
      viewer.current?.destroy?.();
      viewer.current = (window as any).pannellum.viewer(caixa.current, {
        type: "equirectangular", panorama: tours[i].url, autoLoad: true, autoRotate: -2, showControls: true, compass: false,
        hfov: 100, strings: { loadingLabel: "Carregando…", loadButtonLabel: "Toque para ver em 360°" },
      });
      viewer.current.on("load", () => vivo && setCarregando(false));
      viewer.current.on("error", () => vivo && setCarregando(false));
    })().catch(() => setCarregando(false));
    return () => { vivo = false; viewer.current?.destroy?.(); viewer.current = null; };
  }, [i, tours]);
  useEffect(() => { const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar(); window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [onFechar]);
  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black/95" role="dialog" aria-label="Tour 360°">
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-white">
        <p className="flex items-center gap-2 text-sm font-semibold"><Rotate3d className="h-5 w-5" /> {tours[i]?.titulo}{tours[i]?.loteCodigo ? ` · Chácara ${tours[i].loteCodigo}` : ""}</p>
        <button onClick={onFechar} aria-label="Fechar" className="rounded-full p-2 hover:bg-white/10"><X className="h-6 w-6" /></button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={caixa} className="h-full w-full" />
        {carregando && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white"><Loader2 className="h-8 w-8 animate-spin" /></div>}
      </div>
      {tours.length > 1 && (
        <div className="flex gap-2 overflow-x-auto p-2">
          {tours.map((t, k) => (
            <button key={t.id} onClick={() => setI(k)} className={`shrink-0 overflow-hidden rounded-lg border-2 ${k === i ? "border-amber-400" : "border-transparent opacity-70"}`}>
              <div className="h-14 w-28 bg-cover bg-center" style={{ backgroundImage: `url(${t.url})` }} />
              <p className="w-28 truncate bg-black/60 px-1 text-[10px] text-white">{t.titulo}</p>
            </button>
          ))}
        </div>
      )}
      <p className="pb-2 text-center text-[11px] text-white/60">Arraste para olhar em volta · pinça ou rolagem para aproximar</p>
    </div>
  );
}

/** Busca os tours (públicos) do empreendimento/chácara */
export function useTours(slug: string, lote?: string | null) {
  const [tours, setTours] = useState<Tour[]>([]);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/public/tour360?emp=${encodeURIComponent(slug)}${lote ? `&lote=${encodeURIComponent(lote)}` : ""}`)
      .then(r => (r.ok ? r.json() : { tours: [] })).then(j => vivo && setTours(j.tours ?? [])).catch(() => {});
    return () => { vivo = false; };
  }, [slug, lote]);
  return tours;
}
