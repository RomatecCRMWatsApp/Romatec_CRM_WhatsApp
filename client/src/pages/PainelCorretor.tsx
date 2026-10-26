import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { CabecalhoEmpreendimento, Logo, MapaVendas } from "@/components/empreendimento/Vitrine";
import { linkEmpreendimento, linkKml } from "@shared/chacaraLink";
import { comRef, useCartaoVendas } from "@/lib/cartaoVendas";
import { linkAgendamento } from "@/components/LinkAgendamento";
import {
  CalendarDays, Calculator, FileSignature, FileText, Flame, FolderOpen, Globe2, Link2, Lock, Share2, UserPlus,
} from "lucide-react";

const copiar = async (texto: string, rotulo: string) => {
  try { await navigator.clipboard.writeText(texto); toast.success(`${rotulo} copiado`); }
  catch { window.prompt("Copie o link:", texto); }
};
const CHAVE_EMP = "painelCorretor.emp";

type Atalho = { rotulo: string; dica: string; icone: React.ComponentType<{ className?: string }>; cor: string; acao: () => void; destaque?: boolean };

/**
 * Painel do corretor (página inicial): o empreendimento em que ele está habilitado em destaque (logo e portal),
 * o mapa de vendas clicável e os atalhos do dia a dia. Sem estatísticas — essas ficam com o escritório.
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

  const origem = window.location.origin;
  const { ref } = useCartaoVendas();
  const emp = meus.find(e => e.slug === slug);
  const primeiroNome = String(user?.name || "").split(" ")[0] || "corretor";

  const atalhos: Atalho[] = [
    m.contratos && slug ? { rotulo: "Novo contrato", dica: "Reservar uma chácara", icone: FileSignature, cor: "", acao: () => navigate(`/contratos/novo?slug=${slug}`), destaque: true } : null,
    m.leads ? { rotulo: "Leads", dica: "Seus clientes", icone: Flame, cor: "bg-orange-500/15 text-orange-300", acao: () => navigate("/leads") } : null,
    m.leads ? { rotulo: "Agenda", dica: "Visitas marcadas", icone: CalendarDays, cor: "bg-sky-500/15 text-sky-300", acao: () => navigate("/leads/agenda") } : null,
    m.simulador && slug ? { rotulo: "Simulador", dica: "Parcelas", icone: Calculator, cor: "bg-violet-500/15 text-violet-300", acao: () => navigate(`/empreendimentos/${slug}`) } : null,
    m.contratos ? { rotulo: "Contratos", dica: "Seus contratos", icone: FileText, cor: "bg-emerald-500/15 text-emerald-300", acao: () => navigate("/contratos") } : null,
    m.materiais ? { rotulo: "Materiais", dica: "Fotos e vídeos", icone: FolderOpen, cor: "bg-pink-500/15 text-pink-300", acao: () => navigate("/materiais") } : null,
    m.contatos ? { rotulo: "Novo cliente", dica: "Cadastrar contato", icone: UserPlus, cor: "bg-teal-500/15 text-teal-300", acao: () => navigate("/contacts") } : null,
  ].filter(Boolean) as Atalho[];

  const links = emp && m.materiais ? [
    ...(emp.slug === "bom-jardims" ? [{ rotulo: "Página do empreendimento", icone: Globe2, acao: () => copiar(comRef(linkEmpreendimento(origem), ref), "Link do empreendimento") }] : []),
    { rotulo: "Agendar visita", icone: CalendarDays, acao: () => copiar(linkAgendamento(emp.slug, ref), "Link de agendamento") },
    { rotulo: "Folder", icone: FileText, acao: () => navigate(`/empreendimentos/${emp.slug}/folder`) },
  ] : [];

  const semEmpreendimento = !m.empreendimentos || (emps && !meus.length);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-3 pb-10 pt-3 sm:px-4 md:px-6 md:pt-4">
      {/* Abas dos empreendimentos (só aparece com mais de um) */}
      {meus.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Empreendimentos">
          {meus.map(e => (
            <button key={e.slug} role="tab" aria-selected={e.slug === slug} onClick={() => setSlug(e.slug)}
              className={`flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition ${e.slug === slug ? "border-[var(--rt-gold)] bg-[var(--rt-gold)]/15 text-foreground" : "border-border bg-card text-muted-foreground hover:border-[var(--rt-gold)]/50"}`}>
              <Logo slug={e.slug} nome={e.nome} className="h-8 w-12 rounded-full text-xs" />
              <span className="max-w-[180px] truncate font-medium">{e.nome}</span>
            </button>
          ))}
        </div>
      )}

      {/* Cabeçalho: portal de fundo e o logo em destaque */}
      {emp && (
        <CabecalhoEmpreendimento slug={emp.slug} nome={emp.nome} municipio={emp.municipio} uf={emp.uf} disponiveis={emp.disponiveis} nomeUsuario={primeiroNome}
          acao={atalhos[0]?.destaque ? (
            <button onClick={atalhos[0].acao}
              className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--rt-gold)] px-5 py-3 text-sm font-bold text-black shadow-lg shadow-black/40 transition hover:brightness-110 active:scale-[0.98]">
              <FileSignature className="h-5 w-5" /> Novo contrato
            </button>
          ) : null} />
      )}

      {/* Atalhos */}
      {atalhos.length > 1 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6">
          {atalhos.filter(a => !a.destaque).map(a => (
            <button key={a.rotulo} type="button" onClick={a.acao}
              className="group flex items-center gap-2.5 rounded-2xl border border-border bg-card p-2.5 text-left sm:gap-3 sm:p-3 transition hover:-translate-y-0.5 hover:border-[var(--rt-gold)]/50 hover:shadow-lg hover:shadow-black/30 active:scale-[0.98]">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${a.cor}`}><a.icone className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{a.rotulo}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{a.dica}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Links para mandar ao cliente */}
      {links.length > 0 && emp && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2 pl-3">
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Share2 className="h-3.5 w-3.5" /> Para o cliente</span>
          {links.map(l => (
            <button key={l.rotulo} onClick={l.acao} className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition hover:border-[var(--rt-gold)]/60 hover:bg-secondary">
              {l.rotulo === "Folder" ? <l.icone className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />} {l.rotulo}
            </button>
          ))}
          {emp.slug === "bom-jardims" && (
            <a href={linkKml(origem)} download className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition hover:border-[var(--rt-gold)]/60 hover:bg-secondary">
              <Globe2 className="h-3.5 w-3.5" /> Google Earth (KML)
            </a>
          )}
        </div>
      )}

      {/* Mapa de vendas */}
      {semEmpreendimento ? (
        <div className="flex items-center gap-2 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" /> Nenhum empreendimento liberado para você ainda. Peça ao administrador para habilitar o seu empreendimento.
        </div>
      ) : slug ? (
        <MapaVendas slug={slug} ajuda="Veja a situação, as medidas e o link para o cliente, e faça o contrato das disponíveis."
          acimaDoPainel={l => l.situacao === "disponivel" && m.contratos ? (
            <button onClick={() => navigate(`/contratos/novo?slug=${slug}&lote=${l.codigo}`)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--rt-gold)] px-4 py-3 text-sm font-bold text-black shadow-lg shadow-black/30 transition hover:brightness-110 active:scale-[0.98]">
              <FileSignature className="h-4 w-4" /> Fazer contrato da {l.codigo}
            </button>
          ) : null} />
      ) : null}
    </div>
  );
}
