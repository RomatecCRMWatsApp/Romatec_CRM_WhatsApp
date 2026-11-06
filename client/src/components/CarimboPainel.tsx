import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Stamp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LIMITES_CARIMBO } from "@shared/carimbo";
import { formatarTelefone, normalizarInstagram } from "@shared/cartaoVendas";
import { useCartaoVendas } from "@/lib/cartaoVendas";
import PreviaCarimbo from "@/components/PreviaCarimbo";

type Campos = { nome: string; telefone: string; instagram: string; email: string };
const vazio: Campos = { nome: "", telefone: "", instagram: "", email: "" };

/**
 * Materiais › Meu carimbo: cada usuário salva UMA vez o nome, WhatsApp, Instagram e e-mail que saem na faixa
 * de todas as imagens, vídeos e PDFs que ele baixa ou compartilha (shared/carimbo.ts). O CRECI vem do cadastro.
 */
export default function CarimboPainel() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.materiais.meuCarimbo.useQuery();
  const [f, setF] = useState<Campos>(vazio);
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (!data) return;
    const c = data.carimbo;
    setF({ nome: c.nome ?? "", telefone: c.telefone ?? "", instagram: c.instagram ? `@${c.instagram}` : "", email: c.email ?? "" });
    if (!data.salvo) setAberto(true);
  }, [data]);
  const salvar = trpc.materiais.salvarCarimbo.useMutation({
    onSuccess: () => { toast.success("Carimbo salvo: todas as mídias saem com estes dados"); utils.materiais.meuCarimbo.invalidate(); setAberto(false); },
    onError: e => toast.error(e.message),
  });
  const cartao = useCartaoVendas();
  const link = `${window.location.origin}/bom-jardims${cartao.ref ? `?c=${encodeURIComponent(cartao.ref)}` : ""}`;
  // Prévia ao vivo: o que está digitado agora (aberto) ou o que está salvo (fechado)
  const fonteDados = aberto ? f : data ? { nome: data.carimbo.nome ?? "", telefone: data.carimbo.telefone ?? "", instagram: data.carimbo.instagram ?? "", email: data.carimbo.email ?? "" } : f;
  const tel = formatarTelefone(fonteDados.telefone) ?? fonteDados.telefone.trim();
  const ig = normalizarInstagram(fonteDados.instagram);
  const linhas = {
    nome: `${fonteDados.nome.trim() || "Seu nome"}${data?.creci ? ` · ${data.creci}` : ""}`,
    detalhe: [tel ? `WhatsApp ${tel}` : null, ig ? `@${ig}` : null].filter(Boolean).join("  ·  "),
    email: fonteDados.email.trim() || null,
  };
  const set = (k: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const resumo = data ? [data.carimbo.nome, data.creci, data.carimbo.telefone, data.carimbo.instagram && `@${data.carimbo.instagram}`, data.carimbo.email].filter(Boolean).join(" · ") : "";

  return (
    <section className="rounded-lg border border-warn-500/40 bg-warn-500/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Stamp className="h-4 w-4 text-warn-400" />
        <h2 className="text-sm font-semibold text-foreground">Meu carimbo</h2>
        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : (
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={resumo}>
            {data?.salvo ? resumo : "Ainda não salvo: as mídias saem com os dados do seu cadastro"}
          </span>
        )}
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setAberto(!aberto)}>{aberto ? "Fechar" : "Editar"}</Button>
      </div>
      {!aberto && data && <div className="mt-2 max-w-xl"><PreviaCarimbo linhas={linhas} link={link} /></div>}
      {aberto && (
        <form className="mt-3 space-y-2" onSubmit={e => { e.preventDefault(); salvar.mutate({ nome: f.nome, telefone: f.telefone || null, instagram: f.instagram || null, email: f.email || null }); }}>
          <p className="text-xs text-muted-foreground">Preencha uma vez e salve: é isso que vai na faixa de <b>todas</b> as imagens, vídeos e PDFs que você baixar ou enviar. Deixe em branco o que não quiser mostrar.</p>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-[11px] text-muted-foreground">Nome no carimbo
              <Input id="carimbo-nome" value={f.nome} onChange={set("nome")} maxLength={LIMITES_CARIMBO.nome} required placeholder="Seu nome" />
            </label>
            <label className="space-y-1 text-[11px] text-muted-foreground">WhatsApp
              <Input id="carimbo-telefone" value={f.telefone} onChange={set("telefone")} inputMode="tel" placeholder="(99) 9 9999-9999" />
            </label>
            <label className="space-y-1 text-[11px] text-muted-foreground">Instagram
              <Input id="carimbo-instagram" value={f.instagram} onChange={set("instagram")} placeholder="@seuinstagram" />
            </label>
            <label className="space-y-1 text-[11px] text-muted-foreground">E-mail
              <Input id="carimbo-email" type="email" value={f.email} onChange={set("email")} maxLength={LIMITES_CARIMBO.email} placeholder="voce@email.com" />
            </label>
          </div>
          <PreviaCarimbo linhas={linhas} link={link} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={salvar.isPending} className="bg-warn-500 text-black hover:bg-warn-400">
              {salvar.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />} Salvar carimbo
            </Button>
            <span className="text-[11px] text-muted-foreground">{data?.creci ? <>O <b>{data.creci}</b> entra automático (vem do seu cadastro).</> : "Sem CRECI no cadastro: ele não aparece no carimbo."}</span>
          </div>
        </form>
      )}
    </section>
  );
}
