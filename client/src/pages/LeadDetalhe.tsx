import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Building2, ExternalLink, Headset, MessageCircle, Bot, Send, XCircle, FileText, Save } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import VisitasLead from "@/components/VisitasLead";
import ReunioesLead from "@/components/ReunioesLead";
import { CLASSE_COR, MOTIVOS, MotivoPerda, desde } from "./LeadsFunil";

const ROTULO_SLOT: Record<string, string> = {
  objetivo: "Objetivo", forma_pagamento: "Forma de pagamento", valor_entrada: "Valor de entrada (R$)", credito_aprovado: "Crédito aprovado",
  prazo_compra: "Prazo de compra", faixa_valor: "Faixa de valor (R$)", regiao_interesse: "Região de interesse", quer_visita: "Quer visita",
  decisor: "Quem decide", rural_atividade: "Atividade rural", rural_area_desejada_ha: "Área desejada (ha)",
  tipo_imovel: "Tipo do imóvel", localizacao: "Localização", documentacao: "Documentação", area: "Área", valor_pretendido: "Valor pretendido (R$)",
  urgencia: "Urgência", aceita_exclusividade: "Aceita exclusividade", quer_avaliacao: "Quer avaliação", rural_georref: "Georreferenciamento", rural_car_ccir: "CAR/CCIR",
};
const ROTULO_FONTE: Record<string, string> = { ia: "IA", bot: "bot", form: "formulário", manual: "manual" };
const ROTULO_EVENTO: Record<string, string> = {
  view_imovel: "Abriu a página do imóvel", view_galeria: "Viu as fotos", play_video: "Assistiu ao vídeo", view_planta: "Abriu a planta",
  view_mapa: "Abriu o mapa", tempo_pagina: "Tempo na página", clique_whatsapp: "Clicou no WhatsApp", submit_form: "Enviou o formulário", scan_qr: "Escaneou o QR da placa",
};
const opcao = (v: string) => v.replace(/_/g, " ");

function ScorePainel({ leadId }: { leadId: number }) {
  const { data } = trpc.leads.scoreDetalhe.useQuery({ id: leadId });
  if (!data) return null;
  return (
    <div className="space-y-1">
      {data.itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma regra pontuou ainda.</p>
      ) : data.itens.map(i => (
        <div key={i.regra} className="flex justify-between text-sm">
          <span className="text-foreground">{i.rotulo}</span>
          <span className={i.pontos >= 0 ? "text-emerald-300 font-semibold" : "text-red-300 font-semibold"}>{i.pontos >= 0 ? "+" : ""}{i.pontos}</span>
        </div>
      ))}
      <div className="flex justify-between text-sm font-bold border-t border-border pt-1">
        <span>Total{data.limitado ? " (limitado a 0–100)" : ""}</span><span>{data.score ?? "–"}</span>
      </div>
      {data.historico.length > 1 && <p className="text-xs text-muted-foreground">Histórico: {data.historico.slice(0, 8).map((h: any) => h.score).reverse().join(" → ")}</p>}
    </div>
  );
}

export default function LeadDetalhe() {
  const [, params] = useRoute("/leads/lead/:id");
  const [, navigate] = useLocation();
  const id = Number(params?.id);
  const utils = trpc.useUtils();
  const { data: lead, isLoading } = trpc.crm.lead.useQuery({ id }, { enabled: Number.isFinite(id) });
  const { data: etapasCfg } = trpc.crm.etapas.useQuery();
  const [edicao, setEdicao] = useState<Record<string, string>>({});
  const [perder, setPerder] = useState(false);

  useEffect(() => {
    if (lead) setEdicao(Object.fromEntries(Object.entries(lead.slots).map(([k, v]: any) => [k, v.valor])));
  }, [lead]);

  const atualizar = () => { utils.crm.lead.invalidate({ id }); utils.leads.scoreDetalhe.invalidate({ id }); utils.crm.kanban.invalidate(); };
  const erro = (e: { message: string }) => toast.error(e.message);
  const mover = trpc.crm.moverEtapa.useMutation({ onSuccess: atualizar, onError: erro });
  const { data: responsaveis } = trpc.crm.responsaveis.useQuery();
  const definirResp = trpc.crm.definirResponsavel.useMutation({ onSuccess: r => { if (r.encaminhado) toast.success("Lead encaminhado — o corretor foi avisado no sistema e no WhatsApp."); atualizar(); }, onError: erro });
  const marcarAtendido = trpc.crm.marcarAtendido.useMutation({ onSuccess: atualizar, onError: erro });
  // Abrir o WhatsApp do cliente conta como atendido
  const abriuWhatsApp = trpc.crm.abriuWhatsApp.useMutation({ onSuccess: atualizar });
  const salvar = trpc.crm.salvarSlots.useMutation({
    onSuccess: r => { toast.success(`Salvo${r.score !== null ? ` · score ${r.score}` : ""}${r.recusados.length ? ` · valor inválido em: ${r.recusados.join(", ")}` : ""}`); atualizar(); },
    onError: erro,
  });
  const assumir = trpc.crm.assumir.useMutation({ onSuccess: () => { toast.success("Você assumiu a conversa. O bot não responde este lead."); atualizar(); }, onError: erro });
  const devolver = trpc.crm.devolver.useMutation({ onSuccess: () => { toast.success("Conversa devolvida ao bot."); atualizar(); }, onError: erro });
  const similar = trpc.crm.enviarSimilar.useMutation({ onSuccess: r => { toast.success(`Enviado: ${r.enviado.codigo ?? ""} ${r.enviado.titulo}`); atualizar(); }, onError: erro });
  const cadastrar = trpc.crm.cadastrarImovel.useMutation({ onSuccess: r => { toast.success(`Imóvel ${r.codigo} criado (inativo, sem preço público). Complete fotos e preço em Imóveis.`); atualizar(); }, onError: erro });

  const alterados = useMemo(() => {
    if (!lead) return {};
    const out: Record<string, string | null> = {};
    for (const d of lead.definicaoSlots) {
      const atual = lead.slots[d.nome]?.valor ?? "";
      const novo = edicao[d.nome] ?? "";
      if (atual !== novo) out[d.nome] = novo || null;
    }
    return out;
  }, [lead, edicao]);

  if (isLoading) return <p className="container py-8 text-sm text-muted-foreground">Carregando...</p>;
  if (!lead) return <p className="container py-8 text-sm text-muted-foreground">Lead não encontrado.</p>;

  const etapas = etapasCfg?.ETAPAS[lead.funil] ?? [];
  const rotulos = etapasCfg?.ROTULO_ETAPA ?? {};
  const fone = String(lead.phone).replace(/\D/g, "");

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        voltar={{ rotulo: "Funil de leads", onClick: () => navigate("/leads/funil") }}
        titulo={lead.nome}
        subtitulo={<>
          <span className="inline-flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${CLASSE_COR[lead.classe || "frio"]}`}>{lead.score ?? "–"} · {(lead.classe || "frio").toUpperCase()}</span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-white/10">{lead.funil === "proprietario" ? "Proprietário" : "Comprador"}</span>
            {lead.humano && <span className="text-[11px] px-2 py-0.5 rounded bg-violet-500/30 inline-flex items-center gap-1"><Headset className="h-3 w-3" /> com o corretor</span>}
          </span>
          <br />+{fone} · entrou há {desde(lead.criadoEm)} · última atividade há {desde(lead.ultimaAtividade)}
        </>}
        acoes={<Button size="sm" asChild className="bg-[#25D366] hover:bg-[#1fb956] text-white"><a href={`https://wa.me/${fone}`} onClick={() => abriuWhatsApp.mutate({ id })} target="_blank" rel="noreferrer" title="Abrir a conversa (conta como atendido)"><MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp</a></Button>}
      />

      <div className="px-4 md:px-6 pb-6 max-w-[1500px] mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-4">
          {/* Esperando corretor (alerta de 5 minutos) */}
          {lead.aguardandoDesde && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-amber-200">⏰ Esperando um corretor desde {new Date(lead.aguardandoDesde).toLocaleTimeString("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit" })}</p>
              <Button size="sm" variant="outline" onClick={() => marcarAtendido.mutate({ id })}>✅ Já atendi</Button>
            </div>
          )}
          {/* Ações */}
          <Card className="bg-card border-border">
            <CardContent className="py-4 flex flex-wrap items-center gap-2">
              <label className="text-sm text-muted-foreground">Responsável</label>
              <select value={lead.responsavelId ?? ""} onChange={e => definirResp.mutate({ id, responsavelId: e.target.value ? Number(e.target.value) : null })}
                className="h-9 px-2 rounded-md border border-border bg-secondary/30 text-sm text-foreground">
                <option value="">— sem responsável —</option>
                {(responsaveis ?? []).map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
              {lead.atendidoEm && <span className="text-xs text-emerald-300">✅ {lead.ultimoAtendimento === "encaminhado" ? "Encaminhado para atendimento" : "Atendido"} {new Date(lead.atendidoEm).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
              <label className="text-sm text-muted-foreground">Etapa</label>
              <select value={lead.etapa} onChange={e => (e.target.value === "perdido" ? setPerder(true) : mover.mutate({ id, etapa: e.target.value }))}
                className="h-9 px-2 rounded-md border border-border bg-secondary/30 text-sm text-foreground">
                {etapas.map(x => <option key={x} value={x}>{rotulos[x] ?? x}</option>)}
              </select>
              {lead.motivoPerda && <span className="text-xs text-red-300">Perdido: {MOTIVOS[lead.motivoPerda.split(":")[0]] || lead.motivoPerda}</span>}
              <div className="flex-1" />
              {lead.humano || lead.funil === "proprietario"
                ? lead.funil === "comprador" && <Button size="sm" variant="outline" disabled={devolver.isPending} onClick={() => devolver.mutate({ id })}><Bot className="mr-1.5 h-4 w-4" /> Devolver ao bot</Button>
                : <Button size="sm" variant="outline" disabled={assumir.isPending} onClick={() => assumir.mutate({ id })}><Headset className="mr-1.5 h-4 w-4" /> Assumir conversa</Button>}
              {lead.funil === "comprador" && lead.imoveis.length > 0 && (
                <Button size="sm" variant="outline" disabled={similar.isPending} onClick={() => similar.mutate({ id })}><Send className="mr-1.5 h-4 w-4" /> {similar.isPending ? "Enviando..." : "Enviar imóvel similar"}</Button>
              )}
              {lead.etapa !== "perdido" && <Button size="sm" variant="ghost" className="text-red-300" onClick={() => setPerder(true)}><XCircle className="mr-1.5 h-4 w-4" /> Marcar perdido</Button>}
            </CardContent>
          </Card>

          {/* Proprietário: AvalieImob e cadastro */}
          {lead.funil === "proprietario" && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2"><CardTitle className="text-base">Imóvel do proprietário</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-foreground">{lead.imovelProprietario || "Preencha tipo, localização e documentação abaixo."}</p>
                <div className="flex flex-wrap gap-2">
                  {lead.avalieImob ? (
                    <>
                      <Button size="sm" variant="outline" asChild><a href={lead.avalieImob.ptam} target="_blank" rel="noreferrer"><FileText className="mr-1.5 h-4 w-4" /> Abrir PTAM no AvalieImob</a></Button>
                      <Button size="sm" variant="outline" asChild><a href={lead.avalieImob.exclusividade} target="_blank" rel="noreferrer"><FileText className="mr-1.5 h-4 w-4" /> Gerar contrato de exclusividade</a></Button>
                    </>
                  ) : <p className="text-xs text-muted-foreground">Defina AVALIEIMOB_URL no Railway para os botões de PTAM e exclusividade.</p>}
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={cadastrar.isPending}
                    onClick={() => { if (confirm("Cadastrar este imóvel na carteira (inativo e sem preço público)?")) cadastrar.mutate({ id }); }}>
                    <Building2 className="mr-1.5 h-4 w-4" /> Cadastrar como imóvel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Slots */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Qualificação</CardTitle>
              <Button size="sm" disabled={!Object.keys(alterados).length || salvar.isPending} onClick={() => salvar.mutate({ id, slots: alterados })} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Save className="mr-1.5 h-4 w-4" /> {salvar.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </CardHeader>
            <CardContent>
              {lead.pendentes.length > 0 && <p className="text-xs text-amber-300 mb-3">Faltam: {lead.pendentes.map(p => ROTULO_SLOT[p] || p).join(", ")}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {lead.definicaoSlots.map(d => {
                  const s = lead.slots[d.nome];
                  const pendente = lead.pendentes.includes(d.nome);
                  return (
                    <label key={d.nome} className="space-y-1">
                      <span className={`text-xs ${pendente ? "text-amber-300" : "text-muted-foreground"}`}>
                        {ROTULO_SLOT[d.nome] || d.nome}{s ? ` · ${ROTULO_FONTE[s.fonte] || s.fonte}` : ""}
                      </span>
                      {d.opcoes ? (
                        <select value={edicao[d.nome] ?? ""} onChange={e => setEdicao(v => ({ ...v, [d.nome]: e.target.value }))}
                          className="w-full h-9 px-2 rounded-md border border-border bg-secondary/30 text-sm text-foreground">
                          <option value="">—</option>
                          {d.opcoes.map(o => <option key={o} value={o}>{opcao(o)}</option>)}
                        </select>
                      ) : (
                        <input value={edicao[d.nome] ?? ""} inputMode={d.numero ? "decimal" : "text"} onChange={e => setEdicao(v => ({ ...v, [d.nome]: e.target.value }))}
                          className="w-full h-9 px-3 rounded-md border border-border bg-secondary/30 text-sm text-foreground" />
                      )}
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Conversa */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Conversa</CardTitle>
              <p className="text-xs text-muted-foreground">Qualificação: {lead.modoQualificacao === "bot" ? "roteiro de perguntas (IA caiu)" : "IA"} · {lead.perguntasIa} pergunta(s)</p>
            </CardHeader>
            <CardContent>
              {lead.mensagens.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma mensagem registrada pelo CRM ainda.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {lead.mensagens.map((m: any) => (
                    <div key={m.id} className={`flex ${m.direcao === "in" ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-line ${m.direcao === "in" ? "bg-secondary/60 text-foreground" : "bg-emerald-600/20 text-emerald-50"}`}>
                        {m.texto}
                        <p className="text-[10px] opacity-60 mt-1 text-right">{m.autor === "lead" ? "" : `${m.autor} · `}{new Date(m.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Linha do tempo */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-base">Linha do tempo</CardTitle></CardHeader>
            <CardContent>
              {lead.eventos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem eventos de navegação (a pessoa não visitou a página do imóvel ou não aceitou os cookies).</p>
              ) : (
                <ul className="space-y-1.5">
                  {lead.eventos.map((e: any) => (
                    <li key={e.id} className="flex justify-between gap-3 text-sm">
                      <span className="text-foreground">{ROTULO_EVENTO[e.tipo] || e.tipo}{e.tipo === "tempo_pagina" && e.dados?.segundos ? ` (${e.dados.segundos}s)` : ""}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{new Date(e.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-muted-foreground mt-3">Mensagens que você manda direto pelo celular não aparecem aqui.</p>
            </CardContent>
          </Card>
        </div>

        {/* Coluna lateral */}
        <div className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-base">Por que essa nota?</CardTitle></CardHeader>
            <CardContent><ScorePainel leadId={id} /></CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-base">Origem</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">1º contato:</span> {lead.origem.canal}{lead.origem.campanha ? ` · #${lead.origem.campanha.codigo}` : ""}</p>
              <p><span className="text-muted-foreground">Último:</span> {lead.ultimo.canal}{lead.ultimo.campanha ? ` · #${lead.ultimo.campanha.codigo}` : ""}</p>
              {lead.origemWeb && <p><span className="text-muted-foreground">De onde veio:</span> {lead.origemWeb.linha}</p>}
              {lead.origemWeb?.utm && <p className="text-xs text-muted-foreground">UTM: {lead.origemWeb.utm}</p>}
              {lead.cliqueAnuncio && <p className="text-xs text-muted-foreground">Clique de anúncio registrado: {lead.cliqueAnuncio}</p>}
              {lead.campanhaTexto && <p className="text-xs text-muted-foreground">Campanha: {lead.campanhaTexto}</p>}
              {lead.consentimento && <p className="text-xs text-muted-foreground">Consentimento LGPD: {new Date((lead.consentimento as any).at).toLocaleString("pt-BR")}</p>}
            </CardContent>
          </Card>

          <VisitasLead leadId={id} imoveis={lead.imoveis as any} onMudou={atualizar} />
          <ReunioesLead leadId={id} />

          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-base">Follow-up automático</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">Mensagens enviadas:</span> {lead.followUp.passo} de 5</p>
              <p>
                <span className="text-muted-foreground">Próxima:</span>{" "}
                {lead.followUp.proximoEm
                  ? new Date(lead.followUp.proximoEm).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                  : "nenhuma programada"}
                {lead.followUp.tentativas > 0 && ` (nova tentativa ${lead.followUp.tentativas + 1} de 3)`}
              </p>
              {lead.followUp.erro && <p className="text-xs text-red-300">⚠️ {lead.followUp.erro}</p>}
            </CardContent>
          </Card>

          {lead.imoveis.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2"><CardTitle className="text-base">Imóveis de interesse</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {lead.imoveis.map((i: any) => (
                  <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate"><span className="font-mono text-xs text-emerald-300 mr-1">{i.codigo}</span>{i.titulo}</span>
                    {i.link && <a href={i.link} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-4 w-4" /></a>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {lead.tags.length > 0 && (
            <Card className="bg-card border-border">
              <CardContent className="py-3 flex flex-wrap gap-1">
                {lead.tags.map(t => <span key={t} className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-300">{t}</span>)}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {perder && <MotivoPerda onCancelar={() => setPerder(false)} onConfirmar={m => { mover.mutate({ id, etapa: "perdido", motivoPerda: m }); setPerder(false); }} />}
    </div>
  );
}
