/**
 * Configurações › Resumo semanal no WhatsApp: liga/desliga, mostra a prévia da mensagem desta semana e envia agora.
 * Sai sozinho toda segunda, a partir das 8h (server/resumoSemanal.ts).
 */
import { useState } from "react";
import { toast } from "sonner";
import { Eye, Loader2, Send } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export default function ResumoSemanalConfig() {
  const utils = trpc.useUtils();
  const { data: estado } = trpc.resumoSemanal.estado.useQuery();
  const [verPrevia, setVerPrevia] = useState(false);
  const previa = trpc.resumoSemanal.previa.useQuery(undefined, { enabled: verPrevia, staleTime: 60_000 });
  const ligar = trpc.resumoSemanal.definirLigado.useMutation({
    onSuccess: (_r, v) => { utils.resumoSemanal.estado.invalidate(); toast.success(v.ligado ? "Resumo semanal ligado" : "Resumo semanal desligado"); },
    onError: e => toast.error(e.message),
  });
  const enviar = trpc.resumoSemanal.enviarAgora.useMutation({
    onSuccess: r => {
      const falhas = r.resultado.filter(x => !x.ok);
      if (falhas.length) toast.error(`Não enviou para ${falhas.map(f => `${f.nome} (${f.erro})`).join(", ")}`);
      else toast.success(`Resumo enviado no WhatsApp (${r.resultado.map(x => x.nome).join(", ")})`);
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Card className="bg-card border-border">
      <CardHeader><CardTitle className="text-foreground">Resumo da semana no WhatsApp</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Toda segunda, a partir das 8h, chega no WhatsApp do administrador o resumo da semana: leads e de onde vieram, visitas, vendas,
          o que foi recebido e o que está em atraso, corretores parados e licenças vencendo.
        </p>
        <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
          <span className="text-sm text-foreground">Enviar toda segunda</span>
          <Switch checked={estado?.ligado ?? true} disabled={!estado || ligar.isPending} onCheckedChange={v => ligar.mutate({ ligado: v })} aria-label="Enviar o resumo toda segunda" />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setVerPrevia(v => !v)}><Eye className="mr-1.5 h-4 w-4" /> {verPrevia ? "Esconder a prévia" : "Ver a prévia"}</Button>
          <Button size="sm" className="bg-ok-600 text-white hover:bg-ok-700" disabled={enviar.isPending}
            onClick={() => { if (confirm("Enviar o resumo da semana agora para o seu WhatsApp?")) enviar.mutate(); }}>
            {enviar.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Send className="mr-1.5 h-4 w-4" />} Enviar agora
          </Button>
        </div>
        {verPrevia && (
          previa.isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Montando…</p>
          : previa.error ? <p className="text-sm text-danger-300">{previa.error.message}</p>
          : previa.data && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Vai para: {previa.data.destinatarios.length ? previa.data.destinatarios.map(d => `${d.nome} (${d.telefone})`).join(", ") : "nenhum administrador com telefone cadastrado"}
              </p>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-ok-600/15 p-3 font-sans text-sm text-foreground">{previa.data.texto}</pre>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
