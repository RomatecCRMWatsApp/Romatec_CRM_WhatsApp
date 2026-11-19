import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { capaDoVideo } from "@/lib/capaVideo";

/** Vídeos do imóvel guardados em Materiais (do 2º em diante): aparecem no cartão, nos detalhes e na página pública */
export const ehVideoUrl = (m: { mime?: string | null; url: string; tipo?: string }) =>
  m.tipo === "video" || (m.mime ?? "").startsWith("video/") || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(m.url);

export function useVideosExtras(propertyId: number | null) {
  const utils = trpc.useUtils();
  const lista = trpc.materiais.list.useQuery({ propertyId }, { enabled: !!propertyId });
  const criar = trpc.materiais.create.useMutation();
  const excluir = trpc.materiais.delete.useMutation();
  const videos = (lista.data?.grupos ?? []).flatMap(g => g.itens as any[]).filter(ehVideoUrl);
  const recarregar = () => Promise.all([utils.materiais.list.invalidate(), utils.properties.list.invalidate()]);
  return {
    videos,
    adicionar: async (v: { titulo: string; url: string; mime: string; tamanhoBytes: number }) => {
      await criar.mutateAsync({ propertyId, titulo: v.titulo.slice(0, 160) || "Vídeo do imóvel", tipo: "video", url: v.url, mime: v.mime, tamanhoBytes: v.tamanhoBytes, liberado: true });
      await recarregar();
    },
    remover: async (id: number) => {
      try { await excluir.mutateAsync({ id }); await recarregar(); toast.success("Vídeo removido"); }
      catch (e: any) { toast.error(e?.message || "Não foi possível remover"); }
    },
  };
}

export function ListaVideosExtras({ videos, onRemover }: { videos: any[]; onRemover: (id: number) => void }) {
  if (!videos.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">Outros vídeos do imóvel ({videos.length})</p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {videos.map(v => (
          <li key={v.id} className="min-w-0 overflow-hidden rounded-xl border border-border/50 bg-black">
            <video preload="metadata" src={v.url} poster={capaDoVideo(v.url)} controls playsInline className="max-h-[360px] w-full object-contain" />
            <div className="flex items-center justify-between gap-2 bg-card p-2">
              <p className="min-w-0 truncate text-xs text-foreground">{v.titulo}</p>
              <button type="button" onClick={() => { if (confirm(`Remover o vídeo "${v.titulo}"?`)) onRemover(v.id); }}
                className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-danger-400 hover:bg-danger-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-danger-400">
                <Trash2 className="h-3.5 w-3.5" /> Remover
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
