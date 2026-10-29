import { useEffect, useState } from "react";
import { Bell, Download, MonitorSmartphone, Share, Smartphone } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useInstalarApp } from "@/lib/instalarApp";

/** /instalar — como instalar o CRM no celular e no computador (link e QR para mandar à equipe) */
export default function InstalarApp() {
  const app = useInstalarApp();
  const [qr, setQr] = useState("");
  const link = `${window.location.origin}/instalar`;
  useEffect(() => { import("qrcode").then(Q => Q.toString(link, { type: "svg", margin: 1, width: 220 })).then(setQr).catch(() => setQr("")); }, [link]);
  return (
    <div>
      <PageHeader icone={MonitorSmartphone} titulo="Instalar o app" subtitulo="O CRM vira um app no celular e no computador: ícone na tela, abre em tela cheia e recebe as notificações" />
      <div className="mx-auto max-w-[900px] space-y-4 px-4 pb-8 md:px-6 text-sm">
        {app.instalado && <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">✅ Você já está usando o app instalado.</p>}
        {app.podeInstalar && <Button onClick={() => app.instalar()}><Download className="mr-1.5 h-4 w-4" /> Instalar agora</Button>}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1 rounded-xl border border-border bg-card p-4"><p className="flex items-center gap-2 font-semibold"><Smartphone className="h-4 w-4" /> Android</p>
            <p className="text-muted-foreground">Abra no <b>Chrome</b> → toque em <b>Instalar o app</b> (no menu do CRM) ou ⋮ › <b>Instalar app</b>.</p></div>
          <div className="space-y-1 rounded-xl border border-border bg-card p-4"><p className="flex items-center gap-2 font-semibold"><Share className="h-4 w-4" /> iPhone / iPad</p>
            <p className="text-muted-foreground">Abra no <b>Safari</b> → <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b> → <b>Adicionar</b>.</p></div>
          <div className="space-y-1 rounded-xl border border-border bg-card p-4"><p className="flex items-center gap-2 font-semibold"><MonitorSmartphone className="h-4 w-4" /> Computador</p>
            <p className="text-muted-foreground">No Chrome ou Edge, clique no ícone de instalar na barra de endereço (ou em <b>Instalar o app</b> no menu).</p></div>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-border bg-card p-4"><Bell className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-muted-foreground">Depois de instalar, abra pelo ícone e aceite as notificações: lead novo, cliente aguardando, reserva, venda e chamados chegam no celular. No iPhone, as notificações só funcionam com o app instalado (iOS 16.4 ou mais novo).</p></div>
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
          {qr && <div className="h-36 w-36 rounded-lg bg-white p-1.5 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />}
          <div><p className="font-semibold">Mandar para a equipe</p><p className="text-muted-foreground">Aponte a câmera para o QR ou envie o link:</p><code className="break-all text-xs">{link}</code></div>
        </div>
      </div>
    </div>
  );
}
