import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Images } from "lucide-react";
import MateriaisPainel from "@/components/MateriaisPainel";
import PageHeader from "@/components/PageHeader";

export default function Materiais() {
  const [, navigate] = useLocation();
  return (
    <div>
      <PageHeader icone={Images} titulo="Materiais de divulgação" subtitulo="Artes, vídeos, folders e mapas de cada imóvel e empreendimento — veja, baixe e envie" />
      <div className="px-4 md:px-6 pb-6 max-w-[1500px] mx-auto">
        <MateriaisPainel />
      </div>
    </div>
  );
}
