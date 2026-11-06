/**
 * Ficha completa do cliente: quem é, de onde veio, linha do tempo, contratos com as parcelas, visitas, documentos e
 * conversa, numa tela só. Abre pelo lead (/clientes/lead/:id) ou pelo comprador (/clientes/comprador/:id).
 */
import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import {
  CalendarCheck, ChevronDown, FileSignature, FileText, Loader2, MessageCircle, MessagesSquare, Phone, Route as RouteIcon, Send, UserRound, Wallet,
  CheckCircle2, Clock,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { ROTULO_SITUACAO, type TipoEvento } from "@shared/fichaCliente";

const brl = (v: number | null | undefined) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (d: unknown) => (d ? new Date(d as any).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "—");
const dataIsoBr = (d: string | null | undefined) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const horaBr = (d: unknown) => (d ? new Date(d as any).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const fone = (d: string) => (d.length === 11 ? `(${d.slice(0, 2)}) ${d[2]} ${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d);

const ICONE_EVENTO: Record<TipoEvento, React.ComponentType<{ className?: string }>> = {
  lead: UserRound, mensagem: MessageCircle, visita: CalendarCheck, encaminhamento: Send, contrato: FileSignature, pagamento: Wallet, evento: Clock,
};
const COR_SITUACAO: Record<string, string> = {
  em_dia: "bg-ok-500/15 text-ok-300 border-ok-500/40", quitado: "bg-info-500/15 text-info-300 border-info-500/40",
  em_atraso: "bg-danger-500/15 text-danger-300 border-danger-500/40", sem_parcelas: "bg-white/5 text-muted-foreground border-border",
};
const COR_PARCELA: Record<string, string> = { paga: "text-ok-300", vencida: "text-danger-300", cancelada: "text-muted-foreground line-through", estornada: "text-muted-foreground line-through" };

export default function FichaCliente() {
  const [, pLead] = useRoute("/clientes/lead/:id");
  const [, pComprador] = useRoute("/clientes/comprador/:id");
  const [, navegar] = useLocation();
  const ref = pLead ? { leadId: Number(pLead.id) } : { pessoaId: Number(pComprador?.id) };
  const { data: f, isLoading, error } = trpc.ficha.cliente.useQuery(ref, { enabled: Number.isInteger(ref.leadId ?? ref.pessoaId), retry: false });

  if (isLoading) return <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Carregando a ficha…</p>;
  if (error || !f) return <p className="p-6 text-sm text-muted-foreground">{error?.message ?? "Cliente não encontrado."}</p>;

  const r = f.resumo;
  return (
    <div className="pb-8">
      <PageHeader icone={UserRound} titulo={f.nome}
        subtitulo={[f.contato.cidade, f.lead?.responsavel ? `Corretor: ${f.lead.responsavel}` : null, f.lead?.criadoEm ? `Cliente desde ${dataBr(f.lead.criadoEm)}` : null].filter(Boolean).join(" · ") || "Ficha do cliente"}
        voltar={{ rotulo: "Voltar", onClick: () => history.length > 1 ? history.back() : navegar("/leads") }}
        acoes={<>
          {f.contato.whatsapp && <Button asChild size="sm" className="bg-ok-600 text-white hover:bg-ok-700"><a href={`https://wa.me/${f.contato.whatsapp}`} target="_blank" rel="noreferrer"><MessagesSquare className="mr-1.5 h-4 w-4" /> WhatsApp</a></Button>}
          {f.contato.telefones[0] && <Button asChild size="sm" variant="outline"><a href={`tel:+55${f.contato.telefones[0]}`}><Phone className="mr-1.5 h-4 w-4" /> Ligar</a></Button>}
          {f.leadId && <Button size="sm" variant="outline" onClick={() => navegar(`/leads/lead/${f.leadId}`)}>Abrir o lead</Button>}
        </>} />

      <div className="mx-auto max-w-[1400px] space-y-4 px-4 md:px-6">
        {/* Resumo */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Numero rotulo="Contratos" valor={String(r.contratos)} detalhe={r.contratos ? <span className={`rounded-full border px-2 py-0.5 ${COR_SITUACAO[r.situacao]}`}>{ROTULO_SITUACAO[r.situacao]}</span> : "nenhum ainda"} />
          <Numero rotulo="Recebido" valor={brl(r.recebido)} detalhe={`${r.pagas} de ${r.total} parcelas`} cor="text-ok-300" />
          <Numero rotulo="Em aberto" valor={brl(r.emAberto)} detalhe={r.contratado ? `de ${brl(r.contratado)}` : "—"} />
          <Numero rotulo="Vencido" valor={brl(r.vencido)} detalhe={r.parcelasVencidas ? `${r.parcelasVencidas} parcela(s), ${r.diasAtraso} dias` : "nada vencido"} cor={r.vencido ? "text-danger-300" : undefined} />
          <Numero rotulo="Próxima parcela" valor={r.proxima ? brl(r.proxima.valor) : "—"} detalhe={r.proxima ? `vence ${dataIsoBr(r.proxima.vencimento)}` : "sem parcela a vencer"} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* Coluna 1: quem é + linha do tempo */}
          <div className="space-y-4">
            <Quadro titulo="Contato e origem" icone={UserRound}>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
                {f.contato.telefones.map((t, i) => <Linha key={t} rotulo={i ? "Outro telefone" : "Telefone"} valor={fone(t)} />)}
                {f.contato.email && <Linha rotulo="E-mail" valor={f.contato.email} />}
                {f.contato.documento && <Linha rotulo="CPF/CNPJ" valor={f.contato.documento} />}
                {f.lead?.origem && <Linha rotulo="Origem" valor={[f.lead.origem.replace(/_/g, " "), f.lead.campanha].filter(Boolean).join(", ")} />}
                {f.lead?.empreendimento && <Linha rotulo="Interesse" valor={[f.lead.empreendimento, f.lead.chacara ? `chácara ${f.lead.chacara}` : null].filter(Boolean).join(", ")} />}
                {f.lead?.score && <Linha rotulo="Lead" valor={`${f.lead.score}${f.lead.leadScore != null ? ` (nota ${f.lead.leadScore})` : ""}`} />}
                {f.lead?.ultimaAtividade && <Linha rotulo="Última atividade" valor={horaBr(f.lead.ultimaAtividade)} />}
              </dl>
            </Quadro>

            <Quadro titulo="Linha do tempo" icone={RouteIcon}>
              {!f.linhaDoTempo.length && <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>}
              <ol className="relative space-y-3 border-l border-border pl-5">
                {f.linhaDoTempo.map((e, i) => {
                  const Icone = ICONE_EVENTO[e.tipo] ?? Clock;
                  const conteudo = (
                    <>
                      <span className="absolute -left-[31px] top-0 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card"><Icone className="h-3 w-3 text-[var(--rt-gold)]" /></span>
                      <p className="text-sm text-foreground">{e.titulo}</p>
                      {e.detalhe && <p className="text-xs text-muted-foreground">{e.detalhe}</p>}
                      <p className="text-[11px] text-muted-foreground/80">{horaBr(e.quando)}</p>
                    </>
                  );
                  return (
                    <li key={i} className="relative">
                      {e.url ? <button type="button" onClick={() => navegar(e.url!)} className="block w-full text-left hover:opacity-90">{conteudo}</button> : conteudo}
                    </li>
                  );
                })}
              </ol>
            </Quadro>
          </div>

          {/* Coluna 2: contratos, visitas, documentos, conversa */}
          <div className="space-y-4">
            <Quadro titulo="Contratos e parcelas" icone={FileSignature}>
              {!f.contratos.length && <p className="text-sm text-muted-foreground">Ainda sem contrato.</p>}
              <div className="space-y-3">{f.contratos.map(c => <CartaoContrato key={c.id} c={c} onAbrir={() => navegar(`/contratos/${c.id}`)} />)}</div>
            </Quadro>

            {f.visitas.length > 0 && (
              <Quadro titulo="Visitas" icone={CalendarCheck}>
                <ul className="space-y-1.5 text-sm">
                  {f.visitas.map(v => (
                    <li key={v.id} className="flex flex-wrap justify-between gap-2">
                      <span>{horaBr(v.quando)}{v.local ? `, ${v.local}` : ""}{v.com ? `, com ${v.com}` : ""}</span>
                      <span className={v.status === "realizada" ? "text-ok-300" : v.status === "nao_veio" || v.status === "cancelada" ? "text-danger-300" : "text-muted-foreground"}>{v.rotulo}</span>
                    </li>
                  ))}
                </ul>
              </Quadro>
            )}

            <Quadro titulo="Documentos" icone={FileText}>
              {!f.documentos.length && <p className="text-sm text-muted-foreground">Nenhum documento enviado ainda.</p>}
              <ul className="space-y-1.5 text-sm">
                {f.documentos.map(d => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                    {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="text-[var(--rt-gold-light)] underline-offset-2 hover:underline">{d.nome}</a> : <span className="capitalize">{d.nome}</span>}
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">{d.validado && <CheckCircle2 className="h-3.5 w-3.5 text-ok-300" aria-label="validado" />}{dataBr(d.quando)}</span>
                  </li>
                ))}
              </ul>
            </Quadro>

            {f.conversa.length > 0 && <Conversa mensagens={f.conversa} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Numero({ rotulo, valor, detalhe, cor }: { rotulo: string; valor: string; detalhe: React.ReactNode; cor?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={`truncate text-xl font-semibold tabular-nums ${cor ?? "text-foreground"}`}>{valor}</p>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{detalhe}</div>
    </div>
  );
}

function Quadro({ titulo, icone: Icone, children }: { titulo: string; icone: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><Icone className="h-4 w-4 text-[var(--rt-gold)]" aria-hidden="true" /> {titulo}</h2>
      {children}
    </section>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return <><dt className="text-muted-foreground">{rotulo}</dt><dd className="min-w-0 truncate text-right text-foreground" title={valor}>{valor}</dd></>;
}

function CartaoContrato({ c, onAbrir }: { c: any; onAbrir: () => void }) {
  const [aberto, setAberto] = useState(false);
  const r = c.resumo;
  return (
    <div className="rounded-md border border-border bg-secondary/20 p-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">Contrato {c.numero}, chácara {c.chacara}</p>
          <p className="text-xs text-muted-foreground">{[c.empreendimento, c.rotuloStatus, c.corretor ? `corretor ${c.corretor}` : null].filter(Boolean).join(", ")}</p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${COR_SITUACAO[r.situacao]}`}>{ROTULO_SITUACAO[r.situacao]}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Pago {brl(r.recebido)} de {brl(r.contratado)} ({r.pagas}/{r.total} parcelas)
        {r.vencido ? <span className="text-danger-300">, vencido {brl(r.vencido)} há {r.diasAtraso} dias</span> : null}
        {r.proxima ? `, próxima ${dataIsoBr(r.proxima.vencimento)}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="h-8" onClick={onAbrir}>Abrir contrato</Button>
        {c.pdf && <Button asChild size="sm" variant="ghost" className="h-8"><a href={c.pdf} target="_blank" rel="noreferrer"><FileText className="mr-1 h-3.5 w-3.5" /> PDF</a></Button>}
        {c.parcelas.length > 0 && (
          <Button size="sm" variant="ghost" className="h-8" aria-expanded={aberto} onClick={() => setAberto(v => !v)}>
            <ChevronDown className={`mr-1 h-3.5 w-3.5 transition-transform ${aberto ? "rotate-180" : ""}`} /> {aberto ? "Esconder parcelas" : "Ver parcelas"}
          </Button>
        )}
      </div>
      {aberto && (
        <div className="mt-2 max-h-72 overflow-auto rounded border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card text-muted-foreground"><tr><th className="px-2 py-1 text-left font-normal">Parcela</th><th className="px-2 py-1 text-left font-normal">Vencimento</th><th className="px-2 py-1 text-right font-normal">Valor</th><th className="px-2 py-1 text-right font-normal">Situação</th></tr></thead>
            <tbody>
              {c.parcelas.map((x: any) => (
                <tr key={x.id} className="border-t border-border/60">
                  <td className="px-2 py-1">{x.tipo === "entrada" ? "Entrada" : x.tipo === "avista" ? "À vista" : `${x.numero}/${x.total}`}</td>
                  <td className="px-2 py-1 tabular-nums">{dataIsoBr(x.vencimento)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{brl(x.valor)}</td>
                  <td className={`px-2 py-1 text-right ${COR_PARCELA[x.status] ?? "text-muted-foreground"}`}>
                    {x.status === "paga" ? `paga ${dataIsoBr(x.pagoEm)}` : x.boleto ? <a href={x.boleto} target="_blank" rel="noreferrer" className="underline">{x.status} (boleto)</a> : x.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Conversa({ mensagens }: { mensagens: { id: number; direcao: "in" | "out"; autor: string | null; texto: string; quando: string | null }[] }) {
  return (
    <Quadro titulo="Conversa (últimas mensagens)" icone={MessagesSquare}>
      <div className="max-h-96 space-y-2 overflow-auto pr-1">
        {mensagens.map(m => (
          <div key={m.id} className={`flex ${m.direcao === "in" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${m.direcao === "in" ? "bg-secondary/50 text-foreground" : "bg-ok-600/25 text-foreground"}`}>
              <p className="whitespace-pre-wrap break-words">{m.texto}</p>
              <p className="mt-0.5 text-right text-[10px] text-muted-foreground">{m.direcao === "out" && m.autor && m.autor !== "lead" ? `${m.autor === "ia" ? "IA" : m.autor}, ` : ""}{horaBr(m.quando)}</p>
            </div>
          </div>
        ))}
      </div>
    </Quadro>
  );
}
