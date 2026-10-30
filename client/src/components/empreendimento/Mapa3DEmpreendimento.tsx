import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Box, Map as MapIcon } from "lucide-react";
import { COR_SITUACAO, ROTULO_SITUACAO, type SituacaoLote } from "@shared/lotes";
import { webglDisponivel } from "@/components/bom-jardims/Mapa3D";
import type { LoteInfo, MapaData } from "@/components/bom-jardims/LoteMap";

const Mapa3D = lazy(() => import("@/components/bom-jardims/Mapa3D"));
type Pt = [number, number];
type Lote = { id: number; codigo: string; situacao: SituacaoLote; poligono: Pt[] | null; areaM2?: number | null; quadra?: string | null; numero?: number | null };
const CHAVE = "romatec.mapa3d";

/**
 * Mapa 3D dentro do sistema (aba do empreendimento — administrador, secretária, corretor e empreendedor): o mesmo do
 * site, com as cores da situação interna (interesse, reserva, entrada, vendido…). Bom Jardims usa o desenho completo
 * (/bom-jardims/mapa.json: ruas, córrego, APP, área de vivência); os outros, os polígonos do DXF.
 */
export function Mapa3DEmpreendimento({ slug, lotes, perimetro, selecionadoId, onSelecionar, altura = "min(70vh, 640px)" }: {
  slug: string; lotes: Lote[]; perimetro?: Pt[] | null; selecionadoId: number | null; onSelecionar: (id: number | null) => void; altura?: number | string;
}) {
  // undefined = ainda buscando o desenho completo (o mapa só abre depois, para não trocar a geometria no meio)
  const [contexto, setContexto] = useState<MapaData | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    setContexto(undefined);
    fetch(`/${slug}/mapa.json`).then(r => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? r.json() : null))
      .then(d => vivo && setContexto(d && Array.isArray(d.lotes) ? d : null)).catch(() => vivo && setContexto(null));
    return () => { vivo = false; };
  }, [slug]);
  const dados: MapaData | null = useMemo(() => {
    const comPoligono = lotes.filter(l => l.poligono && l.poligono.length >= 3);
    if (contexto) return contexto;
    if (!comPoligono.length) return null;
    const per = perimetro?.length ? perimetro : comPoligono.flatMap(l => l.poligono!);
    return { lotes: comPoligono.map(l => ({ codigo: l.codigo, quadra: l.quadra ?? "", numero: l.numero ?? 0, areaM2: l.areaM2 ?? 0, comercializavel: l.situacao !== "bloqueado", poly: l.poligono! })), ruas: [], perimetro: per, pontos: [] } as MapaData;
  }, [contexto, lotes, perimetro]);
  const porCodigo = useMemo(() => new Map(lotes.map(l => [l.codigo, l])), [lotes]);
  const info: LoteInfo[] = useMemo(() => lotes.map(l => ({ codigo: l.codigo, quadra: l.quadra ?? null, numero: l.numero ?? null, areaM2: l.areaM2 ?? null, status: "disponivel" as const })), [lotes]);
  const corDoLote = useMemo(() => (codigo: string) => { const l = porCodigo.get(codigo); return l ? COR_SITUACAO[l.situacao] ?? null : null; }, [porCodigo]);
  const usadas = Array.from(new Set(lotes.map(l => l.situacao)));
  const legenda = (Object.keys(COR_SITUACAO) as SituacaoLote[]).filter(s => usadas.includes(s)).map(s => ({ cor: COR_SITUACAO[s], rotulo: ROTULO_SITUACAO[s] }));
  const sel = lotes.find(l => l.id === selecionadoId)?.codigo;
  if (contexto === undefined) return <p className="p-4 text-sm text-muted-foreground">Carregando o mapa 3D…</p>;
  if (!dados) return <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Este empreendimento ainda não tem a geometria das chácaras (importe o DXF) para o mapa 3D.</p>;
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Carregando o mapa 3D…</p>}>
      <div className="rounded-xl bg-[#F3EEDF] p-2 text-[#23352A]">
        <Mapa3D lotes={info} dados={dados} selected={sel} corDoLote={corDoLote} legenda={legenda} semBuscador altura={altura}
          onSelect={c => onSelecionar(porCodigo.get(c)?.id ?? null)} />
      </div>
    </Suspense>
  );
}

/** "Mapa 2D | Mapa 3D" (a escolha fica guardada no aparelho); sem WebGL, só o 2D */
export function AlternadorMapa({ dois, tres }: { dois: React.ReactNode; tres: () => React.ReactNode }) {
  const pode3d = typeof window !== "undefined" && webglDisponivel();
  const [modo, setModo] = useState<"2d" | "3d">(() => { try { return (localStorage.getItem(CHAVE) as "2d" | "3d") || "2d"; } catch { return "2d"; } });
  const escolher = (m: "2d" | "3d") => { setModo(m); try { localStorage.setItem(CHAVE, m); } catch { /* sem armazenamento */ } };
  const botao = (ativo: boolean) => `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${ativo ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`;
  return (
    <div className="space-y-2">
      {pode3d && (
        <div className="flex gap-1.5">
          <button type="button" className={botao(modo === "2d")} onClick={() => escolher("2d")}><MapIcon className="h-3.5 w-3.5" /> Mapa 2D</button>
          <button type="button" className={botao(modo === "3d")} onClick={() => escolher("3d")}><Box className="h-3.5 w-3.5" /> Mapa 3D</button>
        </div>
      )}
      {pode3d && modo === "3d" ? tres() : dois}
    </div>
  );
}
