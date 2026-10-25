import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, CheckCircle2, Download, IdCard, Loader2, Pencil, TriangleAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import DependentesCampos from "@/components/contratos/Dependentes";
import { maskCPF, maskPhone } from "@shared/masks";
import { pendenciasDependentes, type Dependente } from "@shared/contratos";

const dataBR = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

/**
 * Carteirinhas do contrato: titular, cônjuge e dependentes — cada um com a carteira vigente ou o que falta.
 * Foto 3×4 de cada pessoa, edição dos dependentes e o PDF da gráfica (CR80, frente e verso).
 */
export default function CarteirinhasContrato({ id, status, dependentes, podeEditar, onMudou }: {
  id: number; status: string; dependentes: (Dependente & { id: number })[]; podeEditar: boolean; onMudou: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: sit, refetch } = trpc.contratos.carteirinhas.useQuery({ id });
  const [editando, setEditando] = useState(false);
  const [lista, setLista] = useState<Dependente[] | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [baixando, setBaixando] = useState(false);
  const [versaoFoto, setVersaoFoto] = useState(Date.now());
  const [enviandoFoto, setEnviandoFoto] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const alvoFoto = useRef<{ tipo: string; ref: number } | null>(null);

  useEffect(() => {
    if (editando) return;
    setLista(dependentes.length ? dependentes.map(d => ({ ...d, cpf: maskCPF(d.cpf ?? ""), telefone1: maskPhone(d.telefone1 ?? ""), nascimento: d.nascimento ?? "" })) : null);
  }, [dependentes, editando]);
  const salvar = trpc.contratos.salvarDependentes.useMutation({
    onSuccess: () => { toast.success("Dependentes salvos"); setEditando(false); onMudou(); refetch(); },
    onError: e => { setErros(((e as any).shape?.cause?.campos ?? (e.data as any)?.cause?.campos) || {}); toast.error(e.message); },
  });
  const liberado = sit?.liberado ?? ["assinado", "ativo", "quitado"].includes(status);
  const encerrado = ["cancelado", "distratado"].includes(status);
  const prontas = (sit?.pessoas ?? []).filter(p => !p.pendencias.length).length;

  const escolherFoto = (tipo: string, ref: number) => { alvoFoto.current = { tipo, ref }; input.current?.click(); };
  const enviarFoto = async (f: File | undefined) => {
    const alvo = alvoFoto.current;
    if (!f || !alvo) return;
    if (f.size > 8 * 1024 * 1024) { toast.error("Foto acima de 8 MB"); return; }
    setEnviandoFoto(`${alvo.tipo}-${alvo.ref}`);
    try {
      const r = await fetch(`/api/contratos/${id}/carteirinhas/foto?tipo=${alvo.tipo}&ref=${alvo.ref}`, { method: "POST", credentials: "include", body: f, headers: { "Content-Type": f.type || "application/octet-stream" } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Falha ao enviar a foto");
      toast.success("Foto salva");
      setVersaoFoto(Date.now()); refetch(); utils.contratos.detalhe.invalidate({ id });
    } catch (e: any) { toast.error(e.message); } finally { setEnviandoFoto(null); if (input.current) input.current.value = ""; }
  };
  const baixar = async () => {
    setBaixando(true);
    try {
      const r = await fetch(`/api/contratos/${id}/carteirinhas.pdf`, { credentials: "include" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const p = j.pendencias ? Object.entries(j.pendencias).map(([n, m]) => `${n}: ${m}`).join(" · ") : "";
        throw new Error([j.error || "Falha ao gerar as carteirinhas", p].filter(Boolean).join(" — "));
      }
      const nome = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? "CARTEIRINHAS.pdf";
      const bloqueadas = Number(r.headers.get("X-Carteirinhas-Bloqueadas") || 0);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url; a.download = nome; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (bloqueadas) toast.warning(`${bloqueadas} carteirinha(s) de dependente ficaram de fora — complete o cadastro (veja a lista).`);
      refetch();
    } catch (e: any) { toast.error(e.message); } finally { setBaixando(false); }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="user" hidden onChange={e => enviarFoto(e.target.files?.[0])} />
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold"><IdCard className="h-4 w-4 text-primary" /> Carteirinhas do condomínio</h2>
        <div className="ml-auto flex gap-1.5">
          {podeEditar && !encerrado && !editando && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setErros({}); setEditando(true); }}><Pencil className="mr-1 h-3.5 w-3.5" /> Dependentes</Button>
          )}
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!liberado || baixando || !prontas} onClick={baixar}
            title={!liberado ? "Disponível depois do contrato assinado" : "PDF tamanho cartão (85,6 × 54 mm), frente e verso, para a gráfica"}>
            {baixando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />} Imprimir carteirinhas (PDF)
          </Button>
        </div>
      </div>

      {!editando ? (
        <ul className="space-y-2">
          {(sit?.pessoas ?? []).map(p => {
            const chave = `${p.tipo}-${p.ref}`;
            return (
              <li key={chave} className="flex items-center gap-3 rounded-lg border border-border/60 p-2">
                <button type="button" disabled={!podeEditar || encerrado} onClick={() => escolherFoto(p.tipo, p.ref)} title="Enviar ou trocar a foto 3×4"
                  className="relative h-14 w-11 shrink-0 overflow-hidden rounded border border-border bg-black/30">
                  {p.temFoto
                    ? <img src={`/api/contratos/${id}/carteirinhas/foto?tipo=${p.tipo}&ref=${p.ref}&v=${versaoFoto}`} alt={`Foto de ${p.nome}`} className="h-full w-full object-cover" />
                    : <Camera className="m-auto h-4 w-4 text-muted-foreground" />}
                  {enviandoFoto === chave && <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-white" />}
                </button>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate"><b>{p.nome}</b> <span className="text-xs text-muted-foreground">· {p.vinculo}</span></p>
                  {p.carteira
                    ? <p className="flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Nº {p.carteira.numero} · válida até {dataBR(p.carteira.validade)}</p>
                    : p.pendencias.length
                      ? <p className="flex items-center gap-1 text-xs text-amber-300"><TriangleAlert className="h-3.5 w-3.5" /> Para emitir, falta: {p.pendencias.join(", ")}</p>
                      : <p className="text-xs text-muted-foreground">Será emitida automaticamente{p.temFoto ? "" : " (sem foto: sai com as iniciais)"}</p>}
                </div>
                {podeEditar && !encerrado && (
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => escolherFoto(p.tipo, p.ref)}><Camera className="mr-1 h-3.5 w-3.5" /> {p.temFoto ? "Trocar foto" : "Foto"}</Button>
                )}
              </li>
            );
          })}
          {!liberado && !encerrado && <li className="text-xs text-muted-foreground">As carteirinhas são emitidas automaticamente quando o contrato é assinado; as fotos já podem ser enviadas.</li>}
        </ul>
      ) : (
        <div className="space-y-3">
          <DependentesCampos lista={lista} onMudar={setLista} erros={erros} comConjuge={(sit?.pessoas ?? []).some(p => p.tipo === "conjuge")} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={salvar.isPending} onClick={() => setEditando(false)}>Cancelar</Button>
            <Button size="sm" disabled={salvar.isPending} onClick={() => {
              const e = pendenciasDependentes(lista ?? []);
              setErros(e);
              if (Object.keys(e).length) { toast.error("Confira os dependentes"); return; }
              salvar.mutate({ id, dependentes: (lista ?? []).map(({ temFoto, ...d }) => ({ ...d, nascimento: d.nascimento || null, telefone2: d.telefone2 || null })) });
            }}>{salvar.isPending ? "Salvando…" : "Salvar dependentes"}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
