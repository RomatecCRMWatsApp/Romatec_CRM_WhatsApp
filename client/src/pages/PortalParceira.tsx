import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { CheckCircle2, Copy, Loader2, MessageCircle, Send } from "lucide-react";

const VERDE = "#0C3320", DOURADO = "#C9A646", CREME = "#F7F3E8";
const brl = (v: number | null) => (v == null ? "sob consulta" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const br = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
const borda = { borderColor: "#e5dcc5" };
const COR_SIT: Record<string, string> = { disponivel: "#1F8A4C", reservado: "#C9A646", em_negociacao: "#C9A646", vendido: "#8A2D2D" };
const ROT_SIT: Record<string, string> = { disponivel: "Disponível", reservado: "Reservada", em_negociacao: "Em negociação", vendido: "Vendida" };

/** /parceiro/:token — portal da imobiliária parceira (server/parceiros.ts) */
export default function PortalParceira() {
  const { token } = useParams<{ token: string }>();
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<"chacaras" | "divulgar" | "indicar" | "leads" | "vendas">("chacaras");
  const [f, setF] = useState({ nome: "", telefone: "", chacara: "", mensagem: "", consentimento: false });
  const [envio, setEnvio] = useState<{ ok: boolean; t: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const carregar = () => fetch(`/api/parceiro/${token}`).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.mensagem || "Link inválido"); setD(j); }).catch(e => setErro(e.message));
  useEffect(() => { carregar(); document.title = "Portal do parceiro — Bom Jardims"; }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const copiar = async (t: string) => { try { await navigator.clipboard.writeText(t); setEnvio({ ok: true, t: "Link copiado!" }); } catch { window.prompt("Copie:", t); } };
  const indicar = async (e: React.FormEvent) => {
    e.preventDefault(); setOcupado(true); setEnvio(null);
    try {
      const r = await fetch(`/api/parceiro/${token}/indicar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.mensagem || "Não foi possível enviar");
      setEnvio({ ok: true, t: j.novo ? "Cliente indicado! O corretor entra em contato e você acompanha aqui em \"Meus clientes\"." : "Esse cliente já estava no CRM — a indicação foi registrada." });
      setF({ nome: "", telefone: "", chacara: "", mensagem: "", consentimento: false }); carregar();
    } catch (err: any) { setEnvio({ ok: false, t: err.message }); } finally { setOcupado(false); }
  };
  const livres = d?.chacaras.filter((c: any) => c.situacao === "disponivel").length ?? 0;
  const campo = "w-full rounded-lg border bg-white px-3 py-2 text-sm";
  return (
    <div className="min-h-screen" style={{ background: CREME, color: "#1d2b22", fontFamily: "Manrope, system-ui, sans-serif" }}>
      <header className="border-b-4 px-4 py-3 text-white" style={{ background: VERDE, borderColor: DOURADO }}>
        <div className="mx-auto max-w-4xl">
          <p className="font-bold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Condomínio de Chácaras Bom Jardims</p>
          <p className="text-xs" style={{ color: DOURADO }}>Portal do parceiro{d ? ` · ${d.parceira.nome}` : ""}</p>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-5 text-sm">
        {erro && <p className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">{erro}</p>}
        {!d && !erro && <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
        {d && (
          <>
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[["Chácaras livres", String(livres)], ["Seus clientes", String(d.leads.length)], ["Vendas", String(d.vendas.filter((v: any) => v.vendido).length)],
                ["Sua comissão prevista", brl(d.vendas.filter((v: any) => v.vendido).reduce((s: number, v: any) => s + v.comissao, 0))]].map(([r, v]) => (
                <div key={r} className="rounded-xl border bg-white p-3" style={{ borderColor: DOURADO }}><p className="text-[11px] uppercase text-neutral-500">{r}</p><p className="font-bold" style={{ color: VERDE }}>{v}</p></div>
              ))}
            </section>
            {d.contato && <p className="flex items-center gap-2 rounded-xl border bg-white p-3" style={borda}><MessageCircle className="h-4 w-4" style={{ color: VERDE }} /> Seu contato na Romatec: <b>{d.contato.nome}</b>{d.contato.telefone ? ` · ${d.contato.telefone}` : ""} · comissão de {(d.parceira.comissaoPct * 100).toLocaleString("pt-BR")}% sobre o valor da venda</p>}
            <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: DOURADO }}>
              {([["chacaras", "Chácaras"], ["divulgar", "Divulgar"], ["indicar", "Indicar cliente"], ["leads", `Meus clientes (${d.leads.length})`], ["vendas", "Vendas"]] as const).map(([k, r]) => (
                <button key={k} onClick={() => { setAba(k); setEnvio(null); }} className="-mb-px shrink-0 border-b-2 px-3 py-2 font-semibold" style={{ borderColor: aba === k ? VERDE : "transparent", color: aba === k ? VERDE : "#777" }}>{r}</button>
              ))}
            </div>
            {aba === "chacaras" && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {d.chacaras.map((c: any) => (
                  <div key={c.codigo} className="rounded-lg border bg-white p-2" style={borda}>
                    <p className="font-bold">{c.codigo}<span className="ml-1 text-xs font-normal" style={{ color: COR_SIT[c.situacao] ?? "#555" }}>· {ROT_SIT[c.situacao] ?? c.situacao}</span></p>
                    <p className="text-xs text-neutral-600">{c.areaM2 ? `${c.areaM2.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m²` : ""}{c.situacao === "disponivel" ? ` · ${brl(c.preco)}` : ""}</p>
                  </div>
                ))}
              </div>
            )}
            {aba === "divulgar" && (
              <div className="space-y-2">
                <p className="text-neutral-600">Os links já levam o seu código: todo cliente que chegar por eles fica marcado como seu.</p>
                {d.links.map((l: any) => (
                  <div key={l.url} className="flex items-center gap-2 rounded-xl border bg-white p-3" style={borda}>
                    <span className="flex-1"><b>{l.titulo}</b><span className="block break-all text-xs text-neutral-500">{l.url}</span></span>
                    <button onClick={() => copiar(l.url)} className="rounded-lg border px-3 py-1.5" style={{ borderColor: DOURADO }}><Copy className="h-4 w-4" /></button>
                  </div>
                ))}
                {envio && <p className="text-emerald-700">{envio.t}</p>}
              </div>
            )}
            {aba === "indicar" && (
              <form onSubmit={indicar} className="space-y-2 rounded-xl border bg-white p-4" style={borda}>
                <input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="Nome do cliente" className={campo} style={borda} required minLength={3} />
                <input value={f.telefone} onChange={e => setF({ ...f, telefone: e.target.value })} placeholder="WhatsApp com DDD" inputMode="tel" className={campo} style={borda} required />
                <input value={f.chacara} onChange={e => setF({ ...f, chacara: e.target.value.toUpperCase().slice(0, 3) })} placeholder="Chácara de interesse (opcional, ex.: A05)" className={campo} style={borda} />
                <textarea value={f.mensagem} onChange={e => setF({ ...f, mensagem: e.target.value })} placeholder="Observações (opcional)" rows={3} className={campo} style={borda} />
                <label className="flex items-start gap-2"><input type="checkbox" checked={f.consentimento} onChange={e => setF({ ...f, consentimento: e.target.checked })} className="mt-1" /> O cliente autorizou ser contatado pela Romatec sobre o Bom Jardims (LGPD).</label>
                {envio && <p className={`rounded-lg p-2 ${envio.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{envio.t}</p>}
                <button disabled={ocupado || !f.consentimento} className="inline-flex items-center gap-1 rounded-lg px-4 py-2 font-semibold text-white disabled:opacity-50" style={{ background: VERDE }}>
                  {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Indicar cliente
                </button>
              </form>
            )}
            {aba === "leads" && (
              <div className="divide-y rounded-xl border bg-white" style={borda}>
                {d.leads.map((l: any) => <div key={l.id} className="flex justify-between gap-2 p-3"><span><b>{l.nome}</b>{l.chacara ? ` · ${l.chacara}` : ""}</span><span className="text-neutral-600">{l.etapa} · {br(l.em)}</span></div>)}
                {!d.leads.length && <p className="p-3 text-neutral-600">Nenhum cliente ainda. Use os links de divulgação ou indique um cliente.</p>}
              </div>
            )}
            {aba === "vendas" && (
              <div className="divide-y rounded-xl border bg-white" style={borda}>
                {d.vendas.map((v: any, i: number) => (
                  <div key={i} className="flex flex-wrap justify-between gap-2 p-3">
                    <span>{v.vendido ? <CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-600" /> : null}<b>Chácara {v.chacara}</b> · {v.situacao} · {br(v.data)}</span>
                    <span>{brl(v.valor)} · comissão <b>{brl(v.comissao)}</b></span>
                  </div>
                ))}
                {!d.vendas.length && <p className="p-3 text-neutral-600">Nenhuma venda ainda.</p>}
              </div>
            )}
            <p className="text-xs text-neutral-500">Comissão prevista conforme o acordo de parceria; o pagamento segue o contrato de parceria com a Romatec Consultoria Total (CRECI/MA 4.705). Link pessoal da sua imobiliária — não compartilhe.</p>
          </>
        )}
      </main>
    </div>
  );
}
