/**
 * Cabeçalho padrão das telas internas (dentro do menu lateral): título,
 * subtítulo, ícone e ações à direita — sem faixa colorida nem "voltar"
 * (o menu já leva a qualquer tela).
 */
export default function PageHeader({ titulo, subtitulo, icone: Icone, acoes, voltar }: {
  titulo: string;
  subtitulo?: React.ReactNode;
  icone?: React.ComponentType<{ className?: string }>;
  acoes?: React.ReactNode;
  /** Só para telas de detalhe (ex.: um lead): volta para a lista */
  voltar?: { rotulo: string; onClick: () => void };
}) {
  return (
    <div className="px-4 md:px-6 pt-5 pb-4 max-w-[1500px] mx-auto w-full">
      {voltar && (
        <button onClick={voltar.onClick} className="mb-2 text-xs text-muted-foreground hover:text-primary">← {voltar.rotulo}</button>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {Icone && (
            <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/15 text-primary flex items-center justify-center"><Icone className="h-5 w-5" /></div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-semibold text-[var(--rt-gold-light)] leading-tight truncate" style={{ fontFamily: "var(--rt-font-title)" }}>{titulo}</h1>
            {subtitulo && <p className="text-xs md:text-sm text-muted-foreground mt-0.5">{subtitulo}</p>}
          </div>
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
    </div>
  );
}
