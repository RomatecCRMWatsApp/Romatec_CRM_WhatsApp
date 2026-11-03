import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { BookOpen, ChevronLeft, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { buscarArtigos, CATEGORIAS_ARTIGO, PUBLICOS_ARTIGO, ROTULO_CATEGORIA_ARTIGO, type CategoriaArtigo, type PublicoArtigo } from "@shared/baseConhecimento";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Artigo { id: number; slug: string; titulo: string; categoria: CategoriaArtigo; publico: PublicoArtigo; conteudo: string; ordem: number; ativo: boolean; atualizadoEm: string | null }
const vazio = { titulo: "", categoria: "sistema" as CategoriaArtigo, publico: "todos" as PublicoArtigo, conteudo: "", ordem: 100, ativo: true };
const selectCls = "h-9 rounded-md border border-border bg-background px-2 text-sm";

/** Ajuda › Base de conhecimento: a equipe consulta e o administrador mantém os artigos (Markdown) */
export default function BaseConhecimento() {
  const { user } = useAuth();
  const admin = perfilDe(user as any) === "admin";
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.baseConhecimento.lista.useQuery({ incluirInativos: admin });
  const artigos = (data ?? []) as Artigo[];
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<CategoriaArtigo | "">("");
  const [abertoId, setAbertoId] = useState<number | null>(null);
  const [editando, setEditando] = useState<null | { id: number | null; dados: typeof vazio }>(null);
  const recarregar = () => utils.baseConhecimento.lista.invalidate();
  const salvar = trpc.baseConhecimento.salvar.useMutation({
    onSuccess: r => { toast.success("Artigo salvo"); setEditando(null); setAbertoId(r.id); recarregar(); }, onError: e => toast.error(e.message),
  });
  const excluir = trpc.baseConhecimento.excluir.useMutation({ onSuccess: () => { toast.success("Artigo excluído"); setAbertoId(null); recarregar(); }, onError: e => toast.error(e.message) });

  const visiveis = useMemo(() => buscarArtigos(artigos.filter(a => !categoria || a.categoria === categoria), busca), [artigos, categoria, busca]);
  const aberto = artigos.find(a => a.id === abertoId) ?? null;

  if (editando) {
    const f = editando.dados;
    const set = (p: Partial<typeof vazio>) => setEditando({ ...editando, dados: { ...f, ...p } });
    return (
      <div>
        <PageHeader icone={BookOpen} titulo={editando.id ? "Editar artigo" : "Novo artigo"} subtitulo="Escreva em Markdown: ## para títulos, - para listas, **negrito** e tabelas com |" />
        <div className="mx-auto max-w-[1100px] space-y-3 px-4 pb-8 md:px-6">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
            <Input id="art-titulo" value={f.titulo} onChange={e => set({ titulo: e.target.value })} placeholder="Título do artigo" maxLength={160} />
            <select id="art-cat" className={selectCls} value={f.categoria} onChange={e => set({ categoria: e.target.value as CategoriaArtigo })}>
              {CATEGORIAS_ARTIGO.map(c => <option key={c} value={c}>{ROTULO_CATEGORIA_ARTIGO[c]}</option>)}
            </select>
            <select id="art-pub" className={selectCls} value={f.publico} onChange={e => set({ publico: e.target.value as PublicoArtigo })}>
              {PUBLICOS_ARTIGO.map(p => <option key={p} value={p}>{p === "todos" ? "Toda a equipe" : "Só escritório"}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm"><input id="art-ativo" type="checkbox" checked={f.ativo} onChange={e => set({ ativo: e.target.checked })} /> Publicado</label>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <textarea id="art-conteudo" value={f.conteudo} onChange={e => set({ conteudo: e.target.value })} rows={22} maxLength={60000}
              className="w-full rounded-md border border-border bg-background p-3 font-mono text-sm" placeholder="## Título da seção&#10;Texto do artigo…" />
            <div className="prose prose-sm max-w-none overflow-auto rounded-xl border border-border bg-card p-4 dark:prose-invert"><Streamdown>{f.conteudo || "_Pré-visualização_"}</Streamdown></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={salvar.isPending} onClick={() => salvar.mutate({ id: editando.id, dados: f })}>{salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}</Button>
            <Button variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
            <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">Ordem
              <Input id="art-ordem" type="number" className="w-20" value={f.ordem} onChange={e => set({ ordem: Number(e.target.value) || 0 })} />
            </label>
          </div>
        </div>
      </div>
    );
  }

  if (aberto) {
    return (
      <div>
        <PageHeader icone={BookOpen} titulo={aberto.titulo} subtitulo={`${ROTULO_CATEGORIA_ARTIGO[aberto.categoria] ?? aberto.categoria}${aberto.publico === "escritorio" ? " · só escritório" : ""}${aberto.atualizadoEm ? ` · atualizado em ${new Date(aberto.atualizadoEm).toLocaleDateString("pt-BR")}` : ""}`}
          acoes={<div className="flex gap-2">
            <Button variant="outline" onClick={() => setAbertoId(null)}><ChevronLeft className="mr-1 h-4 w-4" /> Todos os artigos</Button>
            {admin && <Button variant="outline" onClick={() => setEditando({ id: aberto.id, dados: { titulo: aberto.titulo, categoria: aberto.categoria, publico: aberto.publico, conteudo: aberto.conteudo, ordem: aberto.ordem, ativo: aberto.ativo } })}><Pencil className="mr-1 h-4 w-4" /> Editar</Button>}
            {admin && <Button variant="ghost" className="text-red-500" onClick={() => { if (confirm(`Excluir "${aberto.titulo}"?`)) excluir.mutate({ id: aberto.id }); }}><Trash2 className="h-4 w-4" /></Button>}
          </div>} />
        <article className="prose prose-sm mx-auto max-w-[860px] px-4 pb-10 dark:prose-invert md:px-6">
          {!aberto.ativo && <p className="rounded-md bg-amber-100 p-2 text-amber-900">Rascunho: só o administrador vê este artigo.</p>}
          <Streamdown>{aberto.conteudo}</Streamdown>
        </article>
      </div>
    );
  }

  return (
    <div>
      <PageHeader icone={BookOpen} titulo="Base de conhecimento" subtitulo="Tudo o que a equipe precisa saber sobre o Bom Jardims, as vendas, o financeiro e o sistema"
        acoes={admin ? <Button onClick={() => setEditando({ id: null, dados: vazio })}><Plus className="mr-1 h-4 w-4" /> Novo artigo</Button> : undefined} />
      <div className="mx-auto max-w-[1100px] space-y-3 px-4 pb-8 md:px-6">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input id="busca-artigo" className="pl-8" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar: plano C, 2ª via, CRECI, DIMOB…" />
          </div>
          <select id="filtro-cat" className={selectCls} value={categoria} onChange={e => setCategoria(e.target.value as CategoriaArtigo | "")}>
            <option value="">Todas as categorias</option>{CATEGORIAS_ARTIGO.map(c => <option key={c} value={c}>{ROTULO_CATEGORIA_ARTIGO[c]}</option>)}
          </select>
        </div>
        {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {!isLoading && !visiveis.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum artigo encontrado{busca ? ` para "${busca}"` : ""}.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {visiveis.map(a => (
            <button key={a.id} type="button" onClick={() => setAbertoId(a.id)}
              className={`rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${a.ativo ? "" : "opacity-60"}`}>
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary">{ROTULO_CATEGORIA_ARTIGO[a.categoria] ?? a.categoria}{a.publico === "escritorio" ? " · escritório" : ""}{a.ativo ? "" : " · rascunho"}</span>
              <p className="mt-1 font-semibold">{a.titulo}</p>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.conteudo.replace(/[#*|_>`-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180)}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
