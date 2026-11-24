import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Loader2, Send, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

/**
 * WhatsApp oficial (API da Meta): situação do número, teste de envio e atalhos da conversa.
 * Liga trocando WHATSAPP_PROVIDER para "cloud" no Railway (passo a passo em docs/whatsapp-api-oficial.md).
 */
export default function WhatsappOficial() {
  const { data, isLoading, refetch, isFetching } = trpc.companyConfig.whatsappOficial.useQuery(undefined, { retry: false });
  const teste = trpc.companyConfig.whatsappOficialTeste.useMutation({
    onSuccess: () => toast.success("Mensagem enviada pelo WhatsApp oficial. Confira no celular."),
    onError: e => toast.error(e.message),
  });
  const atalhos = trpc.companyConfig.whatsappOficialAtalhos.useMutation({
    onSuccess: () => toast.success("Boas-vindas e atalhos salvos no número oficial."),
    onError: e => toast.error(e.message),
  });
  const [telefone, setTelefone] = useState("");
  const [lista, setLista] = useState<string[]>([]);
  useEffect(() => { if (data?.atalhosPadrao && !lista.length) setLista(data.atalhosPadrao); }, [data?.atalhosPadrao]); // eslint-disable-line react-hooks/exhaustive-deps

  const st = data?.status;
  const item = (ok: boolean, texto: string) => (
    <li className="flex items-start gap-2">
      <span aria-hidden className={`mt-1 h-2 w-2 shrink-0 rounded-full ${ok ? "bg-ok-500" : "bg-warn-400"}`} />
      <span className={ok ? "text-foreground" : "text-warn-300"}>{texto}</span>
    </li>
  );

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <BadgeCheck className="h-5 w-5 text-primary" /> WhatsApp oficial (API da Meta)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Número verificado pela Meta, sem QR code e sem cair. A primeira mensagem para quem não escreveu nas últimas 24 h sai por um modelo aprovado.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {data && (
          <>
            <div className={`rounded-lg border p-3 ${data.ativo ? "border-ok-500/40 bg-ok-500/10" : "border-border"}`}>
              <p className="font-semibold">{data.ativo ? "Ligado: o CRM está enviando pelo WhatsApp oficial" : "Desligado: o CRM ainda envia pela Z-API"}</p>
              {st && <p className="mt-1 text-muted-foreground">{st.nome ? `${st.nome} · ` : ""}{st.numero ? `${st.numero} · ` : ""}{st.resumo}{st.erro ? `: ${st.erro}` : ""}</p>}
              {!data.ativo && <p className="mt-1 text-muted-foreground">Para ligar, defina WHATSAPP_PROVIDER=cloud no Railway depois de preencher os itens abaixo.</p>}
            </div>
            <ul className="space-y-1.5">
              {item(data.configurado, data.configurado ? "Token e Phone Number ID preenchidos" : "Falta WHATSAPP_CLOUD_TOKEN e WHATSAPP_CLOUD_PHONE_NUMBER_ID")}
              {item(data.verifyTokenDefinido && data.appSecretDefinido, data.verifyTokenDefinido && data.appSecretDefinido
                ? `Webhook pronto: ${window.location.origin}${data.webhook}`
                : "Falta WHATSAPP_CLOUD_VERIFY_TOKEN e o App Secret (WHATSAPP_CLOUD_APP_SECRET) para receber as mensagens")}
              {item(!!data.templateRetomada, data.templateRetomada ? `Modelo da retomada: ${data.templateRetomada}` : "Falta o modelo da retomada (WHATSAPP_CLOUD_TEMPLATE_RETOMADA): sem ele, a retomada dos leads importados não sai")}
              {item(!!data.templatePadrao, data.templatePadrao ? `Modelo padrão (avisos e lembretes fora das 24 h): ${data.templatePadrao}` : "Sem modelo padrão: avisos e lembretes para quem não escreveu em 24 h não saem")}
            </ul>

            {data.configurado && (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="font-medium">Testar envio</p>
                <div className="flex flex-wrap gap-2">
                  <Input className="max-w-[220px]" inputMode="tel" placeholder="(99) 99999-9999" value={telefone} onChange={e => setTelefone(e.target.value)} aria-label="Telefone para o teste" />
                  <Button variant="outline" disabled={telefone.replace(/\D/g, "").length < 10 || teste.isPending} onClick={() => teste.mutate({ telefone, modelo: true })}>
                    {teste.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Teste com modelo
                  </Button>
                  <Button variant="outline" disabled={telefone.replace(/\D/g, "").length < 10 || teste.isPending} onClick={() => teste.mutate({ telefone, modelo: false })}>
                    Teste com texto
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">O teste com texto só chega se esse número mandou mensagem para o número oficial nas últimas 24 h.</p>
              </div>
            )}

            {data.configurado && (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="font-medium">Atalhos da conversa</p>
                <p className="text-xs text-muted-foreground">Aparecem para o cliente quando ele abre a conversa pela primeira vez (até 4, 80 letras cada). Ao tocar, vira a mensagem dele e o robô responde.</p>
                {lista.map((a, i) => (
                  <Input key={i} maxLength={80} value={a} aria-label={`Atalho ${i + 1}`} onChange={e => setLista(l => l.map((x, j) => (j === i ? e.target.value : x)))} />
                ))}
                <Button variant="outline" disabled={atalhos.isPending} onClick={() => atalhos.mutate({ boasVindas: true, atalhos: lista.filter(a => a.trim()) })}>
                  {atalhos.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Salvar atalhos no número oficial
                </Button>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-1 h-4 w-4" />} Verificar de novo
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
