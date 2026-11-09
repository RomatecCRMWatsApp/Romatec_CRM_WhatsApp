import { useState } from "react";
import { Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Conexoes = {
  maximo: number | null; waitTimeoutS: number | null; agora: number; executando: number; pico: number; picoEm: string | null;
  recusadasPorLimite: number; falhasDeConexao: number; consultasLentas: number; ligadoHaHoras: number;
  quem: { usuario: string; origem: string; banco: string; conexoes: number; ativas: number }[];
  poolDoCrm: { driver: string; limite?: number; emUso?: number; livres?: number; fila?: number };
};
type Resp = {
  ok: boolean; conexoes?: Conexoes; erro?: string; totalTabelasMB?: number; binlogs?: { arquivos: number; mb: number } | string; tabelas?: { tabela: string; linhas: number; mb: number; livreMB: number }[];
  bancos?: { banco: string; mb: number }[]; arquivos?: { arquivo: string; tipo: string; mb: number }[]; variaveis?: Record<string, string>;
  compartilhadas?: Record<string, string[]>;
};

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
      <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><Database className="h-5 w-5 text-primary" /> Banco de dados: conexões e espaço</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Mostra as conexões e o que ocupa o volume do MySQL no Railway. Só consulta: não apaga nada.</p>
        <Button size="sm" variant="outline" onClick={ver} disabled={carregando}>{carregando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Database className="mr-1 h-4 w-4" />} Ver conexões e espaço</Button>
        {dados && !dados.ok && <p className="text-sm text-danger-400">{dados.erro || "Só o administrador consulta. Saia e entre de novo como administrador."}</p>}
        {dados?.ok && (
          <>
            {dados.conexoes && <PainelConexoes c={dados.conexoes} />}
            <p className="text-sm">Tabelas: <b>{dados.totalTabelasMB} MB</b> · Logs internos do MySQL (binlog): <b>{typeof dados.binlogs === "string" ? dados.binlogs : `${dados.binlogs?.mb} MB em ${dados.binlogs?.arquivos} arquivo(s)`}</b></p>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Tabela</th><th className="py-1 text-right">Linhas</th><th className="py-1 text-right">Tamanho</th></tr></thead>
              <tbody>{dados.tabelas?.map(t => (
                <tr key={t.tabela} className="border-t border-border/50"><td className="py-1 font-mono text-xs">{t.tabela}</td><td className="py-1 text-right">{t.linhas.toLocaleString("pt-BR")}</td><td className="py-1 text-right">{t.mb} MB</td></tr>
              ))}</tbody>
            </table>
            </div>
            {!!dados.bancos?.length && <p className="text-xs text-muted-foreground">Bancos neste MySQL: {dados.bancos.map(b => `${b.banco} ${b.mb} MB`).join(" · ")}</p>}
            {!!dados.arquivos?.length && <p className="text-xs text-muted-foreground">Arquivos internos: {dados.arquivos.map(f => `${f.arquivo.split(/[\\/]/).pop()} (${f.tipo}) ${f.mb} MB`).join(" · ")}</p>}
            {dados.variaveis && <p className="break-all font-mono text-[11px] text-muted-foreground">{Object.entries(dados.variaveis).map(([k, v]) => `${k}=${v}`).join(" · ")}</p>}
            {dados.compartilhadas && (
              <div className="space-y-1 rounded-md bg-secondary/30 p-2 text-[11px]">
                <p className="font-semibold">Tabelas com o mesmo nome no CRM e na ZAYRA (colunas existentes)</p>
                {Object.entries(dados.compartilhadas).map(([t, cols]) => <p key={t} className="break-all font-mono"><b>{t}</b>: {cols.join(", ") || "—"}</p>)}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Conexões do MySQL: teto, uso agora, pico desde que o banco ligou e quem está conectado */
function PainelConexoes({ c }: { c: Conexoes }) {
  const folga = c.maximo ? Math.round((c.pico / c.maximo) * 100) : null;
  const nivel = folga == null ? "" : folga >= 80 ? "text-danger-400" : folga >= 50 ? "text-warn-400" : "text-ok-400";
  return (
    <div className="space-y-2 rounded-md border border-border/60 p-3">
      <p className="text-sm font-semibold">Conexões com o banco</p>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div><p className="text-xs text-muted-foreground">Limite do MySQL</p><p className="font-semibold tabular-nums">{c.maximo ?? "—"}</p></div>
        <div><p className="text-xs text-muted-foreground">Abertas agora</p><p className="font-semibold tabular-nums">{c.agora} <span className="text-xs font-normal text-muted-foreground">({c.executando} trabalhando)</span></p></div>
        <div><p className="text-xs text-muted-foreground">Pico desde que ligou</p><p className={`font-semibold tabular-nums ${nivel}`}>{c.pico}{folga != null && <span className="text-xs font-normal"> ({folga}% do limite)</span>}</p></div>
        <div><p className="text-xs text-muted-foreground">CRM (pool deste servidor)</p><p className="font-semibold tabular-nums">{c.poolDoCrm.emUso ?? 0} em uso de {c.poolDoCrm.limite ?? "—"}{c.poolDoCrm.fila ? ` · ${c.poolDoCrm.fila} na fila` : ""}</p></div>
      </div>
      <p className="text-xs text-muted-foreground">
        Banco ligado há {c.ligadoHaHoras} h · recusadas por falta de vaga: <b className={c.recusadasPorLimite ? "text-danger-400" : ""}>{c.recusadasPorLimite}</b> · falhas de conexão: {c.falhasDeConexao} · consultas lentas: {c.consultasLentas}
        {c.waitTimeoutS ? ` · conexão parada fecha em ${Math.round(c.waitTimeoutS / 60)} min` : ""}
      </p>
      {!!c.quem.length && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1">Usuário</th><th className="py-1">Origem</th><th className="py-1">Banco</th><th className="py-1 text-right">Conexões</th><th className="py-1 text-right">Trabalhando</th></tr></thead>
            <tbody>{c.quem.map((q, i) => (
              <tr key={i} className="border-t border-border/50"><td className="py-1 font-mono">{q.usuario}</td><td className="py-1 font-mono">{q.origem}</td><td className="py-1 font-mono">{q.banco || "—"}</td><td className="py-1 text-right tabular-nums">{q.conexoes}</td><td className="py-1 text-right tabular-nums">{q.ativas}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
