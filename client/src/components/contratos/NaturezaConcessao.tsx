import { Campo, classeCampo } from "@/components/cadastro/campos";

type Natureza = "liberalidade" | "acordo";
const OPCOES: [Natureza, string, string][] = [
  ["liberalidade", "Liberalidade (doação)", "A proprietária dá a unidade sem nada em troca. O beneficiário declara que não é salário, indenização nem pagamento de dívida."],
  ["acordo", "Acordo — a unidade quita uma obrigação", "Ex.: acordo com ex-funcionário. A unidade é dada em pagamento (dação em pagamento) e o beneficiário dá quitação do que for descrito."],
];

/** Natureza da concessão: define o texto do Termo Aditivo e da Declaração de Recebimento e Quitação */
export function NaturezaConcessao({ natureza, acordo, onNatureza, onAcordo, desabilitado }: {
  natureza: Natureza; acordo: string; onNatureza: (n: Natureza) => void; onAcordo: (v: string) => void; desabilitado?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Natureza da concessão">
        {OPCOES.map(([k, t, r]) => (
          <button key={k} type="button" role="radio" aria-checked={natureza === k} disabled={desabilitado} onClick={() => onNatureza(k)}
            className={`rounded-lg border p-3 text-left text-sm transition disabled:opacity-60 ${natureza === k ? "border-primary bg-primary/15 ring-1 ring-primary" : "border-border hover:border-primary/50"}`}>
            <span className="flex items-center gap-2 font-semibold">
              <span className={`inline-block h-3.5 w-3.5 rounded-full border-2 ${natureza === k ? "border-primary bg-primary" : "border-muted-foreground"}`} />{t}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">{r}</span>
          </button>
        ))}
      </div>
      {natureza === "acordo" && (
        <Campo rotulo="O que a unidade quita (vai no Termo e na Declaração de Recebimento e Quitação)">
          <textarea className={`${classeCampo()} min-h-[72px]`} maxLength={800} value={acordo} disabled={desabilitado} onChange={e => onAcordo(e.target.value)}
            placeholder="Ex.: verbas rescisórias e demais valores do acordo de encerramento do contrato de trabalho mantido com a proprietária de 03/2021 a 08/2026" />
        </Campo>
      )}
      <p className="text-xs text-muted-foreground">O beneficiário assina, junto com o contrato, a Declaração de Recebimento e Quitação: confirma que recebeu a unidade pelo valor de referência e{natureza === "acordo" ? " dá quitação do acordo descrito" : " que a concessão é liberalidade"}.</p>
    </div>
  );
}
