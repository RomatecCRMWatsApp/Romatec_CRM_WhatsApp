import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ListOrdered, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_PASSOS, VARIAVEIS, problemaSequencia, renderizarPasso, type PassoSequencia } from "@shared/followupSequencias";

const EXEMPLO = { nome: "Maria Souza", empreendimento: "Condomínio de Chácaras Bom Jardims", link: "https://romateccrm.com/bom-jardims", corretor: "José Romário (CRECI/MA 4.705)" };

function Editor({ s, admin }: { s: { etapa: string; rotulo: string; ativo: boolean; passos: PassoSequencia[]; padrao: boolean }; admin: boolean }) {
  const utils = trpc.useUtils();
  const [ativo, setAtivo] = useState(s.ativo);
  const [passos, setPassos] = useState<PassoSequencia[]>(s.passos);
  useEffect(() => { setAtivo(s.ativo); setPassos(s.passos); }, [s]);
  const salvar = trpc.crm.salvarSequencia.useMutation({ onSuccess: () => { toast.success(`Sequência "${s.rotulo}" salva`); utils.crm.sequencias.invalidate(); }, onError: e => toast.error(e.message) });
  const restaurar = trpc.crm.restaurarSequencia.useMutation({ onSuccess: () => { toast.success("Sequência padrão restaurada"); utils.crm.sequencias.invalidate(); }, onError: e => toast.error(e.message) });
  const mudou = ativo !== s.ativo || JSON.stringify(passos) !== JSON.stringify(s.passos);
  const prob = problemaSequencia(passos);
  const set = (i: number, p: Partial<PassoSequencia>) => setPassos(passos.map((x, k) => (k === i ? { ...x, ...p } : x)));
  return (
    <div className={`space-y-3 rounded-xl border p-4 ${ativo ? "border-border bg-card" : "border-dashed border-border bg-card/40"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Etapa: {s.rotulo} <span className="text-xs font-normal text-muted-foreground">· {passos.length} mensage{passos.length === 1 ? "m" : "ns"} · {s.padrao ? "padrão" : "editada"}</span></p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ativo} disabled={!admin} onChange={e => setAtivo(e.target.checked)} /> {ativo ? "Ligada" : "Desligada (usa o follow-up padrão)"}
        </label>
      </div>
      {passos.map((p, i) => (
        <div key={i} className="grid gap-2 rounded-lg border border-border/60 p-2 md:grid-cols-[110px_1fr_1fr]">
          <label className="text-xs text-muted-foreground">Dia após a última conversa
            <Input inputMode="numeric" value={String(p.dias)} disabled={!admin} onChange={e => set(i, { dias: Number(e.target.value.replace(/\D/g, "").slice(0, 2)) || 0 })} />
          </label>
          <div>
            <Textarea rows={3} value={p.texto} disabled={!admin} onChange={e => set(i, { texto: e.target.value })} />
            {admin && passos.length > 1 && <Button size="sm" variant="ghost" className="mt-1 h-7 text-red-300" onClick={() => setPassos(passos.filter((_, k) => k !== i))}><Trash2 className="mr-1 h-3.5 w-3.5" /> Remover</Button>}
          </div>
          <p className="whitespace-pre-wrap rounded-md bg-emerald-500/10 p-2 text-xs"><span className="mb-1 block text-[10px] uppercase text-muted-foreground">Prévia</span>{renderizarPasso(p.texto, EXEMPLO)}</p>
        </div>
      ))}
      {admin && (
        <div className="flex flex-wrap items-center gap-2">
          {passos.length < MAX_PASSOS && <Button size="sm" variant="outline" onClick={() => setPassos([...passos, { dias: (passos.at(-1)?.dias ?? 0) + 7, texto: "{oi} " }])}><Plus className="mr-1 h-3.5 w-3.5" /> Mensagem</Button>}
          <Button size="sm" disabled={!mudou || !!prob || salvar.isPending} onClick={() => salvar.mutate({ etapa: s.etapa, ativo, passos })}>{salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}</Button>
          {!s.padrao && <Button size="sm" variant="ghost" onClick={() => { if (confirm("Voltar para a sequência padrão desta etapa?")) restaurar.mutate({ etapa: s.etapa }); }}><RotateCcw className="mr-1 h-3.5 w-3.5" /> Restaurar padrão</Button>}
          {prob && <span className="text-xs text-red-300">{prob}</span>}
        </div>
      )}
    </div>
  );
}

/** Leads › Sequências de follow-up: as mensagens automáticas de cada etapa do funil (o administrador edita) */
export default function SequenciasFollowUp() {
  const { user } = useAuth();
  const admin = perfilDe(user as any) === "admin";
  const { data, isLoading } = trpc.crm.sequencias.useQuery();
  return (
    <div>
      <PageHeader icone={ListOrdered} titulo="Sequências de follow-up" subtitulo="Mensagens automáticas quando o lead para de responder, diferentes em cada etapa do funil" />
      <div className="mx-auto max-w-[1200px] space-y-4 px-4 pb-8 md:px-6">
        <div className="rounded-xl border border-border bg-card/50 p-3 text-xs text-muted-foreground">
          <p>Como funciona: quando o lead para de responder, sai a 1ª mensagem da sequência da etapa dele no dia indicado, depois a 2ª… O lead respondeu, a sequência para; mudou de etapa, começa a sequência da nova etapa. Só em horário comercial (seg–sáb, 8h–19h), nunca para quem está com o corretor, pediu SAIR ou já fechou. Toda mensagem leva a saída (SAIR) e nenhuma pode ter valores.</p>
          <p className="mt-1">Variáveis: {VARIAVEIS.map(([v, d]) => <span key={v} className="mr-2"><code>{v}</code> {d}</span>)}</p>
        </div>
        {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {data?.map(s => <Editor key={s.etapa} s={s} admin={admin} />)}
      </div>
    </div>
  );
}
