import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Box, ChevronRight, Images } from "lucide-react";
import MateriaisPainel from "@/components/MateriaisPainel";
import LinkMateriaisParceiros from "@/components/LinkMateriaisParceiros";
import PageHeader from "@/components/PageHeader";

export default function Materiais() {
  const [, navigate] = useLocation();
  return (
    <div>
      <PageHeader icone={Images} titulo="Materiais de divulgação" subtitulo="Artes, vídeos, folders e mapas de cada imóvel e empreendimento — veja, baixe e envie" />
      <div className="px-4 md:px-6 pb-6 max-w-[1500px] mx-auto">
        <button
          type="button"
          onClick={() => navigate("/materiais/tour-3d")}
          className="mb-4 flex w-full items-center gap-3 rounded-xl border border-[var(--rt-gold)]/40 bg-[var(--rt-gold)]/10 p-4 text-left transition-colors hover:bg-[var(--rt-gold)]/15 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Box className="h-8 w-8 shrink-0 text-[var(--rt-gold-light)]" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-foreground">Tour 3D a partir de fotos</span>
            <span className="block text-sm text-muted-foreground">Tire ou escolha fotos do imóvel e gere um vídeo com movimento 3D para reels, status e apresentação ao cliente.</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
        <LinkMateriaisParceiros />
        <MateriaisPainel />
      </div>
    </div>
  );
}
