import { IdCard, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Campo, InputMascara, classeCampo, sel } from "@/components/cadastro/campos";
import { maskCPF } from "@shared/masks";
import { MAX_DEPENDENTES, PARENTESCOS, type Dependente } from "@shared/contratos";

export const DEPENDENTE_VAZIO: Dependente = { nome: "", parentesco: "", nascimento: "", cpf: "" };

/**
 * Dependentes do comprador para as carteirinhas do condomínio (até 6). Titular e cônjuge já têm carteirinha
 * automaticamente; aqui entram filhos, pais etc. — com a opção de não incluir nenhum.
 */
export default function DependentesCampos({ lista, onMudar, erros, comConjuge }: {
  lista: Dependente[] | null; onMudar: (l: Dependente[] | null) => void; erros: Record<string, string>; comConjuge: boolean;
}) {
  const incluir = lista !== null;
  const e = (i: number, k: string) => erros[`dependentes.${i}.${k}`];
  const mudar = (i: number, k: keyof Dependente, v: string) => onMudar((lista ?? []).map((d, j) => (j === i ? { ...d, [k]: v } : d)));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[220px]">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold"><IdCard className="h-4 w-4 text-primary" /> Dependentes (carteirinhas do condomínio)</h2>
          <p className="text-xs text-muted-foreground">
            O titular{comConjuge ? " e o cônjuge já têm" : " já tem"} carteirinha. Inclua até {MAX_DEPENDENTES} dependentes, se o comprador quiser.
          </p>
        </div>
        <div role="radiogroup" aria-label="Incluir dependentes" className="flex gap-1 rounded-lg border border-border p-1">
          {[["Sem dependentes", false], ["Incluir dependentes", true]].map(([r, v]) => (
            <button key={String(v)} type="button" role="radio" aria-checked={incluir === v}
              onClick={() => onMudar(v ? (lista?.length ? lista : [{ ...DEPENDENTE_VAZIO }]) : null)}
              className={`rounded-md px-3 py-1 text-xs ${incluir === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {r as string}
            </button>
          ))}
        </div>
      </div>
      {incluir && (
        <>
          {(lista ?? []).map((d, i) => (
            <div key={i} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <Campo rotulo={`Dependente ${i + 1} — nome completo`} erro={e(i, "nome")}><input className={classeCampo(e(i, "nome"))} value={d.nome} onChange={x => mudar(i, "nome", x.target.value)} /></Campo>
              <Campo rotulo="Parentesco" erro={e(i, "parentesco")}>
                <select className={sel} value={d.parentesco} onChange={x => mudar(i, "parentesco", x.target.value)}>
                  <option value="">Escolha…</option>{PARENTESCOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Nascimento" erro={e(i, "nascimento")}><input type="date" className={classeCampo(e(i, "nascimento"))} value={d.nascimento} onChange={x => mudar(i, "nascimento", x.target.value)} /></Campo>
              <Campo rotulo="CPF (opcional)" erro={e(i, "cpf")}><InputMascara valor={d.cpf ?? ""} mascara={maskCPF} onMudar={v => mudar(i, "cpf", v)} inputMode="numeric" placeholder="000.000.000-00" erro={e(i, "cpf")} /></Campo>
              <div className="flex items-end">
                <Button type="button" variant="ghost" className="h-9 px-2 text-red-400" title="Remover dependente"
                  onClick={() => { const l = (lista ?? []).filter((_, j) => j !== i); onMudar(l.length ? l : null); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {(lista?.length ?? 0) < MAX_DEPENDENTES && (
            <Button type="button" variant="outline" size="sm" onClick={() => onMudar([...(lista ?? []), { ...DEPENDENTE_VAZIO }])}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar dependente ({lista?.length ?? 0}/{MAX_DEPENDENTES})
            </Button>
          )}
        </>
      )}
    </div>
  );
}
