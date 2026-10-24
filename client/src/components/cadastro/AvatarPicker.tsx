import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

const LADO = 512;
const VISOR = 280;

/** Recorte 1:1 com zoom e arraste; exporta WEBP 512×512 (q 0,85) */
function Recorte({ src, onPronto, onCancelar }: { src: string; onPronto: (b: Blob) => void; onCancelar: () => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const arraste = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = src;
  }, [src]);

  // Escala que cobre o visor; o zoom multiplica
  const base = img ? Math.max(VISOR / img.width, VISOR / img.height) : 1;
  const esc = base * zoom;
  const limitar = (p: { x: number; y: number }) => {
    if (!img) return p;
    const mx = Math.max(0, (img.width * esc - VISOR) / 2), my = Math.max(0, (img.height * esc - VISOR) / 2);
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  };
  useEffect(() => setPos(p => limitar(p)), [zoom, img]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportar = () => {
    if (!img) return;
    const c = document.createElement("canvas");
    c.width = c.height = LADO;
    const k = LADO / VISOR;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    const w = img.width * esc * k, h = img.height * esc * k;
    ctx.drawImage(img, (LADO - w) / 2 + pos.x * k, (LADO - h) / 2 + pos.y * k, w, h);
    c.toBlob(b => (b ? onPronto(b) : toast.error("Não foi possível gerar a foto")), "image/webp", 0.85);
  };

  return (
    <div className="space-y-3">
      <div className="relative mx-auto overflow-hidden rounded-full bg-black touch-none select-none" style={{ width: VISOR, height: VISOR }}
        onPointerDown={e => { (e.target as Element).setPointerCapture?.(e.pointerId); arraste.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; }}
        onPointerMove={e => { const a = arraste.current; if (a) setPos(limitar({ x: a.px + e.clientX - a.x, y: a.py + e.clientY - a.y })); }}
        onPointerUp={() => (arraste.current = null)}
        onWheel={e => setZoom(z => Math.min(4, Math.max(1, z - e.deltaY * 0.002)))}>
        {img && <img src={src} alt="" draggable={false} className="absolute left-1/2 top-1/2 max-w-none cursor-move"
          style={{ width: img.width * esc, height: img.height * esc, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }} />}
      </div>
      <label className="flex items-center gap-3 text-xs text-muted-foreground">
        Zoom
        <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} className="flex-1 accent-[var(--primary)]" />
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancelar}>Cancelar</Button>
        <Button type="button" onClick={exportar} disabled={!img}>Usar foto</Button>
      </div>
    </div>
  );
}

/** Selfie pela câmera (getUserMedia); no celular sem permissão cai no input com capture="user" */
function Camera_({ onFoto, onCancelar }: { onFoto: (src: string) => void; onCancelar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user", width: { ideal: 1080 } }, audio: false })
      .then(s => { stream = s; if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); } })
      .catch(() => setErro("Não foi possível abrir a câmera. Permita o acesso ou envie um arquivo."));
    return () => stream?.getTracks().forEach(t => t.stop());
  }, []);
  const tirar = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width, 0); ctx.scale(-1, 1); // espelho, como a pessoa se vê
    ctx.drawImage(v, 0, 0);
    onFoto(c.toDataURL("image/jpeg", 0.92));
  };
  return (
    <div className="space-y-3">
      {erro ? <p className="text-sm text-red-400">{erro}</p>
        : <video ref={video} playsInline muted className="mx-auto aspect-square w-[280px] rounded-full bg-black object-cover [transform:scaleX(-1)]" />}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancelar}>Cancelar</Button>
        {!erro && <Button type="button" onClick={tirar}><Camera className="mr-1.5 h-4 w-4" /> Tirar foto</Button>}
      </div>
    </div>
  );
}

/**
 * Foto de perfil: enviar arquivo ou tirar selfie, recortar 1:1 e salvar (POST /api/usuarios/:id/foto).
 * `usuarioId` ausente (cadastro novo) = só mostra a inicial.
 */
export default function AvatarPicker({ usuarioId, fotoUrl, nome, onMudou }: { usuarioId?: number; fotoUrl?: string | null; nome: string; onMudou?: (url: string | null) => void }) {
  const [url, setUrl] = useState(fotoUrl ?? null);
  const [etapa, setEtapa] = useState<null | "camera" | { src: string }>(null);
  const [enviando, setEnviando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const selfie = useRef<HTMLInputElement>(null);
  const remover = trpc.cadastro.removerFoto.useMutation();
  useEffect(() => setUrl(fotoUrl ?? null), [fotoUrl]);
  const celular = typeof navigator !== "undefined" && /Android|iPhone|iPad/i.test(navigator.userAgent);

  const abrirArquivo = (f?: File | null) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { toast.error("Envie uma foto JPG, PNG ou WEBP"); return; }
    if (f.size > 15 * 1024 * 1024) { toast.error("Foto muito grande"); return; }
    setEtapa({ src: URL.createObjectURL(f) });
  };

  const salvar = async (b: Blob) => {
    if (!usuarioId) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/usuarios/${usuarioId}/foto`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: b });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.error || "Falha no envio da foto");
      setUrl(j.url); onMudou?.(j.url); setEtapa(null);
      toast.success("Foto atualizada");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-24 w-24 shrink-0">
        {url ? <img src={url} alt="" className="h-24 w-24 rounded-full object-cover ring-2 ring-primary/40" />
          : <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/20 text-3xl font-bold text-primary">{(nome.trim().charAt(0) || "?").toUpperCase()}</div>}
        {enviando && <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
      </div>
      {usuarioId ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => arquivo.current?.click()}><ImagePlus className="mr-1.5 h-3.5 w-3.5" /> Enviar foto</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => (celular ? selfie.current?.click() : setEtapa("camera"))}><Camera className="mr-1.5 h-3.5 w-3.5" /> Tirar selfie</Button>
          {url && <Button type="button" size="sm" variant="ghost" className="text-red-300" disabled={remover.isPending}
            onClick={async () => { if (!confirm("Remover a foto de perfil?")) return; await remover.mutateAsync({ id: usuarioId }); setUrl(null); onMudou?.(null); }}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remover</Button>}
          <input ref={arquivo} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { abrirArquivo(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={selfie} type="file" accept="image/*" capture="user" hidden onChange={e => { abrirArquivo(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      ) : <p className="text-xs text-muted-foreground">A foto é enviada depois de salvar o cadastro.</p>}

      <Dialog open={!!etapa} onOpenChange={o => !o && setEtapa(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{etapa === "camera" ? "Tirar selfie" : "Ajustar foto"}</DialogTitle></DialogHeader>
          {etapa === "camera" && <Camera_ onFoto={src => setEtapa({ src })} onCancelar={() => setEtapa(null)} />}
          {etapa && etapa !== "camera" && <Recorte src={etapa.src} onPronto={salvar} onCancelar={() => setEtapa(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
