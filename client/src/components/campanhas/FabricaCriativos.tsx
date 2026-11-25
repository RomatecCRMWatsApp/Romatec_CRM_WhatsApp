import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { Button } from "@/components/ui/button";
import { Check, Download, Film, Loader2, RefreshCw, Shuffle, Trash2 } from "lucide-react";
import type { ItemFila } from "../../../../server/criativos/fabrica";
import { ROTULO_TEMA, ROTULO_TEMA_DIA, TEMAS_MIDIA, type TemaMidia } from "@shared/pautaDiaria";

const STATUS: Record<string, [string, string]> = {
  pendente: ["Na fila", "bg-secondary text-muted-foreground"], montando: ["Montando", "bg-info-500/15 text-info-300"],
  pronta: ["Para aprovar", "bg-warn-500/15 text-warn-300"], aprovada: ["Aprovada", "bg-ok-500/15 text-ok-300"],
  descartada: ["Descartada", "bg-secondary text-muted-foreground line-through"], erro: ["Erro", "bg-danger-500/15 text-danger-300"],
};
const DESTINO: Record<string, string> = { anuncio_teste: "Anúncio (teste de criativos)", feed_organico: "Feed orgânico", stories: "Stories" };
const TIPO: Record<string, string> = { reels: "Reels 9:16", carrossel: "Carrossel 4:5", foto: "Story 9:16" };
const br = (iso: string) => iso.split("-").reverse().join("/");
const campo = "h-9 rounded-lg border border-border bg-background px-2 text-sm";

type Fila = ItemFila[];

function Peca({ it, condicoesValidas }: { it: Fila[number]; condicoesValidas: boolean }) {
  const utils = trpc.useUtils();
  const recarregar = () => utils.fabricaCriativos.painel.invalidate();
  const opcoes = { onSuccess: recarregar, onError: (e: { message: string }) => toast.error(e.message) };
  const aprovar = trpc.fabricaCriativos.aprovar.useMutation({ ...opcoes, onSuccess: () => { toast.success("Peça aprovada"); recarregar(); } });
  const descartar = trpc.fabricaCriativos.descartar.useMutation(opcoes);
  const remontar = trpc.fabricaCriativos.remontar.useMutation(opcoes);
  const trocar = trpc.fabricaCriativos.trocarMidia.useMutation({ ...opcoes, onSuccess: () => { toast.success("Mídia trocada; a peça está sendo montada de novo"); recarregar(); } });
  const salvarLegenda = trpc.fabricaCriativos.legenda.useMutation({ ...opcoes, onSuccess: () => { toast.success("Legenda salva"); recarregar(); } });
  const [legenda, setLegenda] = useState(it.legenda ?? "");
  useEffect(() => setLegenda(it.legenda ?? ""), [it.legenda]);
  const [st, cor] = STATUS[it.status] ?? [it.status, "bg-secondary"];
  const editavel = it.status !== "aprovada" && it.status !== "descartada";
  const ocupado = it.status === "montando" || it.status === "pendente";

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="font-mono text-xs">{it.nome}</p>
        <span className={`rounded-md px-1.5 py-0.5 text-xs ${cor}`}>{st}</span>
        <span className="text-xs text-muted-foreground">{TIPO[it.tipo] ?? it.tipo} · {DESTINO[it.destino] ?? it.destino}{it.temPreco ? " · mostra preço" : ""}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-[260px_minmax(0,1fr)]">
        <div>
          {ocupado ? (
            <div className="flex aspect-[9/16] items-center justify-center rounded-lg bg-secondary text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Montando…</div>
          ) : it.pecas.length ? (
            it.tipo === "reels" ? (
              <video src={it.pecas[0]} controls playsInline preload="metadata" className="aspect-[9/16] w-full rounded-lg bg-black" />
            ) : (
              <div className="flex snap-x gap-2 overflow-x-auto">
                {it.pecas.map(u => <img key={u} src={u} alt="" loading="lazy" className="w-full shrink-0 snap-start rounded-lg" />)}
              </div>
            )
          ) : (
            <div className="flex aspect-[9/16] items-center justify-center rounded-lg bg-secondary p-3 text-center text-sm text-danger-300">{it.erro ?? "Sem peça montada"}</div>
          )}
          {it.pecas.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2">
              {it.pecas.map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline"><Download className="h-3 w-3" /> {it.pecas.length > 1 ? `Arquivo ${i + 1}` : "Baixar"}</a>)}
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-sm"><span className="text-muted-foreground">Gancho: </span>{it.pauta.gancho.join(" / ")}</p>
          {it.pauta.selo && <p className="text-sm"><span className="text-muted-foreground">Selo: </span>{it.pauta.selo.titulo}</p>}
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Mídias ({it.pauta.midias.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {it.pauta.midias.map((m, i) => (
                <span key={`${m.id}-${i}`} className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs">
                  {m.tipo === "video" ? <Film className="h-3 w-3" /> : null}#{m.id} · {m.dur}s
                  {editavel && !ocupado && (
                    <button aria-label={`Trocar a mídia ${i + 1}`} title="Trocar mídia" className="rounded p-0.5 hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      disabled={trocar.isPending} onClick={() => trocar.mutate({ id: it.id, indice: i })}><Shuffle className="h-3 w-3" /></button>
                  )}
                </span>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Legenda
            <textarea value={legenda} onChange={e => setLegenda(e.target.value)} disabled={!editavel} rows={5} maxLength={2200}
              className="rounded-lg border border-border bg-background p-2 text-sm text-foreground" />
          </label>
          {editavel && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={legenda === (it.legenda ?? "") || salvarLegenda.isPending} onClick={() => salvarLegenda.mutate({ id: it.id, legenda })}>Salvar legenda</Button>
              <Button size="sm" disabled={it.status !== "pronta" || aprovar.isPending || (it.temPreco && !condicoesValidas)} onClick={() => aprovar.mutate({ id: it.id })}
                title={it.temPreco && !condicoesValidas ? "Confirme as condições comerciais antes" : undefined}>
                <Check className="mr-1 h-3.5 w-3.5" /> Aprovar
              </Button>
              {it.status === "erro" && <Button size="sm" variant="outline" disabled={remontar.isPending} onClick={() => remontar.mutate({ id: it.id })}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Montar de novo</Button>}
              <Button size="sm" variant="ghost" disabled={descartar.isPending} onClick={() => descartar.mutate({ id: it.id })}><Trash2 className="mr-1 h-3.5 w-3.5" /> Descartar</Button>
            </div>
          )}
          {it.temPreco && !condicoesValidas && editavel && <p className="text-xs text-warn-300">Mostra entrada e parcelas: confirme as condições comerciais para aprovar.</p>}
        </div>
      </div>
    </div>
  );
}

function Catalogo() {
  const cat = trpc.fabricaCriativos.catalogo.useQuery();
  const utils = trpc.useUtils();
  const salvar = trpc.fabricaCriativos.salvarCatalogo.useMutation({ onSuccess: () => utils.fabricaCriativos.catalogo.invalidate(), onError: e => toast.error(e.message) });
  const [filtro, setFiltro] = useState<"todas" | "sem_tema">("sem_tema");
  const itens = (cat.data ?? []).filter(i => filtro === "todas" || !i.temas.length);
  const semTema = (cat.data ?? []).filter(i => !i.temas.length && !i.bloqueada).length;
  if (cat.isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p>{cat.data?.length ?? 0} mídias do Bom Jardims; {semTema} sem tema.</p>
        <select value={filtro} onChange={e => setFiltro(e.target.value as typeof filtro)} className={campo} aria-label="Filtrar o catálogo">
          <option value="sem_tema">Só as sem tema</option><option value="todas">Todas</option>
        </select>
      </div>
      <p className="text-xs text-muted-foreground">Marque os temas de cada mídia. A sugestão sai do nome do arquivo; confirme tocando nela. Mídia com texto ou logo gravado não serve de fundo para o gancho.</p>
      {!itens.length && <p className="text-sm text-muted-foreground">Nada para mostrar aqui.</p>}
      <div className="grid gap-2 md:grid-cols-2">
        {itens.map(i => {
          const alternar = (t: TemaMidia) => salvar.mutate({ materialId: i.id, temas: i.temas.includes(t) ? i.temas.filter(x => x !== t) : [...i.temas, t], temTexto: i.temTexto });
          return (
            <div key={i.id} className="flex gap-3 rounded-xl border border-border bg-card p-2">
              {i.tipo === "imagem"
                ? <img src={i.arquivo} alt="" loading="lazy" className="h-20 w-16 shrink-0 rounded-md object-cover" />
                : <video src={i.arquivo} preload="metadata" muted className="h-20 w-16 shrink-0 rounded-md bg-black object-cover" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.titulo}</p>
                <p className="text-xs text-muted-foreground">#{i.id} · {i.tipo === "video" ? `vídeo${i.dur ? ` de ${Math.round(i.dur)} s` : ""}` : "foto"}{i.motivoBloqueio ? ` · ${i.motivoBloqueio}` : ""}</p>
                {!i.bloqueada && (
                  <>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {TEMAS_MIDIA.map(t => {
                        const on = i.temas.includes(t), sug = i.sugestao.includes(t);
                        return (
                          <button key={t} onClick={() => alternar(t)} aria-pressed={on} disabled={salvar.isPending}
                            className={`rounded-md border px-1.5 py-0.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${on ? "border-primary bg-primary/15 text-primary" : sug ? "border-dashed border-primary/60 text-foreground" : "border-border text-muted-foreground"}`}>
                            {ROTULO_TEMA[t]}{sug && !on ? "?" : ""}
                          </button>
                        );
                      })}
                    </div>
                    <label className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input type="checkbox" checked={i.temTexto} onChange={e => salvar.mutate({ materialId: i.id, temas: i.temas, temTexto: e.target.checked })} /> Tem texto ou logo gravado
                    </label>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Fábrica diária de criativos: às 6h o CRM monta as pautas do dia a partir dos Materiais e as peças vão para esta fila.
 * Nada é publicado: a peça aprovada fica pronta para baixar e, depois da verificação da Meta, para a publicação.
 */
export default function FabricaCriativos() {
  const { user } = useAuth();
  const admin = perfilDe(user as any) === "admin";
  const [vista, setVista] = useState<"fila" | "catalogo">("fila");
  const painel = trpc.fabricaCriativos.painel.useQuery(undefined, {
    refetchInterval: q => ((q.state.data?.fila ?? []).some(i => i.status === "montando" || i.status === "pendente") ? 5000 : false),
  });
  const utils = trpc.useUtils();
  const gerar = trpc.fabricaCriativos.gerar.useMutation({
    onSuccess: r => { toast.success(r.criadas ? `${r.criadas} pauta(s) na fila de montagem` : "As pautas de hoje já existem"); utils.fabricaCriativos.painel.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const confirmar = trpc.fabricaCriativos.confirmarCondicoes.useMutation({ onSuccess: () => { toast.success("Condições confirmadas por 30 dias"); utils.fabricaCriativos.painel.invalidate(); }, onError: e => toast.error(e.message) });
  const ligar = trpc.fabricaCriativos.ligar.useMutation({ onSuccess: () => utils.fabricaCriativos.painel.invalidate(), onError: e => toast.error(e.message) });
  const d = painel.data;
  const [cond, setCond] = useState({ entrada: "", parcelas: "", handle: "" });
  useEffect(() => { if (d && !cond.entrada) setCond({ entrada: d.condicoes.entrada, parcelas: d.condicoes.parcelas, handle: d.condicoes.handle }); }, [d, cond.entrada]);
  const porDia = useMemo(() => {
    const m = new Map<string, Fila>();
    for (const it of d?.fila ?? []) m.set(it.data, [...(m.get(it.data) ?? []), it]);
    return Array.from(m.entries());
  }, [d?.fila]);
  const temaHoje = d ? ROTULO_TEMA_DIA[(["obra", "natureza", "mapa", "pagamento", "seguranca", "visita", "familia"] as const)[(new Date(`${d.hoje}T12:00:00Z`).getUTCDay() + 6) % 7]] : "";

  if (painel.isLoading || !d) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-sm font-semibold">Hoje, {br(d.hoje)}: tema {temaHoje}</p>
          <p className="mt-1 text-xs text-muted-foreground">Por dia: Reels de anúncio, Reels orgânico, carrossel e Stories, com mídias que não foram usadas nos últimos 14 dias.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" disabled={gerar.isPending} onClick={() => gerar.mutate({ data: d.hoje, refazer: false })}>{gerar.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Gerar as pautas de hoje</Button>
            <Button size="sm" variant="outline" disabled={gerar.isPending} onClick={() => { if (confirm("Refazer as pautas de hoje? As aprovadas ficam; as outras são trocadas.")) gerar.mutate({ data: d.hoje, refazer: true }); }}>Refazer</Button>
          </div>
          {admin && (
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={d.ligada} disabled={ligar.isPending} onChange={e => ligar.mutate({ ligada: e.target.checked })} /> Gerar sozinho todo dia às 6h
            </label>
          )}
        </div>
        <div className={`rounded-xl border p-3 ${d.condicoes.validas ? "border-border bg-card" : "border-warn-500/40 bg-warn-500/5"}`}>
          <p className="text-sm font-semibold">Condições nas peças com preço</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {d.condicoes.validas ? `Confirmadas em ${br(d.condicoes.confirmadoEm!.slice(0, 10))}; valem 30 dias.` : "Ainda não confirmadas, ou vencidas. As peças com entrada e parcelas só podem ser aprovadas depois da confirmação."}
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Entrada<input className={`${campo} w-28`} value={cond.entrada} disabled={!admin} onChange={e => setCond({ ...cond, entrada: e.target.value })} /></label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Parcelas<input className={`${campo} w-20`} value={cond.parcelas} disabled={!admin} onChange={e => setCond({ ...cond, parcelas: e.target.value })} /></label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Perfil<input className={`${campo} w-32`} value={cond.handle} disabled={!admin} onChange={e => setCond({ ...cond, handle: e.target.value })} /></label>
            {admin && <Button size="sm" disabled={confirmar.isPending} onClick={() => confirmar.mutate(cond)}>Confirmar que valem</Button>}
          </div>
          {!admin && <p className="mt-1 text-xs text-muted-foreground">Só o administrador confirma.</p>}
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {([["fila", "Fila de aprovação"], ["catalogo", "Catálogo das mídias"]] as const).map(([k, r]) => (
          <button key={k} onClick={() => setVista(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${vista === k ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{r}</button>
        ))}
      </div>

      {vista === "catalogo" ? <Catalogo /> : !porDia.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma pauta nos últimos 7 dias. Marque os temas no catálogo e gere as pautas de hoje.</p>
      ) : porDia.map(([dia, itens]) => (
        <section key={dia} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{br(dia)} · {itens.filter(i => i.status === "aprovada").length} de {itens.length} aprovadas</h3>
          {itens.map(it => <Peca key={it.id} it={it} condicoesValidas={d.condicoes.validas} />)}
        </section>
      ))}
      <p className="text-xs text-muted-foreground">Nada é publicado daqui. A publicação no Instagram e os anúncios (sempre pausados) entram depois da verificação da empresa na Meta.</p>
    </div>
  );
}
