import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { CalendarDays, Camera, ChevronRight, Filter, Headset, Plus, Users, Zap, type LucideIcon } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { daEquipe, perfilDe } from "@shared/equipe";
import { menuDoPerfil } from "@/components/AppShell";

interface Atalho { rota: string; titulo: string; texto: string; icone: LucideIcon }

const ATALHOS: Atalho[] = [
  { rota: "/leads/atender", titulo: "Atender agora", texto: "Responda seus leads e continue as conversas.", icone: Zap },
  { rota: "/leads", titulo: "Leads", texto: "Veja e organize todos os seus leads.", icone: Users },
  { rota: "/leads/funil", titulo: "Funil", texto: "Acompanhe cada etapa da negociação.", icone: Filter },
  { rota: "/leads/agenda", titulo: "Agenda de visitas", texto: "Visitas marcadas e próximos compromissos.", icone: CalendarDays },
];

const INTERVALO_FOTO_MS = 4500;
const MAX_FOTOS = 12;
const EXT_IMAGEM = /\.(jpe?g|png|webp|avif)(\?|$)/i;

function useRotasPermitidas(): Set<string> {
  const { user } = useAuth();
  const perfil = perfilDe(user as any);
  const { data: minhas } = trpc.permissoes.minhas.useQuery(undefined, { enabled: daEquipe(perfil), staleTime: 60_000 });
  return useMemo(() => new Set(menuDoPerfil(perfil, minhas?.modulos).flatMap(g => g.itens.map(i => i.rota))), [perfil, minhas?.modulos]);
}

/** Fotos já publicadas em Materiais (renders, feed, cards): só para dar vida ao card, nunca entram num relatório. */
function useFotosMateriais(ativo: boolean): string[] {
  const { data } = trpc.materiais.list.useQuery(undefined, { enabled: ativo, staleTime: 5 * 60_000 });
  return useMemo(() => {
    // As últimas enviadas primeiro (a lista vem agrupada por empreendimento e tipo)
    const itens = (data?.grupos ?? []).flatMap(g => g.itens as any[]);
    return itens
      .filter(m => ((m.mime && String(m.mime).startsWith("image/")) || (!m.mime && EXT_IMAGEM.test(m.url))) && m.tipo !== "video" && m.tipo !== "mapa")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id - a.id)
      .slice(0, MAX_FOTOS)
      .map(m => m.url as string);
  }, [data]);
}

function useSemMovimento(): boolean {
  const [reduzir, setReduzir] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const ouvir = () => setReduzir(mq.matches);
    mq.addEventListener("change", ouvir);
    return () => mq.removeEventListener("change", ouvir);
  }, []);
  return reduzir;
}

function CaixaIcone({ icone: Icone }: { icone: LucideIcon }) {
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--rt-green)] ring-1 ring-[var(--rt-gold)]/25">
      <Icone className="h-5 w-5 text-[var(--rt-gold-light)]" aria-hidden />
    </span>
  );
}

function FotosAlternando({ fotos }: { fotos: string[] }) {
  const semMovimento = useSemMovimento();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (semMovimento || fotos.length < 2) return;
    const id = window.setInterval(() => setI(n => (n + 1) % fotos.length), INTERVALO_FOTO_MS);
    return () => window.clearInterval(id);
  }, [fotos.length, semMovimento]);

  if (!fotos.length) {
    return (
      <div className="grid h-full w-full place-items-center bg-[var(--rt-green)]">
        <Camera className="h-10 w-10 text-[var(--rt-gold-light)]" aria-hidden />
      </div>
    );
  }
  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--rt-green)]" aria-hidden>
      {fotos.map((url, n) => (
        <img
          key={url}
          src={url}
          alt=""
          loading={n === 0 ? "eager" : "lazy"}
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${n === i ? "opacity-100" : "opacity-0"}`}
        />
      ))}
    </div>
  );
}

export function AtalhosPainel() {
  const [, navigate] = useLocation();
  const permitidas = useRotasPermitidas();
  const atalhos = ATALHOS.filter(a => permitidas.has(a.rota));
  const podeRelatorios = permitidas.has("/relatorios-fotograficos");
  const podeMateriais = permitidas.has("/materiais");
  const fotos = useFotosMateriais(podeRelatorios && podeMateriais);

  const cartao = "group rounded-2xl border border-[var(--rt-green)] bg-[var(--rt-surface)] text-left transition-colors hover:border-[var(--rt-gold)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rt-gold)]";

  return (
    <div className="space-y-4">
      {atalhos.length > 0 && (
        <nav aria-label="Atalhos" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {atalhos.map(a => (
            <button key={a.rota} type="button" onClick={() => navigate(a.rota)} className={`${cartao} flex min-h-[132px] flex-col gap-3 p-4`}>
              <div className="flex items-start justify-between gap-2">
                <CaixaIcone icone={a.icone} />
                <ChevronRight className="h-4 w-4 text-[var(--rt-gold)] transition-transform group-hover:translate-x-0.5" aria-hidden />
              </div>
              <div>
                <p className="font-semibold text-[var(--rt-text)]">{a.titulo}</p>
                <p className="mt-1 text-xs leading-snug text-[var(--rt-text-2)]">{a.texto}</p>
              </div>
            </button>
          ))}
        </nav>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {podeRelatorios && (
          <section className={`${cartao} flex overflow-hidden`} aria-labelledby="painel-relatorios">
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-4 p-4">
              <div className="flex items-start gap-3">
                <CaixaIcone icone={Camera} />
                <div className="min-w-0">
                  <h2 id="painel-relatorios" className="font-semibold text-[var(--rt-text)]">Relatórios fotográficos</h2>
                  <p className="mt-1 text-xs text-[var(--rt-text-2)]">Registre as atividades em fotos.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => navigate("/relatorios-fotograficos/novo")}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[var(--rt-gold)] px-4 text-sm font-semibold text-[var(--rt-bg)] transition-colors hover:bg-[var(--rt-gold-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rt-gold-light)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--rt-bg)]">
                  <Plus className="h-4 w-4" aria-hidden />Novo relatório
                </button>
                <button type="button" onClick={() => navigate("/relatorios-fotograficos")}
                  className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-[var(--rt-gold-light)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rt-gold)]">
                  Ver relatórios
                </button>
              </div>
            </div>
            <div className="w-[38%] min-w-[120px] max-w-[260px] shrink-0">
              <FotosAlternando fotos={fotos} />
            </div>
          </section>
        )}

        <button type="button" onClick={() => navigate("/ajuda")} className={`${cartao} flex items-center gap-3 p-4`}>
          <CaixaIcone icone={Headset} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-[var(--rt-text)]">Central de suporte</span>
            <span className="mt-1 block text-xs text-[var(--rt-text-2)]">Dúvidas? Conte com nosso time.</span>
          </span>
          <ChevronRight className="h-4 w-4 text-[var(--rt-gold)]" aria-hidden />
        </button>
      </div>
    </div>
  );
}
