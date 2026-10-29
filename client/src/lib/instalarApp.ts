import { useEffect, useState } from "react";

/**
 * Instalação do app (PWA): no Android/computador o navegador avisa que dá para instalar (beforeinstallprompt) e o
 * botão abre a janela nativa; no iPhone/iPad não existe esse aviso — mostramos o passo a passo (Compartilhar ›
 * Adicionar à Tela de Início). Já instalado (modo standalone), nada aparece.
 */
let promptGuardado: any = null;
const ouvintes = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: any) => { e.preventDefault(); promptGuardado = e; ouvintes.forEach(f => f()); });
  window.addEventListener("appinstalled", () => { promptGuardado = null; ouvintes.forEach(f => f()); });
}

export const appInstalado = () => typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true);
export const ehIOS = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;

export function useInstalarApp() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick(x => x + 1); ouvintes.add(f); return () => { ouvintes.delete(f); }; }, []);
  const instalado = appInstalado();
  return {
    instalado,
    podeInstalar: !instalado && !!promptGuardado,
    ios: !instalado && ehIOS(),
    async instalar(): Promise<boolean> {
      if (!promptGuardado) return false;
      promptGuardado.prompt();
      const r = await promptGuardado.userChoice.catch(() => null);
      promptGuardado = null;
      ouvintes.forEach(f => f());
      return r?.outcome === "accepted";
    },
  };
}
