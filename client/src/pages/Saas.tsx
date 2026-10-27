import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeDollarSign, Loader2, Power, Ticket } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { CUPOM_FUNDADOR, ROTULO_ORIGEM, ROTULO_STATUS, type Origem, type StatusAssinatura } from "@shared/saas";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (d: unknown) => (d ? new Date(d as any).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "—");
const campo = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";
const COR: Record<string, string> = {
  TRIAL: "bg-sky-500/15 text-sky-300", ATIVA: "bg-emerald-500/15 text-emerald-300", INADIMPLENTE: "bg-amber-500/15 text-amber-300",
  BLOQUEADO: "bg-red-500/15 text-red-300", CANCELADA: "bg-secondary text-muted-foreground", PENDENTE_CONVERSAO: "bg-amber-500/15 text-amber-300",
};
const pedir = (msg: string) => { const m = window.prompt(msg); return m && m.trim().length >= 3 ? m.trim() : null; };

function VisaoGeral() {
  const utils = trpc.useUtils();
  const { data: m, error } = trpc.saas.metricas.useQuery();
  const [cortesia, setCortesia] = useState(() => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  const definir = trpc.saas.definirLicenciamento.useMutation({
    onSuccess: r => { toast.success(r.ativo ? `Licenciamento ligado${r.cortesias ? ` · ${r.cortesias} cortesia(s) criadas` : ""}` : "Licenciamento desligado"); utils.saas.invalidate(); utils.auth.me.invalidate(); },
    onError: e => toast.error(e.message),
  });
  // Sem as métricas, os quadros do Mercado Pago e do AvalieImob continuam disponíveis (diagnóstico e "Conferir pagamentos")
  if (!m) return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-300">Não foi possível carregar o painel: {error.message}</p> : <p className="text-sm text-muted-foreground">Carregando…</p>}
      <MercadoPago />
      <Avalieimob />
    </div>
  );
  const cards: [string, string][] = [
    ["MRR", brl(m.mrr)], ["Assinantes ativos", String(m.ativos)], ["Trials em curso", String(m.trials)],
    ["Conversão trial → pago", m.conversao == null ? "—" : `${m.conversao.toLocaleString("pt-BR")}%`], ["Inadimplentes", String(m.inadimplentes)], ["Receita do mês", brl(m.receitaMes)],
    ["Cortesias e pacotes", String(m.cortesias)], ["Bloqueados", String(m.bloqueados)],
  ];
  return (
    <div className="space-y-4">
      <section className={`rounded-xl border p-4 ${m.licenciamentoAtivo ? "border-emerald-500/40" : "border-amber-500/40"} bg-card`}>
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Power className="h-4 w-4" /> Licenciamento: {m.licenciamentoAtivo ? <span className="text-emerald-300">LIGADO</span> : <span className="text-amber-300">DESLIGADO</span>}</h2>
        {m.licenciamentoAtivo ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">Corretores e empreendedores precisam de assinatura (trial de 7 dias para convites novos{m.cortesiaAte ? `; cortesia até ${m.cortesiaAte.split("-").reverse().join("/")}` : ""}).</span>
            <Button size="sm" variant="outline" disabled={definir.isPending} onClick={() => { if (confirm("Desligar o licenciamento? Todos voltam a usar sem cobrança.")) definir.mutate({ ativo: false }); }}>Desligar</Button>
          </div>
        ) : (
          <div className="mt-2 space-y-2 text-sm">
            <p className="text-muted-foreground">Hoje ninguém é cobrado nem bloqueado. Ao ligar, quem já usa o CRM (corretores e empreendedores ativos) recebe cortesia até a data abaixo; convites novos começam o teste de 7 dias no 1º login.</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted-foreground">Cortesia para quem já usa, até<input type="date" className={campo} value={cortesia} onChange={e => setCortesia(e.target.value)} /></label>
              <Button disabled={!cortesia || definir.isPending} onClick={() => { if (confirm(`Ligar o licenciamento com cortesia até ${cortesia.split("-").reverse().join("/")}?`)) definir.mutate({ ativo: true, cortesiaAte: cortesia }); }}>
                {definir.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Power className="mr-1 h-4 w-4" />} Ligar licenciamento
              </Button>
            </div>
          </div>
        )}
      </section>
      <MercadoPago />
      <Avalieimob />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(([r, v]) => <div key={r} className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{r}</p><p className="text-xl font-bold">{v}</p></div>)}
      </div>
      <p className="text-xs text-muted-foreground">MRR: assinaturas ativas pagas (anual ÷ 12, preço negociado quando houver). Pagamentos fora do Mercado Pago (Pix direto, transferência) são registrados em "Assinaturas". Cada pagamento gera uma NFS-e pendente na aba "NFS-e".</p>
    </div>
  );
}

/** Mercado Pago: credenciais, modo teste/produção e eventos do webhook */
function MercadoPago() {
  const utils = trpc.useUtils();
  const { data } = trpc.saas.mercadoPago.useQuery(undefined, { refetchInterval: 30_000 });
  const definir = trpc.saas.definirModoMp.useMutation({ onSuccess: r => { toast.success(`Mercado Pago em modo ${r.modo === "producao" ? "PRODUÇÃO" : "teste"}`); utils.saas.mercadoPago.invalidate(); }, onError: e => toast.error(e.message) });
  const conciliar = trpc.saas.conciliarMp.useMutation({
    onSuccess: r => { (r.erros.length ? toast.error : toast.success)(`${r.conferidas} fatura(s) conferida(s) · ${r.aplicadas} pagamento(s) aplicado(s)${r.erros.length ? ` · ${r.erros.join(" | ")}` : ""}`); utils.saas.invalidate(); },
    onError: e => toast.error(e.message),
  });
  if (!data) return null;
  const ok = (v: boolean) => (v ? <span className="text-emerald-300">configurado</span> : <span className="text-red-300">faltando</span>);
  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="text-sm font-semibold">Mercado Pago — modo {data.modo === "producao" ? <span className="text-emerald-300">PRODUÇÃO (cobrança real)</span> : <span className="text-amber-300">TESTE (sem dinheiro real)</span>}</h2>
      <p className="text-xs text-muted-foreground">Credencial de teste: {ok(data.teste)} · produção: {ok(data.producao)} · segredo do webhook: {ok(data.webhook)}</p>
      {data.modo === "teste" ? (
        <Button size="sm" variant="outline" disabled={!data.producao || definir.isPending} onClick={() => { if (confirm("Ligar a cobrança REAL no Mercado Pago? Só com a autorização do José.")) definir.mutate({ modo: "producao" }); }}>Ligar produção (cobrança real)</Button>
      ) : (
        <Button size="sm" variant="outline" disabled={definir.isPending} onClick={() => definir.mutate({ modo: "teste" })}>Voltar para o modo teste</Button>
      )}
      <Button size="sm" variant="outline" className="ml-2" disabled={conciliar.isPending} onClick={() => conciliar.mutate()}>
        {conciliar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Conferir pagamentos agora
      </Button>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Últimos avisos do webhook ({data.eventos.length})</summary>
        <div className="mt-1 space-y-0.5">
          {data.eventos.map(e => (
            <p key={e.id} className="font-mono">
              {new Date(e.recebidoEm as any).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })} · {e.eventoId} · {e.processado ? <span className="text-emerald-300">ok</span> : <span className="text-amber-300">pendente ({e.tentativas})</span>}{e.erro ? <span className="text-red-300"> · {e.erro}</span> : null}
            </p>
          ))}
          {!data.eventos.length && <p className="text-muted-foreground">Nenhum aviso recebido ainda.</p>}
        </div>
      </details>
    </section>
  );
}

function NovaAssinatura({ onFeito }: { onFeito: () => void }) {
  const { data: pessoas } = trpc.saas.semAssinatura.useQuery();
  const { data: planos } = trpc.saas.planos.useQuery();
  const [u, setU] = useState("");
  const [origem, setOrigem] = useState<"CORTESIA" | "PACOTE_GESTAO" | "PAGA">("CORTESIA");
  const [plano, setPlano] = useState("");
  const [ate, setAte] = useState("");
  const [contrato, setContrato] = useState("");
  const pessoa = pessoas?.find(p => String(p.id) === u);
  useEffect(() => { if (pessoa) setPlano(pessoa.perfil === "empreendedor" ? (origem === "PACOTE_GESTAO" ? "EMPREENDEDOR_PACOTE" : "EMPREENDEDOR_AVULSO") : "CORRETOR_ESSENCIAL"); }, [pessoa, origem]);
  const definir = trpc.saas.definirAssinatura.useMutation({ onSuccess: () => { toast.success("Assinatura definida"); setU(""); onFeito(); }, onError: e => toast.error(e.message) });
  if (!pessoas?.length) return null;
  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Sem assinatura ({pessoas.length}) — conceder cortesia, pacote ou registrar assinatura paga</h3>
      <div className="grid gap-2 md:grid-cols-5">
        <select className={campo} value={u} onChange={e => setU(e.target.value)}><option value="">— pessoa —</option>{pessoas.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.perfil})</option>)}</select>
        <select className={campo} value={origem} onChange={e => setOrigem(e.target.value as any)}><option value="CORTESIA">Cortesia</option><option value="PACOTE_GESTAO">Pacote de gestão</option><option value="PAGA">Paga (fora do sistema)</option></select>
        <select className={campo} value={plano} onChange={e => setPlano(e.target.value)}>{(planos ?? []).filter(p => !p.unico).map(p => <option key={p.codigo} value={p.codigo}>{p.nome}</option>)}</select>
        <input type="date" className={campo} value={ate} onChange={e => setAte(e.target.value)} title="Válida até (vazio = sem data para cortesia)" />
        {origem === "PACOTE_GESTAO" ? <input className={campo} value={contrato} onChange={e => setContrato(e.target.value)} placeholder="Nº do contrato de gestão" /> : <span />}
      </div>
      <Button size="sm" disabled={!u || !plano || definir.isPending} onClick={() => { const motivo = pedir("Motivo (fica registrado):"); if (motivo) definir.mutate({ usuarioId: Number(u), empreendimentoId: pessoa?.empreendimentoId ?? null, planoCodigo: plano, origem, periodoFim: ate || null, contratoGestaoNr: contrato || null, motivo }); }}>Definir</Button>
    </section>
  );
}

function Assinaturas() {
  const utils = trpc.useUtils();
  const { data } = trpc.saas.assinaturas.useQuery();
  const atualizar = () => { utils.saas.invalidate(); };
  const acao = trpc.saas.acao.useMutation({ onSuccess: () => { toast.success("Feito"); atualizar(); }, onError: e => toast.error(e.message) });
  const pagar = trpc.saas.pagamentoManual.useMutation({ onSuccess: r => { toast.success(`Pagamento registrado · ativa até ${dataBr(r.periodoFim)}`); atualizar(); }, onError: e => toast.error(e.message) });
  return (
    <div className="space-y-3">
      <NovaAssinatura onFeito={atualizar} />
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="p-2">Pessoa</th><th className="p-2">Plano</th><th className="p-2">Situação</th><th className="p-2">Até</th><th className="p-2">Ações</th></tr></thead>
          <tbody>
            {(data ?? []).map(a => (
              <tr key={a.id} className="border-b border-border/50 align-top last:border-0">
                <td className="p-2"><b>{a.nome}</b><p className="text-[11px] text-muted-foreground">{a.perfil}{a.empreendimento ? ` · ${a.empreendimento}` : ""}</p></td>
                <td className="p-2">{a.plano}<p className="text-[11px] text-muted-foreground">{ROTULO_ORIGEM[a.origem as Origem] ?? a.origem} · {a.ciclo.toLowerCase()}{a.precoOverride != null ? ` · ${brl(a.precoOverride)} negociado` : ""}{a.contratoGestaoNr ? ` · contrato ${a.contratoGestaoNr}` : ""}</p></td>
                <td className="p-2"><span className={`rounded-full px-2 py-0.5 text-[11px] ${COR[a.status] ?? ""}`}>{ROTULO_STATUS[a.status as StatusAssinatura] ?? a.status}</span>{a.motivo && <p className="mt-0.5 text-[11px] text-muted-foreground">{a.motivo}</p>}</td>
                <td className="p-2 whitespace-nowrap">{dataBr(a.status === "TRIAL" ? a.trialFim : a.periodoFim)}</td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                      const v = window.prompt("Valor recebido (R$):", "89,90"); if (!v) return;
                      const anual = confirm("É o pagamento ANUAL? (OK = anual · Cancelar = mensal)");
                      pagar.mutate({ id: a.id, ciclo: anual ? "ANUAL" : "MENSAL", valor: Number(v.replace(/\./g, "").replace(",", ".")), observacao: window.prompt("Observação (forma, nº da transação):") ?? "" });
                    }}>Registrar pagamento</Button>
                    {a.status === "BLOQUEADO" || a.status === "PENDENTE_CONVERSAO"
                      ? <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { const motivo = pedir("Motivo do desbloqueio:"); if (motivo) acao.mutate({ id: a.id, tipo: "desbloquear", motivo, ate: window.prompt("Liberado até (AAAA-MM-DD, vazio = sem data):") || null }); }}>Desbloquear</Button>
                      : <Button size="sm" variant="ghost" className="h-7 text-xs text-red-300" onClick={() => { const motivo = pedir("Motivo do bloqueio:"); if (motivo) acao.mutate({ id: a.id, tipo: "bloquear", motivo }); }}>Bloquear</Button>}
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { const v = window.prompt("Preço negociado por ciclo (vazio = tabela):", a.precoOverride != null ? String(a.precoOverride) : ""); if (v === null) return; const motivo = pedir("Motivo:"); if (motivo) acao.mutate({ id: a.id, tipo: "override", motivo, preco: v.trim() ? Number(v.replace(",", ".")) : null }); }}>Preço</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { const v = window.prompt("Dias de tolerância após o vencimento:", String(a.diasTolerancia)); if (!v) return; const motivo = pedir("Motivo:"); if (motivo) acao.mutate({ id: a.id, tipo: "tolerancia", motivo, dias: Number(v) }); }}>Tolerância</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.length && <p className="p-4 text-sm text-muted-foreground">Nenhuma assinatura ainda. Elas aparecem ao ligar o licenciamento (cortesias) e com os testes dos convites novos.</p>}
      </div>
    </div>
  );
}

function PlanosECupons() {
  const utils = trpc.useUtils();
  const { data: planos } = trpc.saas.planos.useQuery();
  const { data: cupons } = trpc.saas.cupons.useQuery();
  const salvarPlano = trpc.saas.atualizarPlano.useMutation({
    onSuccess: r => {
      const rj = r.reajuste;
      toast.success(rj ? `Plano salvo. Cartão recorrente: ${rj.atualizadas} assinatura(s) atualizada(s) para o valor novo${rj.falhas.length ? `, ${rj.falhas.length} com falha` : ""}.` : "Plano salvo");
      if (rj?.falhas.length) toast.error(`Não atualizou no Mercado Pago: ${rj.falhas.join(" · ")}`);
      utils.saas.planos.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const criar = trpc.saas.criarCupom.useMutation({ onSuccess: r => { toast.success(`Cupom ${r.codigo} criado`); utils.saas.cupons.invalidate(); }, onError: e => toast.error(e.message) });
  const cancelar = trpc.saas.cancelarCupom.useMutation({ onSuccess: () => utils.saas.cupons.invalidate() });
  const [c, setC] = useState({ codigo: "", tipo: "PERCENTUAL" as "PERCENTUAL" | "VALOR_FIXO", valor: "10", planoAlvo: "", limiteUsos: "10", validade: "", duracaoCiclos: "1" });
  const num = (v: string) => Number(String(v).replace(",", "."));
  const temFundador = cupons?.some(x => x.codigo === "FUNDADOR");
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><BadgeDollarSign className="h-4 w-4" /> Planos</h3>
        <div className="space-y-2">
          {(planos ?? []).map(p => (
            <form key={p.id} className="grid items-end gap-2 md:grid-cols-[2fr_1fr_1fr_auto]" onSubmit={e => {
              e.preventDefault(); const f = new FormData(e.currentTarget);
              const m = num(String(f.get("m"))), a = String(f.get("a")).trim() ? num(String(f.get("a"))) : null;
              const mudou = m !== Number(p.precoMensal) || (a ?? null) !== (p.precoAnual == null ? null : Number(p.precoAnual));
              if (mudou && !confirm(`Mudar o preço de ${p.nome}? Vale para a próxima fatura de todos os assinantes deste plano (Pix, boleto e cartão recorrente). Preço negociado e cupom em vigor continuam valendo.`)) return;
              salvarPlano.mutate({ id: p.id, precoMensal: m, precoAnual: a });
            }}>
              <p className="text-sm"><b>{p.nome}</b><span className="block text-[11px] text-muted-foreground">{p.codigo}{p.unico ? " · cobrança única" : ""}</span></p>
              <label className="text-xs text-muted-foreground">{p.unico ? "Valor" : "Mensal"}<input name="m" className={campo} defaultValue={String(p.precoMensal).replace(".", ",")} /></label>
              <label className="text-xs text-muted-foreground">Anual<input name="a" className={campo} defaultValue={p.precoAnual == null ? "" : String(p.precoAnual).replace(".", ",")} disabled={p.unico} /></label>
              <Button size="sm" variant="outline" type="submit">Salvar</Button>
            </form>
          ))}
        </div>
      </section>
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Ticket className="h-4 w-4" /> Cupons</h3>
        {!temFundador && (
          <Button size="sm" variant="outline" disabled={criar.isPending} onClick={() => criar.mutate({ codigo: "FUNDADOR", tipo: "PRECO_FIXO", precosFixos: CUPOM_FUNDADOR.precoFixo, limiteUsos: CUPOM_FUNDADOR.limiteUsos, duracaoCiclos: CUPOM_FUNDADOR.duracaoCiclos, descricao: "Preço fundador: 20 primeiros corretores, 12 meses" })}>
            Criar o cupom FUNDADOR (R$ 69,90 / R$ 129,90 · 20 usos · 12 meses)
          </Button>
        )}
        <div className="grid items-end gap-2 md:grid-cols-7">
          <label className="text-xs text-muted-foreground">Código<input className={campo} value={c.codigo} onChange={e => setC({ ...c, codigo: e.target.value.toUpperCase() })} placeholder="automático" /></label>
          <label className="text-xs text-muted-foreground">Tipo<select className={campo} value={c.tipo} onChange={e => setC({ ...c, tipo: e.target.value as any })}><option value="PERCENTUAL">Percentual</option><option value="VALOR_FIXO">Valor fixo (R$)</option></select></label>
          <label className="text-xs text-muted-foreground">Desconto<input className={campo} value={c.valor} onChange={e => setC({ ...c, valor: e.target.value })} /></label>
          <label className="text-xs text-muted-foreground">Plano<select className={campo} value={c.planoAlvo} onChange={e => setC({ ...c, planoAlvo: e.target.value })}><option value="">Todos</option>{(planos ?? []).filter(p => !p.unico).map(p => <option key={p.codigo} value={p.codigo}>{p.nome}</option>)}</select></label>
          <label className="text-xs text-muted-foreground">Limite de usos<input className={campo} value={c.limiteUsos} onChange={e => setC({ ...c, limiteUsos: e.target.value })} inputMode="numeric" /></label>
          <label className="text-xs text-muted-foreground">Validade<input type="date" className={campo} value={c.validade} onChange={e => setC({ ...c, validade: e.target.value })} /></label>
          <label className="text-xs text-muted-foreground">Ciclos<input className={campo} value={c.duracaoCiclos} onChange={e => setC({ ...c, duracaoCiclos: e.target.value })} inputMode="numeric" /></label>
        </div>
        <Button size="sm" disabled={criar.isPending} onClick={() => criar.mutate({ codigo: c.codigo || null, tipo: c.tipo, valor: num(c.valor), planoAlvo: c.planoAlvo || null, limiteUsos: Math.max(1, Math.round(num(c.limiteUsos))), validade: c.validade || null, duracaoCiclos: Math.max(1, Math.round(num(c.duracaoCiclos))) })}>Criar cupom</Button>
        <div className="space-y-1">
          {(cupons ?? []).map(x => (
            <p key={x.id} className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-1 text-sm">
              <b className="font-mono">{x.codigo}</b>
              <span className="text-xs text-muted-foreground">{x.tipo === "PERCENTUAL" ? `${x.valor}%` : x.tipo === "VALOR_FIXO" ? `- ${brl(x.valor)}` : Object.entries(x.precosFixos ?? {}).map(([k, v]) => `${k}: ${brl(v)}`).join(" · ")}
                {x.planoAlvo ? ` · ${x.planoAlvo}` : ""} · {x.usosRealizados}/{x.limiteUsos} usos · {x.duracaoCiclos} ciclo(s){x.validade ? ` · até ${dataBr(x.validade)}` : ""}</span>
              <span className={`text-xs ${x.status === "ativo" ? "text-emerald-300" : "text-muted-foreground"}`}>{x.status}</span>
              {x.status === "ativo" && <button className="ml-auto text-xs text-red-300 hover:underline" onClick={() => { if (confirm(`Cancelar o cupom ${x.codigo}?`)) cancelar.mutate({ id: x.id }); }}>cancelar</button>}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}

const COR_NFSE: Record<string, string> = {
  PENDENTE: "bg-amber-500/15 text-amber-300", ENVIADA: "bg-sky-500/15 text-sky-300", EMITIDA: "bg-emerald-500/15 text-emerald-300",
  REJEITADA: "bg-red-500/15 text-red-300", CANCELADA: "bg-secondary text-muted-foreground",
};
const AMBIENTE_NFSE: Record<string, string> = { simulation: "simulação", development: "homologação", production: "PRODUÇÃO" };

/** Situação da integração com a Spedy (ambiente, empresa, webhook) — a chave nunca vem para cá */
function PainelSpedy() {
  const utils = trpc.useUtils();
  const { data: s, isLoading } = trpc.saas.spedySituacao.useQuery();
  const webhook = trpc.saas.spedyWebhook.useMutation({
    onSuccess: r => { toast.success(r.criado ? "Webhook cadastrado na Spedy" : r.reativado ? "Webhook reativado" : "Webhook já estava cadastrado"); utils.saas.spedySituacao.invalidate(); },
    onError: e => toast.error(e.message),
  });
  if (isLoading || !s) return null;
  return (
    <section className={`space-y-1 rounded-xl border p-3 text-sm ${s.conectada ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card"}`}>
      <h3 className="font-semibold">
        Spedy (emissão automática) — {!s.configurada ? <span className="text-amber-300">aguardando configuração</span>
          : s.conectada ? <span className="text-emerald-300">conectada · {s.ambiente === "producao" ? "PRODUÇÃO" : "sandbox"}</span> : <span className="text-red-300">sem conexão</span>}
      </h3>
      {!s.configurada && <p className="text-xs text-muted-foreground">{s.erro}. Configure as variáveis no Railway: SPEDY_API_KEY, SPEDY_AMBIENTE (sandbox ou producao) e SPEDY_EMPRESA_ID.</p>}
      {s.configurada && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>NFS-e na empresa: <b className={s.ambienteNfse === "production" ? "text-red-300" : "text-foreground"}>{s.ambienteNfse ? AMBIENTE_NFSE[s.ambienteNfse] ?? s.ambienteNfse : "—"}</b></span>
          <span>Alíquota de ISS: <b className="text-foreground">{s.issAliquota != null ? `${s.issAliquota}%` : "a da empresa na Spedy"}</b></span>
          <span>Webhook: {s.webhook ? <b className={s.webhook.enabled ? "text-emerald-300" : "text-amber-300"}>{s.webhook.enabled ? "ativo" : "desabilitado"}</b> : <b className="text-amber-300">não cadastrado</b>}</span>
          {(!s.webhook || !s.webhook.enabled) && s.conectada && <Button size="sm" variant="outline" className="h-7 text-xs" disabled={webhook.isPending} onClick={() => webhook.mutate()}>{s.webhook ? "Reativar webhook" : "Cadastrar webhook"}</Button>}
        </div>
      )}
      {s.falha && <p className="text-xs text-red-300">{s.falha}</p>}
    </section>
  );
}

/** NFS-e em fila: cada fatura paga vira uma nota pendente com o tomador congelado; emitida pela Spedy ou no portal da prefeitura */
function Nfse() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<"PENDENTE" | "ENVIADA" | "EMITIDA" | "REJEITADA" | "CANCELADA" | "">("PENDENTE");
  const { data } = trpc.saas.nfse.useQuery(status ? { status } : undefined, { refetchInterval: status === "ENVIADA" ? 15_000 : false });
  const { data: spedy } = trpc.saas.spedySituacao.useQuery();
  const ok = (msg: string) => () => { toast.success(msg); utils.saas.nfse.invalidate(); };
  const emitir = trpc.saas.spedyEmitir.useMutation({
    onSuccess: r => { toast.success(r.status === "EMITIDA" ? "NFS-e autorizada" : `Enviada à Spedy (${r.ambiente}) — aguardando a prefeitura`); utils.saas.nfse.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const consultar = trpc.saas.spedyConsultar.useMutation({
    onSuccess: r => { toast.success(`Status na Spedy: ${r.externoStatus ?? "—"}${r.mensagem ? ` — ${r.mensagem}` : ""}`); utils.saas.nfse.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const emitida = trpc.saas.nfseEmitida.useMutation({ onSuccess: ok("Nota marcada como emitida"), onError: e => toast.error(e.message) });
  const tomador = trpc.saas.nfseAtualizarTomador.useMutation({ onSuccess: ok("Tomador atualizado com o cadastro atual"), onError: e => toast.error(e.message) });
  const cancelar = trpc.saas.nfseCancelar.useMutation({ onSuccess: ok("Nota cancelada"), onError: e => toast.error(e.message) });
  const csv = trpc.saas.nfseCsv.useMutation({
    onSuccess: r => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" }));
      a.download = `nfse-${status ? status.toLowerCase() : "todas"}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    onError: e => toast.error(e.message),
  });
  const copiar = (t: string) => { navigator.clipboard?.writeText(t).then(() => toast.success("Copiado")); };
  const total = (data ?? []).reduce((s, n) => s + n.valor, 0);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Toda fatura paga (Mercado Pago ou registrada à mão) entra aqui com os dados do cliente do momento do pagamento. Emita pela Spedy (botão "Emitir NFS-e") ou no portal da prefeitura, marcando como emitida com o número. Item de serviço padrão 1.05 (licenciamento de software) — confirme com a contabilidade.</p>
      <PainelSpedy />
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${campo} w-auto`} value={status} onChange={e => setStatus(e.target.value as any)}>
          <option value="PENDENTE">Pendentes</option><option value="ENVIADA">Enviadas (aguardando)</option><option value="EMITIDA">Emitidas</option>
          <option value="REJEITADA">Rejeitadas</option><option value="CANCELADA">Canceladas</option><option value="">Todas</option>
        </select>
        <span className="text-sm text-muted-foreground">{data?.length ?? 0} nota(s) · {brl(total)}</span>
        <Button size="sm" variant="outline" className="ml-auto" disabled={csv.isPending || !data?.length} onClick={() => csv.mutate(status ? { status } : undefined)}>Exportar CSV</Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="p-2">Tomador</th><th className="p-2">Serviço</th><th className="p-2">Valor</th><th className="p-2">Situação</th><th className="p-2">Ações</th></tr></thead>
          <tbody>
            {(data ?? []).map(n => (
              <tr key={n.id} className="border-b border-border/50 align-top last:border-0">
                <td className="p-2">
                  <b>{n.tomadorNome}</b>
                  <p className="text-[11px] text-muted-foreground">{n.tomadorDoc ? `CPF/CNPJ ${n.tomadorDoc}` : <span className="text-amber-300">sem CPF</span>}{n.tomadorEmail ? ` · ${n.tomadorEmail}` : ""}</p>
                  <p className="text-[11px] text-muted-foreground">{n.tomadorEndereco ?? <span className="text-amber-300">sem endereço</span>}</p>
                </td>
                <td className="p-2 max-w-[360px]"><p className="text-xs">{n.discriminacao}</p><p className="text-[11px] text-muted-foreground">item {n.itemServico} · pago em {dataBr(n.pagoEm)}{n.metodo ? ` · ${n.metodo.toLowerCase()}` : ""}{n.modo === "teste" ? " · TESTE" : ""}</p></td>
                <td className="p-2 whitespace-nowrap">{brl(n.valor)}</td>
                <td className="p-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${COR_NFSE[n.status] ?? ""}`}>{n.status === "ENVIADA" ? "enviada · aguardando" : n.status.toLowerCase()}</span>
                  {n.provedor === "spedy" && <p className="mt-0.5 text-[11px] text-muted-foreground">Spedy{n.ambiente ? ` · ${AMBIENTE_NFSE[n.ambiente] ?? n.ambiente}` : ""}{n.externoStatus ? ` · ${n.externoStatus}` : ""}</p>}
                  {n.numero && <p className="mt-0.5 text-[11px]">nº {n.numero}{n.codigoVerificacao ? ` · ${n.codigoVerificacao}` : ""}</p>}
                  {n.mensagem && <p className={`mt-0.5 max-w-[260px] text-[11px] ${n.status === "REJEITADA" ? "text-red-300" : "text-muted-foreground"}`}>{n.mensagem}</p>}
                  {(n.pdfUrl || n.xmlUrl) && (
                    <p className="mt-0.5 flex gap-2 text-[11px]">
                      {n.pdfUrl && <a href={n.pdfUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">PDF</a>}
                      {n.xmlUrl && <a href={n.xmlUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">XML</a>}
                    </p>
                  )}
                  {n.observacao && <p className={`mt-0.5 text-[11px] ${n.observacao.startsWith("ESTORNO") ? "text-red-300" : "text-muted-foreground"}`}>{n.observacao}</p>}
                </td>
                <td className="p-2">
                  {(n.status === "PENDENTE" || n.status === "REJEITADA") && (
                    <div className="flex flex-wrap gap-1">
                      {spedy?.configurada && (
                        <Button size="sm" className="h-7 text-xs" disabled={emitir.isPending}
                          onClick={() => { if (confirm(`Emitir a NFS-e de ${brl(n.valor)} para ${n.tomadorNome} pela Spedy (${spedy.ambiente === "producao" ? "PRODUÇÃO — nota com validade fiscal" : "sandbox"})?`)) emitir.mutate({ id: n.id }); }}>
                          {emitir.isPending && emitir.variables?.id === n.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}{n.status === "REJEITADA" ? "Reenviar NFS-e" : "Emitir NFS-e"}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copiar(n.discriminacao)}>Copiar descrição</Button>
                      {n.faltaCadastro && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => tomador.mutate({ id: n.id })}>Puxar cadastro atual</Button>}
                      {n.status === "PENDENTE" && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { const numero = window.prompt("Número da NFS-e emitida no portal da prefeitura:"); if (!numero?.trim()) return; emitida.mutate({ id: n.id, numero, codigoVerificacao: window.prompt("Código de verificação (opcional):") || null }); }}>Marcar emitida</Button>}
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-red-300" onClick={() => { const motivo = pedir("Motivo do cancelamento:"); if (motivo) cancelar.mutate({ id: n.id, motivo }); }}>Cancelar</Button>
                    </div>
                  )}
                  {n.status === "ENVIADA" && n.provedor === "spedy" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={consultar.isPending} onClick={() => consultar.mutate({ id: n.id })}>Consultar agora</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.length && <p className="p-4 text-sm text-muted-foreground">Nenhuma nota {status ? status.toLowerCase() : ""}.</p>}
      </div>
    </div>
  );
}

/** Situação da integração com o AvalieImob (acesso do plano Corretor Pro) */
function Avalieimob() {
  const { data } = trpc.saas.avalieimobIntegracao.useQuery();
  if (!data) return null;
  return (
    <section className="space-y-1 rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="text-sm font-semibold">AvalieImob (incluído no Corretor Pro) — {data.configurado ? <span className="text-emerald-300">integração ligada</span> : <span className="text-amber-300">aguardando configuração</span>}</h2>
      <p className="text-xs text-muted-foreground">
        {data.configurado
          ? `${data.ativos} assinatura(s) com acesso liberado em ${data.url}. O acesso é ativado e suspenso sozinho conforme a assinatura.`
          : "Falta o segredo compartilhado nas variáveis do Railway: AVALIEIMOB_INTEGRACAO_SECRET aqui e ROMATEC_CRM_INTEGRACAO_SECRET no AvalieImob (o mesmo valor)."}
      </p>
      {data.erros.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-amber-300">Falhas recentes ({data.erros.length})</summary>{data.erros.map((e, i) => <p key={i} className="font-mono">{e}</p>)}</details>}
    </section>
  );
}

const ABAS = [["geral", "Visão geral"], ["assinaturas", "Assinaturas"], ["planos", "Planos e cupons"], ["nfse", "NFS-e"]] as const;

/** Admin › SaaS (camada SaaS fase 1) — só o administrador */
export default function Saas() {
  const [aba, setAba] = useState<(typeof ABAS)[number][0]>("geral");
  return (
    <div>
      <PageHeader icone={BadgeDollarSign} titulo="SaaS e assinaturas" subtitulo="Planos, assinaturas, cupons e o licenciamento do Romatec CRM" />
      <div className="mx-auto max-w-[1300px] space-y-4 px-4 pb-8 md:px-6">
        <div className="flex flex-wrap gap-1 border-b border-border">
          {ABAS.map(([k, r]) => <button key={k} type="button" onClick={() => setAba(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === k ? "border-primary font-semibold" : "border-transparent text-muted-foreground"}`}>{r}</button>)}
        </div>
        {aba === "geral" ? <VisaoGeral /> : aba === "assinaturas" ? <Assinaturas /> : aba === "nfse" ? <Nfse /> : <PlanosECupons />}
      </div>
    </div>
  );
}
