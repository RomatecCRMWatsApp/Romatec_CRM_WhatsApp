import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, FileDown, Loader2, MessageCircle, RefreshCw, Send, Trash2, UserPlus, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import ConfirmarExclusao from "@/components/sistema/ConfirmarExclusao";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { maskPhone } from "@shared/masks";
import { ROTULO_ESTADO_CIVIL, ROTULO_REGIME } from "@shared/cadastro";
import { ROTULO_PERFIL_RECRUTAMENTO, STATUS_RECRUTAMENTO } from "@shared/recrutamento";

const campo = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";
const COR: Record<string, string> = {
  convidado: "bg-sky-500/15 text-sky-300", preenchido: "bg-amber-500/15 text-amber-300", aprovado: "bg-emerald-500/15 text-emerald-300",
  recusado: "bg-red-500/15 text-red-300", cancelado: "bg-secondary text-muted-foreground",
};
const data = (d: unknown) => (d ? new Date(d as any).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "");
const copiar = async (t: string, o = "Copiado") => { try { await navigator.clipboard.writeText(t); toast.success(o); } catch { window.prompt("Copie:", t); } };

type Acesso = { enviado: boolean; login: string; senha: string; texto: string } | null;

/** Resultado do acesso criado: sem WhatsApp do sistema, mostra login e senha para repassar */
function ResultadoAcesso({ r, onFechar }: { r: Acesso; onFechar: () => void }) {
  if (!r) return null;
  return (
    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm space-y-2">
      <p className="font-semibold text-emerald-300">{r.enviado ? "✅ Acesso criado e enviado pelo WhatsApp." : "✅ Acesso criado — o WhatsApp do sistema não enviou: repasse a mensagem abaixo."}</p>
      <p>Login: <b>{r.login}</b> · Senha provisória: <b className="font-mono">{r.senha}</b></p>
      {!r.enviado && <pre className="whitespace-pre-wrap rounded bg-background/60 p-2 text-xs">{r.texto}</pre>}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => copiar(r.texto, "Mensagem copiada")}><Copy className="mr-1 h-4 w-4" /> Copiar mensagem</Button>
        <Button size="sm" variant="ghost" onClick={onFechar}>Fechar</Button>
      </div>
    </div>
  );
}

function NovoConvite({ emps, onCriado }: { emps: { slug: string; nome: string }[]; onCriado: () => void }) {
  const [perfil, setPerfil] = useState<"corretor" | "secretario">("corretor");
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const [emp, setEmp] = useState("");
  useEffect(() => { if (!emp && emps.length === 1) setEmp(emps[0].slug); }, [emps, emp]);
  const criar = trpc.recrutamento.criarConvite.useMutation({
    onSuccess: r => {
      if (r.reaproveitado) toast.info("Já havia convite para este WhatsApp: ele foi atualizado (sem duplicar)");
      if (r.enviado) toast.success("Convite enviado pelo WhatsApp (texto + formulário em PDF e DOC)");
      else { copiar(r.texto || r.link, "WhatsApp do sistema indisponível: mensagem copiada para você enviar"); }
      setNome(""); setTel(""); onCriado();
    },
    onError: e => toast.error(e.message),
  });
  const ok = nome.trim().length >= 3 && tel.replace(/\D/g, "").length >= 10;
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><UserPlus className="h-4 w-4 text-primary" /> Convidar corretor(a) ou secretária</h2>
      <div className="grid gap-2 md:grid-cols-4">
        <label className="text-xs text-muted-foreground">Perfil
          <select className={campo} value={perfil} onChange={e => setPerfil(e.target.value as any)}><option value="corretor">Corretor(a)</option><option value="secretario">Secretária(o)</option></select>
        </label>
        <label className="text-xs text-muted-foreground md:col-span-2">Nome<input className={campo} value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do candidato" /></label>
        <label className="text-xs text-muted-foreground">WhatsApp<input className={campo} value={tel} onChange={e => setTel(maskPhone(e.target.value))} inputMode="tel" placeholder="(99) 9 9999-9999" /></label>
        <label className="text-xs text-muted-foreground md:col-span-2">Empreendimento da convocação
          <select className={campo} value={emp} onChange={e => setEmp(e.target.value)}>
            <option value="">— nenhum em especial —</option>{emps.map(x => <option key={x.slug} value={x.slug}>{x.nome}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!ok || criar.isPending} onClick={() => criar.mutate({ perfil, nome, telefone: tel, empreendimentoSlug: emp || null, enviar: true })}>
          {criar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Criar e enviar pelo WhatsApp
        </Button>
        <Button variant="outline" disabled={!ok || criar.isPending} onClick={() => criar.mutate({ perfil, nome, telefone: tel, empreendimentoSlug: emp || null, enviar: false })}>Só gerar o link</Button>
        <a className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-secondary/40" href={`/api/recrutamento/modelo.pdf?perfil=${perfil}${emp ? `&emp=${emp}` : ""}`}><FileDown className="h-4 w-4" /> Formulário PDF</a>
        <a className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm hover:bg-secondary/40" href={`/api/recrutamento/modelo.docx?perfil=${perfil}${emp ? `&emp=${emp}` : ""}`}><FileDown className="h-4 w-4" /> Formulário DOC</a>
      </div>
      <p className="text-[11px] text-muted-foreground">O candidato recebe o texto com o link do formulário e os arquivos em PDF e DOC. Ele preenche, anexa o CRECI, a certidão, o documento com foto e a selfie. Você confere aqui e aprova: o sistema cria o login e manda a senha provisória pelo WhatsApp.</p>
    </section>
  );
}

function AcessoEmpreendedor({ emps, onCriado }: { emps: { slug: string; nome: string }[]; onCriado: (r: Acesso) => void }) {
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");
  const { data: prop, error } = trpc.recrutamento.proprietario.useQuery({ slug }, { enabled: !!slug, retry: false });
  useEffect(() => { if (prop) { setEmail(prop.email); setTel(prop.telefone ? maskPhone(prop.telefone) : ""); } }, [prop]);
  const criar = trpc.recrutamento.criarEmpreendedor.useMutation({ onSuccess: r => { onCriado(r); setSlug(""); }, onError: e => toast.error(e.message) });
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Acesso do empreendedor</h2>
      <p className="text-xs text-muted-foreground">Sem formulário: nome e CPF vêm do proprietário cadastrado no empreendimento. Confira o e-mail e o WhatsApp.</p>
      <div className="grid gap-2 md:grid-cols-3">
        <label className="text-xs text-muted-foreground">Empreendimento
          <select className={campo} value={slug} onChange={e => setSlug(e.target.value)}><option value="">— escolha —</option>{emps.map(x => <option key={x.slug} value={x.slug}>{x.nome}</option>)}</select>
        </label>
        <label className="text-xs text-muted-foreground">E-mail<input className={campo} value={email} onChange={e => setEmail(e.target.value)} type="email" /></label>
        <label className="text-xs text-muted-foreground">WhatsApp<input className={campo} value={tel} onChange={e => setTel(maskPhone(e.target.value))} inputMode="tel" /></label>
      </div>
      {error && <p className="text-xs text-red-400">{error.message}</p>}
      {prop && <p className="text-xs">Proprietário: <b>{prop.nome || "— sem dados no empreendimento —"}</b>{prop.cpf ? ` · CPF ${prop.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}` : ""}</p>}
      <Button disabled={!slug || !prop?.nome || !email || criar.isPending} onClick={() => criar.mutate({ slug, email, telefone: tel })}>
        {criar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Criar acesso e enviar
      </Button>
    </section>
  );
}

const linha = (r: string, v: unknown) => (v ? <p><span className="text-muted-foreground">{r}:</span> {String(v)}</p> : null);

/** Conferência do formulário: dados, documentos e as decisões */
function Conferir({ id, onFechar, onAcesso }: { id: number; onFechar: () => void; onAcesso: (r: Acesso) => void }) {
  const utils = trpc.useUtils();
  const { data: r, isLoading } = trpc.recrutamento.detalhe.useQuery({ id });
  const aprovar = trpc.recrutamento.aprovar.useMutation({
    onSuccess: x => { onAcesso(x); if (x.avisos?.length) toast.warning(`Documentos não copiados: ${x.avisos.join("; ")}`); utils.recrutamento.listar.invalidate(); onFechar(); },
    onError: e => toast.error(e.message),
  });
  const recusar = trpc.recrutamento.recusar.useMutation({ onSuccess: () => { toast.success("Recrutamento recusado"); utils.recrutamento.listar.invalidate(); onFechar(); }, onError: e => toast.error(e.message) });
  if (isLoading || !r) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const d = r.dados as Record<string, any>;
  const c = d.conjuge as Record<string, any> | null;
  return (
    <div className="space-y-3 rounded-xl border border-primary/40 bg-card p-4 text-sm">
      <div className="flex items-center gap-2"><b className="text-base">{r.nome}</b><span className="text-xs text-muted-foreground">{ROTULO_PERFIL_RECRUTAMENTO[r.perfil]}{r.empreendimento ? ` · ${r.empreendimento}` : ""}</span>
        <button className="ml-auto" onClick={onFechar} aria-label="Fechar"><X className="h-4 w-4" /></button></div>
      <div className="grid gap-x-6 gap-y-0.5 md:grid-cols-2">
        {linha("CPF", d.cpf)}{linha("RG", [d.rg, d.rgOrgao].filter(Boolean).join(" "))}{linha("Profissão", d.profissao)}
        {linha("Estado civil", ROTULO_ESTADO_CIVIL[d.estadoCivil as keyof typeof ROTULO_ESTADO_CIVIL])}{linha("E-mail", d.email)}{linha("WhatsApp", d.telefone)}
        {linha("CRECI", d.creci ? `${d.creci}/${d.creciUf ?? ""}` : "")}{linha("Instagram", d.instagram)}
        {linha("Endereço", [d.enderecoLogradouro, d.enderecoNumero, d.enderecoComplemento, d.enderecoBairro, d.enderecoCidade && `${d.enderecoCidade}/${d.enderecoUf}`, d.enderecoCep].filter(Boolean).join(", "))}
      </div>
      {c && <div className="rounded-md bg-secondary/30 p-2"><p className="text-xs font-semibold">Cônjuge</p>{linha("Nome", c.nome)}{linha("CPF", c.cpf)}{linha("Regime", ROTULO_REGIME[c.regimeBens as keyof typeof ROTULO_REGIME])}</div>}
      <div>
        <p className="text-xs font-semibold">Documentos</p>
        {r.exigidos.map(x => {
          const doc = r.docs.find((y: any) => y.tipo === x.tipo);
          return <p key={x.tipo} className="text-xs">{doc ? <a className="text-primary hover:underline" href={`/api/recrutamento/docs/${doc.id}`} target="_blank" rel="noreferrer">✅ {x.rotulo}</a> : <span className={x.obrigatorio ? "text-red-300" : "text-muted-foreground"}>{x.obrigatorio ? "❌" : "—"} {x.rotulo}</span>}{doc?.validade ? ` (válida até ${doc.validade.split("-").reverse().join("/")})` : ""}</p>;
        })}
      </div>
      {r.status === "preenchido" && (
        <div className="flex flex-wrap gap-2">
          <Button disabled={aprovar.isPending} onClick={() => { if (confirm(`Aprovar ${r.nome} e criar o acesso com senha provisória?`)) aprovar.mutate({ id }); }} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {aprovar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Aprovar e criar acesso
          </Button>
          <Button variant="outline" className="text-red-300" disabled={recusar.isPending} onClick={() => { const m = prompt("Motivo da recusa (opcional):"); if (m !== null) recusar.mutate({ id, motivo: m }); }}>Recusar</Button>
        </div>
      )}
    </div>
  );
}

/** Recrutamento de corretores, secretárias e empreendedores — administrador e secretária */
export default function Recrutamento() {
  const utils = trpc.useUtils();
  const { data: lista, isLoading } = trpc.recrutamento.listar.useQuery();
  const { data: emps } = trpc.recrutamento.empreendimentos.useQuery();
  const [aberto, setAberto] = useState<number | null>(null);
  const [acesso, setAcesso] = useState<Acesso>(null);
  const atualizar = () => utils.recrutamento.listar.invalidate();
  const reenviar = trpc.recrutamento.enviarConvite.useMutation({
    onSuccess: r => { if (r.enviado) toast.success("Convite reenviado"); else copiar(r.texto, "WhatsApp do sistema indisponível: mensagem copiada"); atualizar(); },
    onError: e => toast.error(e.message),
  });
  const novaSenha = trpc.recrutamento.reenviarAcesso.useMutation({ onSuccess: r => setAcesso(r), onError: e => toast.error(e.message) });
  const cancelar = trpc.recrutamento.recusar.useMutation({ onSuccess: atualizar, onError: e => toast.error(e.message) });
  // Cancelado sai da lista (filtro "Cancelados" para ver); excluir definitivo é só do administrador, com senha
  const { user } = useAuth();
  const admin = (user as any)?.role === "admin";
  const [verCancelados, setVerCancelados] = useState(false);
  const [excluindo, setExcluindo] = useState<{ id: number; nome: string } | null>(null);
  const excluir = trpc.exclusao.convite.useMutation({
    onSuccess: () => { toast.success("Convite excluído"); setExcluindo(null); atualizar(); },
    onError: e => toast.error(e.message),
  });
  const cancelados = (lista ?? []).filter(r => r.status === "cancelado");
  const visiveis = (lista ?? []).filter(r => (r.status === "cancelado") === verCancelados);
  return (
    <div>
      <PageHeader icone={UserPlus} titulo="Recrutamento" subtitulo="Convide corretores, secretárias e empreendedores para o Romatec CRM" />
      <div className="mx-auto max-w-[1200px] space-y-4 px-4 pb-8 md:px-6">
        <ResultadoAcesso r={acesso} onFechar={() => setAcesso(null)} />
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <NovoConvite emps={emps ?? []} onCriado={atualizar} />
          <AcessoEmpreendedor emps={emps ?? []} onCriado={r => { setAcesso(r); atualizar(); }} />
        </div>
        {aberto && <Conferir id={aberto} onFechar={() => setAberto(null)} onAcesso={setAcesso} />}
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        <ConfirmarExclusao pendente={excluir.isPending} onFechar={() => setExcluindo(null)} onConfirmar={senha => excluindo && excluir.mutate({ id: excluindo.id, senha })}
          alvo={excluindo && { titulo: "Excluir convite", descricao: <>O convite de <b>{excluindo.nome}</b> some da lista de vez, com o que já foi preenchido e os anexos. O link deixa de funcionar.</> }} />
        {(cancelados.length > 0 || verCancelados) && (
          <div className="flex justify-end">
            <Button size="sm" variant={verCancelados ? "default" : "outline"} className="h-7 text-xs" onClick={() => setVerCancelados(v => !v)}>
              {verCancelados ? "Voltar aos convites" : `Cancelados (${cancelados.length})`}
            </Button>
          </div>
        )}
        {lista && !visiveis.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{verCancelados ? "Nenhum convite cancelado." : "Nenhum recrutamento ainda."}</p>}
        <div className="space-y-2">
          {visiveis.map(r => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b>{r.nome}</b>
                <span className="text-xs text-muted-foreground">{ROTULO_PERFIL_RECRUTAMENTO[r.perfil]} · {maskPhone(r.telefone)}{r.empreendimentoSlug ? ` · ${emps?.find(e => e.slug === r.empreendimentoSlug)?.nome ?? r.empreendimentoSlug}` : ""}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${COR[r.status] ?? ""}`}>{STATUS_RECRUTAMENTO[r.status] ?? r.status}</span>
                {r.duplicado && r.status !== "aprovado" && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300" title="Há outro convite com o mesmo WhatsApp">duplicado</span>}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {r.preenchidoEm ? `formulário em ${data(r.preenchidoEm)}` : r.enviadoEm ? `enviado em ${data(r.enviadoEm)}` : `criado em ${data(r.createdAt)}`}
                </span>
              </div>
              {r.status === "convidado" || r.status === "preenchido" ? (
                <p className="mt-1 text-xs text-muted-foreground">{r.docs} documento(s){r.faltam.length ? ` · faltam: ${r.faltam.join(", ")}` : " · documentos obrigatórios completos"}{r.linkVencido ? " · link vencido (reenvie)" : ""}</p>
              ) : r.motivo ? <p className="mt-1 text-xs text-muted-foreground">Motivo: {r.motivo}</p> : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.status === "preenchido" && <Button size="sm" className="h-7 text-xs" onClick={() => setAberto(r.id)}>Conferir e aprovar</Button>}
                {(r.status === "convidado" || r.status === "preenchido") && (
                  <>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copiar(r.link, "Link copiado")}><Copy className="mr-1 h-3.5 w-3.5" /> Link</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={reenviar.isPending} onClick={() => reenviar.mutate({ id: r.id })}><MessageCircle className="mr-1 h-3.5 w-3.5" /> Reenviar convite</Button>
                    {r.status === "convidado" && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAberto(r.id)}>Ver o que já preencheu</Button>}
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-red-300" onClick={() => { if (confirm("Cancelar este convite? O link deixa de funcionar.")) cancelar.mutate({ id: r.id, motivo: "", cancelar: true }); }}>Cancelar</Button>
                  </>
                )}
                {r.status === "aprovado" && r.usuarioId && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={novaSenha.isPending} onClick={() => { if (confirm("Gerar uma nova senha provisória e enviar pelo WhatsApp? A senha atual deixa de valer.")) novaSenha.mutate({ usuarioId: r.usuarioId! }); }}>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Reenviar acesso (nova senha)
                  </Button>
                )}
                {admin && r.status !== "aprovado" && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-red-300" onClick={() => setExcluindo({ id: r.id, nome: r.nome })}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
