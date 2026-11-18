import { useState } from "react";
import { toast } from "sonner";
import { Ban, Copy, ExternalLink, Link2, MessageCircle, Share2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { Button } from "@/components/ui/button";

/**
 * Materiais › link para parceiros de marketing (só o administrador): uma página pública, sem login, com os materiais
 * liberados para baixar um a um ou tudo num ZIP. Validade de 7, 30 ou 90 dias; "Revogar" derruba todos os links já enviados.
 */
const copiar = async (texto: string, rotulo: string) => {
  try { await navigator.clipboard.writeText(texto); toast.success(`${rotulo} copiado`); } catch { window.prompt("Copie:", texto); }
};

const campo = "h-10 rounded-md border border-border bg-background px-2 text-sm";

export default function LinkMateriaisParceiros() {
  const { user } = useAuth();
  const ehAdmin = perfilDe(user as any) === "admin";
  const [aberto, setAberto] = useState(false);
  const [slug, setSlug] = useState<string>("");
  const [dias, setDias] = useState(30);
  const [link, setLink] = useState<{ url: string; expiraEm: string } | null>(null);
  const opcoes = trpc.materiais.parceirosOpcoes.useQuery(undefined, { enabled: ehAdmin && aberto });
  const gerar = trpc.materiais.gerarLinkParceiros.useMutation({
    onSuccess: r => { setLink(r); copiar(r.url, "Link"); },
    onError: e => toast.error(e.message),
  });
  const revogar = trpc.materiais.revogarLinksParceiros.useMutation({
    onSuccess: () => { setLink(null); toast.success("Links anteriores revogados: não abrem mais"); },
    onError: e => toast.error(e.message),
  });
  if (!ehAdmin) return null;

  const nomeEmp = opcoes.data?.empreendimentos.find(e => e.slug === slug)?.nome;
  const validoAte = link ? new Date(link.expiraEm).toLocaleDateString("pt-BR") : "";
  const texto = link ? `Olá! Segue o link com os materiais de divulgação${nomeEmp ? ` do ${nomeEmp}` : " da Romatec"} para baixar (peça por peça ou tudo num ZIP). Válido até ${validoAte}.\n\n${link.url}` : "";

  return (
    <section className="mb-4 rounded-2xl border border-[var(--rt-green)] bg-[var(--rt-surface)] p-4" aria-labelledby="link-parceiros">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="link-parceiros" className="font-semibold text-[var(--rt-text)]">Link para parceiros de marketing</h2>
          <p className="text-xs text-[var(--rt-text-2)]">Página sem login com os materiais liberados, para baixar um a um ou tudo num ZIP. Peças "não divulgar" ficam de fora.</p>
        </div>
        {!aberto && <Button size="sm" onClick={() => setAberto(true)}><Link2 className="mr-1.5 h-4 w-4" /> Gerar link</Button>}
      </div>

      {aberto && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-[var(--rt-text-2)]">Materiais
              <select className={campo} value={slug} onChange={e => { setSlug(e.target.value); setLink(null); }}>
                <option value="">Todos{opcoes.data ? ` (${opcoes.data.total})` : ""}</option>
                {opcoes.data?.empreendimentos.map(e => <option key={e.slug} value={e.slug}>{e.nome} ({e.total})</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--rt-text-2)]">Validade
              <select className={campo} value={dias} onChange={e => { setDias(Number(e.target.value)); setLink(null); }}>
                {(opcoes.data?.validades ?? [7, 30, 90]).map(d => <option key={d} value={d}>{d} dias</option>)}
              </select>
            </label>
            <Button disabled={gerar.isPending} onClick={() => gerar.mutate({ slug: slug || null, dias })}>
              <Link2 className="mr-1.5 h-4 w-4" /> {gerar.isPending ? "Gerando…" : "Gerar e copiar"}
            </Button>
            <Button variant="ghost" onClick={() => { setAberto(false); setLink(null); }}>Fechar</Button>
          </div>

          {link && (
            <div className="space-y-2 rounded-xl border border-[var(--rt-green)] bg-[var(--rt-bg)] p-3">
              <p className="break-all font-mono text-xs text-[var(--rt-text)]">{link.url}</p>
              <p className="text-xs text-[var(--rt-text-2)]">Válido até {validoAte}.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="bg-ok-600 text-white hover:bg-ok-700" asChild>
                  <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer"><MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Enviar no WhatsApp</a>
                </Button>
                <Button size="sm" variant="outline" onClick={() => copiar(link.url, "Link")}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar link</Button>
                <Button size="sm" variant="outline" onClick={() => copiar(texto, "Texto com o link")}><Share2 className="mr-1.5 h-3.5 w-3.5" /> Copiar texto</Button>
                <Button size="sm" variant="ghost" asChild>
                  <a href={link.url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Ver como o parceiro</a>
                </Button>
              </div>
            </div>
          )}

          <Button size="sm" variant="outline" disabled={revogar.isPending}
            onClick={() => { if (confirm("Revogar todos os links de materiais já enviados a parceiros? Eles deixam de abrir na hora; os próximos links saem novos.")) revogar.mutate(); }}>
            <Ban className="mr-1.5 h-4 w-4" /> Revogar links já enviados
          </Button>
        </div>
      )}
    </section>
  );
}
