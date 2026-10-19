import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { MapPin } from "lucide-react";

/**
 * Relógio digital do Painel: hora:minuto:segundo, data, dia da semana, versão do app
 * e a cidade/estado onde o aparelho está (localização do navegador, com permissão).
 * Sem permissão, mostra a sede (Açailândia — MA).
 */
const SEDE = { cidade: "Açailândia", uf: "MA" };
const CHAVE = "romatec-local-v1";
const SEIS_HORAS = 6 * 3600_000;

const UF: Record<string, string> = {
  Acre: "AC", Alagoas: "AL", Amapá: "AP", Amazonas: "AM", Bahia: "BA", Ceará: "CE", "Distrito Federal": "DF", "Espírito Santo": "ES",
  Goiás: "GO", Maranhão: "MA", "Mato Grosso": "MT", "Mato Grosso do Sul": "MS", "Minas Gerais": "MG", Pará: "PA", Paraíba: "PB",
  Paraná: "PR", Pernambuco: "PE", Piauí: "PI", "Rio de Janeiro": "RJ", "Rio Grande do Norte": "RN", "Rio Grande do Sul": "RS",
  Rondônia: "RO", Roraima: "RR", "Santa Catarina": "SC", "São Paulo": "SP", Sergipe: "SE", Tocantins: "TO",
};

type Local = { cidade: string; uf: string; doAparelho: boolean };

function lerCache(): Local | null {
  try {
    const c = JSON.parse(localStorage.getItem(CHAVE) || "null");
    return c && Date.now() - c.em < SEIS_HORAS ? c.local : null;
  } catch { return null; }
}

function useLocalizacao(): Local {
  const [local, setLocal] = useState<Local>(() => lerCache() ?? { ...SEDE, doAparelho: false });
  useEffect(() => {
    if (lerCache() || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const { latitude, longitude } = pos.coords;
        // Cidade a partir das coordenadas (OpenStreetMap); fica guardada no aparelho por 6 h
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&accept-language=pt-BR&lat=${latitude.toFixed(4)}&lon=${longitude.toFixed(4)}`);
        const j = await r.json();
        const a = j?.address ?? {};
        const cidade = a.city || a.town || a.municipality || a.village || a.county;
        const estado = a.state as string | undefined;
        if (!cidade) return;
        const novo = { cidade, uf: (estado && UF[estado]) || (a["ISO3166-2-lvl4"] || "").replace("BR-", "") || estado || "", doAparelho: true };
        setLocal(novo);
        try { localStorage.setItem(CHAVE, JSON.stringify({ em: Date.now(), local: novo })); } catch { /* sem armazenamento */ }
      } catch { /* sem internet ou serviço fora: fica a sede */ }
    }, () => { /* permissão negada: fica a sede */ }, { maximumAge: SEIS_HORAS, timeout: 15_000 });
  }, []);
  return local;
}

const dois = (n: number) => String(n).padStart(2, "0");

export default function RelogioPainel() {
  const [agora, setAgora] = useState(() => new Date());
  const local = useLocalizacao();
  const { data: versao } = trpc.system.versao.useQuery(undefined, { refetchInterval: 60_000 });

  useEffect(() => {
    // Acerta no início de cada segundo
    let t: ReturnType<typeof setTimeout>;
    const tique = () => { setAgora(new Date()); t = setTimeout(tique, 1000 - (Date.now() % 1000)); };
    t = setTimeout(tique, 1000 - (Date.now() % 1000));
    return () => clearTimeout(t);
  }, []);

  const semana = agora.toLocaleDateString("pt-BR", { weekday: "long" });
  const data = agora.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const mes = agora.toLocaleDateString("pt-BR", { month: "long" });
  const fuso = -agora.getTimezoneOffset() / 60;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-[#0d1f17] via-card to-[#0b1512] p-4 md:p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-x-8 gap-y-3">
        {/* Hora digital */}
        <div className="font-mono tabular-nums leading-none text-emerald-300 [text-shadow:0_0_18px_rgba(62,200,122,0.45)]" aria-live="off">
          <span className="text-5xl md:text-6xl font-bold">{dois(agora.getHours())}:{dois(agora.getMinutes())}</span>
          <span className="text-3xl md:text-4xl font-bold text-emerald-400/80">:{dois(agora.getSeconds())}</span>
        </div>

        {/* Data e dia da semana */}
        <div className="leading-tight">
          <p className="text-lg md:text-xl font-semibold capitalize text-foreground">{semana}</p>
          <p className="font-mono tabular-nums text-base text-foreground/90">{data}</p>
          <p className="text-xs capitalize text-muted-foreground">{mes} · UTC{fuso >= 0 ? "+" : ""}{fuso}</p>
        </div>

        {/* Localização */}
        <div className="leading-tight">
          <p className="flex items-center gap-1.5 text-base md:text-lg font-semibold text-foreground"><MapPin className="h-4 w-4 text-primary" />{local.cidade}{local.uf ? ` — ${local.uf}` : ""}</p>
          <p className="text-xs text-muted-foreground">{local.doAparelho ? "localização do aparelho" : "sede · permita a localização para ver onde você está"}</p>
        </div>

        {/* Versão */}
        {versao && (
          <div className="ml-auto text-right leading-tight">
            <p className="font-mono text-sm text-foreground">v{versao.versao}{versao.commit ? <span className="text-muted-foreground"> · {versao.commit}</span> : null}</p>
            <p className="text-xs text-muted-foreground">deploy {new Date(versao.deployAt).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        )}
      </div>
    </div>
  );
}
