import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Copy, ExternalLink, Search } from "lucide-react";
import { DOUTRINA, TEMAS_LEGISLACAO, buscarDispositivos, citacao, type Dispositivo, type TemaLegislacao } from "@shared/legislacao";

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Fundamento copiado — cole na peça");
  } catch {
    toast.error("Não foi possível copiar: selecione o texto e copie manualmente");
  }
}

function CartaoDispositivo({ d }: { d: Dispositivo }) {
  return (
    <article className="space-y-1.5 rounded-xl border border-border bg-card p-3 text-sm">
      <header className="flex flex-wrap items-baseline gap-x-2">
        <h4 className="font-semibold text-foreground">{d.norma}</h4>
        <span className="text-[#E8B931]">{d.dispositivo}</span>
      </header>
      <p className="text-justify text-xs leading-relaxed text-foreground/85">{d.ementa}</p>
      <p className="text-[11px] text-muted-foreground"><b className="font-medium text-foreground/70">Quando usar:</b> {d.uso}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={() => copiar(citacao(d))}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:border-[#E8B931] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E8B931]">
          <Copy className="h-3.5 w-3.5" /> Copiar fundamento
        </button>
        {d.url && (
          <a href={d.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:border-[#E8B931] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E8B931]">
            <ExternalLink className="h-3.5 w-3.5" /> Texto oficial
          </a>
        )}
      </div>
    </article>
  );
}

/** Biblioteca de legislação, jurisprudência e doutrina por tema, com busca e cópia do fundamento */
export function BibliotecaLegislacao({ temaInicial }: { temaInicial?: TemaLegislacao | null }) {
  const [tema, setTema] = useState<TemaLegislacao | null>(temaInicial ?? "inadimplencia");
  const [termo, setTermo] = useState("");
  const lista = useMemo(() => buscarDispositivos(termo, termo.trim() ? null : tema), [termo, tema]);
  const atual = TEMAS_LEGISLACAO.find(t => t.id === tema);
  const doutrina = DOUTRINA.filter(d => !termo.trim() && d.tema === tema);
  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Buscar na legislação</span>
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <input value={termo} onChange={e => setTermo(e.target.value)} autoComplete="off"
          placeholder="Busque por assunto: mora, restituição, assembleia, benfeitorias, edital, multa…"
          className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E8B931]" />
      </label>
      <div role="tablist" aria-label="Temas" className="flex flex-wrap gap-1.5">
        {TEMAS_LEGISLACAO.map(t => {
          const ativo = !termo.trim() && tema === t.id;
          return (
            <button key={t.id} type="button" role="tab" aria-selected={ativo} onClick={() => { setTema(t.id); setTermo(""); }}
              className={`rounded-full border px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E8B931] ${ativo ? "border-[#E8B931] bg-[#E8B931] font-semibold text-black" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {t.rotulo}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {termo.trim() ? `${lista.length} dispositivo(s) para "${termo.trim()}" em todos os temas.` : atual?.resumo}
      </p>
      {!lista.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nada encontrado. Tente outra palavra.</p>}
      <div className="grid gap-2 lg:grid-cols-2">
        {lista.map(d => <CartaoDispositivo key={d.id} d={d} />)}
      </div>
      {!!doutrina.length && (
        <div className="rounded-xl border border-border bg-card/60 p-3">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-[#E8B931]"><BookOpen className="h-4 w-4" /> Doutrina de referência</h4>
          <ul className="mt-1.5 space-y-0.5 text-xs text-foreground/85">
            {doutrina.map(d => <li key={`${d.autor}-${d.obra}`}><b className="font-medium">{d.autor}</b> — <i>{d.obra}</i></li>)}
          </ul>
        </div>
      )}
      <p className="text-justify text-[11px] text-muted-foreground">
        Os resumos orientam a consulta e a escolha do fundamento; antes de protocolar, confira a redação vigente no texto oficial e a jurisprudência atual do tribunal competente.
      </p>
    </div>
  );
}
