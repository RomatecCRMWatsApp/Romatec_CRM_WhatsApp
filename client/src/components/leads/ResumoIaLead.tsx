import { useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Resumo = { resumo: string; interesse: string; objecoes: string[]; proximoPasso: string; mensagemSugerida: string; geradoEm: string; mensagens: number };

/**
 * Resumo da conversa e próxima mensagem sugerida pela IA (crm.resumoIa). Só gera quando o corretor pede; a mensagem dá
 * para ajustar antes de mandar. Enviar pelo WhatsApp conta como atendido.
 */
export default function ResumoIaLead({ leadId, phone, onEnviou }: { leadId: number; phone: string; onEnviou?: () => void }) {
  const [r, setR] = useState<Resumo | null>(null);
  const [texto, setTexto] = useState("");
  const gerar = trpc.crm.resumoIa.useMutation({
    onSuccess: x => { setR(x); setTexto(x.mensagemSugerida); },
    onError: e => toast.error(e.message),
  });
  const abriu = trpc.crm.abriuWhatsApp.useMutation({ onSuccess: () => onEnviou?.() });
  const fone = phone.replace(/\D/g, "");
  const copiar = async () => { try { await navigator.clipboard.writeText(texto); toast.success("Mensagem copiada"); } catch { window.prompt("Copie:", texto); } };
  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-violet-300" /> Resumo da IA</CardTitle>
        <Button size="sm" variant={r ? "ghost" : "default"} disabled={gerar.isPending} onClick={() => gerar.mutate({ id: leadId, forcar: !!r })} title={r ? "Gerar de novo" : undefined}>
          {gerar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : r ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
          {r ? "" : "Resumir conversa"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!r && !gerar.isPending && <p className="text-xs text-muted-foreground">A IA lê a conversa e os dados do lead, resume e sugere a próxima mensagem. Ela não inventa valores nem condições.</p>}
        {gerar.isPending && !r && <p className="text-xs text-muted-foreground">Lendo a conversa…</p>}
        {r && (
          <>
            <p>{r.resumo}</p>
            {r.interesse && <p><span className="text-muted-foreground">Interesse:</span> {r.interesse}</p>}
            {r.objecoes.length > 0 && (
              <div><p className="text-muted-foreground">Dúvidas / objeções em aberto:</p>
                <ul className="ml-4 list-disc">{r.objecoes.map(o => <li key={o}>{o}</li>)}</ul></div>
            )}
            {r.proximoPasso && <p className="rounded-md bg-violet-500/10 px-2 py-1.5"><span className="font-semibold">Próximo passo:</span> {r.proximoPasso}</p>}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Mensagem sugerida (ajuste se quiser):</p>
              <Textarea value={texto} onChange={e => setTexto(e.target.value)} rows={5} />
              <div className="flex flex-wrap gap-2">
                {fone && (
                  <Button size="sm" className="bg-[#25D366] text-white hover:bg-[#1fb956]" asChild>
                    <a href={`https://wa.me/${fone}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer" onClick={() => abriu.mutate({ id: leadId })}>
                      <MessageCircle className="mr-1.5 h-4 w-4" /> Enviar no WhatsApp
                    </a>
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={copiar}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar</Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Gerado {new Date(r.geradoEm).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {r.mensagens} mensagens lidas · confira antes de enviar</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
