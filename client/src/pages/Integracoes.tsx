import { useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, Plug, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brl } from "@shared/simulador";

const copiar = async (t: string, r = "Copiado") => { try { await navigator.clipboard.writeText(t); toast.success(r); } catch { window.prompt("Copie:", t); } };
const ESCOPOS = [["lotes:ler", "Ler chácaras"], ["imoveis:ler", "Ler imóveis"], ["leads:criar", "Enviar leads"]] as const;

function Portais() {
  const { data, isLoading } = trpc.integracoes.portais.useQuery();
  if (isLoading || !data) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
        <p className="font-semibold">ZAP Imóveis · VivaReal · OLX (Canal Pro do Grupo OLX)</p>
        <ol className="ml-4 list-decimal space-y-1 text-muted-foreground">
          <li>No Canal Pro, em <b>Integração › Integração por XML</b>, cole o link do feed abaixo (padrão VRSync). Os anúncios atualizam sozinhos.</li>
          <li>Em <b>Integração de leads</b>, cole o link do webhook: cada contato do portal vira lead no CRM, com o portal e o anúncio de origem.</li>
        </ol>
        {[["Link do feed (XML)", data.feed], ["Link do webhook de leads", data.webhook]].map(([r, v]) => (
          <div key={r}>
            <p className="text-xs text-muted-foreground">{r}</p>
            <div className="flex gap-2"><code className="flex-1 break-all rounded-md bg-secondary/40 px-2 py-1.5 text-xs">{v}</code><Button size="sm" variant="outline" onClick={() => copiar(v, `${r} copiado`)}><Copy className="h-3.5 w-3.5" /></Button></div>
          </div>
        ))}
        <p className="text-xs text-amber-200">Os links têm um código secreto: não publique. Para trocar, defina PORTAIS_TOKEN no Railway.</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4 text-sm">
        <p className="mb-2 font-semibold">{data.anuncios.length} anúncio(s) no feed</p>
        <div className="max-h-64 divide-y divide-border overflow-y-auto">
          {data.anuncios.map(a => <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="flex justify-between gap-2 py-1.5"><span><code className="text-xs text-emerald-300">{a.id}</code> {a.titulo}</span><span>{brl(a.preco)}</span></a>)}
          {!data.anuncios.length && <p className="text-muted-foreground">Nenhum anúncio com preço público ainda.</p>}
        </div>
      </div>
      {data.fora.length > 0 && (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm">
          <p className="mb-2 font-semibold">Fora do feed ({data.fora.length})</p>
          {data.fora.map(f => <p key={f.id} className="text-muted-foreground"><code className="text-xs">{f.id}</code> {f.titulo} — {f.motivo}</p>)}
        </div>
      )}
    </div>
  );
}

function Api() {
  const utils = trpc.useUtils();
  const { data } = trpc.integracoes.chaves.useQuery();
  const { data: resp } = trpc.crm.responsaveis.useQuery();
  const [nome, setNome] = useState("");
  const [escopos, setEscopos] = useState<string[]>(["lotes:ler", "leads:criar"]);
  const [corretor, setCorretor] = useState("");
  const [nova, setNova] = useState<string | null>(null);
  const criar = trpc.integracoes.criarChave.useMutation({ onSuccess: r => { setNova(r.chave); setNome(""); utils.integracoes.chaves.invalidate(); }, onError: e => toast.error(e.message) });
  const alterar = trpc.integracoes.alterarChave.useMutation({ onSuccess: () => utils.integracoes.chaves.invalidate(), onError: e => toast.error(e.message) });
  const base = window.location.origin;
  const exemplo = `curl -X POST ${base}/api/v1/leads \\\n  -H "Authorization: Bearer SUA_CHAVE" -H "Content-Type: application/json" \\\n  -d '{"nome":"Maria Souza","telefone":"(99) 9 9999-0000","chacara":"A05","mensagem":"Quero visitar","consentimento":true}'`;
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
        <p className="font-semibold">Nova chave para um parceiro</p>
        <div className="grid gap-2 md:grid-cols-[1fr_auto_220px_auto]">
          <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do parceiro (ex.: Imobiliária X)" />
          <div className="flex flex-wrap items-center gap-3">{ESCOPOS.map(([v, r]) => (
            <label key={v} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={escopos.includes(v)} onChange={e => setEscopos(e.target.checked ? [...escopos, v] : escopos.filter(x => x !== v))} /> {r}</label>
          ))}</div>
          <select value={corretor} onChange={e => setCorretor(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm" aria-label="Corretor dos leads">
            <option value="">Leads: rodízio</option>
            {(resp as any[] | undefined)?.map(u => <option key={u.id} value={u.id}>Leads para {u.nome ?? u.name}</option>)}
          </select>
          <Button disabled={nome.trim().length < 2 || !escopos.length || criar.isPending} onClick={() => criar.mutate({ nome, escopos: escopos as any, corretorId: corretor ? Number(corretor) : null })}><Plus className="mr-1 h-4 w-4" /> Criar</Button>
        </div>
        {nova && (
          <div className="rounded-md border border-amber-400/50 bg-amber-500/10 p-2">
            <p className="text-xs text-amber-200">Copie agora e envie ao parceiro por um canal seguro — a chave não aparece de novo.</p>
            <div className="flex gap-2"><code className="flex-1 break-all text-xs">{nova}</code><Button size="sm" variant="outline" onClick={() => copiar(nova, "Chave copiada")}><Copy className="h-3.5 w-3.5" /></Button></div>
          </div>
        )}
      </div>
      <div className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
        {data?.map(k => (
          <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <p className="font-semibold"><KeyRound className="mr-1 inline h-4 w-4" />{k.nome} <code className="text-xs text-muted-foreground">rmt_{k.prefixo}_…</code></p>
              <p className="text-xs text-muted-foreground">{k.escopos.join(", ")} · {k.usos} chamada(s){k.ultimoUso ? ` · última ${new Date(k.ultimoUso).toLocaleString("pt-BR")}` : ""}</p>
            </div>
            <Button size="sm" variant={k.ativo ? "ghost" : "outline"} className={k.ativo ? "text-red-300" : ""} onClick={() => alterar.mutate({ id: k.id, ativo: !k.ativo })}>{k.ativo ? "Revogar" : "Reativar"}</Button>
          </div>
        ))}
        {data && !data.length && <p className="p-3 text-muted-foreground">Nenhuma chave criada.</p>}
      </div>
      <div className="space-y-2 rounded-xl border border-border bg-card/50 p-4 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">Como o parceiro usa</p>
        <p><code>GET /api/v1/empreendimentos</code> · <code>GET /api/v1/empreendimentos/bom-jardims/chacaras</code> · <code>GET /api/v1/imoveis</code> · <code>POST /api/v1/leads</code></p>
        <pre className="overflow-x-auto rounded-md bg-secondary/40 p-2">{exemplo}</pre>
        <p>Preço só sai quando é público no site. Lead exige <code>consentimento: true</code> (LGPD). Limite: 120 chamadas por minuto por chave.</p>
        <Button size="sm" variant="outline" onClick={() => copiar(exemplo, "Exemplo copiado")}><Copy className="mr-1 h-3.5 w-3.5" /> Copiar exemplo</Button>
      </div>
    </div>
  );
}

/** Admin › Integrações: portais imobiliários e API para parceiros */
export default function Integracoes() {
  const [aba, setAba] = useState<"portais" | "api">("portais");
  return (
    <div>
      <PageHeader icone={Plug} titulo="Integrações" subtitulo="Anúncios automáticos no ZAP, VivaReal e OLX e a API para imobiliárias e sites parceiros" />
      <div className="mx-auto max-w-[1100px] space-y-3 px-4 pb-8 md:px-6">
        <div className="flex gap-1 border-b border-border">
          {([["portais", "Portais"], ["api", "API para parceiros"]] as const).map(([k, r]) => (
            <button key={k} onClick={() => setAba(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === k ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground"}`}>{r}</button>
          ))}
        </div>
        {aba === "portais" ? <Portais /> : <Api />}
      </div>
    </div>
  );
}
