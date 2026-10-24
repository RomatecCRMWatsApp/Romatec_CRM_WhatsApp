import { useEffect, useState } from "react";
import { useGlobalLoading } from "../loadingBus";
import { RomatecLoader } from "./RomatecLoader";

/** Liga `true` só depois de `delay` ms contínuos de `active` (evita piscar em respostas rápidas). */
export function useDelayedFlag(active: boolean, delay: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) {
      setOn(false);
      return;
    }
    const t = window.setTimeout(() => setOn(true), delay);
    return () => window.clearTimeout(t);
  }, [active, delay]);
  return on;
}

export function TopProgressBar({ active }: { active: boolean }) {
  return (
    <div className="rt-progress" data-active={active} aria-hidden="true">
      {active && <div className="rt-progress__bar" />}
    </div>
  );
}

export interface PageLoaderProps {
  /** força o estado; se omitido usa o loadingBus global */
  active?: boolean;
  /** ms até abrir o overlay central (padrão 400) */
  overlayDelay?: number;
  label?: string;
}

/**
 * Montar UMA vez no layout raiz. Barra no topo aparece imediatamente;
 * overlay com o loader oficial abre se a espera passar de 400 ms.
 */
export function PageLoader({ active, overlayDelay = 400, label = "Carregando" }: PageLoaderProps) {
  const busGlobal = useGlobalLoading();
  const isActive = active ?? busGlobal;
  const showOverlay = useDelayedFlag(isActive, overlayDelay);
  return (
    <>
      <TopProgressBar active={isActive} />
      {showOverlay && (
        <div className="rt-overlay">
          <RomatecLoader size={240} label={label} />
        </div>
      )}
    </>
  );
}
