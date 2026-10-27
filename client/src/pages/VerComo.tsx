import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Eye, Loader2, Search } from "lucide-react";
import { entrarVerComo } from "@/lib/verComo";

const ABAS = [["corretor", "Corretores"], ["secretario", "Secretárias"], ["empreendedor", "Empreendedoras"]] as const;

/**
 * Ver como (só o administrador): escolhe um corretor, uma secretária ou uma empreendedora e o sistema abre
 * exatamente como a pessoa vê — menu, empreendimentos e imóveis liberados, módulos e dados dela. Só leitura:
 * nenhuma ação é gravada em nome dela. A faixa embaixo mostra quem está sendo visto e o botão Sair.
 */
export default function VerComo() {
  // A aba vem do menu (?perfil=corretor | secretario | empreendedor) e acompanha a troca de item
  const pedido = new URLSearchParams(useSearch()).get("perfil") ?? "corretor";
  const [aba, setAba] = useState<(typeof ABAS)[number][0]>("corretor");
  useEffect(() => { if (ABAS.some(a => a[0] === pedido)) setAba(pedido as (typeof ABAS)[number][0]); }, [pedido]);
  const [busca, setBusca] = useState("");
  const { data, isLoading, error } = trpc.verComo.lista.useQuery();
  const iniciar = trpc.verComo.iniciar.useMutation({
    onSuccess: p => entrarVerComo({ id: p.id, nome: p.nome, perfil: p.perfil, rotuloPerfil: p.rotuloPerfil }),
    onError: e => toast.error(e.message),
  });
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (data ?? []).filter(p => p.perfil === aba && (!q || p.nome.toLowerCase().includes(q) || String(p.creci ?? "").includes(q)));
  }, [data, aba, busca]);
  return (
    <div>
      <PageHeader icone={Eye} titulo="Ver como" subtitulo="Abra o sistema exatamente como cada corretor, secretária ou empreendedora vê — só leitura" />
      <div className="mx-auto max-w-[1100px] space-y-3 px-4 pb-8 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {ABAS.map(([k, r]) => (
            <button key={k} onClick={() => setAba(k)} className={`rounded-full border px-3 py-1 text-xs ${aba === k ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {r} ({(data ?? []).filter(p => p.perfil === k).length})
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-background px-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome ou CRECI" className="h-9 bg-transparent text-sm outline-none" />
          </label>
        </div>
        {error && <p className="text-sm text-red-400">{error.message}</p>}
        {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {data && !lista.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Ninguém ativo nesta lista.</p>}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map(p => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              {p.fotoUrl ? <img src={p.fotoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 font-bold text-primary">{p.nome.charAt(0).toUpperCase()}</div>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{p.nome}</p>
                <p className="truncate text-[11px] text-muted-foreground">{[p.rotuloPerfil, p.creci ? `CRECI ${p.creci}` : null, p.empreendimentoSlug].filter(Boolean).join(" · ")}</p>
              </div>
              <Button size="sm" disabled={iniciar.isPending} onClick={() => iniciar.mutate({ usuarioId: p.id })}>
                {iniciar.isPending && iniciar.variables?.usuarioId === p.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Eye className="mr-1 h-3.5 w-3.5" />}Ver como
              </Button>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          A tela abre como a pessoa vê de verdade: o menu dela, os empreendimentos e imóveis liberados, os módulos e os dados. Nada pode ser alterado
          enquanto você estiver vendo como ela (o servidor recusa). Para voltar, use o botão <b>Sair</b> da faixa embaixo da tela. Cada visualização fica registrada.
        </p>
      </div>
    </div>
  );
}
