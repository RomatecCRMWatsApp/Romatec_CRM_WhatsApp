import { useLocation } from "wouter";
import { Mic } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_REUNIAO, duracaoTexto, rotuloTipoReuniao } from "@shared/reunioes";

/** Ficha do lead: reuniões gravadas com ele (resumo) e o atalho para gravar uma nova */
export default function ReunioesLead({ leadId }: { leadId: number }) {
  const [, navigate] = useLocation();
  const { data } = trpc.reunioes.listar.useQuery({ leadId });
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Mic className="h-4 w-4 text-primary" /> Reuniões</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {(data ?? []).length === 0 && <p className="text-muted-foreground">Nenhuma reunião gravada com este cliente.</p>}
        {(data ?? []).slice(0, 5).map(r => (
          <button key={r.id} type="button" onClick={() => navigate(`/reunioes/${r.id}`)} className="block w-full rounded-lg border border-border p-2 text-left hover:border-primary/50">
            <p className="font-semibold">{r.titulo}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(r.createdAt as any).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" })} · {rotuloTipoReuniao(r.tipo)} · {duracaoTexto(r.duracaoSeg)}
              {r.status !== "pronta" ? ` · ${STATUS_REUNIAO[r.status] ?? r.status}` : ""}
            </p>
            {r.resumo && <p className="mt-1 line-clamp-3 text-xs">{r.resumo}</p>}
          </button>
        ))}
        <Button size="sm" variant="outline" className="w-full" onClick={() => navigate(`/reunioes?lead=${leadId}`)}><Mic className="mr-1 h-4 w-4" /> Gravar reunião</Button>
      </CardContent>
    </Card>
  );
}
