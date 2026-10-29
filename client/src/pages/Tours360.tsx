import { useState } from "react";
import { toast } from "sonner";
import { Eye, Loader2, Rotate3d, Trash2, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Visualizador360 } from "@/components/Tour360";

const SLUG = "bom-jardims";

/** Vendas › Tour 360°: fotos 360 por chácara ou pontos do condomínio (aparecem nas páginas públicas) */
export default function Tours360() {
  const utils = trpc.useUtils();
  const { data } = trpc.tour360.lista.useQuery({ slug: SLUG });
  const [titulo, setTitulo] = useState("");
  const [lote, setLote] = useState("");
  const [arq, setArq] = useState<File | null>(null);
  const [ver, setVer] = useState<number | null>(null);
  const [lendo, setLendo] = useState(false);
  const adicionar = trpc.tour360.adicionar.useMutation({
    onSuccess: r => { toast.success(`Foto 360 publicada (${r.largura} px)`); setTitulo(""); setLote(""); setArq(null); utils.tour360.lista.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const excluir = trpc.tour360.excluir.useMutation({ onSuccess: () => utils.tour360.lista.invalidate(), onError: e => toast.error(e.message) });
  const enviar = () => {
    if (!arq) return;
    if (arq.size > 30 * 1024 * 1024) { toast.error("Foto maior que 30 MB"); return; }
    setLendo(true);
    const r = new FileReader();
    r.onload = () => { setLendo(false); adicionar.mutate({ slug: SLUG, loteCodigo: lote ? lote.toUpperCase() : null, titulo: titulo || (lote ? `Chácara ${lote.toUpperCase()}` : "Condomínio"), base64: String(r.result) }); };
    r.onerror = () => { setLendo(false); toast.error("Não foi possível ler a foto"); };
    r.readAsDataURL(arq);
  };
  return (
    <div>
      <PageHeader icone={Rotate3d} titulo="Tour 360°" subtitulo="Fotos 360° das chácaras e do condomínio — o cliente vê na página da chácara e na página do Bom Jardims" />
      <div className="mx-auto max-w-[1100px] space-y-4 px-4 pb-8 md:px-6 text-sm">
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <p className="font-semibold">Nova foto 360°</p>
          <p className="text-xs text-muted-foreground">Use a foto equirretangular (proporção 2:1) da câmera 360 ou do modo "Panorama 360" do celular/Google Street View. Sem chácara = ponto geral do condomínio (portal, área de vivência, ruas).</p>
          <div className="grid gap-2 md:grid-cols-[1fr_140px_1fr_auto]">
            <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título (ex.: Vista da frente da chácara)" />
            <Input value={lote} onChange={e => setLote(e.target.value.toUpperCase().slice(0, 3))} placeholder="Chácara (ex.: A05)" />
            <input type="file" accept="image/jpeg,image/png" onChange={e => setArq(e.target.files?.[0] ?? null)} className="text-xs" />
            <Button disabled={!arq || lendo || adicionar.isPending || (!!lote && !/^[A-Z]\d{2}$/.test(lote))} onClick={enviar}>
              {lendo || adicionar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />} Publicar
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((t, i) => (
            <div key={t.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="h-32 bg-cover bg-center" style={{ backgroundImage: `url(${t.url})` }} />
              <div className="flex items-center justify-between gap-2 p-2">
                <p className="truncate"><b>{t.titulo}</b><span className="block text-xs text-muted-foreground">{t.loteCodigo ? `Chácara ${t.loteCodigo}` : "Condomínio (geral)"}</span></p>
                <div className="flex shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => setVer(i)}><Eye className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" className="text-red-300" onClick={() => { if (confirm(`Excluir "${t.titulo}"?`)) excluir.mutate({ id: t.id }); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
          ))}
          {data && !data.length && <p className="text-muted-foreground">Nenhuma foto 360° ainda.</p>}
        </div>
      </div>
      {ver != null && data && <Visualizador360 tours={data} inicial={ver} onFechar={() => setVer(null)} />}
    </div>
  );
}
