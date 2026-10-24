import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BellRing, BellOff, Smartphone } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { cancelarAparelho, estadoPush, inscreverAparelho, type EstadoPush } from "@/lib/push";
import { COR_NOTIFICACAO, ROTULO_NOTIFICACAO, SOM_POR_TIPO, type TipoNotificacao } from "@shared/notificacoes";

/**
 * Notificações do sininho (v1.8.0): reserva, venda/contrato, liberação de lote e sistema atualizado.
 * Com o app aberto: confere a cada 20 s (e na hora, quando chega um push) e toca o som do tipo.
 * Com o app fechado: Web Push do sistema (som do celular).
 */
export type NotificacaoTela = { id: number; tipo: TipoNotificacao; titulo: string; mensagem: string; url: string | null; lida: boolean; criadoEm: string };

const INTERVALO = 20_000;

// Política de autoplay: o som só toca depois do primeiro toque/tecla da pessoa na página
let audioLiberado = false;
if (typeof window !== "undefined") {
  const liberar = () => { audioLiberado = true; window.removeEventListener("pointerdown", liberar); window.removeEventListener("keydown", liberar); };
  window.addEventListener("pointerdown", liberar);
  window.addEventListener("keydown", liberar);
}

export function tocarSom(tipo: TipoNotificacao) {
  if (!audioLiberado) return;
  const a = new Audio(SOM_POR_TIPO[tipo]);
  a.volume = 0.8;
  a.play().catch(() => {});
}

/** Lista e não lidas do sininho (o polling fica em useAlertasNotificacoes) */
export function useNotificacoes(habilitado = true) {
  const { data } = trpc.notificacoes.listar.useQuery(undefined, { enabled: habilitado, staleTime: 10_000 });
  return { itens: (data?.itens ?? []) as NotificacaoTela[], naoLidas: data?.naoLidas ?? 0 };
}

/**
 * Montado uma vez (CamadaSistema): confere novas, toca o som e mostra o aviso; trata o toque
 * na notificação do sistema (?notif=ID marca como lida; ?notificacoes=1 abre o sininho).
 */
export function useAlertasNotificacoes(habilitado: boolean, abrirPainel: () => void) {
  const utils = trpc.useUtils();
  const { data } = trpc.notificacoes.listar.useQuery(undefined, {
    enabled: habilitado, refetchInterval: INTERVALO, refetchIntervalInBackground: false, refetchOnWindowFocus: true,
  });
  const marcar = trpc.notificacoes.marcarLidas.useMutation({ onSuccess: () => utils.notificacoes.listar.invalidate() });
  const ultimoId = useRef<number | null>(null);

  useEffect(() => {
    if (!data) return;
    const itens = data.itens as NotificacaoTela[];
    const maior = itens.reduce((m, n) => Math.max(m, n.id), 0);
    if (ultimoId.current === null) { ultimoId.current = maior; return; } // 1ª carga: sem som
    const novas = itens.filter(n => n.id > ultimoId.current! && !n.lida);
    ultimoId.current = Math.max(ultimoId.current, maior);
    if (!novas.length) return;
    tocarSom(novas[0].tipo);
    for (const n of novas.slice(0, 3).reverse()) toast(n.titulo, { description: n.mensagem, action: { label: "Ver", onClick: abrirPainel } });
  }, [data, abrirPainel]);

  // Push com o CRM em foco: o service worker avisa a aba em vez de mostrar a notificação do sistema
  useEffect(() => {
    if (!habilitado || !("serviceWorker" in navigator)) return;
    const msg = (e: MessageEvent) => { if (e.data?.tipo === "romatec:notificacao") utils.notificacoes.listar.invalidate(); };
    navigator.serviceWorker.addEventListener("message", msg);
    return () => navigator.serviceWorker.removeEventListener("message", msg);
  }, [habilitado, utils]);

  // Chegou pelo toque na notificação do sistema
  useEffect(() => {
    if (!habilitado) return;
    const q = new URLSearchParams(window.location.search);
    const id = Number(q.get("notif"));
    if (id > 0) marcar.mutate({ ids: [id] });
    if (q.get("notificacoes") === "1") abrirPainel();
    if (q.has("notif") || q.has("notificacoes")) {
      q.delete("notif"); q.delete("notificacoes");
      const resto = q.toString();
      window.history.replaceState(null, "", window.location.pathname + (resto ? `?${resto}` : ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habilitado]);
}

const quando = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit" });
};

/** Lista do sininho: tocar abre o item (e marca como lida) */
export function ListaNotificacoes({ habilitado, onAbrir }: { habilitado: boolean; onAbrir: (url: string | null) => void }) {
  const utils = trpc.useUtils();
  const { itens, naoLidas } = useNotificacoes(habilitado);
  const marcar = trpc.notificacoes.marcarLidas.useMutation({ onSuccess: () => utils.notificacoes.listar.invalidate() });
  return (
    <div className="space-y-2">
      <AtivarPush compacto />
      {naoLidas > 0 && <button type="button" className="text-xs text-primary hover:underline" onClick={() => marcar.mutate({})}>Marcar todas como lidas ({naoLidas})</button>}
      {itens.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma notificação ainda. Reservas, vendas e lotes liberados aparecem aqui.</p>}
      {itens.map(n => (
        <button key={n.id} type="button" onClick={() => { if (!n.lida) marcar.mutate({ ids: [n.id] }); onAbrir(n.url); }}
          className={`flex w-full items-start gap-2.5 rounded-lg border p-3 text-left ${n.lida ? "border-border" : "border-[var(--rt-gold)]/60 bg-[var(--rt-gold)]/5"}`}>
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_NOTIFICACAO[n.tipo] }} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              {ROTULO_NOTIFICACAO[n.tipo]}
              {!n.lida && <span className="rounded bg-red-500 px-1.5 text-[10px] font-bold normal-case tracking-normal text-white">nova</span>}
              <span className="ml-auto normal-case tracking-normal">{quando(n.criadoEm)}</span>
            </span>
            <span className="block text-sm font-semibold">{n.titulo}</span>
            <span className="block text-sm text-muted-foreground">{n.mensagem}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

const TEXTO_ESTADO: Record<EstadoPush, string> = {
  sem_suporte: "Este navegador não recebe notificações com o app fechado.",
  ios_instalar: "No iPhone/iPad: toque em Compartilhar › \"Adicionar à Tela de Início\" e abra o CRM pelo ícone (iOS 16.4 ou mais novo) para receber notificações.",
  negado: "Notificações bloqueadas neste navegador. Libere nas configurações do site (cadeado ao lado do endereço) e volte aqui.",
  ativo: "Este aparelho recebe as notificações mesmo com o CRM fechado.",
  disponivel: "Receba reservas, vendas e lotes liberados mesmo com o CRM fechado.",
};

/** Ativar/desativar o push neste aparelho (sininho e Meu cadastro › Preferências) */
export function AtivarPush({ compacto }: { compacto?: boolean }) {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const { data: chave } = trpc.notificacoes.chavePush.useQuery(undefined, { staleTime: Infinity });
  const inscrever = trpc.notificacoes.inscreverPush.useMutation();
  const cancelar = trpc.notificacoes.cancelarPush.useMutation();
  useEffect(() => { estadoPush().then(setEstado).catch(() => setEstado("sem_suporte")); }, []);
  if (!estado || !chave?.chave) return null; // push desligado no servidor (sem chaves VAPID)
  if (compacto && estado === "ativo") return null;

  const ativar = async () => {
    setOcupado(true);
    try {
      await inscrever.mutateAsync(await inscreverAparelho(chave.chave!));
      setEstado("ativo");
      toast.success("Notificações ativadas neste aparelho");
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível ativar");
      setEstado(await estadoPush());
    } finally { setOcupado(false); }
  };
  const desativar = async () => {
    setOcupado(true);
    try {
      const endpoint = await cancelarAparelho();
      if (endpoint) await cancelar.mutateAsync({ endpoint });
      setEstado("disponivel");
      toast.success("Notificações desativadas neste aparelho");
    } finally { setOcupado(false); }
  };

  return (
    <div className={`rounded-lg border border-border p-3 text-sm ${compacto ? "bg-secondary/30" : ""}`}>
      <p className="flex items-center gap-2 font-medium">
        {estado === "ativo" ? <BellRing className="h-4 w-4 text-emerald-400" /> : estado === "disponivel" ? <Smartphone className="h-4 w-4 text-[var(--rt-gold)]" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
        Notificações no celular
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{TEXTO_ESTADO[estado]}</p>
      {estado === "disponivel" && <Button size="sm" className="mt-2" disabled={ocupado} onClick={ativar}>Ativar neste aparelho</Button>}
      {estado === "ativo" && <Button size="sm" variant="outline" className="mt-2" disabled={ocupado} onClick={desativar}>Desativar neste aparelho</Button>}
    </div>
  );
}
