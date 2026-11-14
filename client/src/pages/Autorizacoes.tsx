import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, Copy, CopyPlus, Loader2, Plus, Send, ShieldCheck, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { AcoesPdf } from "@/components/sistema/AcoesPdf";
import { brl } from "@shared/simulador";

type Linha = { loteCodigo: string; preco: string; entrada: string; entradaParcelas: number; prazo: string; parcela: string; data1: string; inicio: string };
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const nova = (): Linha => ({ loteCodigo: "", preco: "", entrada: "", entradaParcelas: 1, prazo: "180", parcela: "", data1: hoje(), inicio: "" });
const num = (v: string) => Number(String(v).replace(/\./g, "").replace(",", "."));
const sinal = (v: number) => `${v >= 0 ? "+" : "−"} ${brl(Math.abs(v))}`;
const ROTULO: Record<string, string> = { aguardando: "Aguardando a proprietária", autorizada: "Autorizada", cancelada: "Cancelada" };
const campo = "mt-1 block h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground";

/**
 * Autorizações da proprietária (só o administrador): proposta de venda fora da tabela — uma ou várias chácaras, cada uma
 * com o seu plano — com a comparação automática com a tabela. A proprietária assina pelo link com código no WhatsApp;
 * autorizada, cada chácara vira um contrato individual no Novo contrato, que puxa o plano e anexa o PDF assinado.
 */
export default function Autorizacoes() {
  const utils = trpc.useUtils();
  const lista = trpc.autorizacoes.listar.useQuery();
  const { data: emps } = trpc.empreendimentosAdmin.lista.useQuery();
  const [abrir, setAbrir] = useState(false);
  const [slug, setSlug] = useState("");
  const [cliente, setCliente] = useState("");
  const [obs, setObs] = useState("");
  const [prop, setProp] = useState({ nome: "", empresa: "", documento: "", telefone: "" });
  const [linhas, setLinhas] = useState<Linha[]>([nova()]);
  const opcoesEmp = useMemo(() => (emps ?? []).filter((e: any) => e.acesso), [emps]);
  useEffect(() => { if (!slug && opcoesEmp.length === 1) setSlug(opcoesEmp[0].slug); }, [opcoesEmp, slug]);
  const op = trpc.contratos.opcoes.useQuery({ slug }, { enabled: !!slug });
  const propPadrao = trpc.autorizacoes.proprietaria.useQuery({ slug }, { enabled: !!slug });
  useEffect(() => { if (propPadrao.data) setProp({ nome: propPadrao.data.nome, empresa: propPadrao.data.empresa, documento: propPadrao.data.documento, telefone: propPadrao.data.telefone }); }, [propPadrao.data]);

  const itens = linhas.filter(l => l.loteCodigo && num(l.entrada) > 0 && Number(l.prazo) > 0 && num(l.parcela) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(l.data1)).map(l => ({
    loteCodigo: l.loteCodigo, dataPrimeiroPagamento: l.data1,
    personalizado: { entrada: num(l.entrada), entradaParcelas: l.entradaParcelas, prazo: Number(l.prazo), parcela: num(l.parcela),
      ...(l.preco.trim() && num(l.preco) > 0 ? { preco: num(l.preco) } : {}), ...(/^\d{4}-\d{2}-\d{2}$/.test(l.inicio) ? { inicioParcelas: l.inicio } : {}) },
  }));
  const pedido = { empreendimentoSlug: slug, clienteNome: cliente, itens, observacao: obs || undefined, proprietario: prop };
  const prontos = !!slug && itens.length > 0 && itens.length === linhas.length;
  const sim = trpc.autorizacoes.simular.useQuery(pedido, { enabled: prontos, retry: false });
  const criar = trpc.autorizacoes.criar.useMutation({
    onSuccess: r => { toast.success(r.enviado ? `Autorização n.º ${r.numero} enviada no WhatsApp da proprietária` : `Autorização n.º ${r.numero} gerada — copie o link (sem WhatsApp da proprietária)`); setAbrir(false); setLinhas([nova()]); setCliente(""); setObs(""); utils.autorizacoes.listar.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const cancelar = trpc.autorizacoes.cancelar.useMutation({ onSuccess: () => { toast.success("Autorização cancelada"); utils.autorizacoes.listar.invalidate(); }, onError: e => toast.error(e.message) });
  const reenviar = trpc.autorizacoes.reenviar.useMutation({ onSuccess: r => (r.enviado ? toast.success("Link reenviado") : toast.error("Sem WhatsApp da proprietária")), onError: e => toast.error(e.message) });
  const setL = (i: number, k: keyof Linha, v: any) => setLinhas(ls => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const usados = new Set(linhas.map(l => l.loteCodigo));

  return (
    <div>
      <PageHeader icone={ShieldCheck} titulo="Autorizações da proprietária" subtitulo="Venda fora da tabela: a proprietária autoriza antes; cada chácara autorizada vira um contrato no Novo contrato"
        acoes={<Button onClick={() => setAbrir(v => !v)}><Plus className="h-4 w-4" /> Nova autorização</Button>} />
      <div className="mx-auto max-w-[1300px] space-y-4 px-4 pb-10 md:px-6">
        {abrir && (
          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs text-muted-foreground">Empreendimento
                <select className={campo} value={slug} onChange={e => { setSlug(e.target.value); setLinhas([nova()]); }}>
                  <option value="">Escolha…</option>
                  {opcoesEmp.map((e: any) => <option key={e.slug} value={e.slug}>{e.nome}</option>)}
                </select>
              </label>
              <label className="text-xs text-muted-foreground md:col-span-2">Interessado (cliente)
                <input className={campo} value={cliente} maxLength={160} onChange={e => setCliente(e.target.value)} placeholder="Nome de quem quer comprar" />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <label className="text-xs text-muted-foreground">Proprietária — quem assina
                <input className={campo} value={prop.nome} maxLength={160} onChange={e => setProp(p => ({ ...p, nome: e.target.value }))} />
              </label>
              <label className="text-xs text-muted-foreground">Empresa (se for PJ)
                <input className={campo} value={prop.empresa} maxLength={160} onChange={e => setProp(p => ({ ...p, empresa: e.target.value }))} placeholder="Razão social" />
              </label>
              <label className="text-xs text-muted-foreground">CPF/CNPJ
                <input className={campo} value={prop.documento} maxLength={25} onChange={e => setProp(p => ({ ...p, documento: e.target.value }))} />
              </label>
              <label className="text-xs text-muted-foreground">WhatsApp de quem assina
                <input className={campo} inputMode="tel" value={prop.telefone} maxLength={25} onChange={e => setProp(p => ({ ...p, telefone: e.target.value }))} placeholder="(99) 9 9000-0000" />
              </label>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Chácaras da proposta</p>
              {linhas.map((l, i) => {
                const c = sim.data?.itens.find(x => x.loteCodigo === l.loteCodigo)?.comparativo;
                return (
                  <div key={i} className="rounded-lg border border-border/60 p-2">
                    <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-9">
                      <label className="text-xs text-muted-foreground">Chácara
                        <select className={campo} value={l.loteCodigo} onChange={e => setL(i, "loteCodigo", e.target.value)} disabled={!slug}>
                          <option value="">…</option>
                          {(op.data?.lotes ?? []).filter((x: any) => x.codigo === l.loteCodigo || !usados.has(x.codigo)).map((x: any) => <option key={x.codigo} value={x.codigo}>{x.codigo}</option>)}
                        </select>
                      </label>
                      <label className="text-xs text-muted-foreground">Preço (vazio = tabela)<input className={campo} inputMode="decimal" value={l.preco} onChange={e => setL(i, "preco", e.target.value.replace(/[^\d.,]/g, ""))} /></label>
                      <label className="text-xs text-muted-foreground">Entrada (R$)<input className={campo} inputMode="decimal" value={l.entrada} onChange={e => setL(i, "entrada", e.target.value.replace(/[^\d.,]/g, ""))} /></label>
                      <label className="text-xs text-muted-foreground">Entrada em
                        <select className={campo} value={l.entradaParcelas} onChange={e => setL(i, "entradaParcelas", Number(e.target.value))}>
                          {Array.from({ length: 12 }, (_, n) => n + 1).map(n => <option key={n} value={n}>{n === 1 ? "única" : `${n}×`}</option>)}
                        </select>
                      </label>
                      <label className="text-xs text-muted-foreground">1º pagamento<input type="date" className={campo} value={l.data1} onChange={e => setL(i, "data1", e.target.value)} /></label>
                      <label className="text-xs text-muted-foreground">Parcelas do saldo<input className={campo} inputMode="numeric" value={l.prazo} onChange={e => setL(i, "prazo", e.target.value.replace(/\D/g, ""))} /></label>
                      <label className="text-xs text-muted-foreground">Valor da parcela<input className={campo} inputMode="decimal" value={l.parcela} onChange={e => setL(i, "parcela", e.target.value.replace(/[^\d.,]/g, ""))} /></label>
                      <label className="text-xs text-muted-foreground">1º venc. do saldo<input type="date" className={campo} value={l.inicio} min={l.data1} onChange={e => setL(i, "inicio", e.target.value)} /></label>
                      <div className="flex items-end gap-1">
                        {i > 0 && <Button size="sm" variant="ghost" title="Copiar o plano da 1ª chácara" onClick={() => setLinhas(ls => ls.map((x, j) => (j === i ? { ...ls[0], loteCodigo: x.loteCodigo, preco: "" } : x)))}><CopyPlus className="h-4 w-4" /></Button>}
                        {linhas.length > 1 && <Button size="sm" variant="ghost" title="Tirar esta chácara" onClick={() => setLinhas(ls => ls.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
                      </div>
                    </div>
                    {c && <p className="mt-1 text-xs">Tabela {c.prazo}× {brl(c.parcelaTabela)} · total tabela {brl(c.totalTabela)} · proposta {brl(c.totalProposta)} ({sinal(c.diferencaNominal)}) · valor presente <b className={c.diferencaVp < 0 ? "text-danger-400" : "text-ok-400"}>{sinal(c.diferencaVp)} ({c.diferencaVpPct.toLocaleString("pt-BR")}%)</b>{c.taxaPropostaAa != null ? ` · taxa ${(c.taxaPropostaAa * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% a.a.` : ""}</p>}
                  </div>
                );
              })}
              <Button size="sm" variant="outline" disabled={!slug} onClick={() => setLinhas(ls => [...ls, { ...nova(), ...(ls[0] ? { ...ls[0], loteCodigo: "", preco: "" } : {}) }])}><Plus className="h-4 w-4" /> Adicionar chácara</Button>
            </div>
            {sim.error && <p className="text-sm text-danger-400">{sim.error.message}</p>}
            {sim.data && sim.data.itens.length > 1 && (
              <p className="text-sm">Total das {sim.data.itens.length} chácaras: proposta <b>{brl(sim.data.totais.totalProposta)}</b> · tabela {brl(sim.data.totais.totalTabela)} · diferença {sinal(sim.data.totais.diferencaNominal)} · valor presente <b className={sim.data.totais.diferencaVp < 0 ? "text-danger-400" : "text-ok-400"}>{sinal(sim.data.totais.diferencaVp)}</b> · parcelas {brl(sim.data.totais.parcelaMensal)}/mês (tabela {brl(sim.data.totais.parcelaMensalTabela)})</p>
            )}
            <label className="block text-xs text-muted-foreground">Observação para a proprietária (opcional)
              <input className={campo} value={obs} maxLength={600} onChange={e => setObs(e.target.value)} />
            </label>
            <div className="flex gap-2">
              <Button disabled={!prontos || cliente.trim().length < 3 || !sim.data || criar.isPending} onClick={() => criar.mutate(pedido)}>
                {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Gerar e enviar à proprietária
              </Button>
              <Button variant="ghost" onClick={() => setAbrir(false)}>Fechar</Button>
            </div>
          </section>
        )}

        {lista.isLoading && <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Carregando…</p>}
        {lista.data && !lista.data.length && !abrir && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhuma autorização ainda. Use "Nova autorização" para pedir à proprietária uma venda fora da tabela.</p>}
        {(lista.data ?? []).map(a => (
          <section key={a.id} className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <b>Autorização n.º {a.numero}</b>
              <span className={`rounded px-1.5 py-0.5 text-xs ${a.status === "autorizada" ? "bg-ok-500/15 text-ok-300" : a.status === "cancelada" ? "bg-secondary text-muted-foreground" : "bg-warn-500/15 text-warn-300"}`}>{ROTULO[a.status] ?? a.status}{a.assinadoEm ? ` em ${new Date(a.assinadoEm).toLocaleString("pt-BR")}` : ""}</span>
              <span className="text-xs text-muted-foreground">{a.empreendimento} · {a.chacaras} · interessado: {a.cliente} · proprietária: {a.proprietaria}</span>
              <span className="ml-auto flex flex-wrap gap-1">
                <AcoesPdf compacto rotulo="Autorização (interna)" url={`/api/autorizacoes/${a.id}.pdf`} nomeArquivo={`AUTORIZACAO-${a.numero}.pdf`} mensagem={`Autorização n.º ${a.numero}`} />
                {a.status === "autorizada" && <AcoesPdf compacto rotulo="Via do cliente" url={`/api/autorizacoes/${a.id}/via-cliente.pdf`} nomeArquivo={`CONDICOES-APROVADAS-${a.numero}.pdf`} mensagem={`Condições de pagamento aprovadas pela proprietária — ${a.chacaras}`} />}
                {a.status === "aguardando" && a.link && <>
                  <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(a.link!).then(() => toast.success("Link copiado"))}><Copy className="h-4 w-4" /> Link</Button>
                  <Button size="sm" variant="outline" disabled={reenviar.isPending} onClick={() => reenviar.mutate({ id: a.id })}><Send className="h-4 w-4" /> Reenviar</Button>
                  <Button size="sm" variant="outline" disabled={cancelar.isPending} onClick={() => cancelar.mutate({ id: a.id })}><Ban className="h-4 w-4" /> Cancelar</Button>
                </>}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {a.itens.map((i: any) => (
                <span key={i.loteCodigo} className="rounded-md border border-border/60 px-2 py-1">
                  <b>{i.loteCodigo}</b> · {i.entradaQtd > 1 ? `${i.entradaQtd}× ` : ""}entrada {brl(i.entrada)} + {i.prazo}× {brl(i.parcela)} · VP <span className={i.diferencaVp < 0 ? "text-danger-400" : "text-ok-400"}>{sinal(i.diferencaVp)}</span>
                  {i.contratoId ? <> · <Link href={`/contratos/${i.contratoId}`} className="underline">contrato</Link></> : a.status === "autorizada" ? <> · <Link href={`/contratos/novo?slug=${a.slug}&lote=${i.loteCodigo}&autorizacao=${a.id}`} className="font-semibold text-ok-300 underline">gerar contrato</Link></> : null}
                </span>
              ))}
              {a.totais && a.itens.length > 1 && <span className="px-2 py-1 text-muted-foreground">Total: {brl(a.totais.totalProposta)} · VP {sinal(a.totais.diferencaVp)}</span>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
