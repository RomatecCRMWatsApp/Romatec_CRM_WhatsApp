import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { linkEmpreendimento, linkKml } from "@shared/chacaraLink";
import { comRef, useCartaoVendas } from "@/lib/cartaoVendas";
import { linkAgendamento } from "@/components/LinkAgendamento";
import { brl } from "@shared/simulador";
import { Building2, Calculator, Globe2, Link2, Lock, Map as MapIcon, Plus, Smartphone, Wallet } from "lucide-react";

const copiar = async (texto: string, rotulo: string) => {
  try { await navigator.clipboard.writeText(texto); toast.success(`${rotulo} copiado`); }
  catch { window.prompt("Copie o link:", texto); }
};

function Secao({ titulo, icone: Icone, children }: { titulo: string; icone: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 font-semibold"><Icone className="h-4 w-4 text-primary" /> {titulo}</p>
      {children}
    </section>
  );
}

/**
 * Área do corretor (PWA no celular): empreendimentos e imóveis com o acesso marcado, links de
 * divulgação, atalhos de cadastro e o resumo do financeiro com a comissão dele. O servidor confere
 * cada acesso de novo (shared/permissoes.ts); aqui só esconde o que não está liberado.
 */
export default function AreaCorretor() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { data: minhas } = trpc.permissoes.minhas.useQuery();
  const m = minhas?.modulos ?? {};
  const { data: emps } = trpc.empreendimentosAdmin.lista.useQuery(undefined, { enabled: !!m.empreendimentos });
  const { data: imoveis } = trpc.properties.list.useQuery(undefined, { enabled: !!m.imoveis });
  const { data: fin } = trpc.financeiro.vendas.useQuery(undefined, { enabled: !!m.financeiro });
  const admin = minhas?.perfil === "admin";
  const habilitado = (id: number) => admin || (minhas?.imoveis ?? []).includes(id);
  const origem = window.location.origin;
  const { ref } = useCartaoVendas();

  const cadastros = [
    { rotulo: "Novo lead", rota: "/leads", modulo: "leads" },
    { rotulo: "Novo imóvel", rota: "/properties", modulo: "imoveis" },
    { rotulo: "Novo cliente", rota: "/contacts", modulo: "contatos" },
    { rotulo: "Enviar material", rota: "/materiais", modulo: "materiais" },
    { rotulo: "Agendar visita", rota: "/leads/agenda", modulo: "leads" },
  ].filter(c => m[c.modulo]);

  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 pb-10 pt-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary"><Smartphone className="h-5 w-5" /></div>
        <div>
          <p className="text-lg font-bold leading-tight">Olá, {String(user?.name || "").split(" ")[0] || "corretor"}</p>
          <p className="text-xs text-muted-foreground">{(user as any)?.creci ? `CRECI ${(user as any).creci} · ` : ""}Área do corretor — instale pelo menu do navegador ("Adicionar à tela inicial")</p>
        </div>
      </div>

      {m.financeiro && fin && (
        <Secao titulo="Financeiro" icone={Wallet}>
          <p className="text-sm">{admin ? "Vendas registradas" : "Suas comissões"}: <b className="text-primary">{admin ? fin.resumo.quantidade : brl(fin.resumo.minhasComissoes)}</b></p>
          <Button size="sm" variant="outline" onClick={() => navigate("/financeiro")}>Ver vendas e comissão</Button>
        </Secao>
      )}

      {cadastros.length > 0 && (
        <Secao titulo="Cadastrar" icone={Plus}>
          <div className="grid grid-cols-2 gap-2">
            {cadastros.map(c => <Button key={c.rotulo} variant="outline" className="h-11" onClick={() => navigate(c.rota)}>{c.rotulo}</Button>)}
          </div>
        </Secao>
      )}

      {m.empreendimentos && (
        <Secao titulo="Empreendimentos" icone={MapIcon}>
          {(emps ?? []).map(e => (
            <div key={e.slug} className={`rounded-xl border p-3 ${e.acesso ? "border-border" : "border-dashed border-border opacity-60"}`}>
              <div className="flex items-center gap-2">
                <p className="flex-1 font-semibold">{e.nome}</p>
                {!e.acesso && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" /> sem acesso</span>}
              </div>
              <p className="text-xs text-muted-foreground">{[e.municipio, e.uf].filter(Boolean).join("/")} · {e.disponiveis} disponíveis de {e.totalLotes}</p>
              {e.acesso ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" onClick={() => navigate(`/empreendimentos/${e.slug}`)}>Abrir mapa e lotes</Button>
                  {m.simulador && <Button size="sm" variant="outline" onClick={() => navigate(`/empreendimentos/${e.slug}`)}><Calculator className="mr-1 h-3.5 w-3.5" /> Simulador</Button>}
                  {e.slug === "bom-jardims" && <>
                    <Button size="sm" variant="outline" onClick={() => copiar(comRef(linkEmpreendimento(origem), ref), "Link do empreendimento")}><Link2 className="mr-1 h-3.5 w-3.5" /> Link de divulgação</Button>
                    <Button size="sm" variant="outline" onClick={() => copiar(linkAgendamento("bom-jardims", ref), "Link de agendamento")}><Link2 className="mr-1 h-3.5 w-3.5" /> Link de agendamento</Button>
                    <Button asChild size="sm" variant="outline"><a href={linkKml(origem)} download><Globe2 className="mr-1 h-3.5 w-3.5" /> KML</a></Button>
                  </>}
                </div>
              ) : <p className="mt-1 text-[11px] text-muted-foreground">Peça ao administrador para habilitar materiais, cadastro e links deste empreendimento.</p>}
            </div>
          ))}
          {emps && emps.length === 0 && <p className="text-xs text-muted-foreground">Nenhum empreendimento cadastrado.</p>}
        </Secao>
      )}

      {m.imoveis && (
        <Secao titulo="Imóveis" icone={Building2}>
          <div className="max-h-[420px] space-y-1.5 overflow-auto">
            {(imoveis ?? []).map((p: any) => {
              const ok = habilitado(p.id);
              const link = p.codigo ? `${origem}/i/${p.codigo}` : p.publicSlug ? `${origem}/imovel/${p.publicSlug}` : null;
              return (
                <div key={p.id} className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${ok ? "border-border" : "border-dashed border-border opacity-60"}`}>
                  <p className="min-w-0 flex-1 truncate">{p.codigo ? `${p.codigo} — ` : ""}{p.denomination}</p>
                  {ok && link ? <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copiar(link, "Link do imóvel")}><Link2 className="mr-1 h-3 w-3" /> Link</Button>
                    : !ok && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" /> sem acesso</span>}
                </div>
              );
            })}
          </div>
        </Secao>
      )}
    </div>
  );
}
