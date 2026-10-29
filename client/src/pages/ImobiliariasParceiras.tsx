import { useState } from "react";
import { toast } from "sonner";
import { Building, Copy, ExternalLink, Loader2, Plus, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brl } from "@shared/simulador";

const vazio = { nome: "", cnpj: "", creci: "", responsavel: "", telefone: "", email: "", comissao: "2", corretorInternoId: "" };
const copiar = async (t: string) => { try { await navigator.clipboard.writeText(t); toast.success("Link copiado"); } catch { window.prompt("Copie:", t); } };

/** Vendas › Imobiliárias parceiras: cadastro, link do portal de cada uma, leads e vendas com a comissão prevista */
export default function ImobiliariasParceiras() {
  const { user } = useAuth();
  const admin = perfilDe(user as any) === "admin";
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.parceiras.lista.useQuery();
  const { data: resp } = trpc.crm.responsaveis.useQuery();
  const [f, setF] = useState(vazio);
  const [aberto, setAberto] = useState(false);
  const recarregar = () => utils.parceiras.lista.invalidate();
  const criar = trpc.parceiras.criar.useMutation({ onSuccess: r => { toast.success(`Parceira cadastrada (código ${r.codigo})`); setF(vazio); setAberto(false); recarregar(); }, onError: e => toast.error(e.message) });
  const atualizar = trpc.parceiras.atualizar.useMutation({ onSuccess: () => { toast.success("Atualizado"); recarregar(); }, onError: e => toast.error(e.message) });
  const novoLink = trpc.parceiras.novoLink.useMutation({ onSuccess: () => { toast.success("Novo link gerado — o anterior parou de funcionar"); recarregar(); }, onError: e => toast.error(e.message) });
  const set = (k: keyof typeof vazio) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const dados = () => ({ nome: f.nome, cnpj: f.cnpj || null, creci: f.creci || null, responsavel: f.responsavel || null, telefone: f.telefone || null, email: f.email || null,
    comissaoPct: (Number(f.comissao.replace(",", ".")) || 0) / 100, corretorInternoId: f.corretorInternoId ? Number(f.corretorInternoId) : null });
  return (
    <div>
      <PageHeader icone={Building} titulo="Imobiliárias parceiras" subtitulo="Cada parceira tem um portal próprio: chácaras disponíveis, links com o código dela, indicação de clientes, leads e vendas"
        acoes={admin ? <Button onClick={() => setAberto(v => !v)}><Plus className="mr-1 h-4 w-4" /> Nova parceira</Button> : undefined} />
      <div className="mx-auto max-w-[1300px] space-y-3 px-4 pb-8 md:px-6">
        {aberto && (
          <div className="space-y-2 rounded-xl border border-border bg-card p-4">
            <div className="grid gap-2 md:grid-cols-3">
              <Input value={f.nome} onChange={set("nome")} placeholder="Nome da imobiliária *" />
              <Input value={f.cnpj} onChange={set("cnpj")} placeholder="CNPJ" />
              <Input value={f.creci} onChange={set("creci")} placeholder="CRECI (PJ)" />
              <Input value={f.responsavel} onChange={set("responsavel")} placeholder="Responsável" />
              <Input value={f.telefone} onChange={set("telefone")} placeholder="Telefone" />
              <Input value={f.email} onChange={set("email")} placeholder="E-mail" />
              <label className="text-xs text-muted-foreground">Comissão da parceira (% da venda)<Input value={f.comissao} onChange={set("comissao")} inputMode="decimal" /></label>
              <label className="text-xs text-muted-foreground">Corretor da casa que recebe os leads
                <select value={f.corretorInternoId} onChange={set("corretorInternoId")} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                  <option value="">Rodízio</option>{(resp as any[] | undefined)?.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </label>
            </div>
            <Button disabled={f.nome.trim().length < 2 || criar.isPending} onClick={() => criar.mutate(dados())}>{criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cadastrar"}</Button>
          </div>
        )}
        {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {data && !data.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhuma imobiliária parceira cadastrada.</p>}
        {data?.map(p => (
          <div key={p.id} className={`space-y-2 rounded-xl border border-border bg-card p-4 text-sm ${p.ativo ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{p.nome} <code className="text-xs text-muted-foreground">PARC-{p.codigo}</code>{!p.ativo && <span className="ml-2 rounded border border-border px-1.5 text-[10px] uppercase">desativada</span>}</p>
                <p className="text-xs text-muted-foreground">{[p.creci && `CRECI ${p.creci}`, p.responsavel, p.telefone, p.email].filter(Boolean).join(" · ")}</p>
                <p className="text-xs text-muted-foreground">Comissão {(p.comissaoPct * 100).toLocaleString("pt-BR")}% · leads com {p.corretorInterno ?? "o rodízio"}</p>
              </div>
              <div className="flex gap-4 text-center text-xs">
                <div><p className="text-lg font-bold">{p.leads}</p><p className="text-muted-foreground">leads</p></div>
                <div><p className="text-lg font-bold">{p.vendidas}</p><p className="text-muted-foreground">vendas</p></div>
                <div><p className="text-lg font-bold">{brl(p.comissaoPrevista)}</p><p className="text-muted-foreground">comissão prevista</p></div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => copiar(p.portal)}><Copy className="mr-1 h-3.5 w-3.5" /> Link do portal</Button>
              <Button size="sm" variant="ghost" asChild><a href={p.portal} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" /> Ver como a parceira</a></Button>
              {admin && <Button size="sm" variant="ghost" onClick={() => { if (confirm("Gerar um novo link? O atual para de funcionar.")) novoLink.mutate({ id: p.id }); }}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Novo link</Button>}
              {admin && <Button size="sm" variant="ghost" onClick={() => atualizar.mutate({ id: p.id, dados: { ativo: !p.ativo } })}>{p.ativo ? "Desativar" : "Reativar"}</Button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
