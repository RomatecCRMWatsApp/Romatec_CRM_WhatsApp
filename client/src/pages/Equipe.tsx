import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Copy, KeyRound, MessageCircle, Plus, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import { ROTULO_PERFIL } from "@shared/equipe";
import PageHeader from "@/components/PageHeader";
import PermissoesCorretor, { PacoteBase } from "@/components/equipe/PermissoesCorretor";

const vazio = { nome: "", email: "", creci: "", telefone: "", perfil: "equipe" as "equipe" | "empreendedor", empreendimentoSlug: "" };

const dataHora = (d?: string | Date | null) =>
  d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/** Mensagem pronta para mandar o link de primeiro acesso pelo WhatsApp */
function mensagemConvite(nome: string, link: string, login: string) {
  const primeiro = nome.trim().split(/\s+/)[0] || "";
  return [
    `Olá${primeiro ? `, ${primeiro}` : ""}! Seu acesso ao *Romatec CRM* está pronto.`,
    "",
    `1️⃣ Abra o link e crie sua senha (vale por 7 dias):`,
    link,
    "",
    `2️⃣ Depois, entre em romateccrm.com/login com *${login}* e a senha que você criou.`,
    "",
    "Dica: no celular, use \"Adicionar à tela inicial\" para instalar o app.",
  ].join("\n");
}

function ConviteGerado({ nome, link, login, telefone, onFechar }: { nome: string; link: string; login: string; telefone?: string | null; onFechar: () => void }) {
  const msg = mensagemConvite(nome, link, login);
  const fone = (telefone || "").replace(/\D/g, "");
  const copiar = async (t: string, r: string) => {
    try { await navigator.clipboard.writeText(t); toast.success(`${r} copiado`); } catch { toast.error("Não foi possível copiar"); }
  };
  return (
    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-2">
      <p className="text-sm text-foreground font-medium">Link de primeiro acesso de {nome}</p>
      <p className="text-xs text-muted-foreground break-all">{link}</p>
      <p className="text-[11px] text-amber-300">O link só aparece agora. Se perder, gere outro (o anterior deixa de valer).</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => copiar(msg, "Mensagem")}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar mensagem</Button>
        <Button size="sm" variant="outline" onClick={() => copiar(link, "Link")}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar só o link</Button>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" asChild>
          <a href={`https://wa.me/${fone.length >= 10 ? (fone.startsWith("55") ? fone : `55${fone}`) : ""}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">
            <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Enviar pelo WhatsApp
          </a>
        </Button>
        <Button size="sm" variant="ghost" onClick={onFechar}>Fechar</Button>
      </div>
    </div>
  );
}

export default function Equipe() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.equipe.list.useQuery();
  const [form, setForm] = useState(vazio);
  const [abrirForm, setAbrirForm] = useState(false);
  const [convite, setConvite] = useState<{ id?: number; nome: string; link: string; login: string; telefone?: string | null } | null>(null);
  const [permissoesDe, setPermissoesDe] = useState<number | null>(null);
  const recarregar = () => utils.equipe.list.invalidate();

  const criar = trpc.equipe.create.useMutation({
    onSuccess: (r, v) => {
      toast.success(`${v.nome} cadastrado(a)`);
      setConvite({ nome: v.nome, link: r.link, login: v.perfil === "empreendedor" && !v.creci ? v.email : `o CRECI ${String(v.creci).replace(/\D/g, "")}`, telefone: v.telefone });
      setForm(vazio); setAbrirForm(false); recarregar();
    },
    onError: e => toast.error(e.message),
  });
  const atualizar = trpc.equipe.update.useMutation({ onSuccess: () => { toast.success("Acesso atualizado"); recarregar(); }, onError: e => toast.error(e.message) });
  const reconvite = trpc.equipe.novoConvite.useMutation({ onError: e => toast.error(e.message) });

  const emps = data?.empreendimentos ?? [];
  const nomeEmp = (slug?: string | null) => emps.find((e: any) => e.slug === slug)?.nome || slug || "";

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    criar.mutate({
      nome: form.nome, email: form.email, creci: form.creci || null, telefone: form.telefone || null,
      perfil: form.perfil, empreendimentoSlug: form.perfil === "empreendedor" ? form.empreendimentoSlug || null : null,
    });
  };

  return (
    <div>
      <PageHeader icone={Users} titulo="Equipe e acessos" subtitulo="Colaboradores entram com o CRECI e a senha que eles mesmos criam no primeiro acesso" />

      <div className="px-4 md:px-6 pb-6 max-w-[1500px] mx-auto space-y-4">
        {error && <p className="text-sm text-red-400">{error.message}</p>}
        {convite && <ConviteGerado {...convite} onFechar={() => setConvite(null)} />}

        <PacoteBase />

        <div className="flex justify-end">
          <Button onClick={() => setAbrirForm(v => !v)} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="mr-1.5 h-4 w-4" /> Novo acesso</Button>
        </div>

        {abrirForm && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2"><CardTitle className="text-base">Novo acesso</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={salvar} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Tipo de acesso</span>
                  <select value={form.perfil} onChange={e => setForm(f => ({ ...f, perfil: e.target.value as any }))} className="h-10 px-3 rounded-md border border-border bg-secondary/30 text-foreground text-sm">
                    <option value="equipe">{ROTULO_PERFIL.equipe} — usa o CRM</option>
                    <option value="empreendedor">{ROTULO_PERFIL.empreendedor} — só gráficos de leads e artes</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Nome</span>
                  <Input required value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome completo" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">CRECI {form.perfil === "empreendedor" ? "(opcional — sem CRECI, entra com o e-mail)" : "(é o login)"}</span>
                  <Input required={form.perfil !== "empreendedor"} inputMode="numeric" value={form.creci} onChange={e => setForm(f => ({ ...f, creci: e.target.value }))} placeholder="Ex.: 4705" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">E-mail (confirmado no primeiro acesso)</span>
                  <Input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="nome@email.com" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">WhatsApp (para enviar o link)</span>
                  <Input inputMode="tel" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(99) 9 9999-9999" />
                </label>
                {form.perfil === "empreendedor" && (
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-muted-foreground">Empreendimento</span>
                    <select required value={form.empreendimentoSlug} onChange={e => setForm(f => ({ ...f, empreendimentoSlug: e.target.value }))} className="h-10 px-3 rounded-md border border-border bg-secondary/30 text-foreground text-sm">
                      <option value="">— escolha —</option>
                      {emps.map((e: any) => <option key={e.slug} value={e.slug}>{e.nome}</option>)}
                    </select>
                  </label>
                )}
                <div className="md:col-span-2 flex items-center gap-2">
                  <Button type="submit" disabled={criar.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">{criar.isPending ? "Salvando..." : "Cadastrar e gerar link"}</Button>
                  <Button type="button" variant="ghost" onClick={() => setAbrirForm(false)}>Cancelar</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
          <div className="space-y-2">
            {(data?.pessoas ?? []).map((p: any) => (
              <Card key={p.id} className={`bg-card border-border ${p.ativo ? "" : "opacity-60"}`}>
                <CardContent className="py-3 space-y-2">
                  <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{p.nome || "Sem nome"}</span>
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-border text-muted-foreground">{ROTULO_PERFIL[p.perfil as keyof typeof ROTULO_PERFIL] || p.perfil}</span>
                        {!p.ativo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600/80 text-white">DESATIVADO</span>}
                        {p.ativo && p.perfil !== "admin" && !p.temSenha && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/80 text-black">{p.convitePendente ? "aguardando 1º acesso" : "sem senha — gere um link"}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.creci ? `CRECI ${p.creci} · ` : ""}{p.email}{p.perfil === "empreendedor" ? ` · ${nomeEmp(p.empreendimentoSlug)}` : ""} · último acesso {dataHora(p.ultimoAcesso)}
                      </p>
                    </div>
                    {p.perfil !== "empreendedor" && p.ativo && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 cursor-pointer" title="Entra no rodízio de leads novos e recebe os alertas de 5 minutos">
                        <input type="checkbox" checked={!!p.recebeLeads} onChange={e => atualizar.mutate({ id: p.id, recebeLeads: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" />
                        Recebe leads
                      </label>
                    )}
                    {p.perfil !== "admin" && (
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <Button size="sm" variant="outline" disabled={reconvite.isPending} onClick={async () => {
                          const zerar = p.temSenha && confirm(`${p.nome} já tem senha. Gerar um link novo para ele(a) criar outra senha? A senha atual deixa de valer.`);
                          if (p.temSenha && !zerar) return;
                          const r = await reconvite.mutateAsync({ id: p.id, zerarSenha: !!zerar });
                          setConvite({ id: p.id, nome: p.nome, link: r.link, login: p.creci ? `o CRECI ${p.creci}` : p.email, telefone: p.telefone });
                          recarregar();
                        }}>
                          <KeyRound className="mr-1.5 h-3.5 w-3.5" /> {p.temSenha ? "Redefinir senha" : "Gerar link"}
                        </Button>
                        <Button size="sm" variant="ghost" className={p.ativo ? "text-red-300" : "text-emerald-300"} onClick={() => {
                          if (p.ativo && !confirm(`Desativar o acesso de ${p.nome}? Ele(a) sai do CRM na hora.`)) return;
                          atualizar.mutate({ id: p.id, ativo: !p.ativo });
                        }}>
                          {p.ativo ? <><UserX className="mr-1.5 h-3.5 w-3.5" /> Desativar</> : <><UserCheck className="mr-1.5 h-3.5 w-3.5" /> Reativar</>}
                        </Button>
                        {p.perfil === "equipe" && (
                          <Button size="sm" variant={permissoesDe === p.id ? "default" : "outline"} onClick={() => setPermissoesDe(v => (v === p.id ? null : p.id))}>
                            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Permissões
                          </Button>
                        )}
                      </div>
                    )}
                    {p.perfil === "admin" && !p.creci && (
                      <Button size="sm" variant="outline" onClick={() => {
                        const c = prompt("Seu CRECI (só o número), para entrar com CRECI + senha:");
                        if (c) atualizar.mutate({ id: p.id, creci: c });
                      }}>Cadastrar meu CRECI</Button>
                    )}
                  </div>
                  {permissoesDe === p.id && <PermissoesCorretor usuarioId={p.id} />}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          <b>Equipe</b> (corretor): usa os módulos do pacote base (ou os ajustados em "Permissões") e só abre os empreendimentos e imóveis habilitados para ele; no financeiro e no simulador vê só a própria comissão. Não mexe em configurações nem na equipe. <b>Empreendedor</b>: vê só os gráficos de leads do empreendimento (sem nomes ou telefones) e as artes liberadas para divulgar.
        </p>
      </div>
    </div>
  );
}
