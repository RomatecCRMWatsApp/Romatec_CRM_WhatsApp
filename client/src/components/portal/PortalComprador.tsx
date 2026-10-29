import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, FileText, HardHat, IdCard, Loader2, MessageSquare, PiggyBank, Send } from "lucide-react";
import { ROTULO_CHAMADO, TIPOS_CHAMADO, type TipoChamado } from "@shared/portalComprador";

/**
 * Abas do portal do comprador além das parcelas e recibos (/c/:codigo): antecipação, documentos, andamento da obra e
 * chamados. Os dados vêm de /api/c/:codigo/portal (server/financeiro/portalComprador.ts).
 */

export const VERDE = "#0C3320", DOURADO = "#C9A646";
const brl = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const br = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
const borda = { borderColor: "#e5dcc5" };

export interface DadosPortal {
  documentos: { titulo: string; descricao: string; url: string }[];
  carteirinhas: { numero: string; validade: string; titular: string; url: string }[];
  obra: { id: number; titulo: string; texto: string; percentual: number | null; data: string; foto: string | null }[];
  chamados: { id: number; tipo: TipoChamado; rotulo: string; assunto: string; mensagem: string; status: string; resposta: string | null; criadoEm: string; respondidoEm: string | null }[];
  antecipacao: { maximo: number; taxaMensal: number };
  registro?: { rotulo: string; status: string; protocolo: string | null; dataProtocolo: string | null; matricula: string | null; registradoEm: string | null } | null;
}

export function usePortal(codigo: string) {
  const [d, setD] = useState<DadosPortal | null>(null);
  const carregar = () => fetch(`/api/c/${encodeURIComponent(codigo)}/portal`).then(r => (r.ok ? r.json() : null)).then(setD).catch(() => setD(null));
  useEffect(() => { carregar(); }, [codigo]); // eslint-disable-line react-hooks/exhaustive-deps
  return { d, recarregar: carregar };
}

async function postar(url: string, corpo: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.mensagem || "Não foi possível concluir agora");
  return j;
}

export function AbaAntecipar({ codigo, d, onPedido }: { codigo: string; d: DadosPortal; onPedido: () => void }) {
  const [qtd, setQtd] = useState(Math.min(3, d.antecipacao.maximo));
  const [sim, setSim] = useState<any>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => {
    if (!qtd) { setSim(null); return; }
    const t = setTimeout(() => { postar(`/api/c/${codigo}/antecipacao/simular`, { quantidade: qtd }).then(setSim).catch(e => setMsg({ ok: false, texto: e.message })); }, 250);
    return () => clearTimeout(t);
  }, [qtd, codigo]);
  if (!d.antecipacao.maximo) return <p className="rounded-xl border bg-white p-4 text-sm" style={borda}>Não há parcelas para antecipar agora (só entram as que vencem daqui a mais de 30 dias).</p>;
  const pedir = async () => {
    setOcupado(true); setMsg(null);
    try { await postar(`/api/c/${codigo}/chamados`, { tipo: "antecipacao", quantidade: qtd }); setMsg({ ok: true, texto: "Pedido enviado! A administração confirma o valor e envia o boleto/PIX da antecipação." }); onPedido(); }
    catch (e: any) { setMsg({ ok: false, texto: e.message }); } finally { setOcupado(false); }
  };
  return (
    <section className="space-y-3 rounded-xl border bg-white p-4 text-sm" style={borda}>
      <p className="flex items-center gap-2 font-semibold" style={{ color: VERDE }}><PiggyBank className="h-5 w-5" /> Antecipar parcelas com desconto dos juros</p>
      <p className="text-neutral-600">Escolha quantas parcelas quer quitar antes (das últimas para as primeiras). Os juros do período são descontados — direito garantido pelo Código de Defesa do Consumidor (art. 52, § 2º).</p>
      <label className="block">
        <span className="text-xs text-neutral-500">Parcelas a antecipar: <b>{qtd}</b> de {d.antecipacao.maximo}</span>
        <input type="range" min={1} max={d.antecipacao.maximo} value={qtd} onChange={e => setQtd(Number(e.target.value))} className="w-full" style={{ accentColor: VERDE }} />
      </label>
      {sim && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-neutral-50 p-2"><p className="text-[11px] text-neutral-500">Valor das parcelas</p><p className="font-semibold">{brl(sim.totalNominal)}</p></div>
          <div className="rounded-lg p-2" style={{ background: "#eef6ee" }}><p className="text-[11px] text-neutral-500">Você paga</p><p className="font-bold" style={{ color: VERDE }}>{brl(sim.totalAPagar)}</p></div>
          <div className="rounded-lg bg-amber-50 p-2"><p className="text-[11px] text-neutral-500">Economia</p><p className="font-semibold text-amber-800">{brl(sim.economia)}</p></div>
        </div>
      )}
      {sim?.parcelas?.length > 0 && (
        <details className="text-xs text-neutral-600"><summary className="cursor-pointer">Ver as parcelas</summary>
          <ul className="mt-1 space-y-0.5">{sim.parcelas.map((p: any) => <li key={p.id}>{p.rotulo} · vence {br(p.vencimento)} · {brl(p.valor)} → {brl(p.valorPresente)}</li>)}</ul>
        </details>
      )}
      <p className="text-[11px] text-neutral-500">Simulação de hoje. O valor final é confirmado pela administração no boleto/PIX da antecipação.</p>
      {msg && <p className={`rounded-lg p-2 ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{msg.texto}</p>}
      <button disabled={ocupado || !sim?.parcelas?.length} onClick={pedir} className="inline-flex items-center gap-1 rounded-lg px-4 py-2 font-semibold text-white disabled:opacity-50" style={{ background: VERDE }}>
        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Quero antecipar
      </button>
    </section>
  );
}

export function AbaDocumentos({ d }: { d: DadosPortal }) {
  return (
    <section className="space-y-2">
      {d.registro && (
        <div className="rounded-xl border bg-white p-3 text-sm" style={borda}>
          <p className="font-semibold" style={{ color: VERDE }}>Registro do contrato no cartório: {d.registro.rotulo}</p>
          <p className="text-xs text-neutral-600">
            {d.registro.protocolo ? `Protocolo ${d.registro.protocolo}${d.registro.dataProtocolo ? ` em ${br(d.registro.dataProtocolo)}` : ""}` : "Em preparação pela administração"}
            {d.registro.matricula ? ` · registrado na matrícula ${d.registro.matricula}${d.registro.registradoEm ? ` em ${br(d.registro.registradoEm)}` : ""}` : ""}
          </p>
        </div>
      )}
      {d.documentos.map(x => (
        <a key={x.url} href={x.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border bg-white p-3 text-sm" style={borda}>
          <FileText className="h-5 w-5 shrink-0" style={{ color: VERDE }} />
          <span className="flex-1"><b>{x.titulo}</b><span className="block text-xs text-neutral-500">{x.descricao}</span></span>
          <ExternalLink className="h-4 w-4 text-neutral-400" />
        </a>
      ))}
      {d.carteirinhas.length > 0 && (
        <div className="rounded-xl border bg-white p-3 text-sm" style={borda}>
          <p className="mb-1 flex items-center gap-2 font-semibold" style={{ color: VERDE }}><IdCard className="h-5 w-5" /> Carteirinhas</p>
          {d.carteirinhas.map(c => (
            <a key={c.numero} href={c.url} target="_blank" rel="noreferrer" className="flex justify-between border-t py-1.5 text-sm first:border-t-0" style={borda}>
              <span>{c.titular} · Nº {c.numero}</span><span className="text-xs text-neutral-500">válida até {br(c.validade)}</span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

export function AbaObra({ d }: { d: DadosPortal }) {
  if (!d.obra.length) return <p className="rounded-xl border bg-white p-4 text-sm" style={borda}>As atualizações da obra aparecem aqui assim que a administração publicar.</p>;
  const atual = d.obra.find(o => o.percentual != null)?.percentual ?? null;
  return (
    <section className="space-y-3">
      {atual != null && (
        <div className="rounded-xl border bg-white p-4" style={borda}>
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold" style={{ color: VERDE }}><HardHat className="h-5 w-5" /> Obra {atual}% concluída</p>
          <div className="h-3 overflow-hidden rounded-full bg-neutral-200"><div className="h-full rounded-full" style={{ width: `${atual}%`, background: VERDE }} /></div>
        </div>
      )}
      {d.obra.map(o => (
        <article key={o.id} className="overflow-hidden rounded-xl border bg-white text-sm" style={borda}>
          {o.foto && <img src={o.foto} alt={o.titulo} loading="lazy" className="max-h-[360px] w-full object-cover" />}
          <div className="p-3">
            <p className="text-xs text-neutral-500">{br(o.data)}{o.percentual != null ? ` · ${o.percentual}%` : ""}</p>
            <p className="font-semibold" style={{ color: VERDE }}>{o.titulo}</p>
            <p className="whitespace-pre-wrap text-neutral-700">{o.texto}</p>
          </div>
        </article>
      ))}
    </section>
  );
}

const ROTULO_STATUS: Record<string, string> = { aberto: "Aguardando resposta", respondido: "Respondido", fechado: "Encerrado" };

export function AbaChamados({ codigo, d, onNovo }: { codigo: string; d: DadosPortal; onNovo: () => void }) {
  const [tipo, setTipo] = useState<TipoChamado>("duvida");
  const [assunto, setAssunto] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); setOcupado(true); setMsg(null);
    try { await postar(`/api/c/${codigo}/chamados`, { tipo, assunto, mensagem }); setAssunto(""); setMensagem(""); setMsg({ ok: true, texto: "Chamado enviado! A resposta aparece aqui e você recebe um aviso no WhatsApp." }); onNovo(); }
    catch (err: any) { setMsg({ ok: false, texto: err.message }); } finally { setOcupado(false); }
  };
  const campo = "w-full rounded-lg border bg-white px-3 py-2 text-sm";
  return (
    <section className="space-y-3">
      <form onSubmit={enviar} className="space-y-2 rounded-xl border bg-white p-4 text-sm" style={borda}>
        <p className="flex items-center gap-2 font-semibold" style={{ color: VERDE }}><MessageSquare className="h-5 w-5" /> Abrir um chamado</p>
        <select value={tipo} onChange={e => setTipo(e.target.value as TipoChamado)} className={campo} style={borda} aria-label="Assunto">
          {TIPOS_CHAMADO.filter(t => t !== "antecipacao").map(t => <option key={t} value={t}>{ROTULO_CHAMADO[t]}</option>)}
        </select>
        <input value={assunto} onChange={e => setAssunto(e.target.value)} maxLength={160} placeholder="Assunto" className={campo} style={borda} required minLength={3} />
        <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} maxLength={3000} rows={4} placeholder="Escreva sua mensagem" className={campo} style={borda} required minLength={5} />
        {msg && <p className={`rounded-lg p-2 ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{msg.texto}</p>}
        <button disabled={ocupado} className="inline-flex items-center gap-1 rounded-lg px-4 py-2 font-semibold text-white disabled:opacity-50" style={{ background: VERDE }}>
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
        </button>
      </form>
      {d.chamados.map(c => (
        <article key={c.id} className="rounded-xl border bg-white p-3 text-sm" style={borda}>
          <p className="flex flex-wrap items-center justify-between gap-2">
            <b>{c.assunto}</b>
            <span className={`rounded px-2 py-0.5 text-xs ${c.status === "aberto" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>{ROTULO_STATUS[c.status] ?? c.status}</span>
          </p>
          <p className="text-xs text-neutral-500">{c.rotulo} · {br(c.criadoEm)}</p>
          <p className="mt-1 whitespace-pre-wrap text-neutral-700">{c.mensagem}</p>
          {c.resposta && (
            <div className="mt-2 rounded-lg p-2" style={{ background: "#eef6ee" }}>
              <p className="flex items-center gap-1 text-xs font-semibold" style={{ color: VERDE }}><CheckCircle2 className="h-3.5 w-3.5" /> Resposta da administração · {br(c.respondidoEm)}</p>
              <p className="whitespace-pre-wrap">{c.resposta}</p>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
