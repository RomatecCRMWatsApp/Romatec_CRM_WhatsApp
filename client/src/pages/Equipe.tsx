import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, IdCard, KeyRound, MessageCircle, Plus, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import { daEquipe, type Perfil } from "@shared/equipe";
import PageHeader from "@/components/PageHeader";
import PermissoesCorretor, { PacoteBase } from "@/components/equipe/PermissoesCorretor";
import CadastroUsuario, { SeloPerfil } from "@/components/equipe/CadastroUsuario";

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
  const [abrirForm, setAbrirForm] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [convite, setConvite] = useState<{ id?: number; nome: string; link: string; login: string; telefone?: string | null } | null>(null);
  const [permissoesDe, setPermissoesDe] = useState<number | null>(null);
  const recarregar = () => utils.equipe.list.invalidate();

  const listas = { modulos: data?.modulos ?? [], empreendimentos: (data?.empreendimentos ?? []) as any[], imoveis: data?.imoveis ?? [] };
  const atualizar = trpc.equipe.update.useMutation({ onSuccess: () => { toast.success("Acesso atualizado"); recarregar(); }, onError: e => toast.error(e.message) });
  const reconvite = trpc.equipe.novoConvite.useMutation({ onError: e => toast.error(e.message) });

  const emps = data?.empreendimentos ?? [];
  const nomeEmp = (slug?: string | null) => emps.find((e: any) => e.slug === slug)?.nome || slug || "";

  return (
    <div>
      <PageHeader icone={Users} titulo="Equipe e acessos" subtitulo="Colaboradores entram com CRECI, CPF ou e-mail e a senha que eles mesmos criam no primeiro acesso" />

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
              <CadastroUsuario admin listas={listas} onCancelar={() => setAbrirForm(false)}
                onSalvo={r => { if (r.link) setConvite({ nome: r.nome, link: r.link, login: r.login, telefone: r.telefone }); setAbrirForm(false); setEditando(r.id); recarregar(); }} />
            </CardContent>
          </Card>
        )}

        {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
          <div className="space-y-2">
            {(data?.pessoas ?? []).map((p: any) => (
              <Card key={p.id} className={`bg-card border-border ${p.ativo ? "" : "opacity-60"}`}>
                <CardContent className="py-3 space-y-2">
                  <div className="flex flex-col md:flex-row md:items-center gap-2">
                    {p.fotoUrl ? <img src={p.fotoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                      : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 font-bold text-primary">{String(p.nome || "?").charAt(0).toUpperCase()}</div>}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{p.nome || "Sem nome"}</span>
                        <SeloPerfil perfil={p.perfil as Perfil} />
                        {(p.pendencias as string[]).map(t => (
                          <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded ${/a vencer/.test(t) ? "bg-amber-500/80 text-black" : "bg-red-600/80 text-white"}`}>{t}</span>
                        ))}
                        {!p.ativo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600/80 text-white">DESATIVADO</span>}
                        {p.ativo && p.perfil !== "admin" && !p.temSenha && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/80 text-black">{p.convitePendente ? "aguardando 1º acesso" : "sem senha — gere um link"}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.creci ? `CRECI ${p.creci} · ` : ""}{p.email}{p.perfil === "empreendedor" ? ` · ${nomeEmp(p.empreendimentoSlug)}` : ""} · último acesso {dataHora(p.ultimoAcesso)}
                      </p>
                    </div>
                    {p.perfil !== "empreendedor" && p.ativo && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 cursor-pointer" title="Entra no rodízio de leads novos e recebe os alertas de 5 minutos">
                        <input type="checkbox" checked={!!p.recebeLeads} disabled={atualizar.isPending} onChange={e => atualizar.mutate({ id: p.id, recebeLeads: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" />
                        Recebe leads
                      </label>
                    )}
                    <Button size="sm" variant={editando === p.id ? "default" : "outline"} className="shrink-0" onClick={() => setEditando(v => (v === p.id ? null : p.id))}>
                      <IdCard className="mr-1.5 h-3.5 w-3.5" /> Cadastro
                    </Button>
                    {p.perfil !== "admin" && (
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <Button size="sm" variant="outline" disabled={reconvite.isPending} onClick={async () => {
                          const zerar = p.temSenha && confirm(`${p.nome} já tem senha. Gerar um link novo para ele(a) criar outra senha? A senha atual deixa de valer.`);
                          if (p.temSenha && !zerar) return;
                          const r = await reconvite.mutateAsync({ id: p.id, zerarSenha: !!zerar });
                          setConvite({ id: p.id, nome: p.nome, link: r.link, login: p.creci ? `o CRECI ${p.creci}` : "o seu CPF", telefone: p.telefone });
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
                        {daEquipe(p.perfil as Perfil) && (
                          <Button size="sm" variant={permissoesDe === p.id ? "default" : "outline"} onClick={() => setPermissoesDe(v => (v === p.id ? null : p.id))}>
                            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Permissões
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  {editando === p.id && (
                    <div className="rounded-lg border border-border bg-secondary/10 p-3">
                      <CadastroUsuario id={p.id} admin listas={listas} onCancelar={() => setEditando(null)} onSalvo={() => recarregar()} />
                    </div>
                  )}
                  {permissoesDe === p.id && <PermissoesCorretor usuarioId={p.id} />}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          <b>Secretário(a)</b>: vê todos os leads, empreendimentos e imóveis, com os módulos do pacote base dele. <b>Corretor(a)</b>: só os leads em que é o responsável e os empreendimentos e imóveis habilitados; no financeiro e no simulador vê só a própria comissão; para receber leads precisa do Cartão de Regularidade CRECI. Nenhum dos dois mexe em configurações, na equipe ou na distribuição de leads. <b>Empreendedor</b>: vê só os gráficos de leads do empreendimento (sem nomes ou telefones) e as artes liberadas para divulgar.
        </p>
      </div>
    </div>
  );
}
