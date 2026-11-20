import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Copy, Loader2, MessageCircle, Plus, Video, XCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import ChamadaJitsi, { type EntradaSala } from "@/components/salaVideo/ChamadaJitsi";
import { textoConviteSala } from "@shared/salaVideo";

/*
 * Sala de vídeo: reunião por vídeo no navegador (Jitsi), sem instalar nada.
 * Cria a sala, manda o link pelo WhatsApp e entra. O convidado abre /sala/<codigo> e digita só o nome.
 */

const campo = "block h-11 w-full rounded-md border border-border bg-background px-3 text-base md:text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring";

function copiar(texto: string, aviso: string) {
  navigator.clipboard?.writeText(texto).then(() => toast.success(aviso)).catch(() => toast.info(texto));
}
function convidarPorWhatsApp(titulo: string, link: string, anfitriao?: string | null) {
  window.open(`https://wa.me/?text=${encodeURIComponent(textoConviteSala({ titulo, link, anfitriao }))}`, "_blank", "noopener");
}

function Sala({ codigo }: { codigo: string }) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [entrada, setEntrada] = useState<(EntradaSala & { titulo: string; link: string }) | null>(null);
  const entrar = trpc.salaVideo.entrar.useMutation({
    onSuccess: e => setEntrada(e as EntradaSala & { titulo: string; link: string }),
    onError: e => toast.error(e.message),
  });
  const encerrar = trpc.salaVideo.encerrar.useMutation({
    onSuccess: () => { toast.success("Sala encerrada: o link deixa de funcionar."); utils.salaVideo.listar.invalidate(); navigate("/sala-video"); },
    onError: e => toast.error(e.message),
  });
  const { data: salas } = trpc.salaVideo.listar.useQuery();
  const sala = salas?.find(s => s.codigo === codigo);
  const titulo = entrada?.titulo ?? sala?.titulo ?? "Sala de vídeo";
  const link = entrada?.link ?? sala?.link ?? `${window.location.origin}/sala/${codigo}`;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-8 md:px-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/sala-video")}><ArrowLeft className="mr-1 h-4 w-4" />Salas</Button>
        <h2 className="mr-auto text-lg font-semibold text-foreground">{titulo}</h2>
        <Button variant="outline" size="sm" onClick={() => copiar(link, "Link da sala copiado")}><Copy className="mr-2 h-4 w-4" aria-hidden />Copiar link</Button>
        <Button variant="outline" size="sm" onClick={() => convidarPorWhatsApp(titulo, link, user?.name)}><MessageCircle className="mr-2 h-4 w-4" aria-hidden />Convidar pelo WhatsApp</Button>
        <Button variant="ghost" size="sm" className="text-destructive" disabled={encerrar.isPending} onClick={() => { if (confirm("Encerrar a sala? O link deixa de funcionar para todos.")) encerrar.mutate({ codigo }); }}><XCircle className="mr-2 h-4 w-4" aria-hidden />Encerrar</Button>
      </div>
      {entrada ? (
        <ChamadaJitsi entrada={entrada} onSair={() => setEntrada(null)} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card p-10 text-center">
          <Video className="h-12 w-12 text-[var(--rt-gold-light)]" aria-hidden />
          <p className="max-w-md text-sm text-muted-foreground">Convide os participantes pelo WhatsApp ou copie o link. Eles entram pelo navegador, só digitando o nome — no celular ou no computador.</p>
          <Button size="lg" onClick={() => entrar.mutate({ codigo })} disabled={entrar.isPending}>
            {entrar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Video className="mr-2 h-4 w-4" aria-hidden />}Entrar na sala
          </Button>
        </div>
      )}
    </div>
  );
}

function Lista() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [titulo, setTitulo] = useState("");
  const { data: salas, isLoading } = trpc.salaVideo.listar.useQuery();
  const { data: status } = trpc.salaVideo.status.useQuery();
  const criar = trpc.salaVideo.criar.useMutation({
    onSuccess: s => { utils.salaVideo.listar.invalidate(); navigate(`/sala-video/${s.codigo}`); },
    onError: e => toast.error(e.message),
  });
  const ativas = (salas ?? []).filter(s => !s.encerrada);
  const antigas = (salas ?? []).filter(s => s.encerrada);

  return (
    <div className="mx-auto grid max-w-[1100px] gap-6 px-4 pb-10 md:px-6">
      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <h2 className="text-base font-semibold text-foreground">Nova sala</h2>
        <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={e => { e.preventDefault(); criar.mutate({ titulo: titulo.trim() || `Reunião com ${user?.name?.split(" ")[0] ?? "a equipe"}` }); }}>
          <input className={campo} value={titulo} maxLength={120} onChange={e => setTitulo(e.target.value)} placeholder="Ex.: Reunião com os corretores · Apresentação do Bom Jardims" aria-label="Nome da reunião" />
          <Button type="submit" size="lg" disabled={criar.isPending}>{criar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Criar e entrar</Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Vídeo, áudio, chat, compartilhar a tela e levantar a mão, pelo navegador.
          {status?.modo === "aba" ? " Hoje a chamada abre numa aba do Jitsi gratuito; com o Jitsi como serviço (JaaS) configurado, ela passa a abrir aqui dentro do CRM." : " A chamada abre aqui dentro do CRM."}
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Salas abertas</h2>
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : !ativas.length ? (
          <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">Nenhuma sala aberta. Crie uma acima.</p>
        ) : (
          <ul className="grid gap-2">
            {ativas.map(s => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
                <Video className="h-5 w-5 text-[var(--rt-gold-light)]" aria-hidden />
                <div className="mr-auto min-w-0">
                  <p className="truncate font-medium text-foreground">{s.titulo}</p>
                  <p className="text-xs text-muted-foreground">{s.criadaEm ? new Date(s.criadaEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : ""}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => copiar(s.link, "Link da sala copiado")}><Copy className="mr-1 h-4 w-4" />Link</Button>
                <Button size="sm" variant="outline" onClick={() => convidarPorWhatsApp(s.titulo, s.link, user?.name)}><MessageCircle className="mr-1 h-4 w-4" />WhatsApp</Button>
                <Button size="sm" onClick={() => navigate(`/sala-video/${s.codigo}`)}><Video className="mr-1 h-4 w-4" />Entrar</Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {antigas.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Encerradas</h2>
          <ul className="grid gap-1 text-sm text-muted-foreground">
            {antigas.slice(0, 20).map(s => <li key={s.id}>{s.titulo} · {s.criadaEm ? new Date(s.criadaEm).toLocaleDateString("pt-BR") : ""}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function SalaVideo() {
  const [naSala, p] = useRoute("/sala-video/:codigo");
  return (
    <div>
      <PageHeader icone={Video} titulo="Sala de vídeo" subtitulo="Reuniões por vídeo no navegador com corretores e clientes — mande o link pelo WhatsApp" />
      {naSala && p?.codigo ? <Sala codigo={p.codigo} /> : <Lista />}
    </div>
  );
}
