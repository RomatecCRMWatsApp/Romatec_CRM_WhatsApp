import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Crown, Loader2, LogOut, MessageCircle, Ticket } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { RomatecLockup } from "@/brand";
import { Button } from "@/components/ui/button";
import { ROTULO_ORIGEM, ROTULO_STATUS, type Origem, type StatusAssinatura } from "@shared/saas";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (d: unknown) => (d ? new Date(d as any).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "—");
const METODOS = [["CARTAO_RECORRENTE", "Cartão (recorrente)"], ["PIX", "Pix"], ["BOLETO", "Boleto"]] as const;

/** Área do assinante e paywall (camada SaaS): situação, planos, cupom, forma de pagamento e faturas */
export default function Assinatura() {
  const { logout } = useAuth();
  const { data, isLoading } = trpc.saas.minhaAssinatura.useQuery();
  const [ciclo, setCiclo] = useState<"MENSAL" | "ANUAL">("MENSAL");
  const [metodo, setMetodo] = useState<(typeof METODOS)[number][0]>("PIX");
  const [cupom, setCupom] = useState("");
  const [desconto, setDesconto] = useState<Record<string, { preco: number; ciclos: number }>>({});
  const [checkout, setCheckout] = useState<{ mensagem: string; whatsapp: string } | null>(null);
  const validar = trpc.saas.cupomValidar.useMutation();
  const assinar = trpc.saas.minhaCheckout.useMutation({ onSuccess: r => setCheckout(r), onError: e => toast.error(e.message) });

  const aplicarCupom = async () => {
    if (!data) return;
    const novo: Record<string, { preco: number; ciclos: number }> = {};
    let erro = "";
    for (const p of data.planos) {
      try { const r = await validar.mutateAsync({ codigo: cupom, plano: p.codigo, ciclo }); novo[p.codigo] = { preco: r.precoComDesconto, ciclos: r.duracaoCiclos ?? 1 }; }
      catch (e: any) { erro = e.message; }
    }
    setDesconto(novo);
    if (Object.keys(novo).length) toast.success("Cupom aplicado"); else toast.error(erro || "Cupom inválido");
  };

  const fundo = { background: "radial-gradient(circle at 50% 0%, #0A1F14 0%, #000 60%)" };
  if (isLoading || !data) return <div className="min-h-screen" style={fundo}><p className="pt-24 text-center text-sm text-muted-foreground">Carregando…</p></div>;
  const l = data.licenca;
  return (
    <div className="min-h-screen px-4 pb-12" style={fundo}>
      <header className="flex flex-col items-center gap-2 pt-8 pb-4"><RomatecLockup variant="stack" height={64} /></header>
      <main className="mx-auto max-w-4xl space-y-5">
        <section className={`rounded-[18px] border p-5 ${l.liberado ? "border-[var(--rt-gold)]/40" : "border-red-500/50"} bg-[var(--rt-surface)]`}>
          <h1 className="text-xl font-semibold">{l.liberado ? "Sua assinatura" : "Acesso pausado"}</h1>
          {!l.liberado && <p className="mt-1 text-red-300">{l.motivo} Escolha um plano para continuar usando o Romatec CRM — seus dados estão guardados.</p>}
          {l.exigida ? (
            <p className="mt-1 text-sm text-[var(--rt-text-2)]">
              {l.plano ?? "Sem plano"} · {l.status ? ROTULO_STATUS[l.status as StatusAssinatura] ?? l.status : "sem assinatura"}{l.origem ? ` · ${ROTULO_ORIGEM[l.origem as Origem] ?? l.origem}` : ""}
              {l.liberado && l.fim ? ` · até ${dataBr(l.fim)}${l.diasRestantes != null ? ` (${l.diasRestantes === 0 ? "termina hoje" : `faltam ${l.diasRestantes} dia(s)`})` : ""}` : ""}
            </p>
          ) : <p className="mt-1 text-sm text-[var(--rt-text-2)]">O seu acesso está liberado.</p>}
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full border border-[var(--rt-border)] p-1 text-sm">
              {(["MENSAL", "ANUAL"] as const).map(c => (
                <button key={c} type="button" onClick={() => { setCiclo(c); setDesconto({}); }} className={`rounded-full px-4 py-1.5 ${ciclo === c ? "bg-[var(--rt-gold)] font-semibold text-black" : "text-[var(--rt-text-2)]"}`}>
                  {c === "MENSAL" ? "Mensal" : "Anual"}
                </button>
              ))}
            </div>
            {ciclo === "ANUAL" && <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">2 meses grátis</span>}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {data.planos.map(p => {
              const preco = ciclo === "ANUAL" && p.precoAnual != null ? p.precoAnual : p.precoMensal;
              const d = desconto[p.codigo];
              return (
                <div key={p.codigo} className={`flex flex-col rounded-[18px] border bg-[var(--rt-surface)] p-5 ${p.incluiAvalieimob ? "border-[var(--rt-gold)]/60" : "border-[var(--rt-border)]"}`}>
                  <p className="flex items-center gap-2 text-lg font-semibold">{p.incluiAvalieimob && <Crown className="h-5 w-5 text-[var(--rt-gold)]" />}{p.nome}</p>
                  <p className="mt-2 text-3xl font-bold">
                    {d ? <><span className="mr-2 text-base font-normal text-[var(--rt-text-3)] line-through">{brl(preco)}</span>{brl(d.preco)}</> : brl(preco)}
                    <span className="text-sm font-normal text-[var(--rt-text-2)]">/{ciclo === "ANUAL" ? "ano" : "mês"}</span>
                  </p>
                  {d && d.ciclos > 1 && <p className="text-xs text-emerald-300">Preço com cupom por {d.ciclos} ciclos</p>}
                  <p className="mt-3 flex-1 text-sm text-[var(--rt-text-2)]">{p.conteudo}</p>
                  <Button className="mt-4" disabled={assinar.isPending} onClick={() => assinar.mutate({ plano: p.codigo, ciclo, metodo, cupom: d ? cupom : null })}>
                    {assinar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Assinar {p.nome}
                  </Button>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-3 rounded-[18px] border border-[var(--rt-border)] bg-[var(--rt-surface)] p-4">
            <label className="text-xs text-[var(--rt-text-2)]">Cupom
              <div className="mt-1 flex gap-2">
                <input value={cupom} onChange={e => setCupom(e.target.value.toUpperCase())} placeholder="FUNDADOR" className="h-9 w-40 rounded-md border border-border bg-background px-2 text-sm" />
                <Button size="sm" variant="outline" disabled={cupom.trim().length < 2 || validar.isPending} onClick={aplicarCupom}><Ticket className="mr-1 h-4 w-4" /> Aplicar</Button>
              </div>
            </label>
            <label className="text-xs text-[var(--rt-text-2)]">Forma de pagamento
              <select value={metodo} onChange={e => setMetodo(e.target.value as any)} className="mt-1 h-9 rounded-md border border-border bg-background px-2 text-sm">
                {METODOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
            </label>
          </div>
          {checkout && (
            <div className="rounded-[18px] border border-[var(--rt-gold)]/50 bg-[var(--rt-surface)] p-4 text-sm">
              <p>{checkout.mensagem}</p>
              <a href={`https://wa.me/${checkout.whatsapp}?text=${encodeURIComponent("Olá! Quero assinar o Romatec CRM.")}`} target="_blank" rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#1F8A4C] px-4 py-2 font-semibold text-white"><MessageCircle className="h-4 w-4" /> Falar com a Romatec</a>
            </div>
          )}
        </section>

        {data.faturas.length > 0 && (
          <section className="rounded-[18px] border border-[var(--rt-border)] bg-[var(--rt-surface)] p-4">
            <h2 className="mb-2 text-sm font-semibold">Faturas</h2>
            {data.faturas.map(f => (
              <p key={f.id} className="flex flex-wrap justify-between border-t border-[var(--rt-border)] py-1.5 text-sm first:border-0">
                <span>{f.competencia} · {brl(f.valor)}</span>
                <span className={f.status === "PAGA" ? "text-emerald-300" : "text-amber-300"}>{f.status === "PAGA" ? <><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />paga em {dataBr(f.pagoEm)}</> : `${f.status.toLowerCase()} · vence ${dataBr(f.vencimento)}`}</span>
              </p>
            ))}
          </section>
        )}
        <div className="flex justify-center gap-3">
          {l.liberado && <a href="/" className="text-sm text-[var(--rt-gold)] hover:underline">Voltar ao CRM</a>}
          <button type="button" onClick={() => logout()} className="inline-flex items-center gap-1 text-sm text-[var(--rt-text-2)] hover:underline"><LogOut className="h-4 w-4" /> Sair</button>
        </div>
      </main>
    </div>
  );
}
