import { useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import MapaTematico from "@/components/empreendimento/MapaTematico";
import PainelLote, { type LotePainel } from "@/components/empreendimento/PainelLote";
import { COR_SITUACAO, ROTULO_SITUACAO, SITUACOES_LOTE, VENDIDOS, type SituacaoLote } from "@shared/lotes";
import { AlertTriangle, Download, FileText, Map as MapIcon, Printer, Trash2, Upload } from "lucide-react";

const CATEGORIAS: Record<string, string> = { licenca: "Licença", projeto: "Projeto / DXF", escritura: "Escritura", memorial: "Memorial", mapa: "Mapa", contrato: "Contrato", outro: "Outro" };
const brl = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const m2 = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const tamanho = (b: number | null) => (b == null ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const cel = (v: unknown) => { const s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function Registro({ slug, emp, admin, onMudou }: { slug: string; emp: any; admin: boolean; onMudou: () => void }) {
  const [matricula, setMatricula] = useState(emp.registroMatricula ?? "");
  const [cartorio, setCartorio] = useState(emp.registroCartorio ?? "");
  const [rt, setRt] = useState(emp.responsavelTecnico ?? "");
  const salvar = trpc.empreendimentosAdmin.salvarRegistro.useMutation({ onSuccess: () => { toast.success("Registro salvo"); onMudou(); }, onError: e => toast.error(e.message) });
  const campo = "w-full h-9 rounded-md border border-border bg-secondary px-2 text-sm";
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
      <p className="font-semibold">Registro e responsável técnico</p>
      <div className="grid md:grid-cols-3 gap-2">
        <label className="space-y-1"><span className="text-xs text-muted-foreground">Matrícula do registro</span><input disabled={!admin} value={matricula} onChange={e => setMatricula(e.target.value)} className={campo} placeholder="ex.: 12.345" /></label>
        <label className="space-y-1"><span className="text-xs text-muted-foreground">Cartório</span><input disabled={!admin} value={cartorio} onChange={e => setCartorio(e.target.value)} className={campo} placeholder="Registro de Imóveis de Açailândia" /></label>
        <label className="space-y-1"><span className="text-xs text-muted-foreground">Responsável técnico (memoriais)</span><input disabled={!admin} value={rt} onChange={e => setRt(e.target.value)} className={campo} placeholder="Nome, título e registro profissional" /></label>
      </div>
      {admin && <Button size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate({ slug, registroMatricula: matricula || null, registroCartorio: cartorio || null, responsavelTecnico: rt || null })}>Salvar</Button>}
    </div>
  );
}

function Arquivos({ slug, arquivos, admin, onMudou }: { slug: string; arquivos: any[]; admin: boolean; onMudou: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [categoria, setCategoria] = useState("outro");
  const [enviando, setEnviando] = useState(false);
  const [dxf, setDxf] = useState<number | null>(null);
  const excluir = trpc.empreendimentosAdmin.excluirArquivo.useMutation({ onSuccess: () => { toast.success("Arquivo excluído"); onMudou(); }, onError: e => toast.error(e.message) });
  const previa = trpc.empreendimentosAdmin.previaDxf.useQuery({ slug, arquivoId: dxf ?? 0 }, { enabled: !!dxf });
  const aplicar = trpc.empreendimentosAdmin.aplicarDxf.useMutation({
    onSuccess: r => { toast.success(`DXF aplicado: ${r.atualizados} lotes atualizados, ${r.criados} novos`); setDxf(null); onMudou(); },
    onError: e => toast.error(e.message),
  });

  const enviar = async (files: FileList | null) => {
    if (!files?.length) return;
    setEnviando(true);
    try {
      for (const f of Array.from(files)) {
        const r = await fetch(`/api/empreendimentos/${slug}/arquivos`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(f.name), "X-File-Type": f.type || "application/octet-stream", "X-Categoria": /\.dxf$/i.test(f.name) ? "projeto" : categoria },
          body: await f.arrayBuffer(),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.success) toast.error(`${f.name}: ${j.error || "falha no envio"}`);
        else toast.success(`${f.name} enviado`);
      }
      onMudou();
    } finally {
      setEnviando(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm"><span className="block text-xs text-muted-foreground">Tipo</span>
          <select value={categoria} onChange={e => setCategoria(e.target.value)} className="h-9 rounded-md border border-border bg-secondary px-2 text-sm">
            {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <input ref={ref} type="file" multiple className="hidden" onChange={e => enviar(e.target.files)} />
        <Button onClick={() => ref.current?.click()} disabled={enviando}><Upload className="mr-1.5 h-4 w-4" /> {enviando ? "Enviando…" : "Enviar arquivos"}</Button>
        <p className="text-[11px] text-muted-foreground basis-full">Até 20 MB por arquivo. Ficam guardados no CRM e só abrem com login (o empreendedor não vê esta aba).</p>
      </div>

      {dxf && (
        <div className="rounded-xl border border-primary/40 bg-card p-4 space-y-2 text-sm">
          <p className="font-semibold">Importar lotes do DXF</p>
          {previa.isLoading && <p className="text-muted-foreground">Lendo o desenho…</p>}
          {previa.error && <p className="text-red-400">{previa.error.message}</p>}
          {previa.data && (
            <>
              <p>{previa.data.total} lotes no desenho · {previa.data.novos.length} novo(s) · {previa.data.alterados.length} com área diferente · {previa.data.ausentes.length} cadastrado(s) que não estão no desenho</p>
              {previa.data.novos.length > 0 && <p className="text-xs">Novos (entram bloqueados para revisão): {previa.data.novos.map(n => `${n.codigo} (${m2(n.areaM2)} m²)`).join(", ")}</p>}
              {previa.data.alterados.length > 0 && <p className="text-xs">Área alterada: {previa.data.alterados.map(a => `${a.codigo} ${m2(a.antes)} → ${m2(a.depois)}`).join("; ")}</p>}
              {previa.data.ausentes.length > 0 && <p className="text-xs text-amber-300">Não estão no desenho (ficam como estão): {previa.data.ausentes.join(", ")}</p>}
              {previa.data.perimetro && <p className="text-xs">Perímetro: {m2(previa.data.perimetro.areaM2)} m² · {previa.data.perimetro.perimetroM.toLocaleString("pt-BR")} m</p>}
              {previa.data.ruas.length > 0 && <p className="text-xs">Ruas: {previa.data.ruas.join(", ")}</p>}
              {previa.data.avisos.map((a, i) => <p key={i} className="text-xs text-muted-foreground">⚠️ {a}</p>)}
              <div className="flex gap-2">
                <Button size="sm" disabled={aplicar.isPending} onClick={() => aplicar.mutate({ slug, arquivoId: dxf })}>Aplicar: atualizar desenho e áreas</Button>
                <Button size="sm" variant="outline" onClick={() => setDxf(null)}>Cancelar</Button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {arquivos.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum arquivo ainda.</p>}
        {arquivos.map(a => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <a href={`/api/empreendimentos/arquivos/${a.id}`} target="_blank" rel="noreferrer" className="flex-1 min-w-[180px] truncate hover:underline">{a.nome}</a>
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">{CATEGORIAS[a.categoria] ?? a.categoria}</span>
            <span className="text-xs text-muted-foreground">{tamanho(a.tamanhoBytes)}</span>
            <a href={`/api/empreendimentos/arquivos/${a.id}?baixar=1`} className="text-muted-foreground hover:text-foreground" aria-label="Baixar"><Download className="h-4 w-4" /></a>
            {admin && /\.dxf$/i.test(a.nome) && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDxf(a.id)}>Importar lotes</Button>}
            {admin && <button onClick={() => confirm(`Excluir ${a.nome}?`) && excluir.mutate({ id: a.id })} className="text-muted-foreground hover:text-red-400" aria-label="Excluir"><Trash2 className="h-4 w-4" /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Empreendimento: mapa temático, controle de vendas dos lotes, arquivos e documentos */
export default function Empreendimento() {
  const [, params] = useRoute("/empreendimentos/:slug");
  const [, navigate] = useLocation();
  const slug = params?.slug ?? "";
  const { user } = useAuth();
  const admin = perfilDe(user as any) === "admin";
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.empreendimentosAdmin.detalhe.useQuery({ slug }, { enabled: !!slug });
  const [sel, setSel] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<SituacaoLote | "">("");
  const atualizar = () => utils.empreendimentosAdmin.detalhe.invalidate({ slug });

  const lotes = (data?.lotes ?? []) as (LotePainel & { poligono: [number, number][] | null })[];
  const selecionado = useMemo(() => lotes.find(l => l.id === sel) ?? null, [lotes, sel]);
  const lista = filtro ? lotes.filter(l => l.situacao === filtro) : lotes;

  const exportar = () => {
    const cab = ["Lote", "Quadra", "Área (m²)", "Situação", "Cliente", "Telefone", "Corretor", "Valor da venda", "Entrada", "Parcelas", "Desde", "Observação"];
    const linhas = lista.map(l => [l.codigo, l.quadra, m2(l.areaM2), ROTULO_SITUACAO[l.situacao], l.leadNome || l.clienteNome, l.leadTelefone, l.corretorNome,
      l.valorVenda ?? "", l.valorEntrada ?? "", l.numParcelas ?? "", l.dataSituacao ? new Date(l.dataSituacao).toLocaleDateString("pt-BR") : "", l.observacao]);
    const csv = "﻿" + [cab, ...linhas].map(r => r.map(cel).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `lotes-${slug}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  if (error) return <p className="p-6 text-sm text-red-400">{error.message}</p>;
  if (isLoading || !data) return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  const emp = data.empreendimento;
  const vendidos = VENDIDOS.reduce((s, k) => s + data.resumo[k], 0);

  return (
    <div>
      <PageHeader icone={MapIcon} titulo={emp.nome} subtitulo={[emp.municipio, emp.uf].filter(Boolean).join("/") + ` · ${lotes.length} lotes`} />
      <div className="px-4 md:px-6 pb-8 max-w-[1500px] mx-auto space-y-4">
        {!emp.registroMatricula && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <p><b>Empreendimento sem registro no cartório informado.</b> A Licença de Operação é ambiental e não substitui o registro do parcelamento (Lei 6.766/79). Reservas, entradas e vendas registradas aqui são controle interno sob sua responsabilidade.</p>
          </div>
        )}

        <Tabs defaultValue="mapa">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="mapa">Mapa</TabsTrigger>
            <TabsTrigger value="lotes">Lotes</TabsTrigger>
            <TabsTrigger value="geral">Visão geral</TabsTrigger>
            <TabsTrigger value="arquivos">Arquivos ({data.arquivos.length})</TabsTrigger>
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
          </TabsList>

          <TabsContent value="mapa" className="mt-3">
            <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-start">
              <MapaTematico slug={slug} lotes={lotes} ruas={data.ruas} perimetro={data.perimetro?.poligono} selecionado={sel} onSelecionar={setSel} />
              {selecionado ? <PainelLote slug={slug} lote={selecionado} onMudou={atualizar} onFechar={() => setSel(null)} />
                : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Clique num lote para ver e mudar a situação (interesse, reserva, entrada, venda), o cliente e o corretor.</p>}
            </div>
          </TabsContent>

          <TabsContent value="lotes" className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <select value={filtro} onChange={e => setFiltro(e.target.value as any)} className="h-9 rounded-md border border-border bg-secondary px-2 text-sm">
                <option value="">Todas as situações ({lotes.length})</option>
                {SITUACOES_LOTE.map(s => <option key={s} value={s}>{ROTULO_SITUACAO[s]} ({data.resumo[s]})</option>)}
              </select>
              <Button size="sm" variant="outline" onClick={exportar}><Download className="mr-1.5 h-4 w-4" /> Exportar CSV</Button>
            </div>
            <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-start">
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border text-muted-foreground">
                    {["Lote", "Área (m²)", "Situação", "Cliente", "Corretor", "Venda", "Entrada", "Parcelas"].map(h => <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {lista.map(l => (
                      <tr key={l.id} onClick={() => setSel(l.id)} className={`border-b border-border/50 cursor-pointer hover:bg-secondary/30 ${sel === l.id ? "bg-secondary/40" : ""}`}>
                        <td className="px-2 py-1.5 font-semibold">{l.codigo}</td>
                        <td className="px-2 py-1.5 tabular-nums">{m2(l.areaM2)}</td>
                        <td className="px-2 py-1.5"><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_SITUACAO[l.situacao] }} />{ROTULO_SITUACAO[l.situacao]}</span></td>
                        <td className="px-2 py-1.5">{l.leadNome || l.clienteNome || "—"}</td>
                        <td className="px-2 py-1.5">{l.corretorNome || "—"}</td>
                        <td className="px-2 py-1.5 tabular-nums">{brl(l.valorVenda)}</td>
                        <td className="px-2 py-1.5 tabular-nums">{brl(l.valorEntrada)}</td>
                        <td className="px-2 py-1.5 tabular-nums">{l.numParcelas ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selecionado && <PainelLote slug={slug} lote={selecionado} onMudou={atualizar} onFechar={() => setSel(null)} />}
            </div>
          </TabsContent>

          <TabsContent value="geral" className="mt-3 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[["Lotes", lotes.length], ["Disponíveis", data.resumo.disponivel], ["Reservados / com entrada", data.resumo.reservado + data.resumo.entrada], ["Vendidos", vendidos]].map(([r, n]) => (
                <div key={String(r)} className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{r}</p><p className="text-2xl font-bold">{n}</p></div>
              ))}
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-sm space-y-1.5">
              <p className="font-semibold">Por situação</p>
              {SITUACOES_LOTE.map(s => (
                <div key={s} className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm" style={{ background: COR_SITUACAO[s] }} />
                  <span className="flex-1">{ROTULO_SITUACAO[s]}</span>
                  <span className="tabular-nums font-semibold">{data.resumo[s]}</span>
                </div>
              ))}
              <p className="pt-2 text-xs text-muted-foreground">Valor vendido (soma dos lotes vendidos com valor informado): <b className="text-foreground">{brl(data.valorVendido)}</b></p>
            </div>
            <Registro slug={slug} emp={emp} admin={admin} onMudou={atualizar} />
          </TabsContent>

          <TabsContent value="arquivos" className="mt-3">
            <Arquivos slug={slug} arquivos={data.arquivos} admin={admin} onMudou={atualizar} />
          </TabsContent>

          <TabsContent value="documentos" className="mt-3 space-y-3">
            <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
              <p className="font-semibold">Mapa, anexo e memoriais descritivos</p>
              <p className="text-xs text-muted-foreground">Gerados a partir do desenho importado (DXF). O memorial sai como <b>rascunho</b> para conferência e assinatura do responsável técnico. Use "Imprimir → Salvar como PDF".</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => navigate(`/empreendimentos/${slug}/documentos?filtro=disponiveis`)}><Printer className="mr-1.5 h-4 w-4" /> Lotes disponíveis</Button>
                <Button variant="outline" onClick={() => navigate(`/empreendimentos/${slug}/documentos?filtro=todos`)}><Printer className="mr-1.5 h-4 w-4" /> Todos os lotes</Button>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
              <p className="font-semibold">Folder de divulgação</p>
              <p className="text-xs text-muted-foreground">Folder em A4 com foto, mapa, medidas e QR Code para a página do empreendimento. Geral ou de uma chácara (também pelo painel do lote). Sem preço.</p>
              <Button onClick={() => navigate(`/empreendimentos/${slug}/folder`)}><FileText className="mr-1.5 h-4 w-4" /> Abrir folder</Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
