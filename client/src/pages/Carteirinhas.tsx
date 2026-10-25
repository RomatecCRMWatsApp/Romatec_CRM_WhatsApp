import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Camera, CheckCircle2, Eye, FileDown, IdCard, Loader2, TriangleAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";

type Linha = {
  contratoId: number; contratoNumero: string; contratoStatus: string; liberado: boolean; loteCodigo: string; empreendimento: string;
  tipo: string; ref: number; nome: string; vinculo: string; temFoto: boolean; pendencias: string[];
  carteira: { numero: string; validade: string } | null;
};
type Filtro = "todos" | "emitidas" | "prontas" | "pendentes" | "semfoto" | "aguardando";
const FILTROS: [Filtro, string][] = [
  ["todos", "Todos"], ["emitidas", "Emitidas"], ["prontas", "Prontas para emitir"], ["pendentes", "Com pendência"],
  ["semfoto", "Sem foto"], ["aguardando", "Contrato não assinado"],
];
const chave = (l: Linha) => `${l.contratoId}:${l.tipo}:${l.ref}`;
const dataBR = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const situacao = (l: Linha): Filtro => (!l.liberado ? "aguardando" : l.carteira ? "emitidas" : l.pendencias.length ? "pendentes" : "prontas");

/**
 * Carteirinhas de todos os contratos: situação de cada pessoa (titular, cônjuge, dependentes), foto, prévia e o PDF
 * dos marcados ou de todos — no formato da gráfica (cartão) ou em A4 com 4 por folha para recortar e plastificar.
 */
export default function Carteirinhas() {
  const [, navigate] = useLocation();
  const { data, isLoading, error, refetch } = trpc.contratos.carteirinhasLista.useQuery();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [formato, setFormato] = useState<"cr80" | "a4">("a4");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [gerando, setGerando] = useState(false);
  const [versao, setVersao] = useState(Date.now());
  const input = useRef<HTMLInputElement>(null);
  const alvo = useRef<Linha | null>(null);

  const linhas = (data ?? []) as Linha[];
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter(l => (filtro === "todos" || (filtro === "semfoto" ? !l.temFoto : situacao(l) === filtro))
      && (!q || [l.nome, l.loteCodigo, l.contratoNumero, l.carteira?.numero].some(v => String(v ?? "").toLowerCase().includes(q))));
  }, [linhas, busca, filtro]);
  const imprimiveis = (l: Linha) => l.liberado && !l.pendencias.length;
  const contagem = (f: Filtro) => (f === "todos" ? linhas.length : linhas.filter(l => (f === "semfoto" ? !l.temFoto : situacao(l) === f)).length);

  const abrirPdf = async (itens: Linha[], rotulo: string) => {
    const ok = itens.filter(imprimiveis);
    if (!ok.length) { toast.error("Nenhuma das escolhidas pode ser impressa (contrato não assinado ou cadastro incompleto)"); return; }
    setGerando(true);
    try {
      const r = await fetch(`/api/carteirinhas.pdf?formato=${formato}&itens=${ok.map(chave).join(",")}`, { credentials: "include" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "Falha ao gerar o PDF"); }
      const fora = Number(r.headers.get("X-Carteirinhas-Fora") || 0) + (itens.length - ok.length);
      window.open(URL.createObjectURL(await r.blob()), "_blank", "noopener");
      toast.success(`${rotulo}: ${ok.length} carteirinha(s)${fora ? ` · ${fora} ficaram de fora` : ""}`);
      refetch();
    } catch (e: any) { toast.error(e.message); } finally { setGerando(false); }
  };
  const enviarFoto = async (f: File | undefined) => {
    const l = alvo.current;
    if (!f || !l) return;
    try {
      const r = await fetch(`/api/contratos/${l.contratoId}/carteirinhas/foto?tipo=${l.tipo}&ref=${l.ref}`, { method: "POST", credentials: "include", body: f, headers: { "Content-Type": f.type || "application/octet-stream" } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Falha ao enviar a foto");
      toast.success(`Foto de ${l.nome.split(" ")[0]} salva`);
      setVersao(Date.now()); refetch();
    } catch (e: any) { toast.error(e.message); } finally { if (input.current) input.current.value = ""; }
  };
  const marcar = (k: string, v: boolean) => setMarcados(s => { const n = new Set(s); v ? n.add(k) : n.delete(k); return n; });
  const todosMarcados = visiveis.length > 0 && visiveis.every(l => marcados.has(chave(l)));
  const selecionadas = linhas.filter(l => marcados.has(chave(l)));

  return (
    <div>
      <PageHeader icone={IdCard} titulo="Carteirinhas" subtitulo="Titulares, cônjuges e dependentes de todos os contratos — emitidas sozinhas; aqui você confere, completa e imprime" />
      <div className="mx-auto max-w-[1400px] space-y-3 px-4 pb-8 md:px-6">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="user" hidden onChange={e => enviarFoto(e.target.files?.[0])} />
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome, chácara, contrato ou nº da carteirinha…" aria-label="Buscar"
            className="h-9 min-w-[220px] flex-1 rounded-lg border border-border bg-background px-3 text-sm" />
          <div role="radiogroup" aria-label="Formato" className="flex gap-1 rounded-lg border border-border p-1">
            {([["a4", "A4 · 4 por folha"], ["cr80", "Gráfica (cartão)"]] as const).map(([v, r]) => (
              <button key={v} type="button" role="radio" aria-checked={formato === v} onClick={() => setFormato(v)}
                className={`rounded-md px-3 py-1 text-xs ${formato === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{r}</button>
            ))}
          </div>
          <Button variant="outline" disabled={gerando || !selecionadas.length} onClick={() => abrirPdf(selecionadas, "Marcadas")}>
            {gerando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileDown className="mr-1 h-4 w-4" />} PDF dos marcados ({selecionadas.length})
          </Button>
          <Button disabled={gerando || !visiveis.some(imprimiveis)} onClick={() => abrirPdf(visiveis, "Todas da lista")}>
            <FileDown className="mr-1 h-4 w-4" /> PDF de todos ({visiveis.filter(imprimiveis).length})
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map(([f, r]) => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`rounded-full border px-3 py-1 text-xs ${filtro === f ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {r} ({contagem(f)})
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-red-400">{error.message}</p>}
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {data && !visiveis.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhuma carteirinha {filtro === "todos" ? "ainda — elas aparecem quando há contratos" : "neste filtro"}.</p>}

        {visiveis.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-2 w-8"><input type="checkbox" aria-label="Marcar todos" checked={todosMarcados} onChange={e => visiveis.forEach(l => marcar(chave(l), e.target.checked))} /></th>
                  <th className="p-2">Foto</th><th className="p-2">Chácara</th><th className="p-2">Pessoa</th><th className="p-2">Situação</th><th className="p-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(l => (
                  <tr key={chave(l)} className="border-b border-border/50 last:border-0">
                    <td className="p-2"><input type="checkbox" aria-label={`Marcar ${l.nome}`} checked={marcados.has(chave(l))} onChange={e => marcar(chave(l), e.target.checked)} /></td>
                    <td className="p-2">
                      <button type="button" title="Enviar ou trocar a foto 3×4" onClick={() => { alvo.current = l; input.current?.click(); }}
                        className="flex h-12 w-9 items-center justify-center overflow-hidden rounded border border-border bg-black/30">
                        {l.temFoto ? <img src={`/api/contratos/${l.contratoId}/carteirinhas/foto?tipo=${l.tipo}&ref=${l.ref}&v=${versao}`} alt={`Foto de ${l.nome}`} className="h-full w-full object-cover" loading="lazy" />
                          : <Camera className="h-4 w-4 text-muted-foreground" />}
                      </button>
                    </td>
                    <td className="p-2 whitespace-nowrap"><b>{l.loteCodigo}</b><p className="text-[11px] text-muted-foreground">{l.contratoNumero}</p></td>
                    <td className="p-2"><b>{l.nome}</b><p className="text-[11px] text-muted-foreground">{l.vinculo}{l.carteira ? ` · Nº ${l.carteira.numero}` : ""}</p></td>
                    <td className="p-2 text-xs">
                      {!l.liberado ? <span className="text-muted-foreground">Contrato ainda não assinado</span>
                        : l.carteira ? <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Emitida · válida até {dataBR(l.carteira.validade)}</span>
                        : l.pendencias.length ? <span className="flex items-center gap-1 text-amber-300"><TriangleAlert className="h-3.5 w-3.5" /> Falta: {l.pendencias.join(", ")}</span>
                        : <span className="text-muted-foreground">Pronta (sai na próxima impressão)</span>}
                    </td>
                    <td className="p-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" disabled={!imprimiveis(l) || gerando} onClick={() => abrirPdf([l], "Prévia")} title="Ver a carteirinha em PDF"><Eye className="mr-1 h-3.5 w-3.5" /> Prévia</Button>
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => navigate(`/contratos/${l.contratoId}`)} title="Abrir o contrato (dependentes e dados)">Contrato</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          As carteirinhas são emitidas sozinhas: titular e cônjuge quando o contrato é assinado; cada dependente quando o cadastro dele fica completo, com a foto.
          No A4 saem 4 por folha, frente e verso lado a lado: recorte na linha tracejada externa, dobre na do meio e plastifique.
        </p>
      </div>
    </div>
  );
}
