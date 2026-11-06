import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Globe, Loader2, MessageCircle, Plus, Radar, Send, Sparkles, Trash2, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import {
  CATEGORIAS_PROSPECTO, ROTULO_CATEGORIA, ROTULO_STATUS, STATUS_PROSPECTO, validarMensagem,
  type CategoriaProspecto, type StatusProspecto,
} from "@shared/prospeccao";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const POR_PAGINA = 40;
const COR_STATUS: Record<StatusProspecto, string> = {
  novo: "bg-muted text-foreground", rascunho: "bg-warn-100 text-warn-900", aprovado: "bg-info-100 text-info-900", enviado: "bg-azul-100 text-azul-900",
  respondeu: "bg-ok-100 text-ok-900", interessado: "bg-go-200 text-go-950", sem_interesse: "bg-grafite-200 text-grafite-700", optout: "bg-danger-100 text-danger-900",
};
const copiar = async (t: string) => { try { await navigator.clipboard.writeText(t); toast.success("Copiado"); } catch { window.prompt("Copie:", t); } };
const fone = (t: string | null) => (t ? t.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") : "sem telefone");
const selectCls = "h-9 rounded-md border border-border bg-background px-2 text-sm";

interface Prospecto {
  id: number; nome: string; categoria: CategoriaProspecto; cidade: string | null; telefone: string | null; celular: boolean; email: string | null;
  site: string | null; instagram: string | null; sobre: string | null; fato: string | null; status: StatusProspecto; mensagem: string | null;
  ultimaResposta: string | null; enviadoEm: string | null;
}

/** Vendas › Prospecção B2B (AvalieImob): importa empresas da região, lê o site, IA escreve, uma pessoa aprova e o CRM envia */
export default function ProspeccaoB2B() {
  const { user } = useAuth();
  const admin = perfilDe(user as any) === "admin";
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<StatusProspecto | "">("");
  const [categoria, setCategoria] = useState<CategoriaProspecto | "">("");
  const [cidade, setCidade] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [painel, setPainel] = useState<"" | "importar" | "novo">("");
  const filtro = { ...(status ? { status } : {}), ...(categoria ? { categoria } : {}), ...(cidade ? { cidade } : {}) };
  const { data: bruto, isLoading } = trpc.prospeccao.lista.useQuery(filtro);
  const data = bruto as Prospecto[] | undefined;
  const { data: resumo } = trpc.prospeccao.resumo.useQuery();
  const recarregar = () => { utils.prospeccao.lista.invalidate(); utils.prospeccao.resumo.invalidate(); };

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (data ?? []).filter(p => !q || `${p.nome} ${p.cidade ?? ""} ${p.telefone ?? ""}`.toLowerCase().includes(q));
  }, [data, busca]);

  return (
    <div>
      <PageHeader icone={Radar} titulo="Prospecção B2B" subtitulo="Empresas da região para o AvalieImob: o CRM lê o site, a IA escreve a primeira mensagem e nada sai sem a sua aprovação"
        acoes={<div className="flex gap-2">
          <Button variant="outline" onClick={() => setPainel(p => (p === "importar" ? "" : "importar"))}><Upload className="mr-1 h-4 w-4" /> Importar lista</Button>
          <Button onClick={() => setPainel(p => (p === "novo" ? "" : "novo"))}><Plus className="mr-1 h-4 w-4" /> Nova empresa</Button>
        </div>} />
      <div className="mx-auto max-w-[1300px] space-y-3 px-4 pb-8 md:px-6">
        {resumo && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg border border-border bg-card px-3 py-2"><b className="text-base">{resumo.total}</b> empresas</span>
            {STATUS_PROSPECTO.filter(s => resumo.porStatus[s]).map(s => (
              <button key={s} onClick={() => { setStatus(status === s ? "" : s); setPagina(1); }} className={`rounded-lg px-3 py-2 ${COR_STATUS[s]} ${status === s ? "ring-2 ring-primary" : ""}`}>
                <b className="text-base">{resumo.porStatus[s]}</b> {ROTULO_STATUS[s].toLowerCase()}
              </button>
            ))}
            <span className="rounded-lg border border-border bg-card px-3 py-2">Enviadas hoje: <b>{resumo.enviadosHoje}/{resumo.limiteDia}</b></span>
          </div>
        )}
        {painel === "importar" && <Importar onFim={() => { setPainel(""); recarregar(); }} />}
        {painel === "novo" && <NovaEmpresa onFim={() => { setPainel(""); recarregar(); }} />}
        <div className="flex flex-wrap gap-2">
          <Input className="max-w-xs" value={busca} onChange={e => { setBusca(e.target.value); setPagina(1); }} placeholder="Buscar por nome, cidade ou telefone" />
          <select className={selectCls} value={categoria} onChange={e => { setCategoria(e.target.value as any); setPagina(1); }}>
            <option value="">Todos os tipos</option>{CATEGORIAS_PROSPECTO.map(c => <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>)}
          </select>
          <select className={selectCls} value={cidade} onChange={e => { setCidade(e.target.value); setPagina(1); }}>
            <option value="">Todas as cidades</option>{resumo?.cidades.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={selectCls} value={status} onChange={e => { setStatus(e.target.value as any); setPagina(1); }}>
            <option value="">Todas as etapas</option>{STATUS_PROSPECTO.map(s => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
          </select>
        </div>
        {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {data && !visiveis.length && (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nenhuma empresa aqui. Use "Importar lista" com o CSV da região (scripts/prospeccao/overture_lugares.py) ou cadastre uma por uma.
          </p>
        )}
        {visiveis.slice(0, pagina * POR_PAGINA).map(p => <Cartao key={p.id} p={p} admin={admin} onMudou={recarregar} />)}
        {visiveis.length > pagina * POR_PAGINA && (
          <Button variant="outline" className="w-full" onClick={() => setPagina(n => n + 1)}>Mostrar mais ({visiveis.length - pagina * POR_PAGINA} restantes)</Button>
        )}
        <p className="text-xs text-muted-foreground">
          Boas práticas (LGPD e WhatsApp): só empresas, uma primeira mensagem por empresa, até {resumo?.limiteDia ?? 20} por dia, sempre com a saída "SAIR".
          Quem responder SAIR sai da lista automaticamente e recebe a confirmação. "Excluir" apaga o registro de vez.
        </p>
      </div>
    </div>
  );
}

function Importar({ onFim }: { onFim: () => void }) {
  const [csv, setCsv] = useState("");
  const importar = trpc.prospeccao.importarCsv.useMutation({
    onSuccess: r => { toast.success(`${r.inseridos} importadas · ${r.repetidos} repetidas · ${r.invalidos} sem nome`); onFim(); },
    onError: e => toast.error(e.message),
  });
  const lerArquivo = (f?: File) => { if (!f) return; const r = new FileReader(); r.onload = () => setCsv(String(r.result ?? "")); r.readAsText(f, "utf-8"); };
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
      <p className="text-muted-foreground">CSV com cabeçalho. Colunas aceitas: <code>nome, categoria, cidade, uf, telefone, email, site, instagram, endereco, fonte, fonteId</code>. Empresas repetidas ficam de fora.</p>
      <input type="file" accept=".csv,text/csv" onChange={e => lerArquivo(e.target.files?.[0])} />
      <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={5} placeholder="…ou cole o CSV aqui" className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs" />
      <Button disabled={csv.trim().length < 5 || importar.isPending} onClick={() => importar.mutate({ csv })}>
        {importar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Importar ${Math.max(0, csv.trim().split("\n").length - 1)} linhas`}
      </Button>
    </div>
  );
}

function NovaEmpresa({ onFim }: { onFim: () => void }) {
  const vazio = { nome: "", categoria: "imobiliaria", cidade: "Açailândia", telefone: "", site: "", email: "" };
  const [f, setF] = useState(vazio);
  const criar = trpc.prospeccao.criar.useMutation({
    onSuccess: r => { if (r.inseridos) { toast.success("Empresa cadastrada"); setF(vazio); onFim(); } else toast.error("Essa empresa já está na lista."); },
    onError: e => toast.error(e.message),
  });
  const set = (k: keyof typeof vazio) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4">
      <div className="grid gap-2 md:grid-cols-3">
        <Input value={f.nome} onChange={set("nome")} placeholder="Nome da empresa *" />
        <select className={selectCls} value={f.categoria} onChange={set("categoria")}>{CATEGORIAS_PROSPECTO.map(c => <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>)}</select>
        <Input value={f.cidade} onChange={set("cidade")} placeholder="Cidade" />
        <Input value={f.telefone} onChange={set("telefone")} placeholder="WhatsApp (99) 9 ...." inputMode="tel" />
        <Input value={f.site} onChange={set("site")} placeholder="Site" />
        <Input value={f.email} onChange={set("email")} placeholder="E-mail" />
      </div>
      <Button disabled={f.nome.trim().length < 2 || criar.isPending} onClick={() => criar.mutate({ ...f, uf: "MA" })}>
        {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cadastrar"}
      </Button>
    </div>
  );
}

function Cartao({ p, admin, onMudou }: { p: Prospecto; admin: boolean; onMudou: () => void }) {
  const [fato, setFato] = useState(p.fato ?? "");
  const [msg, setMsg] = useState(p.mensagem ?? "");
  const [aberto, setAberto] = useState(false);
  const erro = (e: { message: string }) => toast.error(e.message);
  const atualizar = trpc.prospeccao.atualizar.useMutation({ onSuccess: () => { toast.success("Salvo"); onMudou(); }, onError: erro });
  const enriquecer = trpc.prospeccao.enriquecer.useMutation({
    onSuccess: r => { toast.success(r.achou.telefone || r.achou.email ? "Site lido: contatos atualizados" : "Site lido"); onMudou(); setAberto(true); }, onError: erro,
  });
  const gerar = trpc.prospeccao.gerarMensagem.useMutation({
    onSuccess: r => { setMsg(r.mensagem); setAberto(true); toast.success(r.origem === "ia" ? "Mensagem escrita pela IA: revise antes de aprovar" : "Mensagem-modelo (IA indisponível)"); onMudou(); }, onError: erro,
  });
  const enviar = trpc.prospeccao.aprovarEEnviar.useMutation({ onSuccess: r => { toast.success(`Enviada (${r.enviadosHoje}/${r.limiteDia} hoje)`); onMudou(); }, onError: erro });
  const marcar = trpc.prospeccao.marcar.useMutation({ onSuccess: onMudou, onError: erro });
  const excluir = trpc.prospeccao.excluir.useMutation({ onSuccess: () => { toast.success("Excluído"); onMudou(); }, onError: erro });
  const jaEnviado = !!p.enviadoEm || ["enviado", "respondeu", "interessado", "sem_interesse"].includes(p.status);
  const problema = msg ? validarMensagem(msg) : null;
  const alterado = msg !== (p.mensagem ?? "") || fato !== (p.fato ?? "");
  const waLink = p.telefone ? `https://wa.me/${p.telefone}?text=${encodeURIComponent(msg)}` : null;
  const ocupado = atualizar.isPending || enriquecer.isPending || gerar.isPending || enviar.isPending;

  return (
    <div className={`space-y-2 rounded-xl border border-border bg-card p-4 text-sm ${p.status === "optout" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{p.nome} <span className={`ml-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${COR_STATUS[p.status]}`}>{ROTULO_STATUS[p.status]}</span></p>
          <p className="text-xs text-muted-foreground">
            {[ROTULO_CATEGORIA[p.categoria], p.cidade, fone(p.telefone) + (p.telefone ? (p.celular ? " · celular" : " · fixo") : ""), p.email].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-1 flex flex-wrap gap-3 text-xs">
            {p.site && <a className="inline-flex items-center gap-1 text-primary underline" href={p.site} target="_blank" rel="noreferrer noopener"><Globe className="h-3 w-3" /> site</a>}
            {p.instagram && <a className="inline-flex items-center gap-1 text-primary underline" href={p.instagram} target="_blank" rel="noreferrer noopener"><ExternalLink className="h-3 w-3" /> Instagram</a>}
            {p.enviadoEm && <span className="text-muted-foreground">enviada em {new Date(p.enviadoEm).toLocaleString("pt-BR")}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {p.site && <Button size="sm" variant="outline" disabled={ocupado} onClick={() => enriquecer.mutate({ id: p.id })}>{enriquecer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="mr-1 h-3.5 w-3.5" />} Ler site</Button>}
          {!jaEnviado && p.status !== "optout" && (
            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => gerar.mutate({ id: p.id })}>{gerar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />} {p.mensagem ? "Refazer mensagem" : "Escrever mensagem"}</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setAberto(v => !v)}>{aberto ? "Fechar" : "Abrir"}</Button>
        </div>
      </div>
      {p.ultimaResposta && <pre className="whitespace-pre-wrap rounded-lg bg-ok-50 p-2 text-xs text-ok-950">{p.ultimaResposta}</pre>}
      {aberto && (
        <div className="space-y-2">
          {p.sobre && <p className="rounded-lg bg-muted p-2 text-xs"><b>No site:</b> {p.sobre}</p>}
          <label className="block text-xs text-muted-foreground">Fato específico sobre a empresa (a IA só usa o que estiver aqui ou no site)
            <Input value={fato} onChange={e => setFato(e.target.value)} placeholder="ex.: vocês acabaram de lançar o Residencial X" maxLength={300} disabled={jaEnviado} />
          </label>
          <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={8} maxLength={1500} disabled={jaEnviado}
            className="w-full rounded-md border border-border bg-background p-2 text-sm" placeholder='Clique em "Escrever mensagem" ou escreva aqui' />
          {problema && msg && <p className="text-xs text-danger-600">{problema}</p>}
          <div className="flex flex-wrap gap-1.5">
            {!jaEnviado && alterado && <Button size="sm" variant="outline" disabled={ocupado} onClick={() => atualizar.mutate({ id: p.id, dados: { fato: fato || null, mensagem: msg || null } })}>Salvar</Button>}
            {admin && !jaEnviado && p.status !== "optout" && (
              <Button size="sm" disabled={ocupado || !msg || !!problema || alterado || !p.celular}
                title={!p.celular ? "Sem celular: use Copiar" : alterado ? "Salve antes de enviar" : undefined}
                onClick={() => { if (confirm(`Enviar esta mensagem para ${p.nome} pelo WhatsApp ${fone(p.telefone)}?`)) enviar.mutate({ id: p.id }); }}>
                {enviar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />} Aprovar e enviar
              </Button>
            )}
            {msg && <Button size="sm" variant="ghost" onClick={() => copiar(msg)}><Copy className="mr-1 h-3.5 w-3.5" /> Copiar</Button>}
            {waLink && msg && !jaEnviado && <Button size="sm" variant="ghost" asChild><a href={waLink} target="_blank" rel="noreferrer noopener"><MessageCircle className="mr-1 h-3.5 w-3.5" /> Abrir no meu WhatsApp</a></Button>}
          </div>
          <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
            {jaEnviado && (["respondeu", "interessado", "sem_interesse"] as const).map(s => (
              <Button key={s} size="sm" variant={p.status === s ? "default" : "outline"} onClick={() => marcar.mutate({ id: p.id, status: s })}>{ROTULO_STATUS[s]}</Button>
            ))}
            {p.status !== "optout" && <Button size="sm" variant="ghost" onClick={() => { if (confirm("Marcar que esta empresa não quer contato?")) marcar.mutate({ id: p.id, status: "optout" }); }}>Não quer contato</Button>}
            {admin && <Button size="sm" variant="ghost" className="text-danger-600" onClick={() => { if (confirm(`Excluir ${p.nome} de vez?`)) excluir.mutate({ id: p.id }); }}><Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
