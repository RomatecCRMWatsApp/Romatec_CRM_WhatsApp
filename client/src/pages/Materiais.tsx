import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Images } from "lucide-react";
import MateriaisPainel from "@/components/MateriaisPainel";

export default function Materiais() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 text-white">
        <div className="container py-4 flex items-center gap-3">
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/15" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2"><Images className="h-5 w-5" /> Materiais de divulgação</h1>
            <p className="text-xs text-white/70">Artes, vídeos, folders e mapas de cada imóvel e empreendimento — veja, baixe e envie</p>
          </div>
        </div>
      </div>
      <div className="container py-6">
        <MateriaisPainel />
      </div>
    </div>
  );
}
