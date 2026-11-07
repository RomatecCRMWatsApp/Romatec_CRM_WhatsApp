import { useState } from "react";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { brl } from "@shared/simulador";

const pct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const area = (m2: number) => `${m2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;

/**
 * Tabela de comissão do corretor num empreendimento: para cada forma de pagamento, quanto ele recebe e quando, com os
 * valores de uma chácara à venda (a mais barata, ou a que ele escolher). Regras em shared/tabelaComissao.ts.
 */
export function TabelaComissao({ slug }: { slug: string }) {
  const [lote, setLote] = useState<string | undefined>(undefined);
  const { data, isLoading, error } = trpc.simulador.tabelaComissao.useQuery({ slug, lote }, { placeholderData: prev => prev });
  if (isLoading && !data) return <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando a tabela…</p>;
  if (error) return <p className="text-xs text-destructive">{error.message}</p>;
  if (!data) return null;
  if (!data.exemplo) return <p className="text-xs text-muted-foreground">Nenhuma chácara à venda neste empreendimento agora.</p>;
  const ex = data.exemplo;
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-primary/10 p-3">
        <p className="text-sm">Sua comissão: <b className="text-primary">{pct(data.pct)} do valor da venda</b></p>
        {data.faixa && data.faixa.menor !== data.faixa.maior && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Chácaras à venda de {brl(data.faixa.menor)} a {brl(data.faixa.maior)}: comissão de {brl(data.faixa.menor * data.pct)} a {brl(data.faixa.maior * data.pct)} pelo preço de tabela.
          </p>
        )}
      </div>

      <label className="block text-xs text-muted-foreground">
        Valores calculados para a chácara
        <select value={ex.codigo} onChange={e => setLote(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground">
          {data.chacaras.map(c => <option key={c.codigo} value={c.codigo}>{c.codigo} · {area(c.areaM2)} · {brl(c.preco)}</option>)}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">Preço de tabela {brl(ex.preco)} · à vista {brl(ex.avista)}</p>

      <ol className="space-y-2">
        {data.linhas.map(l => (
          <li key={l.chave} className="rounded-xl border border-border p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-semibold leading-tight">{l.forma}</p>
              <p className="shrink-0 text-base font-bold text-primary">{brl(l.valor)}</p>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{l.resumo} {pct(data.pct)} sobre o {l.baseRotulo} ({brl(l.base)}).</p>
            <table className="mt-2 w-full text-xs">
              <thead className="sr-only"><tr><th>Quando você recebe</th><th>Parte</th><th>Valor</th></tr></thead>
              <tbody>
                {l.pagamentos.map(p => (
                  <tr key={p.quando} className="border-t border-border/60">
                    <td className="py-1 pr-2">{p.quando}</td>
                    <td className="py-1 pr-2 text-right text-muted-foreground">{pct(p.pct)}</td>
                    <td className="py-1 text-right font-semibold tabular-nums">{brl(p.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </li>
        ))}
      </ol>

      <p className="text-[11px] leading-snug text-muted-foreground">
        A comissão é retida pela plataforma de pagamentos quando cada pagamento indicado é compensado e repassada a você em até {data.repasseDiasUteis} dias úteis.
        Valores de referência; o que vale é o plano escolhido no contrato.
      </p>
    </div>
  );
}
