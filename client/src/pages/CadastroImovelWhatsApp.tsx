import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2, MessageCircle, ShieldCheck, Smartphone, Star, Trash2, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { CAMPOS, ROTULO_TIPO, TIPOS_IMOVEL, formatarCampo, type DadosImovel } from "@shared/cadastroImovelAgente";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ESTADO: Record<string, string> = {
  collecting: "Coletando", processing: "Processando", awaiting_information: "Falta informação", awaiting_review: "Aguardando confirmação",
  saving: "Gravando", saved: "Cadastrado", failed: "Falhou (tente de novo)", cancelled: "Cancelado", expired: "Expirado",
};
const sel = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

const avisoExcluir = (id: number, propertyId: number | null) => propertyId
  ? `Excluir o rascunho nº ${id} desta lista? O imóvel já cadastrado continua em Imóveis (para apagá-lo, exclua lá).`
  : `Excluir o rascunho nº ${id} e as fotos dele? Nada foi gravado em Imóveis.`;

/** Imóveis › Cadastro pelo WhatsApp (Agente de Cadastro de Imóveis): vínculo, rascunhos, revisão e confirmação */
export default function CadastroImovelWhatsApp() {
  const [, p] = useRoute("/imoveis/whatsapp/:id");
  const id = p?.id ? Number(p.id) : null;
  return (
    <div>
      <PageHeader icone={Smartphone} titulo="Cadastro de imóveis pelo WhatsApp" subtitulo="Mande áudio, texto e fotos para o WhatsApp da Romatec: a IA organiza, você confere e confirma. O imóvel entra interno (não é publicado)." />
      <div className="mx-auto max-w-[1200px] space-y-4 px-4 pb-10 md:px-6">
        {id ? <Rascunho id={id} /> : <><Vinculo /><ListaRascunhos /><PainelAdmin /></>}
      </div>
    </div>
  );
}

function Vinculo() {
  const utils = trpc.useUtils();
  const { data: s, isLoading } = trpc.agenteImovel.status.useQuery();
  const [codigo, setCodigo] = useState<{ mensagem: string; numero: string; expira: string } | null>(null);
  const gerar = trpc.agenteImovel.gerarCodigo.useMutation({ onSuccess: r => setCodigo(r), onError: e => toast.error(e.message) });
  const autorizar = trpc.agenteImovel.autorizar.useMutation({ onSuccess: () => { toast.success("WhatsApp autorizado"); utils.agenteImovel.status.invalidate(); }, onError: e => toast.error(e.message) });
  const revogar = trpc.agenteImovel.revogar.useMutation({ onSuccess: () => { toast.success("Autorização revogada"); utils.agenteImovel.status.invalidate(); } });
  useEffect(() => { if (!codigo) return; const t = setInterval(() => utils.agenteImovel.status.invalidate(), 5000); return () => clearInterval(t); }, [codigo, utils]);
  useEffect(() => { if (s?.vinculado && codigo) setCodigo(null); }, [s?.vinculado]); // eslint-disable-line react-hooks/exhaustive-deps
  if (isLoading || !s) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  const wa = codigo ? `https://wa.me/${codigo.numero}?text=${encodeURIComponent(codigo.mensagem)}` : "";
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className={`h-5 w-5 ${s.autorizado ? "text-ok-400" : "text-warn-400"}`} />
        <h2 className="text-base font-semibold">Meu WhatsApp</h2>
        <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${s.autorizado ? "bg-ok-600/30 text-ok-200" : "bg-warn-600/30 text-warn-200"}`}>
          {s.autorizado ? (s.prazo ? `AUTORIZADO · acompanha o plano até ${new Date(s.prazo).toLocaleDateString("pt-BR")}${s.diasRestantes != null ? ` (${s.diasRestantes} dia(s))` : ""}` : "AUTORIZADO · sem prazo") : s.vinculado ? `VINCULADO · ${s.motivo}` : "NÃO VINCULADO"}
        </span>
      </div>
      {!s.iaDisponivel && <p className="rounded-md bg-warn-500/10 p-2 text-xs text-warn-200">A IA não está configurada no servidor (ANTHROPIC_API_KEY ou OPENAI_API_KEY): o agente recebe as mensagens, mas a organização automática fica indisponível.</p>}
      {!s.vinculado && (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">1. Toque em “Vincular meu WhatsApp”. 2. Mande o código, <b>do WhatsApp do seu cadastro</b>, para o WhatsApp da Romatec ({s.numeroCentral}). Só o seu número consegue usar o código.</p>
          <Button onClick={() => gerar.mutate()} disabled={gerar.isPending}>{gerar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-1 h-4 w-4" />} Vincular meu WhatsApp</Button>
          {codigo && (
            <div className="space-y-2 rounded-lg border border-ok-500/40 bg-ok-500/5 p-3">
              <p>Mande esta mensagem em até 10 minutos:</p>
              <p className="font-mono text-2xl font-bold tracking-widest">{codigo.mensagem}</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild className="bg-[color:var(--c-25d366)] text-white hover:bg-[color:var(--c-1fb956)]"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="mr-1 h-4 w-4" /> Abrir no WhatsApp</a></Button>
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(codigo.mensagem).then(() => toast.success("Copiado"))}><Copy className="mr-1 h-4 w-4" /> Copiar</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Esta tela atualiza sozinha quando o vínculo for confirmado.</p>
            </div>
          )}
        </div>
      )}
      {s.vinculado && (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">WhatsApp final {s.telefoneFinal}. Para cadastrar, mande <b>“cadastrar imóvel”</b> (ou “menu”) para o WhatsApp da Romatec ({s.numeroCentral}). {s.autorizado && (s.prazo ? " A autorização acompanha o seu plano: renova sozinha quando o plano renovar." : " Seu acesso não tem prazo: a autorização vale enquanto você tiver acesso ao CRM.")} Sair do CRM, trocar a senha, "sair de todos os aparelhos" ou "Desligar" encerram a autorização; o rascunho fica salvo.</p>
          <div className="flex flex-wrap gap-2">
            {!s.autorizado && !String(s.motivo ?? "").startsWith("plano") && <Button onClick={() => autorizar.mutate()} disabled={autorizar.isPending}><CheckCircle2 className="mr-1 h-4 w-4" /> Autorizar este WhatsApp</Button>}
            {s.autorizado && <Button variant="ghost" className="text-danger-300" onClick={() => revogar.mutate()}><XCircle className="mr-1 h-4 w-4" /> Desligar</Button>}
            {!s.autorizado && String(s.motivo ?? "").startsWith("plano") && <Button asChild><Link href="/assinatura">Renovar meu plano</Link></Button>}
            <Button asChild variant="outline"><a href={`https://wa.me/${s.numeroCentral}?text=${encodeURIComponent("cadastrar imóvel")}`} target="_blank" rel="noreferrer"><MessageCircle className="mr-1 h-4 w-4" /> Cadastrar agora pelo WhatsApp</a></Button>
          </div>
        </div>
      )}
    </section>
  );
}

function ListaRascunhos() {
  const { data, isLoading } = trpc.agenteImovel.rascunhos.useQuery(undefined, { refetchInterval: 15_000 });
  const utils = trpc.useUtils();
  const excluir = trpc.agenteImovel.excluir.useMutation({ onSuccess: () => { toast.success("Rascunho excluído"); utils.agenteImovel.rascunhos.invalidate(); }, onError: e => toast.error(e.message) });
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">Rascunhos</h2>
      {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      {!isLoading && !data?.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum cadastro pelo WhatsApp ainda.</p>}
      <div className="grid gap-2 md:grid-cols-2">
        {data?.map(r => (
          <Link key={r.id} href={`/imoveis/whatsapp/${r.id}`} className="block space-y-1 rounded-xl border border-border bg-card p-3 hover:border-primary">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">nº {r.id} · {r.titulo || (r.tipo ? ROTULO_TIPO[r.tipo] : "Imóvel")}</span>
              <span className="flex items-center gap-1">
                <span className="rounded bg-secondary/50 px-1.5 py-0.5 text-[10px] font-bold">{ESTADO[r.estado] ?? r.estado}</span>
                {r.estado !== "saving" && (
                  <button type="button" aria-label={`Excluir rascunho nº ${r.id}`} title="Excluir rascunho" disabled={excluir.isPending}
                    className="rounded p-1.5 text-danger-300 hover:bg-danger-500/10"
                    onClick={ev => { ev.preventDefault(); ev.stopPropagation(); if (confirm(avisoExcluir(r.id, r.propertyId))) excluir.mutate({ id: r.id }); }}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{[r.cidade, r.preco ? formatarCampo("preco", r.preco) : null, `${r.fotos} foto(s)`].filter(Boolean).join(" · ")} · {r.responsavel} · {dataHora(r.atualizadoEm)}</p>
            {!!r.pendencias.length && r.estado !== "saved" && r.estado !== "cancelled" && <p className="text-xs text-warn-300">Falta: {r.pendencias.join(", ")}</p>}
            {r.erro && r.estado === "failed" && <p className="text-xs text-danger-300">{r.erro}</p>}
          </Link>
        ))}
      </div>
    </section>
  );
}

function PainelAdmin() {
  const { user } = useAuth();
  const admin = perfilDe(user as any) === "admin";
  const utils = trpc.useUtils();
  const { data } = trpc.agenteImovel.painel.useQuery(undefined, { enabled: admin });
  const revogar = trpc.agenteImovel.revogarDe.useMutation({ onSuccess: () => { toast.success("Vínculo desligado"); utils.agenteImovel.painel.invalidate(); } });
  if (!admin || !data) return null;
  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="text-base font-semibold">Administração do agente</h2>
      <p className="text-xs text-muted-foreground">{data.agente} · {data.motor}</p>
      <p className="text-xs">IA: <b>{data.ia.disponivel ? `${data.ia.provedor} (${data.ia.modelo})` : "não configurada"}</b>, Transcrição de áudio: <b>{data.ia.transcricao ? "ligada" : "sem chave"}</b>, Análise de imagem: <b>não usada</b> (fotos organizadas pelo corretor), Fotos em processamento: <b>{data.fotosEmProcessamento}</b></p>
      <p className="text-xs">Rascunhos: {data.rascunhosPorEstado.map(x => `${ESTADO[x.estado] ?? x.estado} ${x.n}`).join(", ") || "nenhum"}</p>
      <div className="overflow-x-auto"><table className="w-full text-xs">
        <thead className="text-left text-muted-foreground"><tr><th className="p-1">Pessoa</th><th className="p-1">Perfil</th><th className="p-1">WhatsApp</th><th className="p-1">Situação</th><th /></tr></thead>
        <tbody>{data.vinculos.map(v => (
          <tr key={v.usuarioId} className="border-t border-border"><td className="p-1">{v.nome}</td><td className="p-1">{v.perfil}</td><td className="p-1">{v.telefoneFinal ? `…${v.telefoneFinal}` : "—"}</td>
            <td className="p-1">{v.autorizado ? "autorizado" : v.motivo}</td>
            <td className="p-1">{v.autorizado && <button className="text-danger-300 underline" onClick={() => revogar.mutate({ usuarioId: v.usuarioId })}>desligar</button>}</td></tr>
        ))}</tbody>
      </table></div>
      {!!data.erros.length && <details><summary className="cursor-pointer text-xs">Erros recentes ({data.erros.length})</summary>
        <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">{data.erros.map((e, i) => <li key={i}>{dataHora(e.quando)} · {e.tipo} · rascunho {e.rascunhoId ?? "—"} · {e.detalhe}</li>)}</ul></details>}
    </section>
  );
}

function Rascunho({ id }: { id: number }) {
  const utils = trpc.useUtils();
  const { data: r, isLoading, error } = trpc.agenteImovel.rascunho.useQuery({ id }, { refetchInterval: 10_000 });
  const { data: equipe } = trpc.agenteImovel.equipe.useQuery();
  const [edit, setEdit] = useState<Record<string, any>>({});
  const [textos, setTextos] = useState<{ titulo?: string; descricao?: string }>({});
  const atualizar = () => { utils.agenteImovel.rascunho.invalidate({ id }); utils.agenteImovel.rascunhos.invalidate(); };
  const salvar = trpc.agenteImovel.salvar.useMutation({ onSuccess: () => { toast.success("Correção salva: monte a revisão de novo para confirmar"); setEdit({}); setTextos({}); atualizar(); }, onError: e => toast.error(e.message) });
  const foto = trpc.agenteImovel.foto.useMutation({ onSuccess: atualizar, onError: e => toast.error(e.message) });
  const revisar = trpc.agenteImovel.revisar.useMutation({ onSuccess: () => { toast.success("Revisão montada"); atualizar(); }, onError: e => toast.error(e.message) });
  const confirmar = trpc.agenteImovel.confirmar.useMutation({ onSuccess: x => { (x.ok ? toast.success : toast.error)(x.mensagem.replace(/\*/g, "")); atualizar(); }, onError: e => toast.error(e.message) });
  const cancelar = trpc.agenteImovel.cancelar.useMutation({ onSuccess: () => { toast.success("Rascunho cancelado"); atualizar(); }, onError: e => toast.error(e.message) });
  const [, irPara] = useLocation();
  const excluir = trpc.agenteImovel.excluir.useMutation({ onSuccess: () => { toast.success("Rascunho excluído"); utils.agenteImovel.rascunhos.invalidate(); irPara("/imoveis/whatsapp"); }, onError: e => toast.error(e.message) });
  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (error || !r) return <p className="text-sm text-danger-300">{error?.message ?? "Rascunho não encontrado"}</p>;
  const aberto = !["saved", "cancelled", "saving"].includes(r.estado);
  const valor = (c: keyof DadosImovel) => (c in edit ? edit[c] : (r.dados as any)[c]);
  const mudou = Object.keys(edit).length > 0 || textos.titulo !== undefined || textos.descricao !== undefined;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/imoveis/whatsapp" className="text-sm text-muted-foreground hover:underline">← Todos os rascunhos</Link>
        <span className="rounded bg-secondary/50 px-2 py-0.5 text-xs font-bold">{ESTADO[r.estado] ?? r.estado} · versão {r.versao}</span>
        {r.propertyId && <Link href={`/properties?imovel=${r.propertyId}`} className="text-sm text-ok-300 underline">Abrir em Imóveis (cadastrado, interno)</Link>}
        {r.estado !== "saving" && (
          <Button variant="ghost" size="sm" className="ml-auto text-danger-300" disabled={excluir.isPending} onClick={() => { if (confirm(avisoExcluir(id, r.propertyId))) excluir.mutate({ id }); }}>
            <Trash2 className="mr-1 h-4 w-4" /> Excluir rascunho
          </Button>
        )}
      </div>
      {r.erro && <p className="rounded-md bg-danger-500/10 p-2 text-xs text-danger-200">{r.erro}</p>}
      {!!r.pendencias.length && aberto && <p className="rounded-md bg-warn-500/10 p-2 text-sm text-warn-200">Falta: {r.pendencias.join(", ")}</p>}
      {r.conflitos.map((c: any) => <p key={c.campo} className="rounded-md bg-warn-500/10 p-2 text-sm text-warn-200">{CAMPOS.find(x => x.campo === c.campo)?.rotulo}: {c.valores.join(" ou ")} — corrija abaixo</p>)}
      {r.duvidas.map((q: string, i: number) => <p key={i} className="rounded-md bg-warn-500/10 p-2 text-sm text-warn-200">{q}</p>)}

      <section className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2 lg:grid-cols-3">
        {CAMPOS.map(c => {
          const v = valor(c.campo);
          const fonte = (r.fontes as any)[c.campo];
          const comum = { id: `campo-${c.campo}`, disabled: !aberto };
          return (
            <label key={c.campo} className="space-y-1 text-xs text-muted-foreground">
              {c.rotulo}{r.manuais.includes(c.campo) ? " · corrigido" : fonte ? ` · ${fonte.msg}` : ""}
              {c.campo === "tipo" ? (
                <select {...comum} className={sel} value={v ?? ""} onChange={e => setEdit({ ...edit, tipo: e.target.value || null })}>
                  <option value="">—</option>{TIPOS_IMOVEL.map(t => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
                </select>
              ) : c.campo === "finalidade" ? (
                <select {...comum} className={sel} value={v ?? ""} onChange={e => setEdit({ ...edit, finalidade: e.target.value || null })}>
                  <option value="">—</option><option value="venda">Venda</option><option value="aluguel">Aluguel</option>
                </select>
              ) : c.tipo === "bool" ? (
                <select {...comum} className={sel} value={v == null ? "" : v ? "true" : "false"} onChange={e => setEdit({ ...edit, [c.campo]: e.target.value === "" ? null : e.target.value === "true" })}>
                  <option value="">—</option><option value="true">Sim</option><option value="false">Não</option>
                </select>
              ) : (
                <Input {...comum} value={v ?? ""} inputMode={c.tipo === "texto" ? undefined : "decimal"} onChange={e => setEdit({ ...edit, [c.campo]: e.target.value })} title={fonte?.trecho || undefined} />
              )}
            </label>
          );
        })}
      </section>

      <section className="space-y-2 rounded-xl border border-border bg-card p-4">
        <label className="block space-y-1 text-xs text-muted-foreground">Título
          <Input id="rasc-titulo" disabled={!aberto} value={textos.titulo ?? r.titulo} onChange={e => setTextos({ ...textos, titulo: e.target.value })} maxLength={160} />
        </label>
        <label className="block space-y-1 text-xs text-muted-foreground">Descrição (vai para a divulgação; o proprietário e o endereço privado não entram)
          <textarea id="rasc-descricao" disabled={!aberto} rows={5} className="w-full rounded-md border border-border bg-background p-2 text-sm" value={textos.descricao ?? r.descricao} onChange={e => setTextos({ ...textos, descricao: e.target.value })} maxLength={4000} />
        </label>
        {r.podeTrocarResponsavel && aberto && (
          <label className="block max-w-sm space-y-1 text-xs text-muted-foreground">Responsável
            <select className={sel} value={r.responsavelId} onChange={e => salvar.mutate({ id, responsavelId: Number(e.target.value) })}>
              {equipe?.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </label>
        )}
        {aberto && mudou && <Button disabled={salvar.isPending} onClick={() => salvar.mutate({ id, dados: edit, ...(textos.titulo !== undefined ? { titulo: textos.titulo } : {}), ...(textos.descricao !== undefined ? { descricao: textos.descricao } : {}) })}>Salvar correções</Button>}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Fotos ({r.fotos.filter(f => f.status === "ok").length})</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {r.fotos.map(f => (
            <div key={f.id} className={`relative overflow-hidden rounded-lg border ${f.capa ? "border-warn-400" : "border-border"} bg-black/40`}>
              {f.url ? <img src={f.url.replace("/image/upload/", "/image/upload/c_limit,w_480,q_auto/")} alt="" className="aspect-square w-full object-cover" /> : <div className="flex aspect-square items-center justify-center text-xs text-muted-foreground">{f.status === "pendente" ? "processando…" : f.status === "duplicada" ? "repetida" : f.erro ?? f.status}</div>}
              {f.capa && <span className="absolute left-1 top-1 rounded bg-warn-400 px-1 text-[10px] font-bold text-black">CAPA</span>}
              {aberto && f.status === "ok" && (
                <div className="absolute bottom-1 right-1 flex gap-1">
                  {!f.capa && <button title="Usar como capa" className="rounded bg-black/70 p-1" onClick={() => foto.mutate({ id, fotoId: f.id, acao: "capa" })}><Star className="h-3.5 w-3.5 text-warn-300" /></button>}
                  <button title="Tirar do cadastro" className="rounded bg-black/70 p-1" onClick={() => foto.mutate({ id, fotoId: f.id, acao: "remover" })}><Trash2 className="h-3.5 w-3.5 text-danger-300" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {aberto && (
        <div className="sticky bottom-2 flex flex-wrap gap-2 rounded-xl border border-ok-500/40 bg-card p-3 shadow">
          {!r.revisaoPronta ? (
            <Button disabled={revisar.isPending || mudou} onClick={() => revisar.mutate({ id })}>{revisar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Montar revisão</Button>
          ) : (
            <Button className="bg-ok-600 text-white hover:bg-ok-700" disabled={confirmar.isPending || mudou}
              onClick={() => { if (confirm(`Cadastrar este imóvel no CRM (versão ${r.versao})? Ele entra interno, sem publicar.`)) confirmar.mutate({ id, versao: r.versao }); }}>
              {confirmar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />} Confirmar cadastro (versão {r.versao})
            </Button>
          )}
          <Button variant="ghost" className="text-danger-300" onClick={() => { if (confirm("Cancelar este rascunho? Nada é gravado em Imóveis.")) cancelar.mutate({ id }); }}>Cancelar rascunho</Button>
          {mudou && <span className="self-center text-xs text-warn-300">Salve as correções antes de revisar/confirmar.</span>}
        </div>
      )}

      {!!r.mensagens.length && (
        <details className="rounded-xl border border-border bg-card p-3 text-xs">
          <summary className="cursor-pointer font-semibold">Mensagens recebidas ({r.mensagens.length})</summary>
          <ul className="mt-2 space-y-1">{r.mensagens.map((m: any) => <li key={m.id}><b>{m.id}</b> ({m.tipo === "audio" ? "áudio" : "texto"}, {dataHora(m.em)}): {m.texto}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
