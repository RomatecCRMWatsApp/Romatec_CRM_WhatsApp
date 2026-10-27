import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Ban, ChevronDown, Download, FileSignature, Loader2, Pencil, Plus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ConfirmarCancelamento from "@/components/contratos/ConfirmarCancelamento";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { COR_STATUS_CONTRATO, ROTULO_STATUS_CONTRATO, podeCancelarContrato, type StatusContrato } from "@shared/contratos";
import { brl } from "@shared/simulador";

const FILTROS: { rotulo: string; status?: StatusContrato[] }[] = [
  { rotulo: "Todos" },
  { rotulo: "Em andamento", status: ["rascunho", "minuta", "apto_assinatura", "em_assinatura", "assinado"] },
  { rotulo: "Ativos", status: ["ativo"] },
  { rotulo: "Quitados", status: ["quitado"] },
  { rotulo: "Cancelados", status: ["cancelado", "distratado"] },
];

/** Modelos em PDF para baixar direto (nada é criado no sistema): contrato fictício, cliente exemplo, chácara A01 */
const MODELOS = [
  { url: "/api/contratos/modelo.pdf?slug=bom-jardims&lote=A01", nome: "CONTRATO-MODELO-CPCV-BOM-JARDIMS-A01.pdf", rotulo: "Contrato de compra e venda (CPCV)", demora: true },
  { url: "/api/contratos/modelos/intermediacao.pdf?slug=bom-jardims", nome: "MODELO-CONTRATO-INTERMEDIACAO-BOM-JARDIMS.pdf", rotulo: "Contrato de intermediação" },
  { url: "/api/contratos/modelos/diretrizes.pdf?slug=bom-jardims", nome: "DIRETRIZES-DE-USO-BOM-JARDIMS.pdf", rotulo: "Diretrizes de Uso (preenchidas pela proprietária)" },
  { url: "/api/contratos/modelos/estatuto.pdf?slug=bom-jardims", nome: "ESTATUTO-BOM-JARDIMS.pdf", rotulo: "Estatuto da associação", demora: true },
  { url: "/api/contratos/modelos/tabela.pdf?slug=bom-jardims", nome: "MODELO-TABELA-PAGAMENTO-ANEXO-II-BOM-JARDIMS.pdf", rotulo: "Tabela de pagamento (Anexo II)" },
  { url: "/api/contratos/modelos/carne.pdf?slug=bom-jardims", nome: "MODELO-CARNE-BOM-JARDIMS.pdf", rotulo: "Carnê de pagamento" },
  { url: "/api/contratos/modelos/boleto.pdf?slug=bom-jardims", nome: "MODELO-BOLETO-BOM-JARDIMS.pdf", rotulo: "Boleto de pagamento" },
  { url: "/api/contratos/modelos/recibo.pdf?slug=bom-jardims", nome: "MODELO-RECIBO-BOM-JARDIMS.pdf", rotulo: "Recibo de pagamento" },
];
const ENCERRADOS = ["cancelado", "distratado"];

export function SeloStatus({ status }: { status: string }) {
  const cor = COR_STATUS_CONTRATO[status as StatusContrato] ?? "#888";
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${cor}22`, color: cor, border: `1px solid ${cor}55` }}>
      {ROTULO_STATUS_CONTRATO[status as StatusContrato] ?? status}
    </span>
  );
}

/** Contratos (CPCV): lista com filtro por situação; o corretor vê só os dele */
export default function Contratos() {
  const [, navigate] = useLocation();
  const [filtro, setFiltro] = useState(0);
  const [busca, setBusca] = useState("");
  const [baixando, setBaixando] = useState<string | null>(null);
  // Modelos gerados na hora (nada é gravado): baixa o PDF direto, sem abrir
  const baixarModelo = async (m: typeof MODELOS[number]) => {
    setBaixando(m.rotulo);
    try {
      const r = await fetch(m.url, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url; a.download = m.nome; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) { toast.error(e?.message || "Falha ao gerar o modelo"); } finally { setBaixando(null); }
  };
  const { user } = useAuth();
  const perfil = perfilDe(user as any);
  const admin = podeCancelarContrato(perfil);
  const podePedir = perfil === "corretor" || perfil === "secretario";
  const utils = trpc.useUtils();
  // Cancelar (administrador, com a senha dele) ou pedir o cancelamento (corretor/secretária) direto da lista
  const [alvo, setAlvo] = useState<{ id: number; numero: string } | null>(null);
  const cancelar = trpc.contratos.cancelar.useMutation({
    onSuccess: r => {
      toast.success(r.jaCancelado ? "Contrato já estava cancelado" : `Contrato cancelado${r.loteLiberado ? " · chácara liberada" : ""}${r.cobrancasCanceladas ? ` · ${r.cobrancasCanceladas} cobrança(s) futura(s) cancelada(s)` : ""}`);
      if (r.falhasAsaas) toast.error(`${r.falhasAsaas} cobrança(s) não foram canceladas no Asaas — tente de novo pela aba Financeiro do contrato`);
      setAlvo(null); utils.contratos.listar.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const solicitar = trpc.contratos.solicitarCancelamento.useMutation({
    onSuccess: () => { toast.success("Pedido de cancelamento enviado ao administrador"); setAlvo(null); },
    onError: e => toast.error(e.message),
  });
  const { data, isLoading, error } = trpc.contratos.listar.useQuery();
  const lista = useMemo(() => {
    const f = FILTROS[filtro].status;
    const q = busca.trim().toLowerCase();
    return (data ?? []).filter(c => (!f || f.includes(c.status as StatusContrato)) &&
      (!q || [c.numero, c.comprador, c.loteCodigo, c.corretor].some(v => String(v).toLowerCase().includes(q))));
  }, [data, filtro, busca]);
  const abrir = (id: number) => navigate(`/contratos/${id}`);

  return (
    <div>
      <PageHeader icone={FileSignature} titulo="Contratos" subtitulo="Compromissos de compra e venda: minuta, definitivo, assinatura e cobrança"
        acoes={<div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!!baixando} title="Modelos com cliente fictício — nada é criado no sistema">
                {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {baixando ? `Gerando ${baixando.toLowerCase()}…` : "Baixar modelos (PDF)"} <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Cliente exemplo · chácara A01 · faixa "modelo"</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {MODELOS.map(m => (
                <DropdownMenuItem key={m.url} onSelect={() => baixarModelo(m)}>
                  <Download className="h-4 w-4" /> <span className="flex-1">{m.rotulo}</span>
                  {m.demora && <span className="text-[10px] text-muted-foreground">até 1 min</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => navigate("/contratos/novo")}><Plus className="h-4 w-4" /> Novo contrato</Button>
        </div>} />
      <div className="mx-auto max-w-[1400px] space-y-3 px-4 pb-8 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {FILTROS.map((f, i) => (
            <button key={f.rotulo} onClick={() => setFiltro(i)}
              className={`rounded-full border px-3 py-1 text-xs ${i === filtro ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {f.rotulo}
            </button>
          ))}
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nº, comprador, chácara…" aria-label="Buscar contrato"
            className="ml-auto h-8 w-full rounded-lg border border-border bg-background px-3 text-sm sm:w-64" />
        </div>
        {error && <p className="text-sm text-red-400">{error.message}</p>}
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {data && !lista.length && (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Nenhum contrato {filtro ? "nesta situação" : "ainda"}. Use “Novo contrato” para começar pela chácara e pelo plano.
          </p>
        )}
        <div className="grid gap-2">
          {lista.map(c => (
            <div key={c.id} role="link" tabIndex={0} onClick={() => abrir(c.id)} onKeyDown={e => e.key === "Enter" && abrir(c.id)}
              className="cursor-pointer rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/50">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold">{c.numero}</span>
                <SeloStatus status={c.status} />
                <span className="text-sm text-muted-foreground">{c.empreendimento} · Chácara {c.loteCodigo}</span>
                {/* Ações (o clique nelas não abre o contrato) */}
                <div className="ml-auto flex flex-wrap gap-1.5" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => abrir(c.id)} title="Abrir o contrato: minuta/definitivo, assinaturas e financeiro">
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                  {!ENCERRADOS.includes(c.status) && admin && (
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-400" onClick={() => setAlvo({ id: c.id, numero: c.numero })}
                      title="Cancela com a sua senha: libera a chácara e cancela as cobranças futuras. O histórico fica guardado.">
                      <XCircle className="h-3.5 w-3.5" /> Cancelar
                    </Button>
                  )}
                  {!ENCERRADOS.includes(c.status) && podePedir && (
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-400" onClick={() => setAlvo({ id: c.id, numero: c.numero })}
                      title="Só o administrador cancela: o pedido vai para ele">
                      <Ban className="h-3.5 w-3.5" /> Pedir cancelamento
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-3">
                <p>Comprador: <b className="text-foreground">{c.comprador}</b></p>
                <p>Corretor: <b className="text-foreground">{c.corretor}</b></p>
                <p>{c.modalidade === "avista" ? "À vista" : "Financiado"}{c.total != null ? ` · total ${brl(c.total)}` : ""}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <ConfirmarCancelamento aberto={!!alvo} onFechar={() => setAlvo(null)} comSenha={admin} pendente={cancelar.isPending || solicitar.isPending}
        titulo={admin ? `Cancelar o contrato ${alvo?.numero ?? ""}` : `Pedir o cancelamento do contrato ${alvo?.numero ?? ""}`}
        descricao={admin
          ? <>A chácara volta a ficar disponível e as cobranças futuras são canceladas no Asaas. O contrato não é apagado: o histórico e as versões ficam guardados.</>
          : <>Só o administrador cancela contratos. Seu pedido vai para ele com o motivo.</>}
        rotuloBotao={admin ? "Cancelar contrato" : "Enviar pedido"}
        onConfirmar={(motivo, senha) => {
          if (!alvo) return;
          if (admin) cancelar.mutate({ id: alvo.id, motivo, senha });
          else solicitar.mutate({ id: alvo.id, motivo });
        }} />
    </div>
  );
}
