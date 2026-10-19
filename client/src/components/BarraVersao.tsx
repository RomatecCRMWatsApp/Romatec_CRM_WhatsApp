import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

/** Só nas telas internas; landing, catálogo e portal de links são públicos */
const INTERNAS = ["/dashboard", "/contacts", "/properties", "/campaigns", "/settings", "/performance", "/leads", "/setup", "/materiais", "/equipe", "/empreendedor", "/empreendimentos"];

const FUSO = "America/Fortaleza"; // Maranhão, UTC-3
const dataHora = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Faixa no canto superior esquerdo: data e hora, versão do app e hora do último deploy */
export default function BarraVersao() {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();
  const interna = INTERNAS.some(p => location === p || location.startsWith(`${p}/`));
  // Consulta a versão do servidor a cada minuto (e ao voltar para o app): se saiu deploy novo,
  // a tela aberta ainda está com o código antigo — mostra o botão para atualizar
  const { data } = trpc.system.versao.useQuery(undefined, { enabled: isAuthenticated && interna, refetchInterval: 60_000, refetchOnWindowFocus: true });
  const [agora, setAgora] = useState(() => new Date());
  const carregada = useRef<string | null>(null);
  if (data && carregada.current === null) carregada.current = `${data.commit ?? ""}|${data.deployAt}`;
  const versaoNova = !!data && carregada.current !== null && carregada.current.split("|")[0] !== (data.commit ?? "");

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  if (!isAuthenticated || !interna) return null;

  return (
    <div className={`w-full bg-black/40 border-b border-white/5 text-[11px] text-zinc-400 px-3 py-0.5 flex flex-wrap gap-x-3 gap-y-0 tabular-nums ${location.startsWith("/empreendedor") ? "" : "lg:pl-[17rem]"}`}>
      <span>🕒 {dataHora(agora)}</span>
      {data && (
        <>
          <span title={data.commit ? `commit ${data.commit}` : undefined}>
            v{data.versao}{data.commit ? ` (${data.commit})` : ""}
          </span>
          <span>último deploy: {dataHora(new Date(data.deployAt))}</span>
          {versaoNova && (
            <button onClick={() => window.location.reload()} className="rounded bg-emerald-500/20 px-2 font-semibold text-emerald-300 hover:bg-emerald-500/30">
              🔄 Nova versão no ar — toque para atualizar
            </button>
          )}
        </>
      )}
    </div>
  );
}
