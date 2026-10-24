import { useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronRight, DollarSign, Flame, MapPin, UserPlus } from "lucide-react";
import { Skeleton } from "@/brand";

/** Cores do painel (mesma família do tema: verde-menta, dourado, azul, lilás) */
export const COR = { menta: "#5fd3b4", ouro: "#e7b955", azul: "#5aa9e6", lilas: "#c79ae8", rosa: "#ef8fa6", cinza: "#6b7280" };

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const diasAtras = (n: number) => new Date(Date.now() - 3 * 3600_000 - n * 86400_000).toISOString().slice(0, 10);
const brl = (n?: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Relatório dos últimos 30 dias (1º toque) — base de todos os cards do painel */
export function useRelatorio30() {
  return trpc.crm.relatorio.useQuery({ de: diasAtras(29), ate: hoje(), toque: "primeiro" }, { refetchInterval: 120_000 });
}

export function Cartao({ titulo, acao, className = "", children }: { titulo?: string; acao?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl bg-card border border-border/60 p-4 md:p-5 ${className}`}>
      {(titulo || acao) && (
        <div className="flex items-center justify-between mb-3">
          {titulo && <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>}
          {acao}
        </div>
      )}
      {children}
    </div>
  );
}

/** valor undefined = ainda carregando: esqueleto no lugar do número (nunca mostrar 0 antes do dado) */
function Kpi({ rotulo, valor, sub, icone: Icone, cor, onClick }: { rotulo: string; valor: string | number | undefined; sub?: string; icone: any; cor: string; onClick?: () => void }) {
  const carregando = valor === undefined;
  return (
    <button onClick={onClick} className="rounded-2xl bg-card border border-border/60 p-4 text-left hover:border-primary/40 transition-colors" aria-busy={carregando}>
      <div className="flex items-start justify-between">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: `${cor}22`, color: cor }}><Icone className="h-5 w-5" /></div>
      </div>
      {carregando ? <Skeleton width="55%" height={30} className="mt-3" /> : <p className="text-2xl md:text-3xl font-bold text-foreground mt-3 font-mono">{valor}</p>}
      <p className="text-xs text-muted-foreground mt-0.5">{rotulo}</p>
      {carregando ? <Skeleton width="70%" height={11} className="mt-1.5" /> : sub && <p className="text-[11px] mt-1" style={{ color: cor }}>{sub}</p>}
    </button>
  );
}

export function KpisLeads({ r, leadsHoje }: { r: any; leadsHoje: number | undefined }) {
  const [, navigate] = useLocation();
  const t = r?.total;
  if (!t) {
    return (
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi rotulo="Leads novos hoje" valor={undefined} icone={UserPlus} cor={COR.menta} />
        <Kpi rotulo="Leads quentes (30 dias)" valor={undefined} icone={Flame} cor={COR.rosa} />
        <Kpi rotulo="Querem visitar" valor={undefined} icone={MapPin} cor={COR.ouro} />
        <Kpi rotulo="Custo por lead quente" valor={undefined} icone={DollarSign} cor={COR.azul} />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <Kpi rotulo="Leads novos hoje" valor={leadsHoje} sub={`${t?.leads ?? 0} nos últimos 30 dias`} icone={UserPlus} cor={COR.menta} onClick={() => navigate("/leads")} />
      <Kpi rotulo="Leads quentes (30 dias)" valor={t?.quentes ?? 0} sub={`${pct(t?.quentes ?? 0, t?.leads ?? 0)}% dos leads`} icone={Flame} cor={COR.rosa} onClick={() => navigate("/leads/funil")} />
      <Kpi rotulo="Querem visitar" valor={t?.visitas ?? 0} sub={`${t?.fechados ?? 0} negócio(s) fechado(s)`} icone={MapPin} cor={COR.ouro} onClick={() => navigate("/leads/funil")} />
      <Kpi rotulo="Custo por lead quente" valor={brl(t?.custoPorQuente)} sub={t?.gasto ? `gasto ${brl(t.gasto)}` : "cadastre o gasto nas campanhas"} icone={DollarSign} cor={COR.azul} onClick={() => navigate("/leads/relatorio")} />
    </div>
  );
}

export function GraficoLeadsDia({ r }: { r: any }) {
  const dados = useMemo(() => (r?.porDia ?? []).map((d: any) => ({ ...d, rotulo: `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}` })), [r]);
  const total = dados.reduce((a: number, d: any) => a + d.leads, 0);
  return (
    <Cartao titulo="Leads nos últimos 30 dias" acao={<span className="text-xs text-muted-foreground">{total} lead(s)</span>}>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={dados} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COR.menta} stopOpacity={0.55} />
                <stop offset="100%" stopColor={COR.menta} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: "#9ca3af" }} interval={4} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "#22262b", border: "1px solid #3a3f46", borderRadius: 10, fontSize: 12 }} formatter={(v: any) => [v, "leads"]} labelFormatter={(l: any) => `Dia ${l}`} />
            <Area type="monotone" dataKey="leads" stroke={COR.menta} strokeWidth={2.5} fill="url(#gLeads)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Cartao>
  );
}

export function DonutPagoOrganico({ r }: { r: any }) {
  const cores: Record<string, string> = { organico: COR.menta, pago: COR.azul, outro: COR.ouro };
  const rot: Record<string, string> = { organico: "Orgânico", pago: "Pago (anúncios)", outro: "Portais e outros" };
  const dados = (r?.porTipo ?? []).filter((t: any) => t.leads).map((t: any) => ({ nome: rot[t.tipo] || t.tipo, valor: t.leads, cor: cores[t.tipo] || COR.cinza }));
  const total = dados.reduce((a: number, d: any) => a + d.valor, 0);
  return (
    <Cartao titulo="Orgânico × pago">
      {total === 0 ? <p className="text-sm text-muted-foreground py-16 text-center">Sem leads no período.</p> : (
        <>
          <div className="h-44 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius="68%" outerRadius="92%" paddingAngle={3} stroke="none">
                  {dados.map((d: any, i: number) => <Cell key={i} fill={d.cor} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#22262b", border: "1px solid #3a3f46", borderRadius: 10, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-3xl font-bold text-foreground">{total}</p>
              <p className="text-[10px] text-muted-foreground">leads</p>
            </div>
          </div>
          <div className="space-y-1.5 mt-2">
            {dados.map((d: any) => (
              <div key={d.nome} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-muted-foreground"><span className="h-2.5 w-2.5 rounded-full" style={{ background: d.cor }} />{d.nome}</span>
                <span className="font-semibold text-foreground">{d.valor} · {pct(d.valor, total)}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Cartao>
  );
}

export function TopCampanhas({ r }: { r: any }) {
  const [, navigate] = useLocation();
  const lista = (r?.porCampanha ?? []).filter((c: any) => c.leads || c.cliques || c.scans).slice(0, 5);
  const max = Math.max(1, ...lista.map((c: any) => c.leads));
  const cores = [COR.menta, COR.ouro, COR.azul, COR.lilas, COR.rosa];
  return (
    <Cartao titulo="Top campanhas (30 dias)" acao={<button onClick={() => navigate("/leads/relatorio")} className="text-xs text-primary flex items-center">Relatório <ChevronRight className="h-3.5 w-3.5" /></button>}>
      {lista.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma campanha com movimento. Crie em Campanhas de captação.</p> : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs">
            <thead><tr className="text-muted-foreground"><th className="text-left font-medium px-1 pb-2">#</th><th className="text-left font-medium px-1 pb-2">Campanha</th><th className="text-left font-medium px-1 pb-2 w-1/3">Leads</th><th className="text-right font-medium px-1 pb-2">Quentes</th></tr></thead>
            <tbody>
              {lista.map((c: any, i: number) => (
                <tr key={i} className="border-t border-border/50">
                  <td className="px-1 py-2.5 text-muted-foreground">{String(i + 1).padStart(2, "0")}</td>
                  <td className="px-1 py-2.5"><p className="font-semibold text-foreground truncate max-w-[200px]">{c.campanhaId ? `#${c.codigo}` : c.nome}</p><p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{c.rotuloCanal}</p></td>
                  <td className="px-1 py-2.5"><div className="h-1.5 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(4, (c.leads / max) * 100)}%`, background: cores[i % cores.length] }} /></div></td>
                  <td className="px-1 py-2.5 text-right"><span className="inline-block min-w-[2.5rem] rounded-md border px-1.5 py-0.5 text-center font-semibold" style={{ borderColor: `${cores[i % cores.length]}66`, color: cores[i % cores.length] }}>{c.quentes}/{c.leads}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}

export function LeadsPorCanal({ r }: { r: any }) {
  const lista = (r?.porCanal ?? []).filter((c: any) => c.leads).slice(0, 6);
  const max = Math.max(1, ...lista.map((c: any) => c.leads));
  return (
    <Cartao titulo="Leads por canal">
      {lista.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Sem leads no período.</p> : (
        <div className="space-y-3">
          {lista.map((c: any) => (
            <div key={c.canal}>
              <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground truncate">{c.rotulo}</span><span className="font-semibold text-foreground">{c.leads}</span></div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(c.leads / max) * 100}%`, background: c.tipo === "pago" ? COR.azul : c.tipo === "organico" ? COR.menta : COR.ouro }} /></div>
            </div>
          ))}
        </div>
      )}
    </Cartao>
  );
}

/** Medidor (meia rosca): % de leads com qualificação completa */
export function GaugeQualificacao({ r }: { r: any }) {
  const t = r?.total;
  const valor = pct(t?.completa ?? 0, t?.leads ?? 0);
  const dados = [{ v: valor }, { v: 100 - valor }];
  return (
    <Cartao titulo="Qualificação completa">
      <div className="h-36 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={dados} dataKey="v" startAngle={180} endAngle={0} cy="85%" innerRadius="105%" outerRadius="140%" stroke="none">
              <Cell fill={COR.menta} />
              <Cell fill="rgba(255,255,255,0.07)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-x-0 bottom-2 text-center pointer-events-none">
          <p className="text-3xl font-bold text-foreground">{valor}%</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center mt-1">{t?.completa ?? 0} de {t?.leads ?? 0} leads responderam todas as perguntas</p>
    </Cartao>
  );
}
