import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, IdCard, Loader2, Pencil } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import DependentesCampos from "@/components/contratos/Dependentes";
import { pendenciasDependentes, rotuloParentesco, type Dependente } from "@shared/contratos";

const COM_CARTEIRINHA = ["assinado", "ativo", "quitado"];
const idade = (iso: string) => { const n = new Date(iso); const h = new Date(); let a = h.getFullYear() - n.getFullYear(); if (h < new Date(h.getFullYear(), n.getMonth(), n.getDate())) a--; return a; };

/** Carteirinhas do contrato: quem recebe (titular, cônjuge, dependentes), editar os dependentes e baixar o PDF da gráfica */
export default function CarteirinhasContrato({ id, status, titular, conjuge, dependentes, podeEditar, onMudou }: {
  id: number; status: string; titular: string | null; conjuge: string | null; dependentes: (Dependente & { ordem: number })[];
  podeEditar: boolean; onMudou: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [lista, setLista] = useState<Dependente[] | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [baixando, setBaixando] = useState(false);
  useEffect(() => { if (!editando) setLista(dependentes.length ? dependentes.map(({ ordem, ...d }) => ({ ...d, cpf: d.cpf ?? "" })) : null); }, [dependentes, editando]);
  const salvar = trpc.contratos.salvarDependentes.useMutation({
    onSuccess: () => { toast.success("Dependentes salvos"); setEditando(false); onMudou(); },
    onError: e => { setErros(((e.data as any)?.cause?.campos ?? (e as any).shape?.cause?.campos) || {}); toast.error(e.message); },
  });
  const liberado = COM_CARTEIRINHA.includes(status);
  const encerrado = ["cancelado", "distratado"].includes(status);

  const baixar = async () => {
    setBaixando(true);
    try {
      const r = await fetch(`/api/contratos/${id}/carteirinhas.pdf`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      const nome = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? "CARTEIRINHAS.pdf";
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url; a.download = nome; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) { toast.error(e.message || "Falha ao gerar as carteirinhas"); } finally { setBaixando(false); }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><IdCard className="h-4 w-4 text-primary" /> Carteirinhas do condomínio</h2>
        <div className="ml-auto flex gap-1.5">
          {podeEditar && !encerrado && !editando && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setErros({}); setEditando(true); }}><Pencil className="mr-1 h-3.5 w-3.5" /> Dependentes</Button>
          )}
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!liberado || baixando} onClick={baixar}
            title={liberado ? "PDF tamanho cartão (85,6 × 54 mm), frente e verso, para a gráfica" : "Disponível depois do contrato assinado"}>
            {baixando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />} Carteirinhas (PDF)
          </Button>
        </div>
      </div>
      {!editando ? (
        <ul className="space-y-1 text-sm">
          {titular && <li><b>{titular}</b> <span className="text-xs text-muted-foreground">· titular</span></li>}
          {conjuge && <li><b>{conjuge}</b> <span className="text-xs text-muted-foreground">· cônjuge</span></li>}
          {dependentes.map(d => (
            <li key={d.ordem}><b>{d.nome}</b> <span className="text-xs text-muted-foreground">· {rotuloParentesco(d.parentesco)}, {idade(d.nascimento)} anos</span></li>
          ))}
          {!dependentes.length && <li className="text-xs text-muted-foreground">Sem dependentes.</li>}
          {!liberado && !encerrado && <li className="text-xs text-muted-foreground">O PDF das carteirinhas sai depois do contrato assinado.</li>}
        </ul>
      ) : (
        <div className="space-y-3">
          <DependentesCampos lista={lista} onMudar={setLista} erros={erros} comConjuge={!!conjuge} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={salvar.isPending} onClick={() => setEditando(false)}>Cancelar</Button>
            <Button size="sm" disabled={salvar.isPending} onClick={() => {
              const e = pendenciasDependentes(lista ?? []);
              setErros(e);
              if (Object.keys(e).length) { toast.error("Confira os dependentes"); return; }
              salvar.mutate({ id, dependentes: (lista ?? []).map(d => ({ ...d, cpf: d.cpf || null })) });
            }}>{salvar.isPending ? "Salvando…" : "Salvar dependentes"}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
