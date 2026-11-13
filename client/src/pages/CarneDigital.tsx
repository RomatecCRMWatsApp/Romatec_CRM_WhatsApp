import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { AlertTriangle, CheckCircle2, Clock, Download, FileText, Landmark, Loader2, Printer, Receipt, RefreshCw } from "lucide-react";
import { anosComPagamento, demonstrativoAnual, situacaoParcelas } from "@shared/demonstrativoPagamentos";
import { AbaAntecipar, AbaChamados, AbaDocumentos, AbaObra, usePortal } from "@/components/portal/PortalComprador";

const VERDE = "#0C3320", DOURADO = "#C9A646", CREME = "#F7F3E8";
const brl = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const br = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");

interface Parcela {
  id: number; rotulo: string; vencimento: string; valor: number; status: string; pagoEm: string | null; valorPago: number | null;
  atraso: number; negociacao: boolean; boleto: string | null; segundaVia: string | null; recibo: string | null; cartao?: string | null;
}

/** Abre a 2ª via (POST no link assinado) num PDF novo */
async function segundaVia(url: string) {
  const r = await fetch(url, { method: "POST" });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.mensagem || "Não foi possível gerar a 2ª via"); }
  window.open(URL.createObjectURL(await r.blob()), "_blank", "noopener");
}

/** Portal do comprador (carnê digital): parcelas, boleto, 2ª via, recibos, carnês, antecipação, documentos, obra e chamados (aberto pelo QR do carnê) */
export default function CarneDigital() {
  const { codigo } = useParams<{ codigo: string }>();
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<"parcelas" | "recibos" | "ir" | "antecipar" | "documentos" | "obra" | "chamados">("parcelas");
  const portal = usePortal(codigo);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const carregar = () => fetch(`/api/c/${encodeURIComponent(codigo)}`).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.mensagem); setD(j); }).catch(e => setErro(e.message));
  useEffect(() => { carregar(); }, [codigo]); // eslint-disable-line react-hooks/exhaustive-deps

  const pedir2via = async (p: Parcela) => {
    setOcupado(p.id); setMsg(null);
    try { await segundaVia(p.segundaVia!); carregar(); } catch (e: any) { setMsg(e.message); } finally { setOcupado(null); }
  };
  const parcelas: Parcela[] = d?.parcelas ?? [];
  const pagas = parcelas.filter(p => p.status === "paga");
  const abertas = parcelas.filter(p => p.status !== "paga");

  return (
    <div className="min-h-screen" style={{ background: CREME, color: "var(--c-1d2b22)", fontFamily: "Manrope, system-ui, sans-serif" }}>
      <header className="border-b-4 px-4 py-3 text-white" style={{ background: VERDE, borderColor: DOURADO }}>
        <div className="mx-auto max-w-3xl">
          <p className="font-bold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Condomínio de Chácaras Bom Jardims</p>
          <p className="text-xs" style={{ color: DOURADO }}>Portal do comprador</p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {erro && <p className="rounded-lg border border-danger-300 bg-danger-50 p-4 text-danger-800">{erro}</p>}
        {!d && !erro && <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
        {d && (
          <>
            <section className="rounded-xl border bg-white p-4" style={{ borderColor: DOURADO }}>
              <h1 className="text-lg font-bold" style={{ color: VERDE }}>Olá, {d.comprador}!</h1>
              <p className="text-sm">Contrato {d.contrato.numero} · Chácara {d.contrato.lote} · {d.contrato.empreendimento}</p>
              {!d.disponivel && <p className="mt-2 rounded-lg bg-warn-50 p-3 text-sm text-warn-900">O carnê fica disponível quando o contrato estiver assinado por todos.</p>}
            </section>

            {d.disponivel && (
              <>
                <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[["Parcelas pagas", `${d.resumo.pagas} de ${d.resumo.total}`], ["Total pago", brl(d.resumo.totalPago)], ["Saldo devedor", brl(d.resumo.saldoDevedor)],
                    ["Próxima", d.resumo.proxima ? `${br(d.resumo.proxima.vencimento)} · ${brl(d.resumo.proxima.valor)}` : "quitado"]].map(([r, v]) => (
                    <div key={r} className="rounded-xl border bg-white p-3" style={{ borderColor: DOURADO }}>
                      <p className="text-[11px] text-neutro-500">{r}</p>
                      <p className="font-bold" style={{ color: VERDE }}>{v}</p>
                    </div>
                  ))}
                </section>
                <BarraSituacao parcelas={parcelas} />
                {d.resumo.vencidas > 0 && (
                  <p className="flex items-start gap-2 rounded-lg bg-danger-50 p-3 text-sm text-danger-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {d.resumo.vencidas} parcela(s) em atraso. Até 59 dias, gere a 2ª via atualizada aqui; depois disso, fale com a administração: {d.contato}.</p>
                )}

                {!!d.carnes.length && (
                  <section className="rounded-xl border bg-white p-4" style={{ borderColor: DOURADO }}>
                    <h2 className="mb-2 font-semibold" style={{ color: VERDE }}>Carnês</h2>
                    <div className="flex flex-wrap gap-2">
                      {d.carnes.map((c: any) => (
                        <a key={c.n} href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: DOURADO }}>
                          <Download className="h-4 w-4" /> Carnê {c.n} · {c.rotulo}
                        </a>
                      ))}
                    </div>
                  </section>
                )}

                <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: DOURADO }}>
                  {([
                    ["parcelas", `Parcelas (${abertas.length})`], ["recibos", `Recibos (${pagas.length})`], ...(pagas.length ? [["ir", "Imposto de Renda"]] : []),
                    ...(portal.d ? [["antecipar", "Antecipar"], ["documentos", "Documentos"], ["obra", "Obra"],
                      ["chamados", `Chamados${portal.d.chamados.some(c => c.status === "respondido") ? " •" : ""}`]] : []),
                  ] as [typeof aba, string][]).map(([a, r]) => (
                    <button key={a} onClick={() => setAba(a)} className="-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold"
                      style={{ borderColor: aba === a ? VERDE : "transparent", color: aba === a ? VERDE : "var(--c-777777)" }}>{r}</button>
                  ))}
                </div>
                {portal.d && aba === "antecipar" && <AbaAntecipar codigo={codigo} d={portal.d} onPedido={portal.recarregar} />}
                {portal.d && aba === "documentos" && <AbaDocumentos d={portal.d} />}
                {portal.d && aba === "obra" && <AbaObra d={portal.d} />}
                {portal.d && aba === "chamados" && <AbaChamados codigo={codigo} d={portal.d} onNovo={portal.recarregar} />}
                {msg && <p role="alert" className="rounded-lg bg-danger-50 p-2 text-sm text-danger-800">{msg}</p>}

                {aba === "parcelas" && (
                  <ul className="space-y-2">
                    {abertas.map(p => (
                      <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3 text-sm" style={{ borderColor: p.atraso > 0 ? "var(--c-f3b4b4)" : "var(--c-e5dcc5)" }}>
                        {p.atraso > 0 ? <AlertTriangle className="h-5 w-5 text-danger-600" /> : <Clock className="h-5 w-5 text-neutro-400" />}
                        <div className="min-w-[160px] flex-1">
                          <b>{p.rotulo}</b> · {brl(p.valor)}
                          <span className={`block text-xs ${p.atraso > 0 ? "text-danger-700" : "text-neutro-500"}`}>
                            vence {br(p.vencimento)}{p.atraso > 0 ? ` · ${p.atraso} dias em atraso` : ""}
                          </span>
                        </div>
                        {p.cartao && <a href={p.cartao} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ background: VERDE }}><FileText className="h-4 w-4" /> Pagar no cartão</a>}
                        {p.boleto && <a href={p.boleto} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ background: VERDE }}><FileText className="h-4 w-4" /> Boleto / PIX</a>}
                        {p.segundaVia && (
                          <button disabled={ocupado === p.id} onClick={() => pedir2via(p)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50" style={{ background: DOURADO, color: VERDE }}>
                            {ocupado === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 2ª via atualizada
                          </button>
                        )}
                        {p.negociacao && <span className="rounded-lg bg-danger-100 px-2 py-1 text-xs font-semibold text-danger-800">Negociação: {d.contato}</span>}
                        {!p.boleto && !p.cartao && !p.segundaVia && !p.negociacao && <span className="text-xs text-neutro-500">boleto ainda não emitido</span>}
                      </li>
                    ))}
                    {!abertas.length && <li className="flex items-center gap-2 rounded-xl border bg-white p-4 text-sm text-ok-800"><CheckCircle2 className="h-5 w-5" /> Nenhuma parcela em aberto.</li>}
                  </ul>
                )}
                {aba === "ir" && <AbaImpostoRenda parcelas={parcelas} comprador={d.comprador} contrato={d.contrato} beneficiario={d.beneficiario} />}
                {aba === "recibos" && (
                  <ul className="space-y-2">
                    {[...pagas].reverse().map(p => (
                      <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3 text-sm" style={{ borderColor: "var(--c-e5dcc5)" }}>
                        <CheckCircle2 className="h-5 w-5 text-ok-600" />
                        <div className="min-w-[160px] flex-1"><b>{p.rotulo}</b><span className="block text-xs text-neutro-500">pago em {br(p.pagoEm)} · {brl(p.valorPago ?? p.valor)}</span></div>
                        {p.recibo ? <a href={p.recibo} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: DOURADO }}><Receipt className="h-4 w-4" /> Recibo</a>
                          : <span className="text-xs text-neutro-500">recibo em emissão</span>}
                      </li>
                    ))}
                    {!pagas.length && <li className="rounded-xl border bg-white p-4 text-sm text-neutro-600">Nenhum pagamento ainda.</li>}
                  </ul>
                )}
                <p className="text-xs text-neutro-600">Pague somente pelos boletos ou PIX deste carnê, em nome de {d.beneficiario}. Nunca em dinheiro ou a corretores. Dúvidas: {d.contato}.</p>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/** Barra do topo: pagas, em atraso e a vencer (como no extrato de financiamento) */
function BarraSituacao({ parcelas }: { parcelas: Parcela[] }) {
  const s = situacaoParcelas(parcelas);
  if (!s.total) return null;
  const pct = (n: number) => `${(n / s.total) * 100}%`;
  return (
    <section className="rounded-xl border bg-white p-4" style={{ borderColor: DOURADO }} aria-label="Situação das parcelas">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold" style={{ color: VERDE }}>{s.pctPago.toLocaleString("pt-BR")}% das parcelas pagas</p>
        <p className="text-xs text-neutro-500">{s.total} parcelas no contrato</p>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-neutro-200">
        <div style={{ width: pct(s.pagas), background: VERDE }} />
        <div style={{ width: pct(s.emAtraso), background: "var(--c-c0392b)" }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutro-700">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: VERDE }} />Pagas: <b>{s.pagas}</b></span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "var(--c-c0392b)" }} />Em atraso: <b>{s.emAtraso}</b></span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-neutro-300" />A vencer: <b>{s.aVencer}</b></span>
      </div>
    </section>
  );
}

/** Demonstrativo anual dos valores pagos, para o comprador declarar a chácara no Imposto de Renda (imprime ou salva em PDF) */
function AbaImpostoRenda({ parcelas, comprador, contrato, beneficiario }: { parcelas: Parcela[]; comprador: string; contrato: any; beneficiario: string }) {
  const anos = anosComPagamento(parcelas);
  const [ano, setAno] = useState<number>(anos[0] ?? new Date().getFullYear());
  const dm = demonstrativoAnual(parcelas, ano);
  return (
    <section className="space-y-3">
      <style>{`@media print { body * { visibility: hidden !important; } #demonstrativo-ir, #demonstrativo-ir * { visibility: visible !important; } #demonstrativo-ir { position: absolute; inset: 0; border: none !important; } .nao-imprimir { display: none !important; } }`}</style>
      <div className="nao-imprimir flex flex-wrap items-center gap-2">
        <label htmlFor="ano-ir" className="text-sm font-semibold" style={{ color: VERDE }}>Ano-calendário</label>
        <select id="ano-ir" value={ano} onChange={e => setAno(Number(e.target.value))} className="rounded-lg border px-2 py-1.5 text-sm" style={{ borderColor: DOURADO }}>
          {anos.map(a => <option key={a} value={a}>{a} (declaração de {a + 1})</option>)}
        </select>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ background: VERDE }}>
          <Printer className="h-4 w-4" /> Imprimir ou salvar em PDF
        </button>
      </div>
      <article id="demonstrativo-ir" className="space-y-3 rounded-xl border bg-white p-4 text-sm" style={{ borderColor: DOURADO }}>
        <header className="flex items-start gap-2">
          <Landmark className="mt-0.5 h-5 w-5" style={{ color: VERDE }} />
          <div>
            <h2 className="font-bold" style={{ color: VERDE }}>Demonstrativo de valores pagos · ano-calendário {ano}</h2>
            <p className="text-xs text-neutro-600">Contrato {contrato.numero}, Chácara {contrato.lote}, {contrato.empreendimento}, Comprador(a): {comprador}, Vendedora: {beneficiario}</p>
          </div>
        </header>
        <div className="grid gap-2 sm:grid-cols-3">
          {[[`Pago em ${ano}`, dm.totalNoAno], [`Total pago até 31/12/${ano - 1}`, dm.acumuladoAnoAnterior], [`Total pago até 31/12/${ano}`, dm.acumuladoAte31Dez]].map(([r, v]) => (
            <div key={String(r)} className="rounded-lg border p-2" style={{ borderColor: "var(--c-e5dcc5)" }}>
              <p className="text-[11px] text-neutro-500">{r}</p>
              <p className="font-bold tabular-nums" style={{ color: VERDE }}>{brl(Number(v))}</p>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead><tr className="border-b text-xs text-neutro-500"><th className="py-1.5">Parcela</th><th>Vencimento</th><th>Pago em</th><th className="text-right">Valor pago</th></tr></thead>
            <tbody>
              {dm.itens.map((i, k) => (
                <tr key={k} className="border-b border-neutro-100"><td className="py-1.5">{i.rotulo}</td><td>{br(i.vencimento)}</td><td>{br(i.pagoEm)}</td><td className="text-right tabular-nums">{brl(i.valor)}</td></tr>
              ))}
              {!dm.itens.length && <tr><td colSpan={4} className="py-3 text-neutro-500">Nenhum pagamento neste ano.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="rounded-lg bg-neutro-50 p-3 text-xs text-neutro-700">
          <p className="font-semibold" style={{ color: VERDE }}>Como usar na declaração</p>
          <p>Na ficha <b>Bens e Direitos</b>, informe a chácara com os dados do contrato e da vendedora. Em "Situação em 31/12 do ano anterior" use o total pago até 31/12/{ano - 1}; em "Situação em 31/12" use o total pago até 31/12/{ano}. Os valores são os efetivamente pagos, com juros e encargos quando houver.</p>
          <p className="mt-1">Este demonstrativo é informativo e foi gerado pelo sistema com base nos pagamentos registrados. Confirme o preenchimento com o seu contador.</p>
        </div>
      </article>
    </section>
  );
}
