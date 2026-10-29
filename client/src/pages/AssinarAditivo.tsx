import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { CheckCircle2, FileText, Loader2, Lock, MessageCircle } from "lucide-react";

const VERDE = "#0C3320", DOURADO = "#C9A646", CREME = "#F7F3E8";
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
const borda = { borderColor: "#e5dcc5" };

/**
 * /aditivo/:token — o comprador lê o Termo Aditivo de renegociação, recebe o código no WhatsApp e assina
 * (server/financeiro/renegociacao.ts). Assinado, as parcelas novas aparecem no portal do comprador.
 */
export default function AssinarAditivo() {
  const { token } = useParams<{ token: string }>();
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [aceite, setAceite] = useState(false);
  const [leu, setLeu] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const carregar = () => fetch(`/api/aditivo/${token}`).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.mensagem || "Link inválido"); setD(j); }).catch(e => setErro(e.message));
  useEffect(() => { carregar(); document.title = "Termo aditivo — assinatura"; }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const post = async (caminho: string, corpo: unknown) => {
    const r = await fetch(`/api/aditivo/${token}/${caminho}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.mensagem || "Não foi possível concluir");
    return j;
  };
  const pedirCodigo = async () => {
    setOcupado(true); setMsg(null);
    try { await post("codigo", {}); setEnviado(true); setMsg({ ok: true, t: `Código enviado para o WhatsApp ${d.telefone ?? "cadastrado"}. Vale por 10 minutos.` }); }
    catch (e: any) { setMsg({ ok: false, t: e.message }); } finally { setOcupado(false); }
  };
  const assinar = async () => {
    setOcupado(true); setMsg(null);
    try { await post("assinar", { codigo, aceite }); await carregar(); }
    catch (e: any) { setMsg({ ok: false, t: e.message }); } finally { setOcupado(false); }
  };
  const r = d?.resumo;
  return (
    <div className="min-h-screen" style={{ background: CREME, color: "#1d2b22", fontFamily: "Manrope, system-ui, sans-serif" }}>
      <header className="border-b-4 px-4 py-3 text-white" style={{ background: VERDE, borderColor: DOURADO }}>
        <div className="mx-auto max-w-2xl">
          <p className="font-bold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Condomínio de Chácaras Bom Jardims</p>
          <p className="text-xs" style={{ color: DOURADO }}>Termo aditivo · renegociação de parcelas</p>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5 text-sm">
        {erro && <p className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">{erro}</p>}
        {!d && !erro && <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
        {d && (
          <>
            <section className="rounded-xl border bg-white p-4" style={{ borderColor: DOURADO }}>
              <h1 className="text-lg font-bold" style={{ color: VERDE }}>Olá, {d.comprador}!</h1>
              <p>Termo Aditivo n.º {d.numero} ao contrato {d.contrato} · Chácara {d.lote}</p>
            </section>
            <section className="space-y-2 rounded-xl border bg-white p-4" style={borda}>
              <p className="font-semibold" style={{ color: VERDE }}>Parcelas renegociadas</p>
              <ul className="space-y-0.5">{r.itens.map((i: any) => <li key={i.id}>{i.rotulo} · venc. {br(i.vencimento)} · {brl(i.valor)}{i.diasAtraso > 0 ? ` → ${brl(i.atualizado)} atualizado` : ""}</li>)}</ul>
              <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-4">
                {[["Valor original", brl(r.totalOriginal)], ["Encargos", brl(r.encargos)], ["Desconto", r.desconto ? `−${brl(r.desconto)}` : "—"], ["Renegociado", brl(r.valorRenegociado)]].map(([a, b]) => (
                  <div key={a} className="rounded-lg bg-neutral-50 p-2"><p className="text-[11px] text-neutral-500">{a}</p><p className="font-semibold">{b}</p></div>
                ))}
              </div>
              <p className="pt-2 font-semibold" style={{ color: VERDE }}>Novo parcelamento: {r.parcelas.length}× {r.taxaMensal ? `(juros de ${(r.taxaMensal * 100).toLocaleString("pt-BR")}% ao mês)` : "(sem juros)"}</p>
              <ul className="space-y-0.5">{r.parcelas.map((p: any) => <li key={p.numero}>Parcela {p.numero}/{r.parcelas.length} · vence {br(p.vencimento)} · <b>{brl(p.valor)}</b></li>)}</ul>
            </section>
            <a href={`/api/aditivo/${token}/termo.pdf`} target="_blank" rel="noreferrer" onClick={() => setLeu(true)}
              className="flex items-center gap-3 rounded-xl border bg-white p-3 font-semibold" style={{ borderColor: DOURADO, color: VERDE }}>
              <FileText className="h-5 w-5" /> Ler o Termo Aditivo completo (PDF){d.status === "assinado" ? " — com o manifesto de assinatura" : ""}
            </a>
            {d.status === "assinado" && (
              <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-4 text-emerald-900"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                Termo assinado em {new Date(d.assinadoEm).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}. As novas parcelas já aparecem no seu portal do comprador (carnê digital), com boleto e PIX.</p>
            )}
            {d.status === "cancelado" && <p className="rounded-xl bg-amber-50 p-4 text-amber-900">Este termo foi cancelado pela administração. Fale com o escritório.</p>}
            {d.status === "aguardando" && (
              <section className="space-y-3 rounded-xl border bg-white p-4" style={borda}>
                <p className="flex items-center gap-2 font-semibold" style={{ color: VERDE }}><Lock className="h-4 w-4" /> Assinar eletronicamente</p>
                <button disabled={ocupado} onClick={pedirCodigo} className="inline-flex items-center gap-1 rounded-lg px-4 py-2 font-semibold disabled:opacity-50" style={{ background: DOURADO, color: VERDE }}>
                  <MessageCircle className="h-4 w-4" /> {enviado ? "Reenviar código" : "Receber código no WhatsApp"}
                </button>
                <input value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="Código de 6 dígitos" aria-label="Código"
                  className="w-full rounded-lg border px-3 py-2 text-center text-lg tracking-[0.4em]" style={borda} />
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} className="mt-1" />
                  <span>Li o Termo Aditivo n.º {d.numero} e concordo com as condições da renegociação.{!leu && <span className="block text-xs text-neutral-500">Abra o PDF acima antes de assinar.</span>}</span>
                </label>
                {msg && <p className={`rounded-lg p-2 ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{msg.t}</p>}
                <button disabled={ocupado || codigo.length !== 6 || !aceite} onClick={assinar} className="inline-flex w-full items-center justify-center gap-1 rounded-lg px-4 py-3 font-semibold text-white disabled:opacity-50" style={{ background: VERDE }}>
                  {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Assinar o termo
                </button>
                <p className="text-[11px] text-neutral-500">Assinatura eletrônica com código no WhatsApp, IP, aparelho, data e hora registrados no próprio documento (MP 2.200-2/2001, art. 10, § 2º; Lei 14.063/2020).</p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
