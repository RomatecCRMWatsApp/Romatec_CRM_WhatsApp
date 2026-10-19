import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";

const TEXTO: Record<string, string> = {
  parada: "parou de rodar",
  falhando: "está dando erro",
  sem_envio: "não está conseguindo enviar pelo WhatsApp",
};

/** Faixa no topo quando o follow-up ou o alerta de atendimento estão com problema */
export default function AvisoRotinas() {
  const { user } = useAuth();
  const perfil = perfilDe(user as any);
  const { data } = trpc.crm.saudeRotinas.useQuery(undefined, {
    enabled: !!perfil && perfil !== "empreendedor",
    refetchInterval: 5 * 60_000,
    retry: false,
  });
  if (!data || data.ok) return null;
  const problemas = data.rotinas.filter(r => r.situacao !== "ok");
  return (
    <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
      {problemas.map(r => (
        <p key={r.nome}>
          🛑 <strong>{r.rotulo}</strong> {TEXTO[r.situacao] ?? r.situacao}
          {r.ultimoSucesso && ` · último funcionamento ${new Date(r.ultimoSucesso).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
          {r.ultimoErro && <span className="text-red-300/80"> · {r.ultimoErro}</span>}
        </p>
      ))}
    </div>
  );
}
