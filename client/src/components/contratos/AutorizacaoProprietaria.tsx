import { CheckCircle2, ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { AcoesPdf } from "@/components/sistema/AcoesPdf";
import { brl } from "@shared/simulador";

const sinal = (v: number) => `${v >= 0 ? "+" : "−"} ${brl(Math.abs(v))}`;

/** Contrato com plano negociado: a Autorização de venda vinculada (assinada pela proprietária) e a comparação com a tabela */
export function AutorizacaoProprietaria({ contratoId }: { contratoId: number }) {
  const q = trpc.contratos.autorizacaoProprietaria.useQuery({ id: contratoId });
  const d = q.data;
  if (!d || !d.precisa) return null;
  const k = d.comparativo;
  const ok = d.situacao === "valida";
  return (
    <section className={`space-y-2 rounded-xl border p-3 text-sm ${ok ? "border-ok-500/40 bg-ok-500/5" : "border-warn-500/50 bg-warn-500/10"}`}>
      <div className="flex flex-wrap items-center gap-2">
        {ok ? <CheckCircle2 className="h-5 w-5 text-ok-400" /> : <ShieldAlert className="h-5 w-5 text-warn-400" />}
        <p className="font-semibold">Plano negociado · {d.numero ? `Autorização n.º ${d.numero}` : "sem autorização"}</p>
        <span className="text-xs text-muted-foreground">
          {ok ? "autorizado pela proprietária: o PDF assinado vai como anexo do contrato"
            : d.numero ? "a autorização não confere com o plano atual do contrato: o definitivo não sai"
            : "falta a autorização da proprietária: o definitivo não sai"}
        </span>
        {d.autorizacaoId && <span className="ml-auto"><AcoesPdf compacto rotulo="Autorização" url={`/api/autorizacoes/${d.autorizacaoId}.pdf`} nomeArquivo={`AUTORIZACAO-${d.numero}.pdf`} mensagem={`Autorização n.º ${d.numero}`} /></span>}
      </div>
      {k && (
        <p className="text-xs">
          Tabela: {k.prazo}× de {brl(k.parcelaTabela)} · total {brl(k.totalTabela)} — Contrato: total <b>{brl(k.totalProposta)}</b> ·
          diferença {sinal(k.diferencaNominal)} · em valor presente <b className={k.diferencaVp < 0 ? "text-danger-400" : "text-ok-400"}>{sinal(k.diferencaVp)} ({k.diferencaVpPct.toLocaleString("pt-BR")}%)</b>
        </p>
      )}
      {!ok && <p className="text-xs">Peça a autorização em <Link href="/autorizacoes" className="underline">Autorizações</Link> e, assinada, gere o contrato da chácara escolhendo a autorização no Novo contrato.</p>}
    </section>
  );
}
