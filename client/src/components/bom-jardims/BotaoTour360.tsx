import { useState } from "react";
import { Rotate3d } from "lucide-react";
import { C } from "./marca";
import { Visualizador360, useTours } from "@/components/Tour360";

/** "Ver em 360°" nas páginas públicas do Bom Jardims — só aparece quando há foto 360 cadastrada */
export default function BotaoTour360({ lote, rotulo }: { lote?: string | null; rotulo?: string }) {
  const tours = useTours("bom-jardims", lote);
  const [aberto, setAberto] = useState(false);
  if (!tours.length) return null;
  const temDaChacara = !!lote && tours.some(t => t.loteCodigo === lote);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)}
        style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 18px", borderRadius: 12, border: `2px solid ${C.dourado}`, background: C.verde, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
        <Rotate3d size={20} /> {rotulo ?? (temDaChacara ? `Ver a chácara ${lote} em 360°` : "Tour 360° do condomínio")}
      </button>
      {aberto && <Visualizador360 tours={tours} onFechar={() => setAberto(false)} />}
    </>
  );
}
