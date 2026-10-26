import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import MapaTematico from "@/components/empreendimento/MapaTematico";
import PainelLote, { type LotePainel } from "@/components/empreendimento/PainelLote";
import { linkEmpreendimento, linkKml } from "@shared/chacaraLink";
import { comRef, useCartaoVendas } from "@/lib/cartaoVendas";
import { linkAgendamento } from "@/components/LinkAgendamento";
import { COR_SITUACAO, ROTULO_SITUACAO, SITUACOES_LOTE } from "@shared/lotes";
import { CalendarDays, Calculator, FileSignature, FileText, Flame, FolderOpen, Globe2, Link2, Lock, Map as MapIcon, UserPlus } from "lucide-react";

const copiar = async (texto: string, rotulo: string) => {
  try { await navigator.clipboard.writeText(texto); toast.success(`${rotulo} copiado`); }
  catch { window.prompt("Copie o link:", texto); }
};
const CHAVE_EMP = "painelCorretor.emp";

/**
 * Painel do corretor (página inicial): o mapa do empreendimento em que ele está habilitado e os atalhos do dia a dia
 * (leads, contrato, simulador, materiais e links de divulgação/agendamento). Sem estatísticas — essas ficam com o escritório.
 * O servidor confere cada acesso (shared/permissoes.ts); aqui só mostra o que está liberado.
 */
export default function PainelCorretor() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { data: minhas } = trpc.permissoes.minhas.useQuery();
  const m = minhas?.modulos ?? {};
  const { data: emps } = trpc.empreendimentosAdmin.lista.useQuery(undefined, { enabled: !!m.empreendimentos });
  const meus = useMemo(() => (emps ?? []).filter(e => e.acesso), [emps]);
  const [slug, setSlug] = useState<string>(() => { try { return localStorage.getItem(CHAVE_EMP) ?? ""; } catch { return ""; } });
  useEffect(() => {
    if (meus.length && !meus.some(e => e.slug === slug)) setSlug(meus[0].slug);
  }, [meus, slug]);
  useEffect(() => { if (slug) try { localStorage.setItem(CHAVE_EMP, slug); } catch { /* sem armazenamento */ } }, [slug]);

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.empreendimentosAdmin.detalhe.useQuery({ slug }, { enabled: !!slug });
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => setSel(null), [slug]);
  const lotes = (data?.lotes ?? []) as (LotePainel & { poligono: [number, number][] | null })[];
  const selecionado = useMemo(() => lotes.find(l => l.id === sel) ?? null, [lotes, sel]);
  const origem = window.location.origin;
  const { ref } = useCartaoVendas();
  const emp = meus.find(e => e.slug === slug);

  const atalhos = [
    { rotulo: "Leads", icone: Flame, acao: () => navigate("/leads"), ok: m.leads },
    { rotulo: "Novo contrato", icone: FileSignature, acao: () => navigate(`/contratos/novo?slug=${slug}`), ok: m.contratos && !!slug },
    { rotulo: "Meus contratos", icone: FileText, acao: () => navigate("/contratos"), ok: m.contratos },
    { rotulo: "Simulador", icone: Calculator, acao: () => navigate(`/empreendimentos/${slug}`), ok: m.simulador && !!slug },
    { rotulo: "Agenda de visitas", icone: CalendarDays, acao: () => navigate("/leads/agenda"), ok: m.leads },
    { rotulo: "Materiais", icone: FolderOpen, acao: () => navigate("/materiais"), ok: m.materiais },
    { rotulo: "Novo cliente", icone: UserPlus, acao: () => navigate("/contacts"), ok: m.contatos },
  ].filter(a => a.ok);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-4 pb-10 pt-4 md:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary"><MapIcon className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold leading-tight">Olá, {String(user?.name || "").split(" ")[0] || "corretor"}</p>
          <p className="text-xs text-muted-foreground">{emp ? `${emp.nome} · ${[emp.municipio, emp.uf].filter(Boolean).join("/")} · ${emp.disponiveis} disponíveis de ${emp.totalLotes}` : "Seu empreendimento"}</p>
        </div>
        {meus.length > 1 && (
          <select value={slug} onChange={e => setSlug(e.target.value)} className="h-9 rounded-md border border-border bg-secondary px-2 text-sm">
            {meus.map(e => <option key={e.slug} value={e.slug}>{e.nome}</option>)}
          </select>
        )}
      </div>

      {atalhos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {atalhos.map(a => (
            <button key={a.rotulo} type="button" onClick={a.acao} className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-3 text-xs font-medium transition hover:border-primary/60 hover:bg-secondary/40">
              <a.icone className="h-5 w-5 text-primary" />{a.rotulo}
            </button>
          ))}
        </div>
      )}

      {emp && m.materiais && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card p-3">
          <span className="mr-1 text-xs font-semibold text-muted-foreground">Links para o cliente:</span>
          {emp.slug === "bom-jardims" ? <>
            <Button size="sm" variant="outline" onClick={() => copiar(comRef(linkEmpreendimento(origem), ref), "Link do empreendimento")}><Link2 className="mr-1 h-3.5 w-3.5" /> Divulgação</Button>
            <Button size="sm" variant="outline" onClick={() => copiar(linkAgendamento(emp.slug, ref), "Link de agendamento")}><Link2 className="mr-1 h-3.5 w-3.5" /> Agendamento</Button>
            <Button asChild size="sm" variant="outline"><a href={linkKml(origem)} download><Globe2 className="mr-1 h-3.5 w-3.5" /> KML</a></Button>
          </> : <Button size="sm" variant="outline" onClick={() => copiar(linkAgendamento(emp.slug, ref), "Link de agendamento")}><Link2 className="mr-1 h-3.5 w-3.5" /> Agendamento</Button>}
          <Button size="sm" variant="outline" onClick={() => navigate(`/empreendimentos/${emp.slug}/folder`)}><FileText className="mr-1 h-3.5 w-3.5" /> Folder</Button>
        </div>
      )}

      {!m.empreendimentos || (emps && !meus.length) ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" /> Nenhum empreendimento liberado para você ainda. Peça ao administrador para habilitar o seu empreendimento.
        </div>
      ) : isLoading || !data ? (
        <p className="text-sm text-muted-foreground">Carregando o mapa…</p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-2">
            <MapaTematico slug={slug} lotes={lotes} ruas={data.ruas} perimetro={data.perimetro?.poligono} selecionado={sel} onSelecionar={setSel} />
            <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              {SITUACOES_LOTE.map(s => <span key={s} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_SITUACAO[s] }} />{ROTULO_SITUACAO[s]} ({data.resumo[s]})</span>)}
            </div>
          </div>
          {selecionado ? (
            <div className="space-y-2">
              {selecionado.situacao === "disponivel" && m.contratos && (
                <Button className="w-full" onClick={() => navigate(`/contratos/novo?slug=${slug}&lote=${selecionado.codigo}`)}>
                  <FileSignature className="mr-1.5 h-4 w-4" /> Fazer contrato da {selecionado.codigo}
                </Button>
              )}
              <PainelLote slug={slug} lote={selecionado} onMudou={() => utils.empreendimentosAdmin.detalhe.invalidate({ slug })} onFechar={() => setSel(null)} />
            </div>
          ) : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Clique numa chácara no mapa para ver a situação, o valor e fazer o contrato.</p>}
        </div>
      )}
    </div>
  );
}
