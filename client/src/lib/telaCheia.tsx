import { useCallback, useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";

/**
 * Tela cheia dos mapas (computador e celular): o quadro do mapa cobre a tela toda, acima do cabeçalho e da barra
 * de baixo. Onde o navegador deixa (computador, Android), também some com as barras do navegador; no iPhone
 * (o Safari não põe um pedaço da página em tela cheia) fica só a cobertura da tela, que já ocupa tudo.
 * A tela cheia nativa é a da página inteira (não a do mapa), para os avisos e janelas do sistema continuarem aparecendo.
 * Sai pelo botão, pelo Esc ou pelo "voltar" do navegador em tela cheia.
 */
export const Z_TELA_CHEIA = 55; // acima da barra de baixo (z-50) e abaixo da gaveta do menu (z-60)

export const estiloTelaCheia: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: Z_TELA_CHEIA, width: "100vw", height: "100dvh", minHeight: 0,
  borderRadius: 0, border: "none", margin: 0,
  paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)", boxSizing: "border-box",
};

export function useTelaCheia(): { cheia: boolean; alternar: () => void; sair: () => void } {
  const [cheia, setCheia] = useState(false);

  const sair = useCallback(() => {
    setCheia(false);
    if (typeof document !== "undefined" && document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
  }, []);

  const entrar = useCallback(() => {
    setCheia(true);
    const raiz = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      if (raiz.requestFullscreen) raiz.requestFullscreen({ navigationUI: "hide" }).catch(() => undefined);
      else raiz.webkitRequestFullscreen?.();
    } catch { /* o navegador recusou: fica a cobertura da tela */ }
  }, []);

  const alternar = useCallback(() => (cheia ? sair() : entrar()), [cheia, entrar, sair]);

  useEffect(() => {
    if (!cheia) return;
    // Esc (na cobertura) e a saída da tela cheia nativa pelo próprio navegador também fecham
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") sair(); };
    let estavaNativa = !!document.fullscreenElement;
    const mudou = () => {
      if (document.fullscreenElement) { estavaNativa = true; return; }
      if (estavaNativa) setCheia(false);
    };
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", tecla);
    document.addEventListener("fullscreenchange", mudou);
    return () => {
      document.body.style.overflow = rolagem;
      window.removeEventListener("keydown", tecla);
      document.removeEventListener("fullscreenchange", mudou);
    };
  }, [cheia, sair]);

  // Saiu da tela (trocou de aba/página) com a tela cheia ligada: devolve a página ao normal
  useEffect(() => () => { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined); }, []);

  return { cheia, alternar, sair };
}

export function BotaoTelaCheia({ cheia, onClick, estilo }: { cheia: boolean; onClick: () => void; estilo?: React.CSSProperties }) {
  const rotulo = cheia ? "Sair da tela cheia" : "Ver o mapa em tela cheia";
  return (
    <button type="button" onClick={onClick} aria-label={rotulo} title={cheia ? "Sair da tela cheia (Esc)" : "Tela cheia"} aria-pressed={cheia}
      onPointerDown={e => e.stopPropagation()}
      style={{
        width: 40, height: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0,
        borderRadius: 10, border: "1px solid var(--c-cfd8bf)", cursor: "pointer",
        background: cheia ? "var(--c-0c3320)" : "var(--c-ffffff)", color: cheia ? "var(--c-ffffff)" : "var(--c-0c3320)",
        boxShadow: "0 2px 8px color-mix(in srgb, var(--c-000000) 18%, transparent)", ...estilo,
      }}>
      {cheia ? <Minimize size={18} /> : <Maximize size={18} />}
    </button>
  );
}
