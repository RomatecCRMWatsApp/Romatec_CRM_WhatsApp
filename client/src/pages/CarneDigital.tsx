import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { AlertTriangle, CheckCircle2, Clock, Download, FileText, Loader2, Receipt, RefreshCw } from "lucide-react";
import { AbaAntecipar, AbaChamados, AbaDocumentos, AbaObra, usePortal } from "@/components/portal/PortalComprador";

const VERDE = "#0C3320", DOURADO = "#C9A646", CREME = "#F7F3E8";
const brl = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const br = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");

interface Parcela {
  id: number; rotulo: string; vencimento: string; valor: number; status: string; pagoEm: string | null; valorPago: number | null;
  atraso: number; negociacao: boolean; boleto: string | null; segundaVia: string | null; recibo: string | null;
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
  const [aba, setAba] = useState<"parcelas" | "recibos" | "antecipar" | "documentos" | "obra" | "chamados">("parcelas");
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
    <div className="min-h-screen" style={{ background: CREME, color: "#1d2b22", fontFamily: "Manrope, system-ui, sans-serif" }}>
      <header className="border-b-4 px-4 py-3 text-white" style={{ background: VERDE, borderColor: DOURADO }}>
        <div className="mx-auto max-w-3xl">
          <p className="font-bold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Condomínio de Chácaras Bom Jardims</p>
          <p className="text-xs" style={{ color: DOURADO }}>Portal do comprador</p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {erro && <p className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">{erro}</p>}
        {!d && !erro && <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
        {d && (
          <>
            <section className="rounded-xl border bg-white p-4" style={{ borderColor: DOURADO }}>
              <h1 className="text-lg font-bold" style={{ color: VERDE }}>Olá, {d.comprador}!</h1>
              <p className="text-sm">Contrato {d.contrato.numero} · Chácara {d.contrato.lote} · {d.contrato.empreendimento}</p>
              {!d.disponivel && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">O carnê fica disponível quando o contrato estiver assinado por todos.</p>}
            </section>

            {d.disponivel && (
              <>
                <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[["Parcelas pagas", `${d.resumo.pagas} de ${d.resumo.total}`], ["Total pago", brl(d.resumo.totalPago)], ["Saldo devedor", brl(d.resumo.saldoDevedor)],
                    ["Próxima", d.resumo.proxima ? `${br(d.resumo.proxima.vencimento)} · ${brl(d.resumo.proxima.valor)}` : "quitado"]].map(([r, v]) => (
                    <div key={r} className="rounded-xl border bg-white p-3" style={{ borderColor: DOURADO }}>
                      <p className="text-[11px] uppercase text-neutral-500">{r}</p>
                      <p className="font-bold" style={{ color: VERDE }}>{v}</p>
                    </div>
                  ))}
                </section>
                {d.resumo.vencidas > 0 && (
                  <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
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
                    ["parcelas", `Parcelas (${abertas.length})`], ["recibos", `Recibos (${pagas.length})`],
                    ...(portal.d ? [["antecipar", "Antecipar"], ["documentos", "Documentos"], ["obra", "Obra"],
                      ["chamados", `Chamados${portal.d.chamados.some(c => c.status === "respondido") ? " •" : ""}`]] : []),
                  ] as [typeof aba, string][]).map(([a, r]) => (
                    <button key={a} onClick={() => setAba(a)} className="-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold"
                      style={{ borderColor: aba === a ? VERDE : "transparent", color: aba === a ? VERDE : "#777" }}>{r}</button>
                  ))}
                </div>
                {portal.d && aba === "antecipar" && <AbaAntecipar codigo={codigo} d={portal.d} onPedido={portal.recarregar} />}
                {portal.d && aba === "documentos" && <AbaDocumentos d={portal.d} />}
                {portal.d && aba === "obra" && <AbaObra d={portal.d} />}
                {portal.d && aba === "chamados" && <AbaChamados codigo={codigo} d={portal.d} onNovo={portal.recarregar} />}
                {msg && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{msg}</p>}

                {aba === "parcelas" && (
                  <ul className="space-y-2">
                    {abertas.map(p => (
                      <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3 text-sm" style={{ borderColor: p.atraso > 0 ? "#f3b4b4" : "#e5dcc5" }}>
                        {p.atraso > 0 ? <AlertTriangle className="h-5 w-5 text-red-600" /> : <Clock className="h-5 w-5 text-neutral-400" />}
                        <div className="min-w-[160px] flex-1">
                          <b>{p.rotulo}</b> · {brl(p.valor)}
                          <span className={`block text-xs ${p.atraso > 0 ? "text-red-700" : "text-neutral-500"}`}>
                            vence {br(p.vencimento)}{p.atraso > 0 ? ` · ${p.atraso} dias em atraso` : ""}
                          </span>
                        </div>
                        {p.boleto && <a href={p.boleto} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-white" style={{ background: VERDE }}><FileText className="h-4 w-4" /> Boleto / PIX</a>}
                        {p.segundaVia && (
                          <button disabled={ocupado === p.id} onClick={() => pedir2via(p)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50" style={{ background: DOURADO, color: VERDE }}>
                            {ocupado === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} 2ª via atualizada
                          </button>
                        )}
                        {p.negociacao && <span className="rounded-lg bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">Negociação: {d.contato}</span>}
                        {!p.boleto && !p.segundaVia && !p.negociacao && <span className="text-xs text-neutral-500">boleto ainda não emitido</span>}
                      </li>
                    ))}
                    {!abertas.length && <li className="flex items-center gap-2 rounded-xl border bg-white p-4 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5" /> Nenhuma parcela em aberto.</li>}
                  </ul>
                )}
                {aba === "recibos" && (
                  <ul className="space-y-2">
                    {[...pagas].reverse().map(p => (
                      <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3 text-sm" style={{ borderColor: "#e5dcc5" }}>
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        <div className="min-w-[160px] flex-1"><b>{p.rotulo}</b><span className="block text-xs text-neutral-500">pago em {br(p.pagoEm)} · {brl(p.valorPago ?? p.valor)}</span></div>
                        {p.recibo ? <a href={p.recibo} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: DOURADO }}><Receipt className="h-4 w-4" /> Recibo</a>
                          : <span className="text-xs text-neutral-500">recibo em emissão</span>}
                      </li>
                    ))}
                    {!pagas.length && <li className="rounded-xl border bg-white p-4 text-sm text-neutral-600">Nenhum pagamento ainda.</li>}
                  </ul>
                )}
                <p className="text-xs text-neutral-600">Pague somente pelos boletos ou PIX deste carnê, em nome de {d.beneficiario}. Nunca em dinheiro ou a corretores. Dúvidas: {d.contato}.</p>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
