/**
 * Play dos vídeos da galeria (Materiais e portal do empreendedor): a miniatura ganha um botão de play e o vídeo
 * abre numa janela dentro do sistema, sem baixar, num player com a marca Romatec CRM (play, voltar/avançar 10 s,
 * barra de tempo, volume e tela cheia). Sem biblioteca nova: o vídeo é o do navegador e só carrega no play;
 * no Cloudinary vem com qualidade automática (mais leve).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { capaDoVideo, enderecoParaAssistir } from "@/lib/capaVideo";

const SALTO_S = 10;
const OCULTAR_CONTROLES_MS = 2500;

const relogio = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
};

type Props = {
  url: string;
  titulo: string;
  empreendimentoSlug?: string | null;
  /** Aviso embaixo do player (ex.: o arquivo baixado sai com o seu carimbo) */
  rodape?: ReactNode;
  /** Classes da área da miniatura (mesmo tamanho do card) */
  className?: string;
  /** Selos sobre a miniatura (ex.: "Não divulgar") */
  children?: ReactNode;
};

export default function PlayerVideo({ url, titulo, empreendimentoSlug, rodape, className, children }: Props) {
  const [aberto, setAberto] = useState(false);
  const capa = capaDoVideo(url, empreendimentoSlug);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} aria-label={`Assistir ${titulo}`}
        className={`group relative block w-full overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rt-gold)] ${className ?? ""}`}>
        <video src={url} poster={capa} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true" className="pointer-events-none h-full w-full object-contain" />
        <span aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/70 ring-2 ring-[var(--rt-gold)] transition-colors group-hover:bg-[var(--rt-gold)] group-active:bg-[var(--rt-gold-dark)]">
            <Play className="ml-1 h-7 w-7 fill-white text-white" />
          </span>
          <span className="rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">Assistir</span>
        </span>
        {children}
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent showCloseButton={false} className="w-[min(96vw,960px)] max-w-none gap-2 border-[var(--rt-border)] bg-black p-2 sm:p-3">
          <div className="flex items-center gap-2">
            <DialogTitle className="min-w-0 flex-1 truncate text-sm font-medium text-white">{titulo}</DialogTitle>
            <button type="button" onClick={() => setAberto(false)} className="rounded-md px-2 py-1 text-xs text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-[var(--rt-gold)]">Fechar</button>
          </div>
          <DialogDescription className="sr-only">Vídeo da galeria de materiais, com controles de play, volume, avanço e tela cheia</DialogDescription>
          {aberto && <Reprodutor url={enderecoParaAssistir(url)} capa={capa} />}
          {rodape && <div className="text-[11px] text-white/70">{rodape}</div>}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** O player em si: controles próprios nas cores da Romatec, com o logo do CRM no canto */
function Reprodutor({ url, capa }: { url: string; capa?: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [tocando, setTocando] = useState(false);
  const [tempo, setTempo] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [volume, setVolume] = useState(1);
  const [mudo, setMudo] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);
  const [controles, setControles] = useState(true);
  const [erro, setErro] = useState(false);
  const timer = useRef<number | null>(null);

  const mostrarControles = () => {
    setControles(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { if (!video.current?.paused) setControles(false); }, OCULTAR_CONTROLES_MS);
  };

  useEffect(() => {
    const aoMudarTela = () => setTelaCheia(document.fullscreenElement === caixa.current);
    document.addEventListener("fullscreenchange", aoMudarTela);
    return () => {
      document.removeEventListener("fullscreenchange", aoMudarTela);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const alternar = () => {
    const v = video.current; if (!v) return;
    if (v.paused) v.play().catch(() => setErro(true)); else v.pause();
    mostrarControles();
  };
  const pular = (s: number) => {
    const v = video.current; if (!v) return;
    v.currentTime = Math.min(Math.max(0, v.currentTime + s), v.duration || v.currentTime + s);
    mostrarControles();
  };
  const mudarVolume = (n: number) => {
    const v = video.current; if (!v) return;
    v.volume = n; v.muted = n === 0; setVolume(n); setMudo(n === 0);
  };
  const alternarMudo = () => {
    const v = video.current; if (!v) return;
    v.muted = !v.muted; setMudo(v.muted);
    if (!v.muted && v.volume === 0) mudarVolume(1);
  };
  const alternarTelaCheia = async () => {
    const c = caixa.current, v = video.current as any; if (!c) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (c.requestFullscreen) await c.requestFullscreen();
      else v?.webkitEnterFullscreen?.(); // iPhone: tela cheia só no vídeo
    } catch { v?.webkitEnterFullscreen?.(); }
  };
  const teclas = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === " " || e.key === "k") { e.preventDefault(); alternar(); }
    else if (e.key === "ArrowRight" || e.key === "l") { e.preventDefault(); pular(SALTO_S); }
    else if (e.key === "ArrowLeft" || e.key === "j") { e.preventDefault(); pular(-SALTO_S); }
    else if (e.key === "m") alternarMudo();
    else if (e.key === "f") alternarTelaCheia();
  };

  const pct = duracao ? (tempo / duracao) * 100 : 0;
  const botao = "flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/15 active:bg-white/25 focus-visible:outline-2 focus-visible:outline-[var(--rt-gold)]";

  return (
    <div ref={caixa} tabIndex={0} onKeyDown={teclas} onPointerMove={mostrarControles} onPointerDown={mostrarControles}
      className={`relative flex items-center justify-center overflow-hidden rounded-md bg-black outline-none ${telaCheia ? "h-full w-full" : ""}`}>
      <video ref={video} src={url} poster={capa} autoPlay playsInline preload="auto" onClick={alternar}
        onPlay={() => { setTocando(true); mostrarControles(); }} onPause={() => { setTocando(false); setControles(true); }}
        onTimeUpdate={e => setTempo(e.currentTarget.currentTime)} onLoadedMetadata={e => setDuracao(e.currentTarget.duration)}
        onDurationChange={e => setDuracao(e.currentTarget.duration)} onError={() => setErro(true)}
        className={`w-full bg-black object-contain ${telaCheia ? "h-full" : "max-h-[74vh]"}`} />

      <img src="/brand/selo-crm.png" alt="Romatec CRM" width={64} height={64}
        className="pointer-events-none absolute right-3 top-3 h-12 w-12 rounded-full opacity-90 shadow-md sm:h-16 sm:w-16" />

      {!tocando && !erro && (
        <button type="button" onClick={alternar} aria-label="Tocar"
          className="absolute inset-0 m-auto flex h-16 w-16 items-center justify-center rounded-full bg-black/70 ring-2 ring-[var(--rt-gold)] hover:bg-[var(--rt-gold)] active:bg-[var(--rt-gold-dark)]">
          <Play className="ml-1 h-8 w-8 fill-white text-white" />
        </button>
      )}
      {erro && <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md bg-black/80 p-3 text-center text-sm text-white">Este vídeo não abriu aqui. Use o botão Baixar no card.</p>}

      <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-2 pt-8 transition-opacity ${controles || !tocando ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <input type="range" min={0} max={duracao || 0} step={0.1} value={tempo} aria-label="Posição do vídeo"
          onChange={e => { const v = video.current; if (v) v.currentTime = Number(e.target.value); setTempo(Number(e.target.value)); }}
          style={{ background: `linear-gradient(to right, var(--rt-gold) ${pct}%, color-mix(in srgb, white 25%, transparent) ${pct}%)` }}
          className="rt-range w-full" />
        <div className="mt-1 flex items-center gap-1">
          <button type="button" onClick={alternar} aria-label={tocando ? "Pausar" : "Tocar"} className={botao}>
            {tocando ? <Pause className="h-5 w-5 fill-white" /> : <Play className="ml-0.5 h-5 w-5 fill-white" />}
          </button>
          <button type="button" onClick={() => pular(-SALTO_S)} aria-label={`Voltar ${SALTO_S} segundos`} className={botao}><RotateCcw className="h-5 w-5" /></button>
          <button type="button" onClick={() => pular(SALTO_S)} aria-label={`Avançar ${SALTO_S} segundos`} className={botao}><RotateCw className="h-5 w-5" /></button>
          <span className="ml-1 whitespace-nowrap text-xs tabular-nums text-white/85">{relogio(tempo)} / {relogio(duracao)}</span>
          <span className="flex-1" />
          <button type="button" onClick={alternarMudo} aria-label={mudo ? "Ligar o som" : "Tirar o som"} className={botao}>
            {mudo || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={mudo ? 0 : volume} aria-label="Volume"
            onChange={e => mudarVolume(Number(e.target.value))}
            style={{ background: `linear-gradient(to right, var(--rt-gold) ${(mudo ? 0 : volume) * 100}%, color-mix(in srgb, white 25%, transparent) ${(mudo ? 0 : volume) * 100}%)` }}
            className="rt-range w-14 sm:w-20" />
          <button type="button" onClick={alternarTelaCheia} aria-label={telaCheia ? "Sair da tela cheia" : "Tela cheia"} className={botao}>
            {telaCheia ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
