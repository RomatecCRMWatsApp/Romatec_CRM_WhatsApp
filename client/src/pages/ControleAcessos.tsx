/**
 * Controle de acessos dos corretores (administrador e secretária): quem está ativo, quem está pago e quem está
 * usando o sistema. Ações com motivo registrado: ativar/desativar o login, liberar/bloquear a licença,
 * desconectar de todos os aparelhos e ver o histórico de entradas.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { toast } from "sonner";
import { CalendarPlus, History, KeyRound, Loader2, LogOut, RefreshCw, Search, ShieldCheck, ShieldOff, UserCheck, UserX } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { numeroCreciPF } from "@shared/cartaoVendas";
import {
  CATEGORIAS_MIDIA, DICA_USO, descreverMidias, PAGAMENTO, ROTULO_MIDIA, ROTULO_PAGAMENTO, ROTULO_USO, USO,
  type SituacaoPagamento, type SituacaoUso, type UsoMidias,
} from "@shared/controleAcessos";

const dataBr = (d: unknown) => (d ? new Date(d as any).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "—");
const dataHoraBr = (d: unknown) => (d ? new Date(d as any).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
function haQuanto(d: unknown): string {
  if (!d) return "nunca";
  const min = Math.round((Date.now() - new Date(d as any).getTime()) / 60000);
  if (min < 2) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.round(h / 24);
  return dias === 1 ? "ontem" : `há ${dias} dias`;
}

const COR_USO: Record<SituacaoUso, string> = {
  usando: "bg-ok-500/15 text-ok-300 border-ok-500/40",
  pouco: "bg-warn-500/15 text-warn-300 border-warn-500/40",
  parado: "bg-danger-500/15 text-danger-300 border-danger-500/40",
  nunca: "bg-white/5 text-muted-foreground border-border",
};
const COR_PAG: Record<SituacaoPagamento, string> = {
  pago: "bg-ok-500/15 text-ok-300 border-ok-500/40",
  cortesia: "bg-info-500/15 text-info-300 border-info-500/40",
  teste: "bg-[var(--rt-gold)]/15 text-[var(--rt-gold-light)] border-[var(--rt-gold)]/40",
  atrasado: "bg-warn-500/15 text-warn-300 border-warn-500/40",
  bloqueado: "bg-danger-500/15 text-danger-300 border-danger-500/40",
  vencido: "bg-danger-500/15 text-danger-300 border-danger-500/40",
  cancelado: "bg-white/5 text-muted-foreground border-border",
  sem_licenca: "bg-danger-500/10 text-danger-300 border-danger-500/30",
  nao_exige: "bg-white/5 text-muted-foreground border-border",
};

type Linha = {
  id: number; nome: string; perfil: string; creci: string | null; telefone: string | null; fotoUrl: string | null;
  ativo: boolean; arquivado: boolean; temSenha: boolean; ultimoAcesso: string | null; uso: SituacaoUso; loginsMes: number; ultimoLogin: string | null;
  pagamento: SituacaoPagamento; plano: string | null; licencaFim: string | null; diasRestantes: number | null; assinaturaId: number | null;
  ultimoPagamento: string | null; faturasAbertas: number; podeEntrar: boolean; midias: UsoMidias;
};

type Acao =
  | { tipo: "login"; pessoa: Linha; ativo: boolean }
  | { tipo: "prorrogar"; pessoa: Linha }
  | { tipo: "bloquear"; pessoa: Linha }
  | { tipo: "desconectar"; pessoa: Linha };

export default function ControleAcessos() {
  const { data, isLoading, refetch, isFetching } = trpc.controleAcessos.lista.useQuery(undefined, { refetchInterval: 60_000 });
  // ?busca=Nome (vindo da busca única do topo) já abre filtrado
  const [busca, setBusca] = useState(() => { try { return new URLSearchParams(window.location.search).get("busca") ?? ""; } catch { return ""; } });
  const [fUso, setFUso] = useState<"" | SituacaoUso>("");
  const [fPag, setFPag] = useState<"" | SituacaoPagamento | "pendentes">("");
  const [fAtivo, setFAtivo] = useState<"" | "ativos" | "inativos">("ativos");
  const [fMidia, setFMidia] = useState<"" | "usou" | "nao_usou">("");
  const [ordem, setOrdem] = useState<"nome" | "uso" | "midias">("nome");
  const [acao, setAcao] = useState<Acao | null>(null);
  const [historico, setHistorico] = useState<Linha | null>(null);
  // Esqueceu a senha: senha provisória nova pelo WhatsApp (troca obrigatória no 1º acesso)
  const [senhaNova, setSenhaNova] = useState<{ nome: string; enviado: boolean; login: string; senha: string; texto: string } | null>(null);
  const resetar = trpc.recrutamento.reenviarAcesso.useMutation({ onError: e => toast.error(e.message) });
  const resetarSenha = async (l: Linha) => {
    if (!l.telefone) { toast.error("Sem WhatsApp no cadastro: preencha o telefone em Equipe › Cadastro"); return; }
    if (!confirm(`Resetar a senha de ${l.nome}? A senha atual deixa de valer, ele(a) sai dos aparelhos conectados e recebe uma senha provisória no WhatsApp ${l.telefone}.`)) return;
    const r = await resetar.mutateAsync({ usuarioId: l.id });
    setSenhaNova({ nome: l.nome, ...r });
    if (r.enviado) toast.success("Senha provisória enviada pelo WhatsApp");
  };
  // Link do aviso ao administrador: /controle-acessos?pedido=123456 abre a autorização desse pedido
  const pedidoDaUrl = useMemo(() => { try { return new URLSearchParams(window.location.search).get("pedido"); } catch { return null; } }, []);

  const linhas = (data?.linhas ?? []) as Linha[];
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter(l =>
      (!q || l.nome.toLowerCase().includes(q) || (l.creci ?? "").includes(q) || (l.telefone ?? "").includes(q)) &&
      (!fUso || l.uso === fUso) &&
      (!fPag || (fPag === "pendentes" ? ["atrasado", "bloqueado", "vencido", "sem_licenca"].includes(l.pagamento) : l.pagamento === fPag)) &&
      (!fAtivo || (fAtivo === "ativos" ? l.ativo : !l.ativo)) &&
      (!fMidia || (fMidia === "usou" ? l.midias.total > 0 : l.midias.total === 0)))
      .sort((a, b) => ordem === "midias" ? b.midias.total - a.midias.total || a.nome.localeCompare(b.nome, "pt-BR")
        : ordem === "uso" ? (new Date(b.ultimoAcesso ?? 0).getTime() - new Date(a.ultimoAcesso ?? 0).getTime())
        : 0);
  }, [linhas, busca, fUso, fPag, fAtivo, fMidia, ordem]);
  const r = data?.resumo;

  return (
    <div className="pb-6">
      <PageHeader icone={ShieldCheck} titulo="Controle de acessos" subtitulo="Quem está ativo, quem está pago e quem está usando o sistema"
        acoes={<Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} /> Atualizar</Button>} />

      <div className="mx-auto max-w-[1500px] space-y-4 px-4 md:px-6">
        {data && !data.licenciamentoAtivo && (
          <p className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            A cobrança de licença está desligada no SaaS: todos com login ativo entram, pagos ou não. A coluna de pagamento mostra a situação de cada um.
          </p>
        )}

        <PainelPedidos destaque={pedidoDaUrl} onMudou={() => refetch()} />

        {r && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Numero rotulo="Ativos" valor={r.ativos} detalhe={`${r.inativos} desativados`} onClick={() => { setFAtivo("ativos"); setFUso(""); setFPag(""); }} />
            <Numero rotulo="Usando" valor={r.usando} detalhe="entraram em 3 dias" cor="text-ok-300" onClick={() => { setFUso("usando"); setFPag(""); }} />
            <Numero rotulo="Parados" valor={r.parados} detalhe="+15 dias ou nunca" cor="text-danger-300" onClick={() => { setFUso("parado"); setFPag(""); }} />
            <Numero rotulo="Pagos" valor={r.pagos} detalhe={`${r.cortesia} cortesia`} cor="text-ok-300" onClick={() => { setFPag("pago"); setFUso(""); }} />
            <Numero rotulo="Em teste" valor={r.teste} detalhe="7 dias grátis" cor="text-[var(--rt-gold-light)]" onClick={() => { setFPag("teste"); setFUso(""); }} />
            <Numero rotulo="Pendentes" valor={r.pendentes} detalhe="atraso, bloqueio ou sem licença" cor="text-danger-300" onClick={() => { setFPag("pendentes"); setFUso(""); }} />
          </div>
        )}

        {r && (
          <div className="grid gap-2 lg:grid-cols-2">
            <section aria-label="Contador das licenças" className="rounded-lg border border-border bg-card p-3">
              <h2 className="mb-2 text-sm font-semibold text-foreground">Contador das licenças</h2>
              <div className="flex flex-wrap gap-1.5">
                {PAGAMENTO.filter(p => r.licencas[p] > 0 || ["pago", "cortesia", "teste", "bloqueado"].includes(p)).map(p => (
                  <button key={p} type="button" onClick={() => { setFPag(p); setFUso(""); setFAtivo(""); }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${COR_PAG[p]} hover:brightness-125`}>
                    {ROTULO_PAGAMENTO[p]} <b className="tabular-nums">{r.licencas[p]}</b>
                  </button>
                ))}
              </div>
            </section>
            <section aria-label="Uso dos materiais do empreendimento" className="rounded-lg border border-border bg-card p-3">
              <h2 className="text-sm font-semibold text-foreground">Materiais usados nos últimos 30 dias</h2>
              <p className="mb-2 text-[11px] text-muted-foreground">Baixados, enviados ou texto copiado. Só a contagem: não mostra para quem foi enviado.</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {CATEGORIAS_MIDIA.map(c => (
                  <div key={c} className="rounded-md bg-secondary/30 px-2 py-1.5">
                    <p className="text-[11px] text-muted-foreground">{ROTULO_MIDIA[c]}</p>
                    <p className="text-lg font-semibold tabular-nums text-foreground">{r.midias[c]}</p>
                  </div>
                ))}
                <div className="col-span-2 rounded-md bg-secondary/30 px-2 py-1.5 sm:col-span-1">
                  <p className="text-[11px] text-muted-foreground">Corretores que usaram</p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">{r.usaramMidias} <span className="text-xs font-normal text-muted-foreground">de {r.ativos}</span></p>
                </div>
              </div>
            </section>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Buscar</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, CRECI ou telefone" className="pl-8" />
          </label>
          <Filtro rotulo="Login" valor={fAtivo} onChange={v => setFAtivo(v as any)} opcoes={[["ativos", "Ativos"], ["inativos", "Desativados"], ["", "Todos"]]} />
          <Filtro rotulo="Uso" valor={fUso} onChange={v => setFUso(v as any)} opcoes={[["", "Todos"], ...USO.map(u => [u, ROTULO_USO[u]] as [string, string])]} />
          <Filtro rotulo="Materiais" valor={fMidia} onChange={v => setFMidia(v as any)} opcoes={[["", "Todos"], ["usou", "Usaram em 30 dias"], ["nao_usou", "Não usaram"]]} />
          <Filtro rotulo="Ordenar" valor={ordem} onChange={v => setOrdem(v as any)} opcoes={[["nome", "Nome"], ["uso", "Último uso"], ["midias", "Mais materiais"]]} />
          <Filtro rotulo="Pagamento" valor={fPag} onChange={v => setFPag(v as any)} opcoes={[["", "Todos"], ["pendentes", "Pendentes"], ...PAGAMENTO.map(p => [p, ROTULO_PAGAMENTO[p]] as [string, string])]} />
        </div>

        {isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Carregando…</p>}
        {!isLoading && visiveis.length === 0 && <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Ninguém neste filtro.</p>}

        {senhaNova && (
          <div className="space-y-2 rounded-xl border border-ok-500/40 bg-ok-500/10 p-4 text-sm">
            <p className="font-semibold text-ok-300">{senhaNova.enviado
              ? `✅ Senha de ${senhaNova.nome} redefinida e enviada pelo WhatsApp.`
              : `✅ Senha de ${senhaNova.nome} redefinida — o WhatsApp do sistema não enviou: repasse a mensagem abaixo.`}</p>
            <p>Login: <b>{senhaNova.login}</b> · Senha provisória: <b className="font-mono">{senhaNova.senha}</b></p>
            <p className="text-xs text-muted-foreground">No 1º acesso o sistema pede para criar a senha nova. A provisória vale 7 dias; a antiga já não vale e os aparelhos conectados saíram.</p>
            {!senhaNova.enviado && <pre className="whitespace-pre-wrap rounded bg-background/60 p-2 text-xs">{senhaNova.texto}</pre>}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(senhaNova.texto); toast.success("Mensagem copiada"); } catch { toast.error("Não foi possível copiar"); } }}>Copiar mensagem</Button>
              <Button size="sm" variant="ghost" onClick={() => setSenhaNova(null)}>Fechar</Button>
            </div>
          </div>
        )}

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visiveis.map(l => <CartaoPessoa key={l.id} l={l} onAcao={setAcao} onHistorico={() => setHistorico(l)} onResetarSenha={() => resetarSenha(l)} resetando={resetar.isPending} />)}
        </div>
      </div>

      {acao && (acao.tipo === "prorrogar"
        ? <DialogoProrrogar pessoa={acao.pessoa} onFechar={() => setAcao(null)} onFeito={() => { setAcao(null); refetch(); }} />
        : <DialogoAcao acao={acao} onFechar={() => setAcao(null)} onFeito={() => { setAcao(null); refetch(); }} />)}
      {historico && <DialogoHistorico pessoa={historico} onFechar={() => setHistorico(null)} />}
    </div>
  );
}

function Numero({ rotulo, valor, detalhe, cor, onClick }: { rotulo: string; valor: number; detalhe: string; cor?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-[var(--rt-gold)]/50 focus-visible:outline-2 focus-visible:outline-[var(--rt-gold)]">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={`text-2xl font-semibold tabular-nums ${cor ?? "text-foreground"}`}>{valor}</p>
      <p className="text-[11px] text-muted-foreground">{detalhe}</p>
    </button>
  );
}

function Filtro({ rotulo, valor, onChange, opcoes }: { rotulo: string; valor: string; onChange: (v: string) => void; opcoes: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {rotulo}
      <select value={valor} onChange={e => onChange(e.target.value)} className="h-9 rounded-md border border-border bg-secondary/30 px-2 text-sm text-foreground">
        {opcoes.map(([v, t]) => <option key={v || "todos"} value={v}>{t}</option>)}
      </select>
    </label>
  );
}

function Selo({ texto, cor, dica }: { texto: string; cor: string; dica?: string }) {
  return <span title={dica} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cor}`}>{texto}</span>;
}

function CartaoPessoa({ l, onAcao, onHistorico, onResetarSenha, resetando }: { l: Linha; onAcao: (a: Acao) => void; onHistorico: () => void; onResetarSenha: () => void; resetando?: boolean }) {
  const licenca = l.licencaFim ? `${l.plano ?? "Licença"} até ${dataBr(l.licencaFim)}${l.diasRestantes != null && l.diasRestantes >= 0 ? ` (${l.diasRestantes} d)` : ""}` : l.plano ?? null;
  return (
    <div className={`flex flex-col gap-2 rounded-lg border bg-card p-3 ${l.ativo ? "border-border" : "border-danger-500/30 opacity-80"}`}>
      <div className="flex items-start gap-3">
        {l.fotoUrl
          ? <img src={l.fotoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
          : <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 font-semibold text-primary">{l.nome.charAt(0).toUpperCase()}</span>}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{l.nome}</p>
          <p className="truncate text-xs text-muted-foreground">
            {l.perfil === "empreendedor" ? "Empreendedor" : l.perfil === "juridico" ? "Advogado(a) — jurídico" : "Corretor"}{l.creci ? `, CRECI ${numeroCreciPF(l.creci)}` : ""}{l.telefone ? `, ${l.telefone}` : ""}
          </p>
        </div>
        <Selo texto={l.podeEntrar ? "Entra hoje" : "Sem acesso"} cor={l.podeEntrar ? "bg-ok-500/15 text-ok-300 border-ok-500/40" : "bg-danger-500/15 text-danger-300 border-danger-500/40"}
          dica={l.podeEntrar ? "Login ativo e licença liberada" : "Login desativado ou licença bloqueada/vencida"} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Selo texto={l.ativo ? "Login ativo" : "Login desativado"} cor={l.ativo ? "bg-ok-500/10 text-ok-300 border-ok-500/30" : "bg-danger-500/15 text-danger-300 border-danger-500/40"} />
        <Selo texto={ROTULO_PAGAMENTO[l.pagamento]} cor={COR_PAG[l.pagamento]} />
        <Selo texto={ROTULO_USO[l.uso]} cor={COR_USO[l.uso]} dica={DICA_USO[l.uso]} />
        {!l.temSenha && <Selo texto="Sem senha criada" cor="bg-white/5 text-muted-foreground border-border" dica="Ainda não fez o primeiro acesso pelo convite" />}
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Último uso</dt><dd className="text-right text-foreground" title={dataHoraBr(l.ultimoAcesso)}>{haQuanto(l.ultimoAcesso)}</dd>
        <dt className="text-muted-foreground">Entradas em 30 dias</dt><dd className="text-right tabular-nums text-foreground">{l.loginsMes}</dd>
        {licenca && <><dt className="text-muted-foreground">Licença</dt><dd className="truncate text-right text-foreground" title={licenca}>{licenca}</dd></>}
        <dt className="text-muted-foreground">Materiais em 30 dias</dt>
        <dd className="text-right text-foreground" title={l.midias.ultimo ? `Último em ${dataHoraBr(l.midias.ultimo)}` : "Nenhum material baixado ou enviado"}>
          {descreverMidias(l.midias)}
        </dd>
        <dt className="text-muted-foreground">Último pagamento</dt><dd className="text-right text-foreground">{dataBr(l.ultimoPagamento)}{l.faturasAbertas ? `, ${l.faturasAbertas} em aberto` : ""}</dd>
      </dl>

      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        {l.ativo
          ? <Button size="sm" variant="outline" className="h-8 border-danger-500/40 text-danger-300 hover:bg-danger-500/10" onClick={() => onAcao({ tipo: "login", pessoa: l, ativo: false })}><UserX className="mr-1 h-3.5 w-3.5" /> Desativar login</Button>
          : <Button size="sm" variant="outline" className="h-8 border-ok-500/40 text-ok-300 hover:bg-ok-500/10" onClick={() => onAcao({ tipo: "login", pessoa: l, ativo: true })}><UserCheck className="mr-1 h-3.5 w-3.5" /> Ativar login</Button>}
        <Button size="sm" variant="outline" className="h-8 border-[var(--rt-gold)]/50 text-[var(--rt-gold-light)] hover:bg-[var(--rt-gold)]/10" onClick={() => onAcao({ tipo: "prorrogar", pessoa: l })}
          title="Nova data de vencimento, com pagamento ou cortesia. Só vale com a senha do administrador"><CalendarPlus className="mr-1 h-3.5 w-3.5" /> {["bloqueado", "vencido", "sem_licenca", "cancelado"].includes(l.pagamento) ? "Desbloquear / prorrogar" : "Prorrogar"}</Button>
        {["pago", "cortesia", "teste", "atrasado"].includes(l.pagamento) && l.assinaturaId
          ? <Button size="sm" variant="outline" className="h-8" onClick={() => onAcao({ tipo: "bloquear", pessoa: l })}><ShieldOff className="mr-1 h-3.5 w-3.5" /> Bloquear licença</Button>
          : null}
        {l.ativo && (
          <Button size="sm" variant="outline" className="h-8" disabled={resetando} title={l.telefone ? "Esqueceu a senha: senha provisória nova pelo WhatsApp" : "Sem WhatsApp no cadastro"} onClick={onResetarSenha}>
            <KeyRound className="mr-1 h-3.5 w-3.5" /> Resetar senha
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-8 px-2" title="Desconectar de todos os aparelhos" aria-label="Desconectar de todos os aparelhos" onClick={() => onAcao({ tipo: "desconectar", pessoa: l })}><LogOut className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" className="h-8 px-2" title="Histórico de entradas e liberações" aria-label="Histórico de entradas e liberações" onClick={onHistorico}><History className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

const hojeMais = (dias: number) => { const d = new Date(Date.now() + dias * 86_400_000); return d.toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" }); };

function DialogoAcao({ acao, onFechar, onFeito }: { acao: Exclude<Acao, { tipo: "prorrogar" }>; onFechar: () => void; onFeito: () => void }) {
  const [motivo, setMotivo] = useState("");
  const ok = (msg: string) => () => { toast.success(msg); onFeito(); };
  const erro = (e: { message: string }) => toast.error(e.message);
  const login = trpc.controleAcessos.definirLogin.useMutation({ onSuccess: ok(acao.tipo === "login" && acao.ativo ? "Login ativado" : "Login desativado e aparelhos desconectados"), onError: erro });
  const bloquear = trpc.controleAcessos.bloquearLicenca.useMutation({ onSuccess: ok("Licença bloqueada"), onError: erro });
  const desconectar = trpc.controleAcessos.desconectar.useMutation({ onSuccess: ok("Desconectado de todos os aparelhos"), onError: erro });
  const ocupado = login.isPending || bloquear.isPending || desconectar.isPending;
  const p = acao.pessoa;

  const titulo = acao.tipo === "login" ? (acao.ativo ? "Ativar login" : "Desativar login") : acao.tipo === "bloquear" ? "Bloquear licença" : "Desconectar de todos os aparelhos";
  const texto = acao.tipo === "login" ? (acao.ativo ? `${p.nome} volta a entrar no sistema (se a licença estiver liberada).` : `${p.nome} não entra mais e é desconectado de todos os aparelhos. Os leads e o histórico continuam.`)
    : acao.tipo === "bloquear" ? `${p.nome} perde o acesso até o administrador autorizar uma prorrogação.`
    : `${p.nome} sai de todos os celulares e computadores e precisa entrar de novo com a senha.`;
  const precisaMotivo = acao.tipo !== "desconectar";
  const podeConfirmar = !ocupado && (!precisaMotivo || motivo.trim().length >= 3);

  const confirmar = () => {
    if (acao.tipo === "login") login.mutate({ id: p.id, ativo: acao.ativo, motivo });
    else if (acao.tipo === "bloquear") bloquear.mutate({ id: p.id, motivo });
    else desconectar.mutate({ id: p.id });
  };

  return (
    <Dialog open onOpenChange={v => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{texto}</DialogDescription>
        </DialogHeader>
        {precisaMotivo && (
          <label className="flex flex-col gap-1 text-sm">
            Motivo (fica registrado)
            <Input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={300} placeholder="Ex.: saiu da equipe" />
          </label>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onFechar} disabled={ocupado}>Voltar</Button>
          <Button onClick={confirmar} disabled={!podeConfirmar} className={acao.tipo === "login" && acao.ativo ? "bg-ok-600 text-white hover:bg-ok-700" : "bg-danger-600 text-white hover:bg-danger-700"}>
            {ocupado && <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" />} Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Prorrogar / desbloquear (com pagamento ou cortesia). Secretária: faz o pedido, o administrador recebe o aviso com o
 * código e autoriza com a senha dele (no aparelho dele ou digitando aqui). Administrador: confirma com a própria senha.
 */
function DialogoProrrogar({ pessoa, onFechar, onFeito }: { pessoa: Linha; onFechar: () => void; onFeito: () => void }) {
  const { user } = useAuth();
  const souAdmin = perfilDe(user as any) === "admin";
  const [modalidade, setModalidade] = useState<"pago" | "cortesia">("pago");
  const [ate, setAte] = useState(() => {
    const base = pessoa.licencaFim && new Date(pessoa.licencaFim).getTime() > Date.now() ? Math.round((new Date(pessoa.licencaFim).getTime() - Date.now()) / 86_400_000) + 30 : 30;
    return hojeMais(base);
  });
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [senha, setSenha] = useState("");
  const [pedido, setPedido] = useState<{ id: number; codigo: string } | null>(null);
  const utils = trpc.useUtils();
  const erro = (e: { message: string }) => toast.error(e.message);
  const pedir = trpc.controleAcessos.pedirProrrogacao.useMutation({
    onSuccess: r => { setPedido(r); utils.controleAcessos.pedidos.invalidate(); toast.success(`Pedido enviado ao administrador (código ${r.codigo})`); }, onError: erro,
  });
  const direto = trpc.controleAcessos.prorrogarComSenha.useMutation({ onSuccess: () => { toast.success("Prorrogação autorizada"); onFeito(); }, onError: erro });
  const autorizar = trpc.controleAcessos.autorizarPedido.useMutation({
    onSuccess: () => { toast.success("Autorizado com a senha do administrador"); utils.controleAcessos.pedidos.invalidate(); onFeito(); },
    onError: e => { setSenha(""); erro(e); },
  });
  const ocupado = pedir.isPending || direto.isPending || autorizar.isPending;
  const dados = { id: pessoa.id, modalidade, ate, valor: modalidade === "pago" && valor ? Number(valor.replace(",", ".")) : null, motivo };
  const valido = /^\d{4}-\d{2}-\d{2}$/.test(ate) && motivo.trim().length >= 3;

  return (
    <Dialog open onOpenChange={v => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Prorrogar acesso de {pessoa.nome}</DialogTitle>
          <DialogDescription>
            Nova data de vencimento, desbloqueando se estiver bloqueado. <b>Só vale com a senha do administrador.</b>
          </DialogDescription>
        </DialogHeader>

        {!pedido ? (
          <>
            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="mb-1 text-sm">Como fica</legend>
              {([["pago", "Com pagamento"], ["cortesia", "Cortesia (sem pagamento)"]] as const).map(([v, t]) => (
                <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${modalidade === v ? "border-[var(--rt-gold)] bg-[var(--rt-gold)]/10" : "border-border"}`}>
                  <input type="radio" name="modalidade" value={v} checked={modalidade === v} onChange={() => setModalidade(v)} className="accent-[var(--rt-gold)]" /> {t}
                </label>
              ))}
            </fieldset>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm">
                Vence em
                <Input type="date" value={ate} min={hojeMais(0)} onChange={e => setAte(e.target.value)} />
              </label>
              {modalidade === "pago" && (
                <label className="flex flex-col gap-1 text-sm">
                  Valor pago (R$)
                  <Input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value.replace(/[^\d,.]/g, ""))} placeholder="89,90" />
                </label>
              )}
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Motivo (fica registrado)
              <Input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={300} placeholder={modalidade === "pago" ? "Ex.: pagou por Pix em 06/11, comprovante no WhatsApp" : "Ex.: cortesia de boas-vindas"} />
            </label>
            {souAdmin && (
              <label className="flex flex-col gap-1 text-sm">
                Sua senha de administrador
                <Input type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} />
              </label>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onFechar} disabled={ocupado}>Voltar</Button>
              {souAdmin
                ? <Button disabled={!valido || !senha || ocupado} onClick={() => direto.mutate({ ...dados, senha })} className="bg-ok-600 text-white hover:bg-ok-700">
                    {ocupado ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" /> : <KeyRound className="mr-1.5 h-4 w-4" />} Autorizar
                  </Button>
                : <Button disabled={!valido || ocupado} onClick={() => pedir.mutate(dados)} className="bg-[var(--rt-gold)] text-black hover:bg-[var(--rt-gold-light)]">
                    {ocupado && <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" />} Pedir autorização
                  </Button>}
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-[var(--rt-gold)]/50 bg-[var(--rt-gold)]/10 p-3 text-center">
              <p className="text-xs text-muted-foreground">Código do pedido</p>
              <p className="text-3xl font-semibold tracking-normal tabular-nums text-[var(--rt-gold-light)]">{pedido.codigo}</p>
              <p className="mt-1 text-xs text-muted-foreground">O administrador recebeu o aviso no sininho e no celular. Ele autoriza pelo aparelho dele, ou digita a senha aqui.</p>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Senha do administrador
              <Input type="password" autoComplete="off" value={senha} onChange={e => setSenha(e.target.value)} />
            </label>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onFechar} disabled={ocupado}>Fechar (aguardar)</Button>
              <Button disabled={!senha || ocupado} onClick={() => autorizar.mutate({ id: pedido.id, senha })} className="bg-ok-600 text-white hover:bg-ok-700">
                {ocupado ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" /> : <KeyRound className="mr-1.5 h-4 w-4" />} Autorizar agora
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Pedidos de prorrogação aguardando a senha do administrador (e os decididos na semana) */
function PainelPedidos({ destaque, onMudou }: { destaque: string | null; onMudou: () => void }) {
  const { user } = useAuth();
  const souAdmin = perfilDe(user as any) === "admin";
  const { data } = trpc.controleAcessos.pedidos.useQuery(undefined, { refetchInterval: 20_000 });
  const [autorizando, setAutorizando] = useState<{ id: number; codigo: string; pessoa: string } | null>(null);
  const utils = trpc.useUtils();
  const encerrar = trpc.controleAcessos.encerrarPedido.useMutation({
    onSuccess: r => { toast.success(r.status === "RECUSADA" ? "Pedido recusado" : "Pedido cancelado"); utils.controleAcessos.pedidos.invalidate(); }, onError: e => toast.error(e.message),
  });
  const abertos = (data ?? []).filter(p => p.status === "PENDENTE");
  const decididos = (data ?? []).filter(p => p.status !== "PENDENTE").slice(0, 5);
  useEffect(() => {
    if (!destaque || !abertos.length || autorizando) return;
    const p = abertos.find(x => x.codigo === destaque);
    if (p && souAdmin) setAutorizando({ id: p.id, codigo: p.codigo, pessoa: p.pessoa });
  }, [destaque, abertos.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!abertos.length && !decididos.length) return null;
  const ROT: Record<string, string> = { APROVADA: "Autorizado", RECUSADA: "Recusado", CANCELADA: "Cancelado", EXPIRADA: "Expirou" };

  return (
    <section aria-label="Pedidos de prorrogação" className="rounded-lg border border-[var(--rt-gold)]/40 bg-card p-3">
      <h2 className="text-sm font-semibold text-foreground">Pedidos de prorrogação {abertos.length ? <span className="ml-1 rounded-full bg-[var(--rt-gold)] px-2 py-0.5 text-xs text-black">{abertos.length} aguardando</span> : null}</h2>
      <p className="mb-2 text-[11px] text-muted-foreground">Prorrogar, desbloquear e dar cortesia só valem com a senha do administrador. O pedido vale por 48 horas.</p>
      <ul className="space-y-2">
        {abertos.map(p => (
          <li key={p.id} className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm ${destaque === p.codigo ? "border-[var(--rt-gold)]" : "border-border"}`}>
            <span className="min-w-0 flex-1">
              <b className="text-foreground">{p.pessoa}</b>: {p.modalidade === "pago" ? "com pagamento" : "cortesia"} até {dataBr(`${p.ate}T12:00:00`)}{p.valor ? `, R$ ${p.valor.toFixed(2).replace(".", ",")}` : ""}
              <span className="block text-xs text-muted-foreground">Pedido por {p.solicitante} {haQuanto(p.criadoEm)}, código <b className="tabular-nums text-[var(--rt-gold-light)]">{p.codigo}</b>. Motivo: {p.motivo}</span>
            </span>
            <Button size="sm" className="h-8 bg-ok-600 text-white hover:bg-ok-700" onClick={() => setAutorizando({ id: p.id, codigo: p.codigo, pessoa: p.pessoa })}><KeyRound className="mr-1 h-3.5 w-3.5" /> Autorizar com senha</Button>
            {(souAdmin || p.solicitanteId === (user as any)?.id) && (
              <Button size="sm" variant="ghost" className="h-8 text-danger-300" disabled={encerrar.isPending} onClick={() => { if (confirm(souAdmin && p.solicitanteId !== (user as any)?.id ? `Recusar o pedido de ${p.pessoa}?` : `Cancelar o pedido de ${p.pessoa}?`)) encerrar.mutate({ id: p.id }); }}>
                {souAdmin && p.solicitanteId !== (user as any)?.id ? "Recusar" : "Cancelar"}
              </Button>
            )}
          </li>
        ))}
        {decididos.map(p => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
            <span className="flex-1">{p.pessoa}: {p.modalidade === "pago" ? "com pagamento" : "cortesia"} até {dataBr(`${p.ate}T12:00:00`)}</span>
            <span className={p.status === "APROVADA" ? "text-ok-300" : "text-danger-300"}>{ROT[p.status] ?? p.status}{p.decididoPor ? ` por ${p.decididoPor}` : ""}</span>
          </li>
        ))}
      </ul>
      {autorizando && <DialogoSenha pedido={autorizando} onFechar={() => setAutorizando(null)} onFeito={() => { setAutorizando(null); onMudou(); }} />}
    </section>
  );
}

function DialogoSenha({ pedido, onFechar, onFeito }: { pedido: { id: number; codigo: string; pessoa: string }; onFechar: () => void; onFeito: () => void }) {
  const [senha, setSenha] = useState("");
  const utils = trpc.useUtils();
  const autorizar = trpc.controleAcessos.autorizarPedido.useMutation({
    onSuccess: () => { toast.success(`Acesso de ${pedido.pessoa} prorrogado`); utils.controleAcessos.pedidos.invalidate(); onFeito(); },
    onError: e => { setSenha(""); toast.error(e.message); },
  });
  return (
    <Dialog open onOpenChange={v => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Autorizar pedido {pedido.codigo}</DialogTitle>
          <DialogDescription>Prorrogação do acesso de {pedido.pessoa}. Digite a senha do administrador.</DialogDescription>
        </DialogHeader>
        <form onSubmit={e => { e.preventDefault(); if (senha) autorizar.mutate({ id: pedido.id, senha }); }} className="space-y-3">
          <Input type="password" autoComplete="current-password" autoFocus value={senha} onChange={e => setSenha(e.target.value)} aria-label="Senha do administrador" />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onFechar} disabled={autorizar.isPending}>Voltar</Button>
            <Button type="submit" disabled={!senha || autorizar.isPending} className="bg-ok-600 text-white hover:bg-ok-700">
              {autorizar.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" /> : <KeyRound className="mr-1.5 h-4 w-4" />} Autorizar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoHistorico({ pessoa, onFechar }: { pessoa: Linha; onFechar: () => void }) {
  const { data, isLoading } = trpc.controleAcessos.historico.useQuery({ id: pessoa.id });
  return (
    <Dialog open onOpenChange={v => { if (!v) onFechar(); }}>
      <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico de {pessoa.nome}</DialogTitle>
          <DialogDescription>Entradas no sistema, liberações e bloqueios (os 30 mais recentes)</DialogDescription>
        </DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && !data?.length && <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>}
        <ol className="space-y-2">
          {data?.map(e => (
            <li key={e.id} className="rounded-md border border-border bg-secondary/20 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">{e.rotulo}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{dataHoraBr(e.quando)}</span>
              </div>
              {(e.motivo || e.por) && <p className="mt-0.5 text-xs text-muted-foreground">{e.motivo}{e.motivo && e.por ? ", " : ""}{e.por ? `por ${e.por}` : ""}</p>}
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
