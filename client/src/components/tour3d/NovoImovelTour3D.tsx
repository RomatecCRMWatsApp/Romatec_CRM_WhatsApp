import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { enviarParaCloudinary } from "@/lib/uploadCloudinary";

/*
 * Cadastro rápido de imóvel a partir do Tour 3D: nome, endereço, cidade, preço e finalidade, já com as
 * fotos que estão no tour. O resto (área, quartos, descrição…) se completa depois em Imóveis.
 */

export interface SugestaoImovel {
  nome: string;
  endereco: string;
  cidade: string;
  uf: string;
  preco: string;
}

interface Props {
  aberto: boolean;
  sugestao: SugestaoImovel;
  /** fotos do tour (blob: URLs) que vão para o cadastro */
  fotos: { url: string; nome: string }[];
  onFechar: () => void;
  onCriado: (id: number, nome: string) => void;
}

const campo = "mt-1 block h-11 w-full rounded-md border border-border bg-background px-3 text-base md:text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring";
const rotulo = "text-xs font-medium text-muted-foreground";

/** "R$ 350.000,00" → "350000.00" (o cadastro guarda o número) */
export function precoParaNumero(v: string): string {
  const limpo = v.replace(/[^\d,.]/g, "");
  if (!limpo) return "";
  const decimal = /,\d{1,2}$/.test(limpo) ? limpo.replace(/\./g, "").replace(",", ".") : limpo.replace(/[.,]/g, "");
  const n = Number(decimal);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : "";
}

export default function NovoImovelTour3D({ aberto, sugestao, fotos, onFechar, onCriado }: Props) {
  const utils = trpc.useUtils();
  const criar = trpc.properties.create.useMutation();
  const atualizar = trpc.properties.update.useMutation();
  const [f, setF] = useState({ ...sugestao, finalidade: "venda" as "venda" | "aluguel", levarFotos: true });
  const [salvando, setSalvando] = useState("");

  useEffect(() => { if (aberto) setF(x => ({ ...x, ...sugestao })); }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    const preco = precoParaNumero(f.preco);
    if (!f.nome.trim()) { toast.error("Dê um nome ao imóvel."); return; }
    if (!f.endereco.trim()) { toast.error("Informe o endereço."); return; }
    if (!preco) { toast.error("Informe o preço."); return; }
    try {
      setSalvando("Cadastrando o imóvel…");
      const r = await criar.mutateAsync({
        denomination: f.nome.trim(), address: f.endereco.trim(), city: f.cidade.trim() || undefined,
        state: f.uf.trim().toUpperCase().slice(0, 2) || undefined, price: preco, finalidade: f.finalidade,
      });
      if (f.levarFotos && fotos.length) {
        const urls: string[] = [];
        for (let i = 0; i < fotos.length; i++) {
          setSalvando(`Enviando foto ${i + 1} de ${fotos.length}…`);
          try {
            const blob = await (await fetch(fotos[i].url)).blob();
            const arq = new File([blob], fotos[i].nome || `foto-${i + 1}.jpg`, { type: blob.type || "image/jpeg" });
            urls.push((await enviarParaCloudinary(arq)).url);
          } catch { /* segue com as demais */ }
        }
        if (urls.length) await atualizar.mutateAsync({ id: r.id, images: urls });
        if (urls.length < fotos.length) toast.warning(`${fotos.length - urls.length} foto(s) não subiram. Adicione depois em Imóveis.`);
      }
      await utils.properties.list.invalidate();
      toast.success("Imóvel cadastrado! Complete área, quartos e descrição depois em Imóveis.");
      onCriado(r.id, f.nome.trim());
    } catch (e) {
      toast.error((e as Error)?.message || "Não consegui cadastrar o imóvel.");
    } finally {
      setSalvando("");
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={v => { if (!v && !salvando) onFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Cadastrar imóvel novo</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className={rotulo}>Nome do imóvel</span><input className={campo} value={f.nome} maxLength={120} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Casa 3 quartos Vila São Francisco" /></label>
          <label className="sm:col-span-2"><span className={rotulo}>Endereço</span><input className={campo} value={f.endereco} maxLength={200} onChange={e => setF({ ...f, endereco: e.target.value })} placeholder="Rua, número — bairro" /></label>
          <label><span className={rotulo}>Cidade</span><input className={campo} value={f.cidade} maxLength={80} onChange={e => setF({ ...f, cidade: e.target.value })} /></label>
          <label><span className={rotulo}>UF</span><input className={campo} value={f.uf} maxLength={2} onChange={e => setF({ ...f, uf: e.target.value.toUpperCase() })} placeholder="MA" /></label>
          <label><span className={rotulo}>Preço</span><input className={campo} value={f.preco} inputMode="decimal" maxLength={20} onChange={e => setF({ ...f, preco: e.target.value })} placeholder="350.000" /></label>
          <label><span className={rotulo}>Finalidade</span>
            <select className={campo} value={f.finalidade} onChange={e => setF({ ...f, finalidade: e.target.value as "venda" | "aluguel" })}>
              <option value="venda">Venda</option>
              <option value="aluguel">Aluguel</option>
            </select>
          </label>
          {fotos.length > 0 && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4" checked={f.levarFotos} onChange={e => setF({ ...f, levarFotos: e.target.checked })} />Salvar as {fotos.length} foto(s) do tour no cadastro</label>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {salvando && <span className="mr-auto flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{salvando}</span>}
          <Button type="button" variant="ghost" onClick={onFechar} disabled={!!salvando}>Cancelar</Button>
          <Button type="button" onClick={() => void salvar()} disabled={!!salvando}>Cadastrar imóvel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
