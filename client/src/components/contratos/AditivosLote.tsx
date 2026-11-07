/**
 * Contratos › Termos aditivos em lote (server/contratos/aditivosLote.ts): registro do loteamento e liberação para
 * transferência. O administrador preenche os dados uma vez e o sistema gera um termo para cada contrato assinado do
 * empreendimento e manda o link de assinatura no WhatsApp do comprador. Andamento das assinaturas por contrato.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { CheckCircle2, Clock, FileStack, Loader2, Send } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const campo = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";
type Tipo = "registro" | "liberacao";
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/** "A01 = 12.345" por linha → { A01: "12.345" } */
function lerMatriculas(texto: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of texto.split(/\r?\n/)) {
    const m = l.trim().match(/^([A-Za-z]\d{1,3})\s*[=:;,\-–]\s*(.+)$/);
    if (m) out[m[1].toUpperCase()] = m[2].trim();
  }
  return out;
}

export default function AditivosLote({ admin }: { admin: boolean }) {
  const utils = trpc.useUtils();
  const { data: emps } = trpc.renegociacao.loteEmpreendimentos.useQuery();
  const [empId, setEmpId] = useState<number | null>(null);
  const emp = empId ?? emps?.[0]?.id ?? null;
  const [tipo, setTipo] = useState<Tipo>("registro");
  const { data: and } = trpc.renegociacao.loteAndamento.useQuery({ empreendimentoId: emp ?? 0, tipo }, { enabled: !!emp });
  const [reg, setReg] = useState({ numeroRegistro: "", dataRegistro: hoje(), cartorio: "", matriculaEmpreendimento: "", livroFolhas: "", matriculas: "", atualizarCadastro: true, observacao: "" });
  const [lib, setLib] = useState({ dataLiberacao: hoje(), fundamento: "", observacao: "" });
  const [senha, setSenha] = useState("");
  const matriculas = useMemo(() => lerMatriculas(reg.matriculas), [reg.matriculas]);
  const gerar = trpc.renegociacao.loteGerar.useMutation({
    onSuccess: r => {
      toast.success(`${r.gerados} termo(s) gerado(s), ${r.enviados} enviado(s) no WhatsApp`);
      if (r.semWhatsapp.length) toast.warning(`Sem WhatsApp: ${r.semWhatsapp.join(", ")} — copie o link no contrato`);
      r.falhas.forEach(f => toast.error(f));
      setSenha(""); utils.renegociacao.loteAndamento.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const recebem = and?.semTermo ?? 0;
  const enviar = () => {
    if (!emp) return;
    if (!confirm(`Gerar o termo aditivo de ${tipo === "registro" ? "registro" : "liberação"} para ${recebem} contrato(s) e enviar o link de assinatura aos compradores?`)) return;
    gerar.mutate({
      empreendimentoId: emp, tipo, senha,
      ...(tipo === "registro"
        ? { registro: { ...reg, livroFolhas: reg.livroFolhas || null, observacao: reg.observacao || null, matriculas: Object.keys(matriculas).length ? matriculas : null } }
        : { liberacao: { ...lib, observacao: lib.observacao || null } }),
    });
  };

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <FileStack className="h-5 w-5 text-[var(--rt-gold)]" />
        <h2 className="text-base font-semibold">Termos aditivos em lote</h2>
        <select className={`${campo} ml-auto w-auto`} value={emp ?? ""} onChange={e => setEmpId(Number(e.target.value))} aria-label="Empreendimento">
          {(emps ?? []).map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
      </div>
      <div className="flex gap-1 rounded-lg bg-secondary/40 p-1" role="tablist">
        {([["registro", "Registro do loteamento"], ["liberacao", "Liberação para transferência"]] as [Tipo, string][]).map(([k, r]) => (
          <button key={k} type="button" role="tab" aria-selected={tipo === k} onClick={() => setTipo(k)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${tipo === k ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}>{r}</button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {tipo === "registro"
          ? "Quando sair o registro do parcelamento no cartório: cada contrato assinado recebe um termo que inclui o número do registro, a data, o cartório, a matrícula do empreendimento e a matrícula da chácara. Preço e parcelas não mudam."
          : "Quando a chácara puder ser transferida: o termo registra a liberação para cessão de direitos (com anuência e em dia com as parcelas) e para a escritura definitiva após a quitação."}
        {" "}O comprador assina pelo link no WhatsApp, com código de confirmação.
      </p>

      {admin && (tipo === "registro" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">Registro (ex.: R-1 da matrícula)<input className={campo} value={reg.numeroRegistro} onChange={e => setReg({ ...reg, numeroRegistro: e.target.value })} /></label>
          <label className="text-xs text-muted-foreground">Data do registro<input type="date" className={campo} value={reg.dataRegistro} onChange={e => setReg({ ...reg, dataRegistro: e.target.value })} /></label>
          <label className="text-xs text-muted-foreground sm:col-span-2">Cartório de Registro de Imóveis<input className={campo} value={reg.cartorio} onChange={e => setReg({ ...reg, cartorio: e.target.value })} placeholder="Ex.: Cartório do 1º Ofício de Registro de Imóveis de Açailândia/MA" /></label>
          <label className="text-xs text-muted-foreground">Matrícula do empreendimento<input className={campo} value={reg.matriculaEmpreendimento} onChange={e => setReg({ ...reg, matriculaEmpreendimento: e.target.value })} /></label>
          <label className="text-xs text-muted-foreground">Livro / folhas (opcional)<input className={campo} value={reg.livroFolhas} onChange={e => setReg({ ...reg, livroFolhas: e.target.value })} /></label>
          <label className="text-xs text-muted-foreground sm:col-span-2">Matrículas das chácaras, se já abertas (uma por linha: <code>A01 = 12.345</code>)
            <textarea className={`${campo} h-24 py-1`} value={reg.matriculas} onChange={e => setReg({ ...reg, matriculas: e.target.value })} />
            {Object.keys(matriculas).length > 0 && <span className="text-ok-400">{Object.keys(matriculas).length} matrícula(s) lida(s)</span>}
          </label>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-1" checked={reg.atualizarCadastro} onChange={e => setReg({ ...reg, atualizarCadastro: e.target.checked })} />
            <span>Gravar também no cadastro do empreendimento <span className="block text-xs text-muted-foreground">Contratos novos, o modelo e o talão passam a sair com o registro.</span></span>
          </label>
          <label className="text-xs text-muted-foreground sm:col-span-2">Cláusula específica (opcional)<textarea className={`${campo} h-16 py-1`} value={reg.observacao} onChange={e => setReg({ ...reg, observacao: e.target.value })} /></label>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">Liberado a partir de<input type="date" className={campo} value={lib.dataLiberacao} onChange={e => setLib({ ...lib, dataLiberacao: e.target.value })} /></label>
          <label className="text-xs text-muted-foreground sm:col-span-2">Fundamento da liberação
            <textarea className={`${campo} h-16 py-1`} value={lib.fundamento} onChange={e => setLib({ ...lib, fundamento: e.target.value })} placeholder="Ex.: Termo de Verificação e Aceite das Obras n.º 12/2027, emitido pela Prefeitura de Açailândia em 10/03/2027" />
          </label>
          <label className="text-xs text-muted-foreground sm:col-span-2">Cláusula específica (opcional)<textarea className={`${campo} h-16 py-1`} value={lib.observacao} onChange={e => setLib({ ...lib, observacao: e.target.value })} /></label>
        </div>
      ))}

      {and && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3 text-sm">
            <span><b>{and.total}</b> contrato(s) assinados</span>
            <span className="text-ok-400"><CheckCircle2 className="mr-1 inline h-4 w-4" />{and.assinados} assinaram</span>
            <span className="text-warn-300"><Clock className="mr-1 inline h-4 w-4" />{and.aguardando} aguardando</span>
            <span className="text-muted-foreground">{and.semTermo} ainda sem termo</span>
          </div>
          <ul className="max-h-64 divide-y divide-border overflow-auto rounded-lg border border-border">
            {and.contratos.map(c => (
              <li key={c.contratoId} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
                <Link href={`/contratos/${c.contratoId}`} className="min-w-0 flex-1 truncate hover:underline"><b>{c.lote}</b> · {c.contrato} · {c.comprador}</Link>
                {!c.temWhatsapp && c.situacao !== "assinado" && <span className="text-xs text-warn-300">sem WhatsApp</span>}
                <span className={`text-xs ${c.situacao === "assinado" ? "text-ok-400" : c.situacao === "aguardando" ? "text-warn-300" : "text-muted-foreground"}`}>
                  {c.situacao === "assinado" ? "assinado" : c.situacao === "aguardando" ? "aguardando assinatura" : "recebe o termo"}
                </span>
              </li>
            ))}
            {!and.contratos.length && <li className="p-3 text-sm text-muted-foreground">Nenhum contrato assinado neste empreendimento.</li>}
          </ul>
        </div>
      )}

      {admin ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">Sua senha<Input type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} className="h-9 w-44" /></label>
          <Button disabled={!senha || !recebem || gerar.isPending} onClick={enviar}>
            {gerar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            Gerar e enviar para {recebem} contrato(s)
          </Button>
          {gerar.isPending && <span className="text-xs text-muted-foreground">Gerando os termos… alguns segundos por contrato.</span>}
        </div>
      ) : <p className="text-xs text-muted-foreground">Só o administrador gera os termos (com a senha). A secretária acompanha as assinaturas e reenvia o link na tela do contrato.</p>}
    </section>
  );
}
