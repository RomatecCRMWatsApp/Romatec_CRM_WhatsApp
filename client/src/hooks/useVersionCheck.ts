import { useCallback, useEffect, useState } from "react";
import { APP_VERSION } from "@/brand";
import { compararVersao } from "@shared/releases";

const INTERVALO = 5 * 60_000;

/**
 * Versão nova no ar? Consulta /api/system/version a cada 5 min e ao voltar para a aba/app.
 * `atualizar` limpa o cache do service worker e recarrega.
 */
export function useVersionCheck(ativo = true) {
  const [nova, setNova] = useState<{ versao: string; obrigatoria: boolean } | null>(null);

  const checar = useCallback(async () => {
    try {
      const r = await fetch("/api/system/version", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      if (j?.versao && APP_VERSION && compararVersao(j.versao, APP_VERSION) > 0) setNova({ versao: j.versao, obrigatoria: !!j.obrigatoria });
    } catch { /* offline: tenta no próximo ciclo */ }
  }, []);

  useEffect(() => {
    if (!ativo) return;
    checar();
    const t = setInterval(checar, INTERVALO);
    const aoVoltar = () => document.visibilityState === "visible" && checar();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", checar);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", aoVoltar); window.removeEventListener("focus", checar); };
  }, [ativo, checar]);

  const atualizar = useCallback(async () => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.update().catch(() => undefined)));
      }
      if ("caches" in window) {
        const chaves = await caches.keys();
        await Promise.all(chaves.map(k => caches.delete(k)));
      }
    } finally {
      window.location.reload();
    }
  }, []);

  return { nova, atualizar };
}
