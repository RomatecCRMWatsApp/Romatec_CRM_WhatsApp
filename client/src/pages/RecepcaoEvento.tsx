import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { Camera, CameraOff, CheckCircle2, Loader2, MonitorPlay, ScanLine, Search, Undo2, UserPlus } from "lucide-react";
import jsQR from "jsqr";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";

const campo = "h-10 w-full rounded-md border border-border bg-background px-3 text-sm";
const hora = (d: unknown) => new Date(d as any).toLocaleTimeString("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit" });
const fone = (t: string) => { const d = t.replace(/^55/, ""); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; };
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Leitura = { tipo: "ok" | "ja" | "erro"; texto: string };

/** Lê QR pela câmera: BarcodeDetector (Android/Chrome) ou jsQR (iPhone e o resto) */
function LeitorQr({ onLido, pausado }: { onLido: (texto: string) => void; pausado: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const pausadoRef = useRef(pausado);
  pausadoRef.current = pausado;
  const onLidoRef = useRef(onLido);
  onLidoRef.current = onLido;

  useEffect(() => {
    let stream: MediaStream | null = null, timer = 0, vivo = true;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const Detector = (window as any).BarcodeDetector;
    const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;
    const ler = async () => {
      const v = video.current;
      if (!vivo || !v || pausadoRef.current || v.readyState < 2) return;
      try {
        if (detector) {
          const [c] = await detector.detect(v);
          if (c?.rawValue) onLidoRef.current(c.rawValue);
          return;
        }
        const w = 640, h = Math.round((v.videoHeight / v.videoWidth) * w) || 480;
        canvas.width = w; canvas.height = h;
        ctx?.drawImage(v, 0, 0, w, h);
        const img = ctx?.getImageData(0, 0, w, h);
        const c = img && jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
        if (c?.data) onLidoRef.current(c.data);
      } catch { /* quadro ruim: tenta o próximo */ }
    };
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(s => {
        if (!vivo) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); }
        timer = window.setInterval(ler, 300);
      })
      .catch(() => setErro("Não foi possível abrir a câmera. Libere o acesso à câmera no navegador ou procure a pessoa pelo nome."));
    if (!navigator.mediaDevices) setErro("Este navegador não abre a câmera. Procure a pessoa pelo nome.");
    return () => { vivo = false; clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  if (erro) return <p className="rounded-lg bg-warn-500/10 p-3 text-sm text-warn-300">{erro}</p>;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-black">
      <video ref={video} playsInline muted className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80" />
    </div>
  );
}

/** Recepção do evento: entrada pelo QR do convite, pela lista ou cadastro na hora (quem chega vira lead) */
export default function RecepcaoEvento() {
  const [, params] = useRoute("/convites/:id/recepcao");
  const id = Number(params?.id);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: r, isLoading, error } = trpc.convites.detalhe.useQuery({ id }, { enabled: id > 0, refetchInterval: 5000 });
  const [camera, setCamera] = useState(false);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [busca, setBusca] = useState("");
  const [nova, setNova] = useState({ nome: "", telefone: "" });
  const ultimo = useRef<{ texto: string; em: number }>({ texto: "", em: 0 });

  const mostrar = (l: Leitura) => {
    setLeitura(l);
    navigator.vibrate?.(l.tipo === "ok" ? 120 : [60, 60, 60]);
    window.setTimeout(() => setLeitura(atual => (atual === l ? null : atual)), 4000);
  };
  const aposEntrada = (x: { nome: string; jaEntrou: boolean; desde: Date | string }) => {
    utils.convites.detalhe.invalidate({ id });
    mostrar(x.jaEntrou ? { tipo: "ja", texto: `${x.nome} já tinha entrado às ${hora(x.desde)}` } : { tipo: "ok", texto: `Bem-vindo(a), ${x.nome.split(" ")[0]}!` });
  };
  const erro = (e: { message: string }) => mostrar({ tipo: "erro", texto: e.message });
  const porQr = trpc.convites.checkinQr.useMutation({ onSuccess: aposEntrada, onError: erro });
  const porNome = trpc.convites.checkin.useMutation({ onSuccess: aposEntrada, onError: e => toast.error(e.message) });
  const desfazer = trpc.convites.desfazerCheckin.useMutation({ onSuccess: () => utils.convites.detalhe.invalidate({ id }), onError: e => toast.error(e.message) });
  const naPorta = trpc.convites.naPorta.useMutation({
    onSuccess: x => { setNova({ nome: "", telefone: "" }); aposEntrada(x); },
    onError: e => toast.error(e.message),
  });

  const lido = (texto: string) => {
    // O mesmo QR fica na frente da câmera por alguns segundos: lê uma vez só
    if (porQr.isPending || (texto === ultimo.current.texto && Date.now() - ultimo.current.em < 5000)) return;
    ultimo.current = { texto, em: Date.now() };
    porQr.mutate({ reuniaoId: id, lido: texto });
  };

  const lista = useMemo(() => {
    const q = semAcento(busca.trim()), dig = busca.replace(/\D/g, "");
    const todos = (r?.convidados ?? []).filter(c => c.status !== "recusado" || c.checkinEm);
    const filtrados = !q ? todos : todos.filter(c => semAcento(c.nome).includes(q) || (dig.length >= 3 && c.telefone.includes(dig)));
    return [...filtrados].sort((a, b) => Number(!!a.checkinEm) - Number(!!b.checkinEm) || a.nome.localeCompare(b.nome));
  }, [r?.convidados, busca]);

  if (isLoading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (error || !r) return <div className="p-6 text-sm text-danger-400">{error?.message ?? "Evento não encontrado"}</div>;
  const ehBomJardims = /bom jardim/i.test(r.empreendimento ?? "");
  const corLeitura = leitura?.tipo === "ok" ? "bg-ok-500/15 text-ok-400 border-ok-500/40" : leitura?.tipo === "ja" ? "bg-warn-500/15 text-warn-300 border-warn-500/40" : "bg-danger-500/15 text-danger-400 border-danger-500/40";

  return (
    <div>
      <PageHeader icone={ScanLine} titulo={`Recepção · ${r.titulo}`} voltar={{ rotulo: "Voltar ao convite", onClick: () => navigate(`/convites/${id}`) }}
        subtitulo={<>{r.chegaram} chegaram · {r.contagem.confirmado} confirmados · {r.contagem.total} na lista</>}
        acoes={ehBomJardims && <Button variant="outline" onClick={() => window.open("/bom-jardims/ao-vivo", "_blank", "noopener")}><MonitorPlay className="h-4 w-4" />Mapa ao vivo (TV)</Button>} />
      <div className="mx-auto grid max-w-[1100px] gap-4 px-4 pb-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:px-6">
        <section className="grid content-start gap-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold">Ler o QR do convite</h2>
              <Button variant={camera ? "outline" : "default"} onClick={() => setCamera(v => !v)}>
                {camera ? <><CameraOff className="h-4 w-4" />Fechar câmera</> : <><Camera className="h-4 w-4" />Abrir câmera</>}
              </Button>
            </div>
            {camera ? <LeitorQr onLido={lido} pausado={porQr.isPending} />
              : <p className="text-sm text-muted-foreground">O convidado mostra o QR que aparece no link do convite depois de confirmar. A entrada fica registrada na hora.</p>}
            {leitura && (
              <div role="status" aria-live="polite" className={`mt-3 flex items-center gap-2 rounded-lg border p-3 text-base font-semibold ${corLeitura}`}>
                {leitura.tipo === "ok" && <CheckCircle2 className="h-5 w-5 shrink-0" />}{leitura.texto}
              </div>
            )}
          </div>
          <form className="grid gap-2 rounded-xl border border-border bg-card p-4"
            onSubmit={e => { e.preventDefault(); naPorta.mutate({ reuniaoId: id, ...nova }); }}>
            <h2 className="font-semibold">Chegou sem convite</h2>
            <p className="text-xs text-muted-foreground">Cadastra e registra a entrada. A pessoa vira lead para os corretores.</p>
            <input className={campo} placeholder="Nome" autoComplete="off" value={nova.nome} onChange={e => setNova({ ...nova, nome: e.target.value })} aria-label="Nome" />
            <input className={campo} placeholder="WhatsApp com DDD" inputMode="tel" autoComplete="off" value={nova.telefone} onChange={e => setNova({ ...nova, telefone: e.target.value })} aria-label="WhatsApp" />
            <Button type="submit" disabled={naPorta.isPending || nova.nome.trim().length < 2 || nova.telefone.replace(/\D/g, "").length < 10}>
              <UserPlus className="h-4 w-4" />Cadastrar e registrar entrada
            </Button>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-card">
          <div className="border-b border-border p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input className={`${campo} pl-9`} placeholder="Procurar pelo nome ou telefone" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Procurar convidado" />
            </label>
          </div>
          <ul className="divide-y divide-border">
            {lista.map(c => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{c.nome}</div>
                  <div className="text-xs text-muted-foreground">{fone(c.telefone)} · {c.status === "confirmado" ? "confirmou" : c.status === "pendente" ? "não respondeu" : "tinha recusado"}</div>
                </div>
                {c.checkinEm ? <>
                  <span className="text-xs font-semibold text-ok-400">Chegou {hora(c.checkinEm)}</span>
                  <Button size="sm" variant="ghost" title="Desfazer a entrada" disabled={desfazer.isPending}
                    onClick={() => { if (confirm(`Desfazer a entrada de ${c.nome}?`)) desfazer.mutate({ id: c.id }); }}><Undo2 className="h-4 w-4" /></Button>
                </> : <Button size="sm" disabled={porNome.isPending} onClick={() => porNome.mutate({ id: c.id })}>Registrar entrada</Button>}
              </li>
            ))}
            {!lista.length && <li className="p-4 text-sm text-muted-foreground">{busca ? "Ninguém com esse nome. Use “Chegou sem convite”." : "Lista vazia."}</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
