import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, BookOpen, CheckCircle2, FileKey2, FileText, Gavel, Loader2, LogOut, MessageSquarePlus, PenTool, Receipt } from "lucide-react";
import { CertificadoDigital, DocumentosJuridicos } from "@/components/juridico/CertificadoDigital";
import { PainelInadimplencia } from "@/components/juridico/Inadimplencia";
import { BibliotecaLegislacao } from "@/components/juridico/Legislacao";
import { AvisoValidacao } from "@/components/juridico/AvisoValidacao";
import type { TemaLegislacao } from "@shared/legislacao";
import { perfilDe } from "@shared/equipe";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { FotoUsuario } from "@/components/AppShell";
import { SinoNovidades } from "@/components/sistema/Novidades";
import { RomatecAppIcon } from "@/brand";
import { AcoesPdf } from "@/components/sistema/AcoesPdf";
import { OURO_JURIDICO, SeloJuridico } from "@/components/juridico/SeloJuridico";

const brl = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const dataBr = (d: string | null | undefined) => (d ? new Date(d.length <= 10 ? `${d}T12:00:00` : d).toLocaleDateString("pt-BR") : "—");
const SECOES = [["inadimplencia", "Inadimplência", AlertTriangle], ["assinaturas", "Assinaturas", PenTool], ["documentos", "Documentos", FileText], ["legislacao", "Legislação", BookOpen], ["pontuacoes", "Pontuações jurídicas", MessageSquarePlus], ["contratos", "Contratos e aditivos", Gavel], ["financeiro", "Financeiro", Receipt], ["certificado", "Certificado", FileKey2]] as const;
/** Grupo de documento → tema da biblioteca de legislação */
const TEMA_DO_GRUPO: Record<string, TemaLegislacao> = { "Associação": "associacao", "Compra e venda": "contratos", "Pagamento": "inadimplencia" };
const TIPO: Record<string, string> = { alteracao: "Alteração", indagacao: "Indagação", observacao: "Observação" };
const STATUS: Record<string, [string, string]> = {
  aberto: ["Aberta", "bg-warn-500/15 text-warn-300"], respondido: ["Respondida", "bg-info-500/15 text-info-300"], resolvido: ["Resolvida", "bg-ok-500/15 text-ok-300"],
};
const STATUS_CONTRATO: Record<string, string> = {
  rascunho: "Rascunho", minuta: "Minuta", apto_assinatura: "Apto para assinatura", em_assinatura: "Em assinatura", assinado: "Assinado",
  ativo: "Ativo", quitado: "Quitado", cancelado: "Cancelado", distratado: "Distratado",
};

function Titulo({ id, icone: Icone, children, sub }: { id: string; icone: React.ComponentType<{ className?: string }>; children: React.ReactNode; sub?: string }) {
  return (
    <div id={`aba-${id}`} className="pt-2">
      <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--rt-gold-light)] [font-family:var(--rt-font-title)] sm:text-lg"><Icone className="h-5 w-5 shrink-0" />{children}</h2>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Formulário de nova pontuação sobre um documento */
function NovaPontuacao({ slug, documentos, inicial, onFeito }: { slug: string; documentos: { chave: string; rotulo: string }[]; inicial?: string; onFeito: () => void }) {
  const [doc, setDoc] = useState(inicial ?? documentos[0]?.chave ?? "geral");
  const [tipo, setTipo] = useState<"alteracao" | "indagacao" | "observacao">("alteracao");
  const [trecho, setTrecho] = useState("");
  const [texto, setTexto] = useState("");
  const m = trpc.juridico.pontuar.useMutation({
    onSuccess: () => { toast.success("Pontuação registrada — o escritório foi avisado"); setTexto(""); setTrecho(""); onFeito(); },
    onError: e => toast.error(e.message),
  });
  const opcoes = [...documentos, { chave: "geral", rotulo: "Assunto geral do empreendimento" }];
  const campo = "mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground";
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
      <div className="grid gap-2 md:grid-cols-4">
        <label className="text-xs text-muted-foreground md:col-span-2">Documento
          <select className={campo} value={doc} onChange={e => setDoc(e.target.value)}>{opcoes.map(o => <option key={o.chave} value={o.chave}>{o.rotulo}</option>)}</select>
        </label>
        <label className="text-xs text-muted-foreground">Tipo
          <select className={campo} value={tipo} onChange={e => setTipo(e.target.value as any)}><option value="alteracao">Alteração necessária</option><option value="indagacao">Indagação jurídica</option><option value="observacao">Observação</option></select>
        </label>
        <label className="text-xs text-muted-foreground">Cláusula / artigo / página
          <input className={campo} value={trecho} onChange={e => setTrecho(e.target.value)} placeholder="Ex.: Cláusula 9ª, item 9.2" autoComplete="off" name="jur-trecho" />
        </label>
      </div>
      <label className="block text-xs text-muted-foreground">Pontuação
        <textarea className="mt-1 min-h-[110px] w-full rounded-md border border-border bg-background p-2 text-sm text-foreground" value={texto} onChange={e => setTexto(e.target.value)}
          placeholder="Descreva a alteração proposta (com a redação sugerida) ou a indagação jurídica, com o fundamento legal." />
      </label>
      <Button disabled={texto.trim().length < 5 || m.isPending} onClick={() => m.mutate({ slug, documento: doc, documentoRotulo: opcoes.find(o => o.chave === doc)?.rotulo ?? doc, trecho: trecho || null, tipo, texto })}>
        {m.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MessageSquarePlus className="mr-1 h-4 w-4" />} Registrar pontuação
      </Button>
    </div>
  );
}

/** Uma pontuação: texto, autor, resposta do escritório e as ações */
function CartaoPontuacao({ p, admin, onFeito }: { p: any; admin: boolean; onFeito: () => void }) {
  const [resposta, setResposta] = useState("");
  const r = trpc.juridico.responder.useMutation({ onSuccess: () => { toast.success("Atualizado"); setResposta(""); onFeito(); }, onError: e => toast.error(e.message) });
  const [rot, cor] = STATUS[p.status] ?? [p.status, ""];
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${cor}`}>{rot}</span>
        <b>{TIPO[p.tipo] ?? p.tipo}</b>
        <span className="text-xs text-muted-foreground">{p.documentoRotulo}{p.trecho ? ` · ${p.trecho}` : ""}</span>
        <span className="ml-auto text-xs text-muted-foreground">{p.autor} · {dataBr(p.criadoEm)}</span>
      </div>
      <p className="whitespace-pre-wrap">{p.texto}</p>
      {p.resposta && (
        <div className="rounded-lg border border-[var(--rt-gold)]/30 bg-background/40 p-2 text-xs">
          <p className="mb-1 text-muted-foreground">Resposta do escritório — {p.respondidoPor} · {dataBr(p.respondidoEm)}</p>
          <p className="whitespace-pre-wrap text-sm">{p.resposta}</p>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {admin && p.status !== "resolvido" && (
          <>
            <textarea className="min-h-[60px] flex-1 rounded-md border border-border bg-background p-2 text-sm" value={resposta} onChange={e => setResposta(e.target.value)} placeholder="Resposta do escritório (ex.: alteração aceita na versão v1.6 do estatuto)" />
            <Button size="sm" disabled={resposta.trim().length < 2 || r.isPending} onClick={() => r.mutate({ id: p.id, resposta, status: "respondido" })}>Responder</Button>
          </>
        )}
        {p.status !== "resolvido" && <Button size="sm" variant="outline" disabled={r.isPending} onClick={() => r.mutate({ id: p.id, status: "resolvido" })}><CheckCircle2 className="mr-1 h-4 w-4" /> Marcar como resolvida</Button>}
        {p.status === "resolvido" && <Button size="sm" variant="ghost" disabled={r.isPending} onClick={() => r.mutate({ id: p.id, status: "aberto" })}>Reabrir</Button>}
      </div>
    </div>
  );
}

/**
 * Portal do corpo jurídico do empreendimento: documentos (estatuto, modelos de contrato) para leitura e pontuação,
 * contratos com vias assinadas e aditivos, financeiro e as pontuações jurídicas com a resposta do escritório.
 */
export default function Juridico() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const ehJuridico = perfilDe(user as any) === "juridico";
  const [slugAdmin, setSlugAdmin] = useState<string | undefined>(undefined);
  const entrada = ehJuridico ? undefined : slugAdmin ? { slug: slugAdmin } : undefined;
  const utils = trpc.useUtils();
  const { data: p, error } = trpc.juridico.painel.useQuery(entrada);
  const { data: cs = [] } = trpc.juridico.contratos.useQuery(entrada);
  const { data: fin } = trpc.juridico.financeiro.useQuery(entrada);
  const { data: pts = [] } = trpc.juridico.pontuacoes.useQuery(entrada);
  const [filtro, setFiltro] = useState<string>("abertas");
  const [docPontuar, setDocPontuar] = useState<string | undefined>(undefined);
  const [grupoDoc, setGrupoDoc] = useState<string>("todos");
  const [verAviso, setVerAviso] = useState(false);
  const [temaLeg, setTemaLeg] = useState<TemaLegislacao>("inadimplencia");
  const recarregar = () => { utils.juridico.pontuacoes.invalidate(); utils.juridico.painel.invalidate(); };
  // Abas independentes: cada botão do topo abre só a sua seção (lembrada no #endereço)
  const inicial = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
  const [aba, setAba] = useState<string>(SECOES.some(([id]) => id === inicial) ? inicial : "inadimplencia");
  const ir = (id: string) => { setAba(id); try { window.history.replaceState(null, "", `#${id}`); } catch { /* sem histórico */ } window.scrollTo({ top: 0, behavior: "smooth" }); };
  const slug = p?.empreendimento.slug ?? "bom-jardims";
  const verLegislacao = (t: TemaLegislacao) => { setTemaLeg(t); ir("legislacao"); };
  const gruposDoc = Array.from(new Set((p?.documentos ?? []).map(d => d.grupo)));
  const docsVisiveis = (p?.documentos ?? []).filter(d => grupoDoc === "todos" || d.grupo === grupoDoc);
  const lista = pts.filter(x => filtro === "todas" || (filtro === "abertas" ? x.status !== "resolvido" : x.status === "resolvido"));
  const porDoc = new Map<string, number>();
  for (const x of pts) if (x.status !== "resolvido") porDoc.set(x.documento, (porDoc.get(x.documento) ?? 0) + 1);

  return (
    <div className="min-h-screen bg-background">
      <AvisoValidacao usuarioId={ehJuridico ? Number((user as any)?.id) || null : null} />
      {verAviso && <AvisoValidacao forcar onFechar={() => setVerAviso(false)} />}
      <div className="sticky top-[env(safe-area-inset-top)] z-30 border-b border-[var(--rt-border)] bg-black">
        <div className="mx-auto flex max-w-[1500px] items-center gap-1 px-2 py-2 sm:gap-3 sm:px-4 md:px-6">
          {!ehJuridico && (
            <Button size="sm" variant="outline" className="shrink-0 border-white/30 text-white hover:bg-white/15" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Voltar ao&nbsp;</span>CRM
            </Button>
          )}
          <span className="hidden min-[400px]:inline-flex"><RomatecAppIcon size={34} /></span>
          <p className="min-w-0 flex-1 truncate text-sm text-white/80">
            Portal jurídico · <b className="text-white">{p?.empreendimento.nome ?? "…"}</b>{ehJuridico ? ` · ${String((user as any)?.name || "").split(" ")[0]}` : " (visão do escritório)"}
          </p>
          {p?.admin && p.empreendimentos.length > 1 && (
            <select className="h-8 rounded-md border border-white/30 bg-black px-2 text-xs text-white" value={slug} onChange={e => setSlugAdmin(e.target.value)} aria-label="Empreendimento">
              {p.empreendimentos.map(e => <option key={e.slug} value={e.slug}>{e.nome}</option>)}
            </select>
          )}
          <SinoNovidades className="text-white/80 hover:text-white" />
          <FotoUsuario />
          <Button size="sm" variant="ghost" className="px-2 text-white hover:bg-white/15 sm:px-3" title="Sair" onClick={() => logout()}><LogOut className="h-4 w-4" /></Button>
        </div>
        <div role="tablist" aria-label="Seções do portal jurídico" className="mx-auto flex max-w-[1500px] gap-1.5 overflow-x-auto px-3 pb-2 sm:px-4 md:px-6 [scrollbar-width:none]">
          {SECOES.map(([id, rotulo, Icone]) => (
            <button key={id} role="tab" aria-selected={aba === id} onClick={() => ir(id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F6D56B] ${aba === id
                ? "border-[#E8B931] bg-[#E8B931] text-[#1b1402] shadow-[0_0_12px_rgba(232,185,49,.35)]"
                : "border-border text-white/80 hover:border-[#E8B931]/60 hover:text-white"}`}>
              <Icone className="h-3.5 w-3.5" />{rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] space-y-4 px-3 pb-10 pt-3 sm:px-4 md:px-6 md:pt-4">
        {error && <p className="text-sm text-danger-400">{error.message}</p>}
        <section className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: `${OURO_JURIDICO.base}55`, background: "radial-gradient(ellipse at 0% 0%, #14361f 0%, var(--rt-surface) 60%)" }}>
          <div className="flex items-center gap-3 sm:gap-4">
            <SeloJuridico tamanho={72} className="h-16 w-16 shrink-0 sm:h-20 sm:w-20" />
            <div className="min-w-0 flex-1">
              <p className="text-xs italic sm:text-sm" style={{ color: OURO_JURIDICO.claro, fontFamily: "Georgia, serif" }}>Ética, segurança jurídica e transparência</p>
              <h1 className="mt-0.5 text-base font-semibold leading-tight sm:text-xl" style={{ color: OURO_JURIDICO.claro, fontFamily: "var(--rt-font-title)" }}>Corpo jurídico</h1>
              <p className="truncate text-sm text-[var(--rt-text)]">{p?.empreendimento.nome ?? "…"}</p>
            </div>
          </div>
          <p className="mt-3 text-justify text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Leia os documentos do empreendimento, registre as alterações necessárias e as indagações jurídicas; o escritório responde aqui mesmo.
          </p>
          {!!p?.advogados.length && (
            <p className="mt-1 text-xs text-muted-foreground">Advogados: {p.advogados.map(a => `${a.nome}${a.oab ? ` (${a.oab})` : ""}${a.ativo ? "" : " — bloqueado"}`).join("; ")}</p>
          )}
          {p && (
            <div className="mt-3 grid grid-cols-3 divide-x divide-[var(--rt-border)] rounded-xl border border-[var(--rt-border)] bg-black/30 text-center">
              {[["abertas", p.pontuacoes.abertas, "text-warn-300"], ["respondidas", p.pontuacoes.respondidas, "text-info-300"], ["resolvidas", p.pontuacoes.resolvidas, "text-ok-300"]].map(([r, v, c]) => (
                <div key={r as string} className="px-2 py-2"><p className={`text-xl font-bold tabular-nums ${c}`}>{v as number}</p><p className="text-[11px] text-muted-foreground">{r as string}</p></div>
              ))}
            </div>
          )}
        </section>

        {aba === "inadimplencia" && (<section aria-labelledby="aba-inadimplencia" className="space-y-3">
        <Titulo id="inadimplencia" icone={AlertTriangle} sub="Constituição em mora, cartório, resolução do contrato e retorno da chácara ao empreendimento (Lei n.º 6.766/1979, arts. 32 e 32-A).">Inadimplência — ato jurídico de consolidação do bem</Titulo>
        <PainelInadimplencia slug={ehJuridico ? undefined : slug} />
        <Button size="sm" variant="outline" onClick={() => verLegislacao("inadimplencia")}><BookOpen className="mr-1 h-4 w-4" /> Legislação da inadimplência e consolidação do bem</Button>
        </section>)}

        {aba === "assinaturas" && (<section aria-labelledby="aba-assinaturas" className="space-y-3">
        <Titulo id="assinaturas" icone={PenTool} sub="Notificações, requerimentos, atas, ofícios e alterações — assinados com certificado digital ICP-Brasil.">Documentos e assinaturas</Titulo>
        <Button size="sm" variant="outline" onClick={() => setVerAviso(true)}><CheckCircle2 className="mr-1 h-4 w-4" /> Como validar as assinaturas</Button>
        <DocumentosJuridicos slug={ehJuridico ? undefined : slug} podeEnviar admin={!ehJuridico && !!p?.admin} />
        </section>)}

        {aba === "documentos" && (<section aria-labelledby="aba-documentos" className="space-y-3">
        <Titulo id="documentos" icone={FileText} sub="Versões em vigor, geradas na hora com um cliente fictício. Alguns PDFs levam alguns segundos.">Documentos do empreendimento</Titulo>
        <div role="tablist" aria-label="Grupos de documentos" className="flex flex-wrap items-center gap-1.5">
          {["todos", ...gruposDoc].map(g => (
            <button key={g} type="button" role="tab" aria-selected={grupoDoc === g} onClick={() => setGrupoDoc(g)}
              className={`rounded-full border px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E8B931] ${grupoDoc === g ? "border-[#E8B931] bg-[#E8B931] font-semibold text-black" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {g === "todos" ? "Todos" : g}
            </button>
          ))}
          {TEMA_DO_GRUPO[grupoDoc] && (
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => verLegislacao(TEMA_DO_GRUPO[grupoDoc])}><BookOpen className="mr-1 h-4 w-4" /> Legislação de {grupoDoc.toLowerCase()}</Button>
          )}
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {docsVisiveis.map(d => (
            <div key={d.chave} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm">
              <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                <p className="font-medium">{d.rotulo}</p>
                <p className="text-xs text-muted-foreground">{d.grupo}{porDoc.get(d.chave) ? ` · ${porDoc.get(d.chave)} pontuação(ões) em aberto` : ""}</p>
              </div>
              <AcoesPdf compacto rotulo="PDF" url={d.url} nomeArquivo={`${d.chave.toUpperCase()}-${slug.toUpperCase()}.pdf`} mensagem={`${d.rotulo} — ${p?.empreendimento.nome ?? ""}`} />
              <Button size="sm" variant="outline" onClick={() => { setDocPontuar(d.chave); ir("pontuacoes"); }}><MessageSquarePlus className="mr-1 h-4 w-4" /> Pontuar</Button>
            </div>
          ))}
        </div>
        </section>)}

        {aba === "legislacao" && (<section aria-labelledby="aba-legislacao" className="space-y-3">
        <Titulo id="legislacao" icone={BookOpen} sub="Leis, jurisprudência e doutrina que regem o empreendimento, por tema — com o fundamento pronto para copiar na peça.">Legislação e fundamentos</Titulo>
        <BibliotecaLegislacao key={temaLeg} temaInicial={temaLeg} />
        </section>)}

        {aba === "pontuacoes" && (<section aria-labelledby="aba-pontuacoes" className="space-y-3">
        <Titulo id="pontuacoes" icone={MessageSquarePlus} sub="Alterações necessárias, indagações jurídicas e observações sobre cada documento.">Pontuações jurídicas</Titulo>
        {p && <NovaPontuacao key={docPontuar ?? "x"} slug={slug} documentos={p.documentos} inicial={docPontuar} onFeito={recarregar} />}
        <div className="flex gap-1.5">
          {[["abertas", "Em aberto"], ["resolvidas", "Resolvidas"], ["todas", "Todas"]].map(([k, r]) => (
            <button key={k} onClick={() => setFiltro(k)} className={`rounded-full border px-3 py-1 text-xs ${filtro === k ? "border-[var(--rt-gold)] text-[var(--rt-gold-light)]" : "border-border text-muted-foreground"}`}>{r}</button>
          ))}
        </div>
        <div className="space-y-2">
          {!lista.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhuma pontuação {filtro === "abertas" ? "em aberto" : filtro === "resolvidas" ? "resolvida" : "ainda"}.</p>}
          {lista.map(x => <CartaoPontuacao key={x.id} p={x} admin={!!p?.admin} onFeito={recarregar} />)}
        </div>
        </section>)}

        {aba === "contratos" && (<section aria-labelledby="aba-contratos" className="space-y-3">
        <Titulo id="contratos" icone={Gavel} sub="Contratos do empreendimento, com o PDF atual, a via assinada (com o manifesto) e os termos aditivos.">Contratos e aditivos</Titulo>
        <div className="space-y-2">
          {!cs.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum contrato ainda.</p>}
          {cs.map(c => (
            <div key={c.id} className="space-y-1.5 rounded-xl border border-border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b>{c.numero}</b>
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px]">{STATUS_CONTRATO[c.status] ?? c.status}</span>
                <span className="text-muted-foreground">Chácara {c.lote} · {c.comprador}</span>
                <div className="ml-auto flex flex-wrap gap-1.5">
                  {c.viaAssinada && <AcoesPdf compacto rotulo="Via assinada" url={c.viaAssinada} nomeArquivo={`CONTRATO-${c.numero}-VIA-ASSINADA.pdf`} mensagem={`Contrato ${c.numero} — via assinada`} />}
                  {!c.viaAssinada && c.pdfAtual && <AcoesPdf compacto rotulo="PDF atual" url={c.pdfAtual} nomeArquivo={`CONTRATO-${c.numero}.pdf`} mensagem={`Contrato ${c.numero}`} />}
                  <Button size="sm" variant="outline" onClick={() => { setDocPontuar(undefined); ir("pontuacoes"); }}>Pontuar</Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Plano: <b className="text-foreground">{c.plano}</b></p>
              {c.observacoes.map((o: string) => <p key={o} className="text-xs text-warn-200">• {o}</p>)}
              {!!c.aditivos.length && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                  <span className="text-muted-foreground">Aditivos:</span>
                  {c.aditivos.map((a: any) => (
                    <AcoesPdf key={a.id} compacto rotulo={`n.º ${a.numero} — ${a.titulo}${a.status === "assinado" ? "" : ` (${a.status})`}`} url={a.url} nomeArquivo={`ADITIVO-${a.numero}-${c.numero}.pdf`} mensagem={`Termo Aditivo n.º ${a.numero} — contrato ${c.numero}`} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        </section>)}

        {aba === "financeiro" && (<section aria-labelledby="aba-financeiro" className="space-y-3">
        <Titulo id="financeiro" icone={Receipt} sub="Contratado, recebido, em aberto e vencido por contrato — base para o acompanhamento e o percentual do escritório.">Financeiro do empreendimento</Titulo>
        {fin?.totais ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[["Contratos", String(fin.totais.contratos), ""], ["Contratado", brl(fin.totais.contratado), "text-[var(--rt-gold-light)]"], ["Recebido", brl(fin.totais.recebido), "text-ok-300"],
                ["Em aberto", brl(fin.totais.emAberto), ""], ["Vencido", brl(fin.totais.vencido), "text-danger-300"]].map(([t, v, c]) => (
                <div key={t} className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{t}</p><p className={`mt-1 text-xl font-bold ${c}`}>{v}</p></div>
              ))}
            </div>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                  {["Contrato", "Chácara", "Comprador", "Contratado", "Recebido", "Vencido", "Pago", "Próximo vencimento"].map(h => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                </tr></thead>
                <tbody>
                  {fin.contratos.map((c: any) => (
                    <tr key={c.contratoId} className="border-b border-border/50">
                      <td className="px-3 py-2">{c.numero}</td><td className="px-3 py-2">{c.lote}</td><td className="px-3 py-2">{c.comprador}</td>
                      <td className="px-3 py-2 tabular-nums">{brl(c.contratado)}</td><td className="px-3 py-2 tabular-nums text-ok-300">{brl(c.recebido)}</td>
                      <td className="px-3 py-2 tabular-nums">{brl(c.vencido)}</td><td className="px-3 py-2">{c.pctPago != null ? `${Math.round(c.pctPago)}%` : "—"}</td>
                      <td className="px-3 py-2">{dataBr(c.proximoVencimento)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="text-sm text-muted-foreground">Sem contratos com financeiro ainda.</p>}
        </section>)}

        {aba === "certificado" && (<section aria-labelledby="aba-certificado" className="space-y-3">
        <Titulo id="certificado" icone={FileKey2} sub="O seu certificado para assinar os documentos do portal.">Meu certificado digital</Titulo>
        <CertificadoDigital />
        </section>)}

      </div>
    </div>
  );
}
