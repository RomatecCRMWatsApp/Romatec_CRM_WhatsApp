import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import MapaTematico from "@/components/empreendimento/MapaTematico";
import EnviarWhatsAppModal from "@/components/EnviarWhatsAppModal";
import { exibirTelefoneBR } from "@shared/telefone";
import { brl, type SeloLote } from "@shared/simulador";
import type { LotePainel } from "@/components/empreendimento/PainelLote";
import { Calculator, Download, FileText, Link2, Send, X } from "lucide-react";

const m2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cel = (v: unknown) => { const s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const num = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SELO: Record<SeloLote, { rotulo: string; classe: string }> = {
  disponivel: { rotulo: "Disponível", classe: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  negociacao: { rotulo: "Reservado / em negociação", classe: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  vendido: { rotulo: "Vendido — sem proposta", classe: "bg-red-500/20 text-red-300 border-red-500/50" },
  nao_comercializavel: { rotulo: "Não comercializável", classe: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40" },
};

type Lote = LotePainel & { poligono: [number, number][] | null };

/** Evolução mês a mês (entrada + Tabela Price) com exportação CSV */
function Evolucao({ slug, codigo, entrada, prazo, onFechar }: { slug: string; codigo: string; entrada: number; prazo: number; onFechar: () => void }) {
  const { data, isLoading, error } = trpc.simulador.evolucao.useQuery({ slug, lote: codigo, entrada, prazo });
  const exportar = () => {
    if (!data) return;
    const cab = ["Mês", "Tipo", "Nº", "Parcela", "Juros", "Amortização", "Saldo devedor"];
    const linhas = data.linhas.map(l => [l.mes, l.tipo === "entrada" ? "Entrada" : "Saldo", l.numero, num(l.parcela), num(l.juros), num(l.amortizacao), num(l.saldoDevedor)]);
    const csv = "﻿" + [cab, ...linhas].map(r => r.map(cel).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `simulacao-${codigo}-${entrada}x-${prazo}m.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4" onClick={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div role="dialog" aria-modal="true" className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <p className="flex-1 font-semibold">Evolução — chácara {codigo} · entrada {entrada === 1 ? "à vista" : `${entrada}x`} · saldo {prazo}x</p>
          <Button size="sm" variant="outline" disabled={!data} onClick={exportar}><Download className="mr-1.5 h-4 w-4" /> CSV</Button>
          <button onClick={onFechar} aria-label="Fechar" className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-auto">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Calculando…</p>}
          {error && <p className="p-4 text-sm text-red-400">{error.message}</p>}
          {data && (
            <table className="w-full text-xs tabular-nums">
              <thead className="sticky top-0 bg-card"><tr className="border-b border-border text-muted-foreground">
                {["Mês", "Tipo", "Nº", "Parcela", "Juros", "Amortização", "Saldo devedor"].map(h => <th key={h} className="px-2 py-2 text-right font-medium first:text-left">{h}</th>)}
              </tr></thead>
              <tbody>
                {data.linhas.map((l, k) => (
                  <tr key={k} className={`border-b border-border/40 ${l.tipo === "entrada" ? "bg-secondary/30" : ""}`}>
                    <td className="px-2 py-1">{l.mes}</td>
                    <td className="px-2 py-1 text-right">{l.tipo === "entrada" ? "Entrada" : "Saldo"}</td>
                    <td className="px-2 py-1 text-right">{l.numero}</td>
                    <td className="px-2 py-1 text-right">{num(l.parcela)}</td>
                    <td className="px-2 py-1 text-right">{num(l.juros)}</td>
                    <td className="px-2 py-1 text-right">{num(l.amortizacao)}</td>
                    <td className="px-2 py-1 text-right">{num(l.saldoDevedor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/** Vincular a simulação a um lead do CRM (grava a simulação e leva o lead para "Proposta") */
function VincularLead({ salvando, onFechar, onVincular }: { salvando: boolean; onFechar: () => void; onVincular: (leadId: number) => void }) {
  const [busca, setBusca] = useState("");
  const { data: achados } = trpc.empreendimentosAdmin.buscarLeads.useQuery({ q: busca }, { enabled: busca.trim().length >= 2 });
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4" onClick={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div role="dialog" aria-modal="true" className="w-full max-w-md space-y-2 rounded-2xl border border-border bg-card p-5">
        <p className="font-semibold">Vincular ao lead</p>
        <p className="text-xs text-muted-foreground">A simulação fica gravada no lead e ele vai para a etapa <b>Proposta</b> do funil (nunca volta etapa).</p>
        <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar lead por nome ou telefone" className="h-9 w-full rounded-md border border-border bg-secondary px-2 text-sm" />
        <div className="max-h-60 divide-y divide-border overflow-auto rounded-md border border-border">
          {(achados ?? []).length === 0 && <p className="p-2 text-xs text-muted-foreground">{busca.trim().length >= 2 ? "Nenhum lead encontrado." : "Digite ao menos 2 letras ou dígitos."}</p>}
          {(achados ?? []).map(a => (
            <button key={a.id} disabled={salvando} onClick={() => onVincular(a.id)} className="block w-full px-2 py-1.5 text-left text-sm hover:bg-secondary/50">
              {a.nome || "Sem nome"} <span className="text-xs text-muted-foreground">· {a.phone}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end"><Button size="sm" variant="outline" onClick={onFechar}>Cancelar</Button></div>
      </div>
    </div>
  );
}

/** Aba Empreendimento › Simulador: preço do lote, entrada, planos do saldo, proposta e comissão */
export default function Simulador({ slug, lotes, ruas, perimetro, destinoSugerido }: {
  slug: string; lotes: Lote[]; ruas: any[]; perimetro?: [number, number][] | null; destinoSugerido?: string;
}) {
  const vendaveis = useMemo(() => lotes.filter(l => l.situacao !== "bloqueado").map(l => l.codigo).sort(), [lotes]);
  const [digitado, setDigitado] = useState("");
  const [codigo, setCodigo] = useState("");
  const [entrada, setEntrada] = useState(1);
  const [prazo, setPrazo] = useState(120);
  const [modal, setModal] = useState<"evolucao" | "whatsapp" | "lead" | null>(null);

  const escolher = (c: string) => { const v = c.trim().toUpperCase(); setDigitado(v); if (/^[A-Z]\d{2}$/.test(v)) setCodigo(v); };
  const { data, error, isFetching } = trpc.simulador.simular.useQuery(
    { slug, lote: codigo, entrada },
    { enabled: !!codigo, retry: false, placeholderData: prev => (prev && prev.lote.codigo === codigo ? prev : undefined) },
  );
  useEffect(() => { if (data && !data.condicoes.prazos.includes(prazo)) setPrazo(data.condicoes.prazos[data.condicoes.prazos.length - 1]); }, [data, prazo]);

  const salvar = trpc.simulador.salvar.useMutation({
    onSuccess: r => { toast.success(`Simulação vinculada ao lead${r.etapa === "proposta" ? " — lead em Proposta" : ""}`); setModal(null); },
    onError: e => toast.error(e.message),
  });
  const envio = trpc.simulador.enviarWhatsApp.useMutation({
    onSuccess: r => { toast.success(`Simulação enviada para ${exibirTelefoneBR(r.telefone)}`); setModal(null); },
    onError: e => toast.error(e.message),
  });

  const sel = lotes.find(l => l.codigo === codigo)?.id ?? null;
  const sim = data?.simulacao;
  const plano = sim?.planos.find(p => p.prazo === prazo);
  const vendido = data?.lote.selo === "vendido";
  const proposta = () => window.open(`/empreendimentos/${slug}/proposta?lote=${codigo}&entrada=${entrada}&prazo=${prazo}`, "_blank");

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_420px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
          <label className="space-y-1 text-sm">
            <span className="block text-xs text-muted-foreground">Chácara (nº ou clique no mapa)</span>
            <input list="simulador-lotes" value={digitado} onChange={e => escolher(e.target.value)} placeholder="A01" maxLength={4}
              className="h-9 w-32 rounded-md border border-border bg-secondary px-2 text-sm uppercase" />
            <datalist id="simulador-lotes">{vendaveis.map(c => <option key={c} value={c} />)}</datalist>
          </label>
          {data && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">Chácara {data.lote.codigo}</span>
              <span className="text-muted-foreground">{m2(data.lote.areaM2)} m²</span>
              <span className="font-semibold">{brl(data.simulacao.preco)}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SELO[data.lote.selo].classe}`}>{SELO[data.lote.selo].rotulo}</span>
            </div>
          )}
          {error && codigo && <p className="basis-full text-sm text-red-400">{error.message}</p>}
        </div>
        <MapaTematico slug={slug} lotes={lotes} ruas={ruas} perimetro={perimetro} selecionado={sel}
          onSelecionar={id => { const l = lotes.find(x => x.id === id); if (l) escolher(l.codigo); }} compacto />
      </div>

      <div className="space-y-3">
        {!codigo && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground"><Calculator className="mr-1 inline h-4 w-4" /> Escolha a chácara pelo número ou clicando no mapa.</p>}
        {sim && data && (
          <>
            <div className={`space-y-2 rounded-xl border border-border bg-card p-4 ${isFetching ? "opacity-80" : ""}`}>
              <p className="text-sm font-semibold">Entrada ({Math.round(data.condicoes.entradaPct * 100)}% = {brl(sim.entrada30)})</p>
              <div className="flex flex-wrap gap-1.5">
                {data.opcoesEntrada.map(o => (
                  <button key={o.parcelas} onClick={() => setEntrada(o.parcelas)}
                    className={`rounded-lg border px-2.5 py-1.5 text-left text-xs ${entrada === o.parcelas ? "border-primary bg-primary/15 text-foreground" : "border-border hover:bg-secondary/50"}`}>
                    {o.parcelas === 1 ? <>À vista <b>{brl(o.total)}</b> <span className="text-emerald-400">(economize {brl(o.desconto)})</span></> : <>{o.parcelas}x de <b>{brl(o.valorParcela)}</b></>}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Entrada escolhida: <b className="text-foreground">{entrada === 1 ? `à vista ${brl(sim.entradaAvista)}` : `${entrada}x — total ${brl(sim.entrada30)}`}</b> · Saldo ({Math.round((1 - data.condicoes.entradaPct) * 100)}%): <b className="text-foreground">{brl(sim.saldo)}</b></p>
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">Saldo em parcelas fixas</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {sim.planos.map(p => (
                  <button key={p.prazo} onClick={() => setPrazo(p.prazo)}
                    className={`rounded-lg border p-2.5 text-left ${prazo === p.prazo ? "border-primary bg-primary/10" : "border-border hover:bg-secondary/40"}`}>
                    <p className="text-xs text-muted-foreground">{p.prazo} parcelas fixas de</p>
                    <p className="text-lg font-bold tabular-nums">{brl(p.parcela)}</p>
                    <p className="text-[11px] leading-snug text-muted-foreground">Saldo {brl(p.totalSaldo)} · juros {brl(p.juros)}<br />Total pago <b className="text-foreground">{brl(p.totalPago)}</b></p>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">{data.textoJuros} · preço da chácara {brl(sim.preco)}</p>
            </div>

            {vendido && <p className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">Chácara vendida: simulação só para consulta, sem proposta, envio ou vínculo.</p>}
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setModal("evolucao")}>Ver evolução</Button>
              <Button size="sm" variant="outline" disabled={vendido || !plano} onClick={proposta}><FileText className="mr-1 h-4 w-4" /> Gerar proposta PDF</Button>
              <Button size="sm" variant="outline" disabled={vendido || !plano} className="border-[#25d366]/40 text-[#1fa855] hover:text-[#1fa855]" onClick={() => setModal("whatsapp")}><Send className="mr-1 h-4 w-4" /> Enviar no WhatsApp</Button>
              <Button size="sm" variant="outline" disabled={vendido || !plano} onClick={() => setModal("lead")}><Link2 className="mr-1 h-4 w-4" /> Vincular ao lead</Button>
            </div>

            {data.comissao && (
              <div className="space-y-1.5 rounded-xl border border-border bg-card p-4 text-sm">
                <p className="font-semibold">Comissão (só administrador)</p>
                {([["Com corretor", data.comissao.comCorretor], ["Venda direta Romatec", data.comissao.vendaDireta]] as const).map(([rotulo, k]) => (
                  <div key={rotulo} className="rounded-lg border border-border p-2 text-xs">
                    <p className="font-semibold">{rotulo}: {brl(k.total)} ({(data.condicoes.comissaoTotalPct * 100).toLocaleString("pt-BR")}% do preço de tabela)</p>
                    <p>Corretor {brl(k.corretor)} · Romatec {brl(k.romatec)}</p>
                    <p className="text-muted-foreground">
                      {entrada === 1 ? <>Sinal à vista: 100% no ato ({brl(k.no1oPagamento.total)})</>
                        : <>1º pagamento do sinal: {brl(k.no1oPagamento.total)} (corretor {brl(k.no1oPagamento.corretor)} · Romatec {brl(k.no1oPagamento.romatec)}) · 2º pagamento: {brl(k.no2oPagamento.total)} (corretor {brl(k.no2oPagamento.corretor)} · Romatec {brl(k.no2oPagamento.romatec)})</>}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] leading-snug text-muted-foreground">{data.avisoLegal}</p>
          </>
        )}
      </div>

      {modal === "evolucao" && codigo && <Evolucao slug={slug} codigo={codigo} entrada={entrada} prazo={prazo} onFechar={() => setModal(null)} />}
      {modal === "whatsapp" && (
        <EnviarWhatsAppModal
          titulo={`Enviar a simulação da chácara ${codigo}`}
          descricao={`Preço, entrada ${entrada === 1 ? "à vista" : `em ${entrada}x`} e saldo em ${prazo}x fixas — só para o número que você digitar.`}
          sugestao={destinoSugerido}
          enviando={envio.isPending}
          onFechar={() => setModal(null)}
          onEnviar={destino => envio.mutate({ slug, lote: codigo, entrada, prazo, telefone: destino })}
        />
      )}
      {modal === "lead" && <VincularLead salvando={salvar.isPending} onFechar={() => setModal(null)} onVincular={leadId => salvar.mutate({ slug, lote: codigo, entrada, prazo, leadId })} />}
    </div>
  );
}
