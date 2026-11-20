import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Resposta do servidor para entrar numa sala (server/salaVideo.ts → Entrada). */
export interface EntradaSala {
  modo: "embutido" | "aba";
  dominio?: string;
  sala?: string;
  jwt?: string;
  script?: string;
  url?: string;
  nome: string;
}

const scripts = new Map<string, Promise<void>>();
function carregarScript(src: string): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((ok, erro) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => { scripts.delete(src); erro(new Error("Não consegui carregar a videochamada")); };
      document.head.appendChild(s);
    });
    scripts.set(src, p);
  }
  return p;
}

interface ApiJitsi { dispose(): void; addListener(ev: string, f: (...a: unknown[]) => void): void }
type Construtor = new (dominio: string, opcoes: Record<string, unknown>) => ApiJitsi;

/**
 * A videochamada. Modo "embutido": o Jitsi roda aqui dentro (câmera, microfone, chat, tela, mão levantada).
 * Modo "aba": o Jitsi público não deixa embutir; mostra o botão que abre a chamada numa aba nova.
 */
export default function ChamadaJitsi({ entrada, onSair, altura = "calc(100dvh - 220px)" }: { entrada: EntradaSala; onSair?: () => void; altura?: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(entrada.modo === "embutido");

  useEffect(() => {
    if (entrada.modo !== "embutido" || !entrada.script || !entrada.dominio || !caixa.current) return;
    let api: ApiJitsi | null = null;
    let vivo = true;
    carregarScript(entrada.script).then(() => {
      if (!vivo || !caixa.current) return;
      const Api = (window as unknown as { JitsiMeetExternalAPI: Construtor }).JitsiMeetExternalAPI;
      api = new Api(entrada.dominio!, {
        roomName: entrada.sala,
        jwt: entrada.jwt,
        parentNode: caixa.current,
        width: "100%",
        height: "100%",
        lang: "ptBR",
        userInfo: { displayName: entrada.nome },
        configOverwrite: {
          prejoinConfig: { enabled: true },
          // no celular, não oferece "baixar o app": a chamada fica no navegador
          disableDeepLinking: true,
          defaultLanguage: "ptBR",
        },
      });
      api.addListener("videoConferenceJoined", () => vivo && setCarregando(false));
      api.addListener("readyToClose", () => onSair?.());
      setTimeout(() => vivo && setCarregando(false), 4000);
    }).catch(e => { if (vivo) { setErro((e as Error).message); setCarregando(false); } });
    return () => { vivo = false; api?.dispose(); };
  }, [entrada]); // eslint-disable-line react-hooks/exhaustive-deps

  if (entrada.modo === "aba") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card p-8 text-center">
        <Video className="h-10 w-10 text-[var(--rt-gold-light)]" aria-hidden />
        <p className="max-w-md text-sm text-muted-foreground">A chamada abre no Jitsi, numa aba do navegador. No primeiro acesso, quem cria a sala entra com a conta Google para liberar a reunião.</p>
        <Button size="lg" onClick={() => window.open(entrada.url, "_blank", "noopener")}><ExternalLink className="mr-2 h-4 w-4" aria-hidden />Entrar na videochamada</Button>
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-black" style={{ height: altura, minHeight: 420 }}>
      <div ref={caixa} className="h-full w-full" />
      {carregando && <div className="absolute inset-0 flex items-center justify-center gap-2 text-white/80"><Loader2 className="h-5 w-5 animate-spin" aria-hidden />Abrindo a sala…</div>}
      {erro && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-white">{erro}</div>}
    </div>
  );
}
