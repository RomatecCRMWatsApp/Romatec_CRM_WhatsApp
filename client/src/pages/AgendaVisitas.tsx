import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { CalendarDays } from "lucide-react";
import { AcoesVisita, COR_STATUS_VISITA, ROTULO_STATUS_VISITA } from "@/components/VisitasLead";

const diaChave = (d: string | Date) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
const diaRotulo = (d: string | Date) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza", weekday: "long", day: "2-digit", month: "long" });
const hora = (d: string | Date) => new Date(d).toLocaleTimeString("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit" });

type Visita = {
  id: number; leadId: number; nome: string; telefone: string; quando: string | Date; local: string | null; status: string;
  imovel: string | null; responsavel: string | null; lembreteEnviado: boolean; confirmadaPeloCliente: boolean; semResultado: boolean;
};

function Linha({ v, onMudou }: { v: Visita; onMudou: () => void }) {
  const [, navigate] = useLocation();
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">{hora(v.quando)}</span>
        <button onClick={() => navigate(`/leads/lead/${v.leadId}`)} className="font-semibold hover:underline">{v.nome}</button>
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${COR_STATUS_VISITA[v.status] ?? ""}`}>{ROTULO_STATUS_VISITA[v.status] ?? v.status}</span>
        {v.confirmadaPeloCliente && <span className="text-[11px] text-emerald-300">confirmou pelo WhatsApp</span>}
        {v.responsavel && <span className="ml-auto text-xs text-muted-foreground">👤 {v.responsavel}</span>}
      </div>
      {(v.imovel || v.local) && <p className="text-xs text-muted-foreground">{[v.imovel, v.local].filter(Boolean).join(" · ")}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {v.telefone && <a href={`https://wa.me/${v.telefone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="text-xs text-emerald-300 hover:underline">💬 WhatsApp</a>}
        <AcoesVisita visita={v} onMudou={onMudou} />
      </div>
    </div>
  );
}

/** Agenda de visitas: próximas visitas por dia e as que ainda estão sem resultado */
export default function AgendaVisitas() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.crm.agenda.useQuery({ diasAtras: 14, diasFrente: 60 });
  const atualizar = () => utils.crm.agenda.invalidate();
  const lista = (data ?? []) as Visita[];
  const pendentes = lista.filter(v => v.semResultado);
  const agora = Date.now();
  const proximas = lista.filter(v => new Date(v.quando).getTime() >= agora - 3600_000 && ["agendada", "confirmada"].includes(v.status));
  const porDia = new Map<string, Visita[]>();
  for (const v of proximas) porDia.set(diaChave(v.quando), [...(porDia.get(diaChave(v.quando)) ?? []), v]);
  const realizadas = lista.filter(v => v.status === "realizada").length;
  const naoVeio = lista.filter(v => v.status === "nao_veio").length;

  return (
    <div>
      <PageHeader icone={CalendarDays} titulo="Agenda de visitas" subtitulo="Próximas visitas, confirmações pelo WhatsApp e resultado de cada uma" />
      <div className="px-4 md:px-6 pb-8 max-w-[1100px] mx-auto space-y-5">
        {error && <p className="text-sm text-red-400">{error.message}</p>}
        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ["Próximas", proximas.length],
            ["Sem resultado", pendentes.length],
            ["Realizadas (14 dias)", realizadas],
            ["Não vieram (14 dias)", naoVeio],
          ].map(([r, n]) => (
            <div key={String(r)} className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">{r}</p>
              <p className="text-2xl font-bold">{n}</p>
            </div>
          ))}
        </div>

        {pendentes.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-amber-300">📝 Marque o resultado ({pendentes.length})</h2>
            {pendentes.map(v => <Linha key={v.id} v={v} onMudou={atualizar} />)}
          </section>
        )}

        {Array.from(porDia.entries()).map(([dia, vs]) => (
          <section key={dia} className="space-y-2">
            <h2 className="text-sm font-semibold capitalize">{diaRotulo(vs[0].quando)}</h2>
            {vs.map(v => <Linha key={v.id} v={v} onMudou={atualizar} />)}
          </section>
        ))}

        {!isLoading && proximas.length === 0 && pendentes.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma visita agendada. Agende pela tela do lead (cartão "Visitas").</p>
        )}
      </div>
    </div>
  );
}
