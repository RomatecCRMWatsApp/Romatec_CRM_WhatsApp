import { useLocation } from "wouter";
import { ArrowLeft, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VisaoComo } from "@/lib/visaoComo";
import PainelCorretor from "./PainelCorretor";

/**
 * Visão do corretor (administrador e secretária): o Painel do corretor como ele aparece para o corretor — mapa,
 * atalhos e o painel da chácara só leitura. Os empreendimentos mostrados são os que o escritório acessa.
 */
export default function VisaoCorretor() {
  const [, navigate] = useLocation();
  return (
    <div>
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2 px-3 pt-3 sm:px-4 md:px-6">
        <Button size="sm" variant="outline" onClick={() => navigate("/dashboard")}><ArrowLeft className="mr-1 h-4 w-4" /> Voltar ao CRM</Button>
        <p className="flex items-center gap-1.5 rounded-full bg-[var(--rt-gold)]/15 px-3 py-1 text-xs text-[var(--rt-gold-light,#E2C877)]">
          <Eye className="h-3.5 w-3.5" /> Visão do corretor: é assim que o corretor vê a página inicial. O corretor só vê os empreendimentos liberados para ele.
        </p>
      </div>
      <VisaoComo.Provider value="corretor">
        <PainelCorretor />
      </VisaoComo.Provider>
    </div>
  );
}
