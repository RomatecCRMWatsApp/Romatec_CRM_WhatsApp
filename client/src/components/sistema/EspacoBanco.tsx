import { useState } from "react";
import { Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Resp = { ok: boolean; erro?: string; totalTabelasMB?: number; binlogs?: { arquivos: number; mb: number } | string; tabelas?: { tabela: string; linhas: number; mb: number; livreMB: number }[] };

/** Configurações → Espaço do banco: tamanho das tabelas (só leitura) para acompanhar o volume do MySQL */
export default function EspacoBanco() {
  const [dados, setDados] = useState<Resp | null>(null);
  const [carregando, setCarregando] = useState(false);
  const ver = async () => {
    setCarregando(true);
    try { setDados(await (await fetch("/api/sistema/espaco", { credentials: "include" })).json()); }
    catch { setDados({ ok: false, erro: "Não foi possível consultar agora." }); }
    finally { setCarregando(false); }
  };
  return (
    <Card className="bg-card border-border">
      <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><Database className="h-5 w-5 text-primary" /> Espaço do banco de dados</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Mostra o que ocupa o volume do MySQL no Railway. Só consulta — não apaga nada.</p>
        <Button size="sm" variant="outline" onClick={ver} disabled={carregando}>{carregando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Database className="mr-1 h-4 w-4" />} Ver espaço</Button>
        {dados && !dados.ok && <p className="text-sm text-red-400">{dados.erro || "Só o administrador consulta. Saia e entre de novo como administrador."}</p>}
        {dados?.ok && (
          <>
            <p className="text-sm">Tabelas: <b>{dados.totalTabelasMB} MB</b> · Logs internos do MySQL (binlog): <b>{typeof dados.binlogs === "string" ? dados.binlogs : `${dados.binlogs?.mb} MB em ${dados.binlogs?.arquivos} arquivo(s)`}</b></p>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Tabela</th><th className="py-1 text-right">Linhas</th><th className="py-1 text-right">Tamanho</th></tr></thead>
              <tbody>{dados.tabelas?.map(t => (
                <tr key={t.tabela} className="border-t border-border/50"><td className="py-1 font-mono text-xs">{t.tabela}</td><td className="py-1 text-right">{t.linhas.toLocaleString("pt-BR")}</td><td className="py-1 text-right">{t.mb} MB</td></tr>
              ))}</tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
