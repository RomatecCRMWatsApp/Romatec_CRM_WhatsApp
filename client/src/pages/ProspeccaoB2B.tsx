import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Building, Copy, ExternalLink, FileDown, Globe, Loader2, MapPin, MessageCircle, Plus, Radar, Search, Send, Sparkles, Star, Trash2, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import {
  CATEGORIAS_PROSPECTO, OBJETIVOS_PROSPECTO, ROTULO_CATEGORIA, ROTULO_OBJETIVO, ROTULO_STATUS, STATUS_PROSPECTO, TIPOS_BUSCA_MAPS, TIPOS_BUSCA_POR_OBJETIVO,
  validarMensagem, type CategoriaProspecto, type ObjetivoProspecto, type StatusProspecto, type TipoBuscaMaps,
} from "@shared/prospeccao";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AcoesPdf } from "@/components/sistema/AcoesPdf";

const POR_PAGINA = 40;
const COR_STATUS: Record<StatusProspecto, string> = {
  novo: "bg-muted text-foreground", rascunho: "bg-warn-100 text-warn-900", aprovado: "bg-info-100 text-info-900", enviado: "bg-azul-100 text-azul-900",
  respondeu: "bg-ok-100 text-ok-900", interessado: "bg-go-200 text-go-950", sem_interesse: "bg-grafite-200 text-grafite-700", optout: "bg-danger-100 text-danger-900",
};
const copiar = async (t: string) => { try { await navigator.clipboard.writeText(t); toast.success("Copiado"); } catch { window.prompt("Copie:", t); } };
const fone = (t: string | null) => (t ? t.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") : "sem telefone");
const selectCls = "h-9 rounded-md border border-border bg-background px-2 text-sm";

interface Prospecto {
  id: number; nome: string; categoria: CategoriaProspecto; objetivo: ObjetivoProspecto; cidade: string | null; telefone: string | null; celular: boolean; email: string | null;
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
  const [painel, setPainel] = useState<"" | "importar" | "novo" | "maps">("");
  const [objetivo, setObjetivo] = useState<ObjetivoProspecto | "">("");
  const filtro = { ...(status ? { status } : {}), ...(categoria ? { categoria } : {}), ...(cidade ? { cidade } : {}), ...(objetivo ? { objetivo } : {}) };
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
      <PageHeader icone={Radar} titulo="Prospecção B2B" subtitulo="Parceiros do Bom Jardims e clientes do AvalieImob: busque no Google Maps, o CRM lê o site, a IA escreve a primeira mensagem e nada sai sem a sua aprovação"
        acoes={<div className="flex flex-wrap gap-2">
          <Button onClick={() => setPainel(p => (p === "maps" ? "" : "maps"))}><MapPin className="mr-1 h-4 w-4" /> Buscar no Google Maps</Button>
          <Button variant="outline" onClick={() => setPainel(p => (p === "importar" ? "" : "importar"))}><Upload className="mr-1 h-4 w-4" /> Importar lista</Button>
          <Button variant="outline" onClick={() => setPainel(p => (p === "novo" ? "" : "novo"))}><Plus className="mr-1 h-4 w-4" /> Nova empresa</Button>
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
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Objetivo da prospecção">
          {(["", ...OBJETIVOS_PROSPECTO] as const).map(o => (
            <Button key={o || "todos"} size="sm" variant={objetivo === o ? "default" : "outline"} aria-pressed={objetivo === o} onClick={() => { setObjetivo(o); setPagina(1); }}>
              {o ? ROTULO_OBJETIVO[o] : "Todos"}
            </Button>
          ))}
        </div>
        {painel === "maps" && <BuscaMaps admin={admin} objetivoInicial={objetivo || "parceria_bj"} onFim={() => { setPainel(""); recarregar(); }} />}
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
            Nenhuma empresa aqui. Use "Buscar no Google Maps", "Importar lista" (CSV) ou cadastre uma por uma.
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
  const vazio = { nome: "", categoria: "imobiliaria", objetivo: "parceria_bj" as ObjetivoProspecto, cidade: "Açailândia", telefone: "", site: "", email: "" };
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
        <select className={selectCls} aria-label="Tipo de empresa" value={f.categoria} onChange={set("categoria")}>{CATEGORIAS_PROSPECTO.map(c => <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>)}</select>
        <select className={selectCls} aria-label="Objetivo" value={f.objetivo} onChange={set("objetivo")}>{OBJETIVOS_PROSPECTO.map(o => <option key={o} value={o}>{ROTULO_OBJETIVO[o]}</option>)}</select>
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
  const virar = trpc.prospeccao.virarParceira.useMutation({ onSuccess: r => { toast.success(`Parceira cadastrada (código ${r.codigo}). O kit dela já sai com o portal.`); onMudou(); }, onError: erro });
  const parceria = p.objetivo === "parceria_bj";
  const jaEnviado = !!p.enviadoEm || ["enviado", "respondeu", "interessado", "sem_interesse"].includes(p.status);
  const problema = msg ? validarMensagem(msg) : null;
  const alterado = msg !== (p.mensagem ?? "") || fato !== (p.fato ?? "");
  const waLink = p.telefone ? `https://wa.me/${p.telefone}?text=${encodeURIComponent(msg)}` : null;
  const ocupado = atualizar.isPending || enriquecer.isPending || gerar.isPending || enviar.isPending;

  return (
    <div className={`space-y-2 rounded-xl border border-border bg-card p-4 text-sm ${p.status === "optout" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{p.nome} <span className={`ml-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${COR_STATUS[p.status]}`}>{ROTULO_STATUS[p.status]}</span>
            <span className="ml-1 rounded border border-border px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">{ROTULO_OBJETIVO[p.objetivo]}</span></p>
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
          {parceria && p.status !== "optout" && (
            <AcoesPdf compacto rotulo="Kit PDF" url={`/api/kit-parceiro/prospecto/${p.id}.pdf`} nomeArquivo={`KIT-PARCEIRO-${p.id}.pdf`} mensagem="Kit do parceiro — Condomínio de Chácaras Bom Jardims" />
          )}
          {parceria && admin && p.status !== "optout" && (
            <Button size="sm" variant="outline" disabled={virar.isPending}
              onClick={() => { if (confirm(`Cadastrar ${p.nome} como imobiliária parceira (comissão de 2%, ajustável em Imobiliárias parceiras)?`)) virar.mutate({ id: p.id }); }}>
              {virar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building className="mr-1 h-3.5 w-3.5" />} Virar parceira
            </Button>
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

interface LugarMaps {
  placeId: string; nome: string; categoria: CategoriaProspecto; tipoGoogle: string | null; endereco: string | null; telefone: string | null;
  site: string | null; nota: number | null; avaliacoes: number; mapsUrl: string | null; termo: string; jaCadastrado: null | "prospecto" | "parceira";
}

/** Busca no Google Maps (Places API oficial): escolhe cidade e tipos, revisa a lista e importa só os selecionados */
function BuscaMaps({ admin, objetivoInicial, onFim }: { admin: boolean; objetivoInicial: ObjetivoProspecto; onFim: () => void }) {
  const utils = trpc.useUtils();
  const { data: cfg } = trpc.prospeccao.mapsConfig.useQuery();
  const [chave, setChave] = useState("");
  const [cidade, setCidade] = useState("Açailândia");
  const [uf, setUf] = useState("MA");
  const [obj, setObj] = useState<ObjetivoProspecto>(objetivoInicial);
  const [tipos, setTipos] = useState<TipoBuscaMaps[]>(TIPOS_BUSCA_POR_OBJETIVO[objetivoInicial]);
  const [res, setRes] = useState<LugarMaps[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const salvar = trpc.prospeccao.salvarChaveMaps.useMutation({ onSuccess: () => { toast.success("Chave salva"); setChave(""); utils.prospeccao.mapsConfig.invalidate(); }, onError: e => toast.error(e.message) });
  const buscar = trpc.prospeccao.buscarMaps.useMutation({
    onSuccess: r => {
      const ls = r.lugares as LugarMaps[];
      setRes(ls); setMarcados(new Set(ls.filter(l => !l.jaCadastrado).map(l => l.placeId)));
      toast.success(`${ls.length} empresas encontradas em ${cidade}/${uf}`);
    },
    onError: e => toast.error(e.message),
  });
  const importar = trpc.prospeccao.importarMaps.useMutation({
    onSuccess: r => { toast.success(`${r.inseridos} importadas · ${r.repetidos} já estavam na lista`); onFim(); },
    onError: e => toast.error(e.message),
  });
  const trocarObjetivo = (o: ObjetivoProspecto) => { setObj(o); setTipos(TIPOS_BUSCA_POR_OBJETIVO[o]); };
  const alternar = (t: TipoBuscaMaps) => setTipos(ts => (ts.includes(t) ? ts.filter(x => x !== t) : [...ts, t]));
  const marcar = (id: string) => setMarcados(m => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const escolhidos = (res ?? []).filter(l => marcados.has(l.placeId));

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
      {cfg && !cfg.configurada && (
        <div className="space-y-2 rounded-lg border border-[var(--rt-gold)]/50 bg-secondary p-3 text-foreground">
          <p className="font-medium">Falta a chave da API do Google (Places API New).</p>
          <p className="text-xs text-muted-foreground">No Google Cloud: crie um projeto, ative a <b>Places API (New)</b>, crie uma chave em "Credenciais" e restrinja a chave a essa API. O uso do escritório fica dentro da cota gratuita mensal do Google.</p>
          {admin
            ? <div className="flex flex-wrap gap-2"><Input className="max-w-sm" value={chave} onChange={e => setChave(e.target.value)} placeholder="AIza…" aria-label="Chave da Places API" autoComplete="off" />
                <Button size="sm" disabled={chave.trim().length < 30 || salvar.isPending} onClick={() => salvar.mutate({ chave: chave.trim() })}>Salvar chave</Button></div>
            : <p className="text-xs">Peça ao administrador para cadastrar a chave.</p>}
        </div>
      )}
      {cfg?.configurada && <p className="text-xs text-muted-foreground">Google Places conectado (chave …{cfg.final}{cfg.origem === "servidor" ? ", configurada no servidor" : ""}).</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Cidade<Input value={cidade} onChange={e => setCidade(e.target.value)} className="w-48" /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">UF<Input value={uf} onChange={e => setUf(e.target.value.toUpperCase().slice(0, 2))} className="w-16" /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Objetivo
          <select className={selectCls} value={obj} onChange={e => trocarObjetivo(e.target.value as ObjetivoProspecto)}>
            {OBJETIVOS_PROSPECTO.map(o => <option key={o} value={o}>{ROTULO_OBJETIVO[o]}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="mb-1 text-xs text-muted-foreground">Tipos de empresa</legend>
        {(Object.keys(TIPOS_BUSCA_MAPS) as TipoBuscaMaps[]).map(t => (
          <label key={t} className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={tipos.includes(t)} onChange={() => alternar(t)} /> {TIPOS_BUSCA_MAPS[t].rotulo}</label>
        ))}
      </fieldset>
      <Button disabled={!cfg?.configurada || !tipos.length || cidade.trim().length < 2 || uf.length !== 2 || buscar.isPending} onClick={() => buscar.mutate({ cidade: cidade.trim(), uf, tipos })}>
        {buscar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />} Buscar
      </Button>
      {res && (
        <div className="space-y-2">
          {!res.length && <p className="text-muted-foreground">Nada encontrado nessa cidade para esses tipos.</p>}
          {res.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span>{escolhidos.length} de {res.length} selecionadas</span>
              <Button size="sm" variant="ghost" onClick={() => setMarcados(new Set(res.filter(l => !l.jaCadastrado).map(l => l.placeId)))}>Só as novas</Button>
              <Button size="sm" variant="ghost" onClick={() => setMarcados(new Set())}>Nenhuma</Button>
            </div>
          )}
          <ul className="divide-y divide-border rounded-lg border border-border">
            {res.map(l => (
              <li key={l.placeId} className={`flex flex-wrap items-start gap-2 p-2 ${l.jaCadastrado ? "opacity-70" : ""}`}>
                <input type="checkbox" className="mt-1" checked={marcados.has(l.placeId)} onChange={() => marcar(l.placeId)} aria-label={`Selecionar ${l.nome}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.nome}
                    {l.jaCadastrado && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal">{l.jaCadastrado === "parceira" ? "já é parceira" : "já está na prospecção"}</span>}</p>
                  <p className="text-xs text-muted-foreground">{[l.tipoGoogle, fone(l.telefone), l.endereco].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {l.nota != null && <span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3" aria-hidden="true" /> {l.nota.toLocaleString("pt-BR")} ({l.avaliacoes})</span>}
                  {l.site && <a className="text-primary underline" href={l.site} target="_blank" rel="noreferrer noopener">site</a>}
                  {l.mapsUrl && <a className="text-primary underline" href={l.mapsUrl} target="_blank" rel="noreferrer noopener">mapa</a>}
                </div>
              </li>
            ))}
          </ul>
          {res.length > 0 && (
            <Button disabled={!escolhidos.length || importar.isPending} onClick={() => importar.mutate({ cidade: cidade.trim(), uf, objetivo: obj, lugares: escolhidos.map(({ jaCadastrado, ...l }) => l) })}>
              {importar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Importar {escolhidos.length} para {ROTULO_OBJETIVO[obj]}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">Fonte: Google Maps (Places API oficial). Contato só com empresas, identificando-se e com a opção "SAIR" na primeira mensagem.</p>
        </div>
      )}
    </div>
  );
}
