/**
 * Carrossel das fotos de Materiais (tela cheia, no celular e no computador).
 *  - Arrastar para o lado: foto anterior / próxima.
 *  - Arrastar para CIMA: baixa a foto, já com os dados de quem divulga (no iPhone abre o "Salvar imagem" da galeria).
 *  - Arrastar para BAIXO: envia pelo WhatsApp (arquivo com o carimbo + texto com o link do corretor).
 * Os mesmos comandos ficam em botões e no teclado (setas, B baixa, W envia, Esc fecha).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Loader2, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { legendaDoMaterial, linkDoMaterial } from "@/lib/materialDoCorretor";
import { FORMATOS_DOWNLOAD, ROTULO_FORMATO, type FormatoDownload } from "@shared/materiais";
import { acaoDoGesto, type AcaoGesto } from "@/lib/gestoCarrossel";
import { arquivoDoCorretor, type Cartao, type Grupo } from "./MateriaisPainel";

const ehIos = () => typeof navigator !== "undefined" && (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
const ehCelular = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

/** Fullsize leve para olhar a foto (o arquivo baixado/enviado é o do servidor, com o carimbo) */
const fotoGrande = (url: string) => url.includes("/image/upload/") ? url.replace("/image/upload/", "/image/upload/c_limit,w_1440,q_auto,f_auto/") : url;

function baixarArquivo(blob: Blob, nome: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

type Props = {
  aberto: boolean;
  onFechar: () => void;
  itens: any[];
  indiceInicial: number;
  grupo: Grupo;
  cartao: Cartao;
  assinatura?: string;
};

export default function CarrosselFotos({ aberto, onFechar, itens, indiceInicial, grupo, cartao, assinatura }: Props) {
  const [i, setI] = useState(indiceInicial);
  useEffect(() => { if (aberto) setI(indiceInicial); }, [aberto, indiceInicial]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [pronto, setPronto] = useState<{ arquivo: File; texto: string; titulo: string } | null>(null);
  const [formato, setFormatoEstado] = useState<FormatoDownload>(() => {
    try { const v = localStorage.getItem("materiais_formato"); return (FORMATOS_DOWNLOAD as readonly string[]).includes(v ?? "") ? (v as FormatoDownload) : "original"; } catch { return "original"; }
  });
  const setFormato = (f: FormatoDownload) => { setFormatoEstado(f); try { localStorage.setItem("materiais_formato", f); } catch { /* sem armazenamento */ } };
  // Arraste em andamento
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const [arraste, setArraste] = useState({ dx: 0, dy: 0 });

  const m = itens[i];
  const total = itens.length;
  const ir = useCallback((d: number) => { setPronto(null); setI(v => Math.min(Math.max(0, v + d), total - 1)); }, [total]);

  const preparar = async () => {
    setOcupado("Colocando os seus dados na foto…");
    try { return await arquivoDoCorretor(m, cartao, linkDoMaterial(grupo, cartao.ref), formato, setOcupado); }
    finally { setOcupado(null); }
  };

  const baixar = async () => {
    if (!m || ocupado) return;
    try {
      const a = await preparar();
      const arquivo = new File([a.blob], a.nome, { type: a.blob.type || m.mime || "image/jpeg" });
      // iPhone: o download vai para "Arquivos"; o compartilhar abre "Salvar imagem", que guarda na galeria (Fotos)
      if (ehIos() && (navigator as any).canShare?.({ files: [arquivo] })) {
        try { await navigator.share({ files: [arquivo], title: m.titulo }); toast.success("Toque em “Salvar imagem” para guardar na galeria."); return; }
        catch (e: any) {
          if (e?.name === "AbortError") return;
          if (e?.name !== "NotAllowedError") throw e;
        }
      }
      baixarArquivo(a.blob, a.nome);
      toast.success("Foto baixada com os seus dados.");
    } catch (e: any) { toast.error(e?.message || "Não foi possível baixar"); }
  };

  const enviar = async () => {
    if (!m || ocupado) return;
    if (!m.liberado) { toast.error("Esta peça está bloqueada para divulgação."); return; }
    const texto = legendaDoMaterial(m.titulo, linkDoMaterial(grupo, cartao.ref), cartao, assinatura);
    try {
      const a = await preparar();
      try { await navigator.clipboard.writeText(texto); } catch { /* sem área de transferência */ }
      const arquivo = new File([a.blob], a.nome, { type: a.blob.type || m.mime || "image/jpeg" });
      if ((navigator as any).canShare?.({ files: [arquivo] })) {
        try { await navigator.share({ files: [arquivo], text: texto, title: m.titulo }); return; }
        catch (e: any) {
          if (e?.name === "AbortError") return;
          // A foto demorou para ficar pronta: o celular pede um toque novo para abrir o compartilhamento
          if (e?.name === "NotAllowedError") { setPronto({ arquivo, texto, titulo: m.titulo }); return; }
          throw e;
        }
      }
      // Computador: baixa a foto e abre o WhatsApp com o texto e o link; é só anexar a foto baixada
      baixarArquivo(a.blob, a.nome);
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
      toast.success("Foto baixada e WhatsApp aberto com o seu texto e link: anexe a foto na conversa.");
    } catch (e: any) { toast.error(e?.message || "Não foi possível enviar"); }
  };

  const enviarPronto = async () => {
    if (!pronto) return;
    try { await navigator.share({ files: [pronto.arquivo], text: pronto.texto, title: pronto.titulo }); setPronto(null); }
    catch (e: any) { if (e?.name !== "AbortError") toast.error("Não foi possível compartilhar"); }
  };

  const executar = (acao: AcaoGesto) => {
    if (acao === "anterior") ir(-1);
    else if (acao === "proxima") ir(1);
    else if (acao === "baixar") baixar();
    else if (acao === "enviar") enviar();
  };

  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "SELECT") return;
      if (e.key === "ArrowLeft") ir(-1);
      else if (e.key === "ArrowRight") ir(1);
      else if (e.key === "ArrowUp" || e.key.toLowerCase() === "b") { e.preventDefault(); baixar(); }
      else if (e.key === "ArrowDown" || e.key.toLowerCase() === "w") { e.preventDefault(); enviar(); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const aoTocar = (e: React.PointerEvent) => { inicio.current = { x: e.clientX, y: e.clientY }; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); };
  const aoMover = (e: React.PointerEvent) => { if (inicio.current) setArraste({ dx: e.clientX - inicio.current.x, dy: e.clientY - inicio.current.y }); };
  const aoSoltar = () => {
    if (!inicio.current) return;
    const acao = acaoDoGesto(arraste.dx, arraste.dy, { inicio: i === 0, fim: i === total - 1 });
    inicio.current = null;
    setArraste({ dx: 0, dy: 0 });
    if (acao) executar(acao);
  };
  const previa = inicio.current ? acaoDoGesto(arraste.dx, arraste.dy, { inicio: i === 0, fim: i === total - 1 }) : null;

  if (!m) return null;
  return (
    <Dialog open={aberto} onOpenChange={v => { if (!v) onFechar(); }}>
      <DialogContent showCloseButton={false}
        className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none border-0 bg-black p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:rounded-none">
        <div className="flex shrink-0 items-center gap-2 px-3 py-2 text-white">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-medium text-white">{m.titulo}</DialogTitle>
          <span className="shrink-0 text-xs tabular-nums text-white/70">{i + 1} de {total}</span>
          <select value={formato} onChange={e => setFormato(e.target.value as FormatoDownload)} aria-label="Formato da foto"
            className="h-8 max-w-[132px] shrink-0 rounded border border-white/25 bg-black px-1 text-xs text-white">
            {FORMATOS_DOWNLOAD.map(f => <option key={f} value={f}>{ROTULO_FORMATO[f].rotulo}</option>)}
          </select>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-[var(--rt-gold)]"><X className="h-5 w-5" /></button>
        </div>
        <DialogDescription className="sr-only">Arraste para cima para baixar a foto, para baixo para enviar pelo WhatsApp, e para o lado para ver a próxima.</DialogDescription>

        <div className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
          onPointerDown={aoTocar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar}>
          <img key={m.id} src={fotoGrande(m.url)} alt={m.titulo} draggable={false}
            style={{ transform: `translate(${arraste.dx}px, ${arraste.dy}px)`, transition: inicio.current ? "none" : "transform 180ms ease-out" }}
            className="h-full w-full object-contain" />
          {i > 0 && (
            <button type="button" onClick={() => ir(-1)} aria-label="Foto anterior" onPointerDown={e => e.stopPropagation()}
              className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 sm:flex"><ChevronLeft className="h-6 w-6" /></button>
          )}
          {i < total - 1 && (
            <button type="button" onClick={() => ir(1)} aria-label="Próxima foto" onPointerDown={e => e.stopPropagation()}
              className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 sm:flex"><ChevronRight className="h-6 w-6" /></button>
          )}
          {previa === "baixar" && <Dica icone={<ArrowUp className="h-5 w-5" />} texto="Solte para baixar na galeria" lugar="top-4" />}
          {previa === "enviar" && <Dica icone={<ArrowDown className="h-5 w-5" />} texto="Solte para enviar pelo WhatsApp" lugar="bottom-4" />}
          {ocupado && (
            <div role="status" className="absolute inset-x-0 top-1/2 mx-auto flex w-fit -translate-y-1/2 items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-sm text-white">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> {ocupado}
            </div>
          )}
        </div>

        <div className="shrink-0 space-y-2 px-3 pb-3 pt-2">
          {pronto && (
            <button type="button" onClick={enviarPronto} className="flex w-full items-center justify-center gap-2 rounded-lg bg-ok-600 py-2.5 text-sm font-semibold text-white hover:bg-ok-700">
              <Share2 className="h-4 w-4" /> Foto pronta: toque para enviar
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={baixar} disabled={!!ocupado}
              className="flex items-center justify-center gap-2 rounded-lg border border-white/25 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50">
              <Download className="h-4 w-4" /> Baixar
            </button>
            <button type="button" onClick={enviar} disabled={!!ocupado || !m.liberado}
              className="flex items-center justify-center gap-2 rounded-lg bg-[var(--rt-gold)] py-2.5 text-sm font-semibold text-black hover:bg-[var(--rt-gold-light)] disabled:opacity-50">
              <Share2 className="h-4 w-4" /> Enviar no WhatsApp
            </button>
          </div>
          <p className="text-center text-[11px] text-white/60">
            {ehCelular() ? "Arraste para cima para baixar, para baixo para enviar no WhatsApp e para o lado para trocar de foto." : "Setas trocam de foto. Seta para cima baixa, seta para baixo envia no WhatsApp."} A foto sai com o seu carimbo.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Dica({ icone, texto, lugar }: { icone: React.ReactNode; texto: string; lugar: string }) {
  return (
    <div className={`pointer-events-none absolute inset-x-0 ${lugar} mx-auto flex w-fit items-center gap-2 rounded-full bg-[var(--rt-gold)] px-4 py-2 text-sm font-semibold text-black shadow-md`}>
      {icone} {texto}
    </div>
  );
}
