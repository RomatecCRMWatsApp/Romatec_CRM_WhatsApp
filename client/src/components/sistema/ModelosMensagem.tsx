import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageSquareText, RotateCcw, Save } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROTULO_MODELO, VARIAVEIS_AGENDAMENTO, preencherModelo, type ChaveModelo } from "@shared/mensagensAgendamento";

/** Exemplo para a prévia */
const EXEMPLO: Record<string, string> = {
  nome: "Maria Souza", telefone: "(99) 9 8123-4567", cidade: "Açailândia", unidade: "B07", melhor_dia: "08/11/2026 (sábado)",
  melhor_horario: "8h às 10h", forma_pagamento: "Entrada parcelada", num_pessoas: "2", corretor_nome: "José Romário",
  corretor_creci: "4.705", corretor_telefone: "(99) 9 9181-1246",
};

/** Configurações → Mensagens do agendamento: os dois modelos com as variáveis, prévia e "voltar ao padrão" (só o administrador) */
export default function ModelosMensagem() {
  const { data } = trpc.crm.modelosMensagem.useQuery();
  const utils = trpc.useUtils();
  const [textos, setTextos] = useState<Record<string, string>>({});
  useEffect(() => { if (data) setTextos(Object.fromEntries(data.map(m => [m.chave, m.texto]))); }, [data]);
  const salvar = trpc.crm.salvarModeloMensagem.useMutation({
    onSuccess: () => { toast.success("Mensagem salva"); utils.crm.modelosMensagem.invalidate(); },
    onError: e => toast.error(e.message),
  });
  return (
    <Card className="bg-card border-border">
      <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><MessageSquareText className="h-5 w-5 text-primary" /> Mensagens do agendamento</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-muted-foreground">
          Variáveis: {VARIAVEIS_AGENDAMENTO.map(([k, r]) => <code key={k} title={r} className="mr-1 rounded bg-secondary px-1">{`{${k}}`}</code>)}.
          O corretor é quem recebeu o agendamento (sem ele, o administrador).
        </p>
        {(data ?? []).map(m => {
          const t = textos[m.chave] ?? m.texto;
          return (
            <div key={m.chave} className="space-y-2">
              <p className="text-sm font-semibold">{ROTULO_MODELO[m.chave as ChaveModelo]} {m.personalizado && <span className="text-xs font-normal text-primary">· personalizada</span>}</p>
              <textarea value={t} onChange={e => setTextos(s => ({ ...s, [m.chave]: e.target.value }))} rows={10} maxLength={3000}
                className="w-full rounded-md border border-border bg-secondary/30 p-2 text-sm" aria-label={ROTULO_MODELO[m.chave as ChaveModelo]} />
              <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">Prévia com um exemplo</summary>
                <pre className="mt-1 whitespace-pre-wrap rounded bg-secondary/40 p-2 font-sans">{preencherModelo(t, EXEMPLO)}</pre>
              </details>
              <div className="flex gap-2">
                <Button size="sm" disabled={salvar.isPending || t === m.texto} onClick={() => salvar.mutate({ chave: m.chave as ChaveModelo, texto: t })}><Save className="mr-1 h-4 w-4" /> Salvar</Button>
                <Button size="sm" variant="outline" disabled={salvar.isPending || (!m.personalizado && t === m.padrao)}
                  onClick={() => { if (confirm("Voltar ao texto padrão?")) { setTextos(s => ({ ...s, [m.chave]: m.padrao })); salvar.mutate({ chave: m.chave as ChaveModelo, texto: "" }); } }}>
                  <RotateCcw className="mr-1 h-4 w-4" /> Voltar ao padrão
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
