import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

/** Só nas telas internas; landing, catálogo e portal de links são públicos */
const INTERNAS = ["/dashboard", "/contacts", "/properties", "/campaigns", "/settings", "/performance", "/leads", "/setup", "/materiais"];

const FUSO = "America/Fortaleza"; // Maranhão, UTC-3
const dataHora = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Faixa no canto superior esquerdo: data e hora, versão do app e hora do último deploy */
export default function BarraVersao() {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();
  const interna = INTERNAS.some(p => location === p || location.startsWith(`${p}/`));
  const { data } = trpc.system.versao.useQuery(undefined, { enabled: isAuthenticated && interna, staleTime: 5 * 60_000 });
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  if (!isAuthenticated || !interna) return null;

  return (
    <div className="w-full bg-black/60 border-b border-white/5 text-[11px] text-zinc-400 px-3 py-0.5 flex flex-wrap gap-x-3 gap-y-0 tabular-nums">
      <span>🕒 {dataHora(agora)}</span>
      {data && (
        <>
          <span title={data.commit ? `commit ${data.commit}` : undefined}>
            v{data.versao}{data.commit ? ` (${data.commit})` : ""}
          </span>
          <span>último deploy: {dataHora(new Date(data.deployAt))}</span>
        </>
      )}
    </div>
  );
}
