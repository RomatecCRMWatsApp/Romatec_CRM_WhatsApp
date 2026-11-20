/**
 * /privacidade/pedidos — gestão dos pedidos de titular (só administrador; o servidor também confere).
 * Verificar identidade, atribuir responsável/situação/resposta, exportar dados (link de 15 min) e anonimizar
 * (simulação primeiro; execução real com senha e confirmação digitada).
 */
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { STATUS_PEDIDO, TIPOS_PEDIDO, type StatusPedido, type TipoPedido } from "@shared/privacidade";

const data = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString("pt-BR") : "—");
const inp = "w-full rounded-md border px-2 py-1 text-sm bg-background";

function Pedido({ p, recarregar }: { p: any; recarregar: () => void }) {
  const [resposta, setResposta] = useState<string>(p.resposta ?? "");
  const [justificativa, setJustificativa] = useState("");
  const [crit, setCrit] = useState({ telefone: p.contatoTipo === "telefone" ? p.contato : "", cpf: "", email: p.contatoTipo === "email" ? p.contato : "" });
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const eventos = trpc.privacidade.eventos.useQuery({ id: p.id });
  const ok = (m: string) => () => { toast.success(m); recarregar(); eventos.refetch(); };
  const erro = (e: { message: string }) => toast.error(e.message);
  const verificar = trpc.privacidade.verificarManual.useMutation({ onSuccess: ok("Identidade confirmada"), onError: erro });
  const atualizar = trpc.privacidade.atualizarPedido.useMutation({ onSuccess: ok("Pedido atualizado"), onError: erro });
  const exportar = trpc.privacidade.linkExportacao.useMutation({ onSuccess: r => { window.open(r.url, "_blank", "noopener"); eventos.refetch(); }, onError: erro });
  const criterios = { telefone: crit.telefone || null, cpf: crit.cpf || null, email: crit.email || null };
  const [simular, setSimular] = useState(false);
  const plano = trpc.privacidade.planejarAnonimizacao.useQuery({ criterios }, { enabled: simular, retry: false });
  const anonimizar = trpc.privacidade.anonimizar.useMutation({ onSuccess: ok("Anonimização executada"), onError: erro });
  const verificado = p.status !== "aguardando_verificacao";

  return (
    <Card className={p.atrasado ? "border-red-500" : ""}>
      <CardContent className="space-y-3 pt-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <div>
            <strong>{p.protocolo}</strong> · {TIPOS_PEDIDO[p.tipo as TipoPedido] ?? p.tipo}
            <div className="text-muted-foreground">{p.nome} · {p.contato} · aberto em {data(p.criadoEm)} · prazo {data(p.prazoEm)}{p.atrasado ? " · ATRASADO" : ""}</div>
          </div>
          <span className="rounded bg-muted px-2 py-0.5 h-fit">{STATUS_PEDIDO[p.status as StatusPedido] ?? p.status}</span>
        </div>
        {p.descricao && <p className="whitespace-pre-wrap">{p.descricao}</p>}

        {!verificado && (
          <div className="flex gap-2">
            <input className={inp} placeholder="Como a identidade foi confirmada (ex.: retorno pelo WhatsApp já cadastrado em …)" value={justificativa} onChange={e => setJustificativa(e.target.value)} />
            <Button size="sm" onClick={() => verificar.mutate({ id: p.id, justificativa })}>Confirmar identidade</Button>
          </div>
        )}

        {verificado && (
          <>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <textarea className={inp} placeholder="Resposta/justificativa dada ao titular" value={resposta} onChange={e => setResposta(e.target.value)} />
              <div className="flex flex-col gap-1">
                <select className={inp} defaultValue={p.status} onChange={e => atualizar.mutate({ id: p.id, status: e.target.value as StatusPedido, resposta })}>
                  {Object.entries(STATUS_PEDIDO).filter(([k]) => k !== "aguardando_verificacao").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <Button size="sm" variant="outline" onClick={() => atualizar.mutate({ id: p.id, resposta })}>Salvar resposta</Button>
              </div>
            </div>

            <div className="rounded border p-2 space-y-2">
              <div className="font-semibold">Localizar os dados do titular (confira antes de exportar ou anonimizar)</div>
              <div className="grid gap-2 sm:grid-cols-3">
                <input className={inp} placeholder="Telefone" value={crit.telefone} onChange={e => setCrit(c => ({ ...c, telefone: e.target.value }))} />
                <input className={inp} placeholder="CPF/CNPJ" value={crit.cpf} onChange={e => setCrit(c => ({ ...c, cpf: e.target.value }))} />
                <input className={inp} placeholder="E-mail" value={crit.email} onChange={e => setCrit(c => ({ ...c, email: e.target.value }))} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => exportar.mutate({ id: p.id, criterios, formato: "json" })}>Exportar JSON</Button>
                <Button size="sm" variant="outline" onClick={() => exportar.mutate({ id: p.id, criterios, formato: "csv" })}>Exportar CSV</Button>
                <Button size="sm" variant="outline" onClick={() => { setSimular(true); plano.refetch(); }}>Simular anonimização</Button>
              </div>
              {plano.error && <p className="text-red-600">{plano.error.message}</p>}
              {plano.data && (
                <div className="space-y-2">
                  <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">{JSON.stringify(plano.data, null, 2)}</pre>
                  <div className="flex flex-wrap gap-2">
                    <input className={inp} type="password" placeholder="Sua senha" value={senha} onChange={e => setSenha(e.target.value)} />
                    <input className={inp} placeholder='Digite ANONIMIZAR' value={confirmacao} onChange={e => setConfirmacao(e.target.value)} />
                    <Button size="sm" variant="destructive" disabled={confirmacao !== "ANONIMIZAR" || !senha}
                      onClick={() => anonimizar.mutate({ id: p.id, criterios, senha, confirmacao: "ANONIMIZAR" })}>Anonimizar (irreversível)</Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <details>
          <summary className="cursor-pointer text-muted-foreground">Trilha do pedido</summary>
          <ul className="text-xs">
            {(eventos.data ?? []).map((e: any) => <li key={e.id}>{data(e.criadoEm)} — {e.evento}{e.usuarioId ? ` (usuário ${e.usuarioId})` : ""}</li>)}
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}

export default function PrivacidadePedidos() {
  const [status, setStatus] = useState<StatusPedido | "">("");
  const q = trpc.privacidade.pedidos.useQuery(status ? { status } : undefined);
  return (
    <div className="space-y-4 p-4">
      <PageHeader titulo="Pedidos de privacidade (LGPD)" icone={ShieldCheck}
        subtitulo="Pedidos de titulares recebidos pelo formulário /privacidade. Confirme a identidade antes de atender."
        acoes={(
          <select className={inp} value={status} onChange={e => setStatus(e.target.value as StatusPedido | "")}>
            <option value="">Todas as situações</option>
            {Object.entries(STATUS_PEDIDO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )} />
      {q.error && <p className="text-red-600">{q.error.message}</p>}
      {(q.data ?? []).length === 0 && !q.isLoading && <p className="text-muted-foreground">Nenhum pedido.</p>}
      {(q.data ?? []).map((p: any) => <Pedido key={p.id} p={p} recarregar={() => q.refetch()} />)}
    </div>
  );
}
