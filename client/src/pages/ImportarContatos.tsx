import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FileUp, Loader2, Pause, Play, Send, Trash2, UserPlus } from "lucide-react";
import {
  contatosMarcados, lerArquivoContatos, montarRetomada, MARCADOR_PADRAO, TEXTO_RETOMADA_PADRAO,
  type ContatoMarcado,
} from "@shared/importacaoContatos";

const SITUACAO: Record<string, { rotulo: string; cor: string }> = {
  novo: { rotulo: "Novo", cor: "text-ok-400" },
  ja_no_crm: { rotulo: "Já no CRM", cor: "text-warn-300" },
  descadastrado: { rotulo: "Pediu para sair", cor: "text-danger-400" },
};

/**
 * Importar contatos do celular (/leads/importar): o arquivo .vcf/.csv é lido aqui no navegador, só os contatos com o
 * marcador (ex.: "CCBJ") vão para o servidor, viram leads do empreendimento e recebem a retomada pelo número do CRM,
 * aos poucos. A resposta cai no robô, que faz a qualificação.
 */
export default function ImportarContatos({ embutido = false }: { embutido?: boolean }) {
  const [marcador, setMarcador] = useState(MARCADOR_PADRAO);
  const [arquivo, setArquivo] = useState<{ nome: string; total: number; contatos: ContatoMarcado[]; semTelefone: string[] } | null>(null);
  const [modelo, setModelo] = useState(TEXTO_RETOMADA_PADRAO);
  const [enviar, setEnviar] = useState(true);
  const [incluirExistentes, setIncluirExistentes] = useState(false);
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());

  const previa = trpc.importacaoContatos.previa.useMutation({ onError: e => toast.error(e.message) });
  const fila = trpc.importacaoContatos.fila.useQuery(undefined, { refetchInterval: 30_000 });
  const importar = trpc.importacaoContatos.importar.useMutation({
    onSuccess: r => {
      toast.success(`${r.criados} leads criados, ${r.enfileirados} na fila de retomada${r.previsao ? ` (${r.previsao})` : ""}`);
      setArquivo(null); previa.reset(); setDesmarcados(new Set()); fila.refetch();
    },
    onError: e => toast.error(e.message),
  });
  const mudarLote = trpc.importacaoContatos.mudarLote.useMutation({ onSuccess: () => fila.refetch(), onError: e => toast.error(e.message) });

  const ler = async (f: File) => {
    const texto = await f.text();
    const todos = lerArquivoContatos(texto);
    if (!todos.length) { toast.error("Não encontrei contatos nesse arquivo. Envie o .vcf ou o .csv exportado do celular ou do Google Contatos."); return; }
    const { contatos, semTelefone } = contatosMarcados(todos, marcador);
    setArquivo({ nome: f.name, total: todos.length, contatos, semTelefone });
    setDesmarcados(new Set());
    if (contatos.length) previa.mutate({ contatos });
    else toast.warning(`Nenhum contato termina com "${marcador}" no arquivo`);
  };

  const linhas = previa.data?.linhas ?? [];
  const elegivel = (l: (typeof linhas)[number]) => l.situacao === "novo" || (l.situacao === "ja_no_crm" && incluirExistentes);
  const selecionados = useMemo(() => linhas.filter(l => elegivel(l) && !desmarcados.has(l.telefone)), [linhas, desmarcados, incluirExistentes]);
  const exemplo = montarRetomada(modelo, selecionados[0]?.nome ?? "Maria");
  const alternar = (tel: string) => setDesmarcados(s => { const n = new Set(s); n.has(tel) ? n.delete(tel) : n.add(tel); return n; });

  return (
    <div>
      {!embutido && <PageHeader icone={UserPlus} titulo="Importar contatos do celular" subtitulo="Traga os interessados salvos no seu celular para o CRM: o robô retoma a conversa pelo número do CRM e qualifica" />}
      <div className={embutido ? "space-y-5" : "mx-auto max-w-[1100px] space-y-5 px-4 pb-10 md:px-6"}>
        {fila.data && !fila.data.roboBomJardims && (
          <p className="flex items-start gap-2 rounded-xl border border-warn-500/40 bg-warn-500/10 p-3 text-sm text-warn-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            O robô do Bom Jardims está desligado: a retomada sai, mas as respostas não serão qualificadas automaticamente. Ligue em Respostas automáticas.
          </p>
        )}

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">1. Exporte os contatos do seu celular</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li><b className="text-foreground">Android:</b> abra Contatos › menu › Gerenciar contatos › Exportar › salve o arquivo .vcf e envie para o computador (ou abra esta tela no próprio celular).</li>
            <li><b className="text-foreground">iPhone ou Google:</b> em contacts.google.com, selecione os contatos › Exportar › vCard ou CSV do Google.</li>
            <li>Pode exportar a agenda inteira: só entram os contatos cujo nome termina com o marcador abaixo.</li>
          </ol>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Marcador no fim do nome</span>
              <input value={marcador} onChange={e => setMarcador(e.target.value.toUpperCase())} maxLength={20} className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-within:ring-2 focus-within:ring-primary">
              <FileUp className="h-4 w-4" /> Escolher arquivo (.vcf ou .csv)
              <input type="file" accept=".vcf,.vcard,.csv,text/vcard,text/csv" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) ler(f); e.target.value = ""; }} />
            </label>
            {arquivo && <p className="text-xs text-muted-foreground">{arquivo.nome}: {arquivo.total} números no arquivo, {arquivo.contatos.length} com “{marcador}”{arquivo.semTelefone.length ? `, ${arquivo.semTelefone.length} sem telefone válido` : ""}</p>}
            {previa.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </section>

        {linhas.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold">2. Confira os contatos</h2>
              <p className="text-xs text-muted-foreground">
                {linhas.filter(l => l.situacao === "novo").length} novos · {linhas.filter(l => l.situacao === "ja_no_crm").length} já no CRM · {linhas.filter(l => l.situacao === "descadastrado").length} pediram para sair
              </p>
              <label className="ml-auto flex items-center gap-2 text-xs">
                <input type="checkbox" checked={incluirExistentes} onChange={e => setIncluirExistentes(e.target.checked)} />
                Incluir quem já está no CRM
              </label>
            </div>
            <div className="mt-3 max-h-[420px] overflow-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                  <tr><th className="w-8 p-2" /><th className="p-2">Nome</th><th className="p-2">Telefone</th><th className="p-2">Situação</th></tr>
                </thead>
                <tbody>
                  {linhas.map(l => {
                    const pode = elegivel(l);
                    return (
                      <tr key={l.telefone} className={`border-t border-border ${pode ? "" : "opacity-50"}`}>
                        <td className="p-2"><input type="checkbox" aria-label={`Importar ${l.nome}`} disabled={!pode} checked={pode && !desmarcados.has(l.telefone)} onChange={() => alternar(l.telefone)} /></td>
                        <td className="p-2">{l.nome}<span className="block text-[11px] text-muted-foreground">{l.nomeOriginal}</span></td>
                        <td className="p-2 font-mono text-xs">{l.telefone}</td>
                        <td className={`p-2 text-xs ${SITUACAO[l.situacao].cor}`}>{SITUACAO[l.situacao].rotulo}{l.naFila ? " · já na fila" : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {linhas.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold">3. Mensagem de retomada</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Sai do número do CRM devagar: uma a cada 7 a 12 minutos, das 8 h às 20 h, de segunda a sábado, até 30 por dia (protege o número contra bloqueio). Quem não responder não recebe mais nada. Use {"{nome}"} ou {"{, nome}"} para o primeiro nome. A pergunta final é a primeira da qualificação: deixe-a no texto.
            </p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <textarea value={modelo} onChange={e => setModelo(e.target.value)} rows={11} className="w-full rounded-lg border border-border bg-background p-3 text-sm" />
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="mb-2 text-[11px] text-muted-foreground">Como o cliente vê</p>
                <p className="whitespace-pre-wrap rounded-lg bg-ok-500/10 p-3 text-sm">{exemplo}</p>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Depois o robô pergunta o prazo e a forma de pagamento. Quem quer fechar em até 3 meses vai direto para você, com o resumo; os demais seguem recebendo novidades do robô.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enviar} onChange={e => setEnviar(e.target.checked)} /> Enviar a retomada pelo WhatsApp</label>
              <Button className="ml-auto" disabled={!selecionados.length || importar.isPending}
                onClick={() => {
                  if (!confirm(`Importar ${selecionados.length} contatos para o Bom Jardims${enviar ? " e mandar a retomada pelo número do CRM" : ""}?`)) return;
                  importar.mutate({ contatos: selecionados.map(l => ({ nome: l.nome, telefone: l.telefone })), marcador, empreendimentoSlug: "bom-jardims", modelo, enviar, incluirExistentes });
                }}>
                {importar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                Importar {selecionados.length} contatos
              </Button>
            </div>
          </section>
        )}

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">Envios por importação</h2>
          {fila.isLoading && <Loader2 className="mt-2 h-4 w-4 animate-spin text-muted-foreground" />}
          {fila.data && !fila.data.lotes.length && <p className="mt-2 text-sm text-muted-foreground">Nenhuma importação ainda.</p>}
          <div className="mt-3 space-y-2">
            {fila.data?.lotes.map(l => {
              const n = (k: string) => Number((l as Record<string, unknown>)[k] ?? 0);
              const pendentes = n("pendente") + n("enviando");
              return (
                <div key={l.lote} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-sm">
                  <b>{l.lote}</b>
                  <span className="text-xs text-muted-foreground">{n("enviado")} enviados · {pendentes} na fila{n("pausado") ? ` · ${n("pausado")} pausados` : ""}{n("erro") ? ` · ${n("erro")} com erro` : ""}{n("cancelado") ? ` · ${n("cancelado")} cancelados` : ""}</span>
                  <div className="ml-auto flex gap-2">
                    {pendentes > 0 && <Button size="sm" variant="outline" onClick={() => mudarLote.mutate({ lote: l.lote, acao: "pausar" })}><Pause className="mr-1 h-3.5 w-3.5" /> Pausar</Button>}
                    {n("pausado") > 0 && <Button size="sm" variant="outline" onClick={() => mudarLote.mutate({ lote: l.lote, acao: "continuar" })}><Play className="mr-1 h-3.5 w-3.5" /> Continuar</Button>}
                    {pendentes + n("pausado") > 0 && <Button size="sm" variant="outline" onClick={() => { if (confirm("Cancelar os envios que ainda não saíram?")) mudarLote.mutate({ lote: l.lote, acao: "cancelar" }); }}><Trash2 className="mr-1 h-3.5 w-3.5" /> Cancelar</Button>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
