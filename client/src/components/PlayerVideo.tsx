/**
 * Play dos vídeos da galeria (Materiais e portal do empreendedor): a miniatura ganha um botão de play e o vídeo
 * abre numa janela dentro do sistema, sem baixar. Usa o player do próprio navegador (nada de biblioteca nova) e
 * só começa a carregar quando a pessoa aperta o play; no Cloudinary vem com qualidade automática (mais leve).
 */
import { useState, type ReactNode } from "react";
import { Play } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { capaDoVideo, enderecoParaAssistir } from "@/lib/capaVideo";


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
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/65 ring-2 ring-white/80 transition-colors group-hover:bg-ok-600 group-active:bg-ok-700">
            <Play className="ml-1 h-7 w-7 fill-white text-white" />
          </span>
        </span>
        {children}
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="w-[min(96vw,960px)] max-w-none gap-2 border-border bg-black p-2 sm:p-3 [&_[data-slot=dialog-close]]:top-2 [&_[data-slot=dialog-close]]:right-2 [&_[data-slot=dialog-close]]:bg-transparent [&_[data-slot=dialog-close]]:p-1.5 [&_[data-slot=dialog-close]]:text-white [&_[data-slot=dialog-close]_svg]:size-6">
          <DialogTitle className="pr-8 text-sm font-medium text-white">{titulo}</DialogTitle>
          <DialogDescription className="sr-only">Vídeo da galeria de materiais</DialogDescription>
          {aberto && (
            <video src={enderecoParaAssistir(url)} poster={capa} controls autoPlay playsInline preload="auto"
              className="max-h-[78vh] w-full rounded-md bg-black object-contain">
              Seu navegador não toca este vídeo. Use o botão Baixar.
            </video>
          )}
          {rodape && <div className="text-[11px] text-white/70">{rodape}</div>}
        </DialogContent>
      </Dialog>
    </>
  );
}
