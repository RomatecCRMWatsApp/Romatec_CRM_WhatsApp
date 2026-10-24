import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, Megaphone, Pencil } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RomatecSeal } from "@/brand";
import { PUBLICOS_RELEASE, SECOES_RELEASE, TIPOS_RELEASE, problemaRelease, type ItensRelease } from "@shared/releases";
import { ROTULO_PERFIL } from "@shared/equipe";
import { ItensDaRelease } from "./Novidades";

const VAZIO = { versao: "", tipo: "patch" as (typeof TIPOS_RELEASE)[number], titulo: "", obrigatoria: false, publico: "todos" as (typeof PUBLICOS_RELEASE)[number], texto: { novo: "", melhorias: "", correcoes: "", avisos: "" } };
type Form = typeof VAZIO;
const sel = "h-9 rounded-md border border-border bg-secondary/30 px-2 text-sm";
const proxima = (v: string) => { const [a, b, c] = v.split(".").map(Number); return `${a || 0}.${b || 0}.${(c || 0) + 1}`; };
const itensDe = (t: Form["texto"]): ItensRelease => ({
  novo: t.novo.split("\n").map(s => s.replace(/^[-•]\s*/, "").trim()).filter(Boolean),
  melhorias: t.melhorias.split("\n").map(s => s.replace(/^[-•]\s*/, "").trim()).filter(Boolean),
  correcoes: t.correcoes.split("\n").map(s => s.replace(/^[-•]\s*/, "").trim()).filter(Boolean),
  avisos: t.avisos.split("\n").map(s => s.replace(/^[-•]\s*/, "").trim()).filter(Boolean),
});

/**
 * Configurações › Publicar atualização (admin): aviso ou correção de texto sem deploy.
 * Aparece para todos no "Novidades da versão" e no sino. O banner "Atualizar agora" só sai com deploy.
 */
export default function PublicarAtualizacao() {
  const utils = trpc.useUtils();
  const { data } = trpc.novidades.todas.useQuery();
  const [f, setF] = useState<Form>(VAZIO);
  const [editando, setEditando] = useState<number | null>(null);
  const [previa, setPrevia] = useState(false);
  const ok = (msg: string) => () => { toast.success(msg); setF({ ...VAZIO, versao: "" }); setEditando(null); utils.novidades.invalidate(); };
  const publicar = trpc.novidades.publicar.useMutation({ onSuccess: ok("Atualização publicada para todos"), onError: e => toast.error(e.message) });
  const editar = trpc.novidades.editar.useMutation({ onSuccess: ok("Texto atualizado"), onError: e => toast.error(e.message) });
  const ativar = trpc.novidades.ativar.useMutation({ onSuccess: () => utils.novidades.invalidate(), onError: e => toast.error(e.message) });
  useEffect(() => { if (data && !f.versao && editando === null) setF(x => ({ ...x, versao: proxima(data.ultimaVersao) })); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const itens = itensDe(f.texto);
  const erro = problemaRelease({ versao: editando ? "0.0.0" : f.versao, titulo: f.titulo, itens }, editando ? null : data?.ultimaVersao);
  const enviar = () => {
    if (erro) { toast.error(erro); return; }
    const d = { tipo: f.tipo, titulo: f.titulo, itens, obrigatoria: f.obrigatoria, publico: f.publico };
    if (editando) editar.mutate({ id: editando, ...d });
    else if (confirm(`Publicar a v${f.versao} para ${f.publico === "todos" ? "todos" : ROTULO_PERFIL[f.publico as keyof typeof ROTULO_PERFIL]}?`)) publicar.mutate({ versao: f.versao, ...d });
  };
  const abrirEdicao = (r: any) => {
    setEditando(r.id);
    setF({ versao: r.versao, tipo: r.tipo, titulo: r.titulo, obrigatoria: r.obrigatoria, publico: r.publico,
      texto: { novo: r.itens.novo.join("\n"), melhorias: r.itens.melhorias.join("\n"), correcoes: r.itens.correcoes.join("\n"), avisos: r.itens.avisos.join("\n") } });
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><Megaphone className="h-5 w-5 text-[var(--rt-gold)]" /> Publicar atualização</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          As versões do deploy vêm do <code>RELEASE_NOTES.md</code>. Aqui você publica um aviso ou corrige um texto sem deploy — todos recebem no "Novidades da versão" e no sino.
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Versão
            <input value={f.versao} disabled={!!editando} onChange={e => setF({ ...f, versao: e.target.value.trim() })} className={sel} placeholder="1.7.1" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Tipo
            <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value as any })} className={sel}>{TIPOS_RELEASE.map(t => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">Para
            <select value={f.publico} onChange={e => setF({ ...f, publico: e.target.value as any })} className={sel}>
              {PUBLICOS_RELEASE.map(p => <option key={p} value={p}>{p === "todos" ? "Todos" : ROTULO_PERFIL[p as keyof typeof ROTULO_PERFIL]}</option>)}
            </select>
          </label>
          <label className="flex items-end gap-2 pb-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={f.obrigatoria} onChange={e => setF({ ...f, obrigatoria: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" /> Obrigatória
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-4">Título
            <input value={f.titulo} maxLength={150} onChange={e => setF({ ...f, titulo: e.target.value })} className={sel} placeholder="Ex.: Novo empreendimento no catálogo" />
          </label>
          {SECOES_RELEASE.map(s => (
            <label key={s.chave} className="flex flex-col gap-1 text-xs sm:col-span-2" style={{ color: s.cor }}>{s.rotulo} (um item por linha)
              <textarea rows={3} value={f.texto[s.chave]} onChange={e => setF({ ...f, texto: { ...f.texto, [s.chave]: e.target.value } })}
                className="rounded-md border border-border bg-secondary/30 px-2 py-1.5 text-sm text-foreground" />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPrevia(true)} disabled={!!erro && erro !== "Versão no formato 1.7.1"}><Eye className="mr-1.5 h-4 w-4" /> Pré-visualizar</Button>
          <Button onClick={enviar} disabled={publicar.isPending || editar.isPending} className="bg-[var(--rt-gold)] text-black hover:bg-[var(--rt-gold-light)]">{editando ? "Salvar texto" : "Publicar"}</Button>
          {editando && <Button variant="ghost" onClick={() => { setEditando(null); setF({ ...VAZIO, versao: proxima(data?.ultimaVersao ?? "0.0.0") }); }}>Cancelar edição</Button>}
          {erro && <span className="self-center text-xs text-amber-300">{erro}</span>}
        </div>

        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-xs font-semibold text-muted-foreground">Versões publicadas</p>
          {(data?.releases ?? []).map(r => (
            <div key={r.id} className={`flex flex-wrap items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm ${r.ativo ? "" : "opacity-50"}`}>
              <b className="w-14">v{r.versao}</b>
              <span className="min-w-0 flex-1 truncate">{r.titulo}</span>
              <span className="text-xs text-muted-foreground">{new Date(r.publicadoEm).toLocaleDateString("pt-BR")}</span>
              {r.publico !== "todos" && <span className="rounded border border-border px-1 text-[10px] uppercase text-muted-foreground">{r.publico}</span>}
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => abrirEdicao(r)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => ativar.mutate({ id: r.id, ativo: !r.ativo })}>{r.ativo ? "Desativar" : "Reativar"}</Button>
            </div>
          ))}
        </div>

        <Dialog open={previa} onOpenChange={setPrevia}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <RomatecSeal size={52} />
                <div className="text-left">
                  <DialogTitle className="text-base">Novidades da versão <span className="text-[var(--rt-gold-light)]">{f.versao}</span></DialogTitle>
                  <p className="text-sm text-foreground/90">{f.titulo || "(sem título)"}</p>
                  <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString("pt-BR")} · prévia</p>
                </div>
              </div>
            </DialogHeader>
            <ItensDaRelease itens={itens} />
            <div className="flex justify-end"><Button onClick={() => setPrevia(false)}>Fechar</Button></div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
