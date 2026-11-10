import { useState } from "react";
import { Loader2 } from "lucide-react";
import { AcoesPdf } from "@/components/sistema/AcoesPdf";
import { trpc } from "@/lib/trpc";
import { brl } from "@shared/simulador";
import { GESTOR_EMPREENDIMENTO } from "@shared/escritorio";
import { ROTULO_CURTO_COMISSAO, TITULO_TABELA_COMISSAO } from "@shared/tabelaComissao";

const pct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const area = (m2: number) => `${m2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;

/**
 * Tabela de comissão de um empreendimento: corretor (2%, o repasse do escritório) ou escritório (5%, a comissão integral
 * paga pelo empreendimento). Para cada forma de pagamento, quanto se recebe e quando, com os valores de uma chácara à
 * venda (a mais barata, ou a escolhida), e o PDF para baixar. Regras em shared/tabelaComissao.ts.
 */
export function TabelaComissao({ slug, tipo = "corretor" }: { slug: string; tipo?: "corretor" | "escritorio" }) {
  const [lote, setLote] = useState<string | undefined>(undefined);
  const { data, isLoading, error } = trpc.comissoes.tabela.useQuery({ slug, lote, tipo }, { placeholderData: prev => prev });
  const link = trpc.comissoes.linkTabela.useMutation();
  const quem = tipo === "corretor" ? "Comissão de venda" : "Comissão de gestão";
  if (isLoading && !data) return <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando a tabela…</p>;
  if (error) return <p className="text-xs text-destructive">{error.message}</p>;
  if (!data) return null;
  if (!data.exemplo) return <p className="text-xs text-muted-foreground">Nenhuma chácara à venda neste empreendimento agora.</p>;
  const ex = data.exemplo;
  return (
    <div className="space-y-3">
      <GestorDoEmpreendimento />
      <div className="rounded-xl bg-primary/10 p-3">
        <p className="text-sm">{quem}: <b className="text-primary">{pct(data.pct)} do valor da venda</b></p>
        <p className="mt-0.5 text-xs text-muted-foreground">{tipo === "escritorio" ? "Paga pelo empreendimento à gestora geral, já incluída a comissão de venda do corretor." : "Do corretor intermediador, repassada pela gestora."}</p>
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
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Preço de tabela {brl(ex.preco)} · à vista {brl(ex.avista)}</p>
        <AcoesPdf
          url={`/api/comissao/tabela.pdf?slug=${encodeURIComponent(slug)}&tipo=${tipo}&lote=${encodeURIComponent(ex.codigo)}`}
          nomeArquivo={`TABELA-COMISSAO-${tipo === "corretor" ? "VENDA" : "GESTAO"}-${slug.toUpperCase()}-${ex.codigo.toUpperCase()}.pdf`}
          linkPublico={() => link.mutateAsync({ slug, tipo, lote: ex.codigo })}
          mensagem={`${TITULO_TABELA_COMISSAO[tipo] ?? "Tabela de comissão"} — ${data.empreendimento?.nome ?? ""}, chácara ${ex.codigo}`}
        />
      </div>

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
        {tipo === "corretor"
          ? `A comissão é retida pela plataforma de pagamentos quando cada pagamento indicado é compensado e repassada a você em até ${data.repasseDiasUteis} dias úteis.`
          : `A comissão é retida na plataforma de pagamentos (split para o escritório) quando cada pagamento indicado é compensado; o escritório repassa a parte do corretor em até ${data.repasseDiasUteis} dias úteis.`}{" "}
        Valores de referência; o que vale é o plano escolhido no contrato.
      </p>
    </div>
  );
}

/** Gestora e responsável técnico (em todas as tabelas de comissão) */
export function GestorDoEmpreendimento() {
  return (
    <div className="rounded-xl border border-border p-3 text-xs">
      <p className="font-semibold text-primary">{GESTOR_EMPREENDIMENTO.titulo}</p>
      <p className="mt-0.5 font-semibold">{GESTOR_EMPREENDIMENTO.gestora}</p>
      <p className="text-muted-foreground">{GESTOR_EMPREENDIMENTO.responsavel}</p>
    </div>
  );
}

/**
 * Comissões de um empreendimento: comissão de gestão (5%, gestora geral) e comissão de venda (2%, corretor). Cada
 * empreendimento tem as dele (percentuais das condições de pagamento do empreendimento). Administrador e secretária
 * veem as duas; o corretor, só a de venda (a dele).
 */
export function ComissoesEmpreendimento({ slug, perfil }: { slug: string; perfil: string | null | undefined }) {
  const escritorio = perfil === "admin" || perfil === "secretario";
  const [tipo, setTipo] = useState<"corretor" | "escritorio">(escritorio ? "escritorio" : "corretor");
  if (!escritorio && perfil !== "corretor") return null;
  const atual = escritorio ? tipo : "corretor";
  return (
    <div className="space-y-3">
      {escritorio && (
        <div role="tablist" aria-label="Tabela de comissão" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(["escritorio", "corretor"] as const).map(k => (
            <button key={k} type="button" role="tab" aria-selected={tipo === k} onClick={() => setTipo(k)} title={TITULO_TABELA_COMISSAO[k]}
              className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${tipo === k ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {ROTULO_CURTO_COMISSAO[k]} ({k === "escritorio" ? "gestora" : "corretor"})
            </button>
          ))}
        </div>
      )}
      <TabelaComissao key={`${slug}-${atual}`} slug={slug} tipo={atual} />
    </div>
  );
}
