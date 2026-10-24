import { useEffect, useState } from "react";
import { RomatecLoader } from "./RomatecLoader";
import { RomatecLockup } from "./RomatecLockup";

export interface SplashScreenProps {
  /** true quando sessão/dados iniciais carregaram */
  ready: boolean;
  version: string;
  /** tempo mínimo em tela (ms) para a animação não "piscar". Padrão 900 */
  minDuration?: number;
  message?: string;
}

/** Splash do app/PWA: loader oficial + lockup empilhado. Some com fade quando `ready` e o mínimo passou. */
export function SplashScreen({ ready, version, minDuration = 900, message = "Sincronizando leads e WhatsApp…" }: SplashScreenProps) {
  const [minDone, setMinDone] = useState(false);
  const [gone, setGone] = useState(false);
  const leaving = ready && minDone;

  useEffect(() => {
    const t = window.setTimeout(() => setMinDone(true), minDuration);
    return () => window.clearTimeout(t);
  }, [minDuration]);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setGone(true), 380);
    return () => window.clearTimeout(t);
  }, [leaving]);

  if (gone) return null;
  return (
    <div className="rt-splash" data-leaving={leaving} aria-busy={!leaving}>
      <RomatecLoader size={260} label={null} />
      <RomatecLockup variant="stack" height={96} />
      <span style={{ fontSize: 13, color: "var(--rt-text-3)" }}>{message}</span>
      <div className="rt-splash__foot">
        v{version} · Açailândia — MA<br />Romatec Consultoria Total · CNPJ 17.261.987/0001-09
      </div>
    </div>
  );
}
