import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, Download, FileSignature, FileText, Loader2, Receipt, RefreshCw, Send, Upload, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { sel } from "@/components/cadastro/campos";
import { brl } from "@shared/simulador";
import { maskPhone } from "@shared/masks";
import { SeloStatus } from "./Contratos";
import PainelAssinaturas from "@/components/contratos/PainelAssinaturas";

const br = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
const ROTULO_TIPO: Record<string, string> = { entrada: "Entrada", saldo: "Saldo", avista: "À vista", antecipacao: "Antecipação" };
const STATUS_COB: Record<string, [string, string]> = {
  prevista: ["Prevista", "text-muted-foreground"], emitida: ["Emitida", "text-sky-400"], vencida: ["Vencida", "text-red-400"],
  paga: ["Paga", "text-emerald-400"], cancelada: ["Cancelada", "text-muted-foreground line-through"], estornada: ["Estornada", "text-amber-400"],
};
/** Rótulos dos campos que faltam (tags do modelo) — o que não estiver aqui aparece como a própria tag */
const ROTULO_CAMPO: Record<string, string> = {
  emp_matricula_empreendimento: "Matrícula do empreendimento", emp_registro_parcelamento: "Registro do parcelamento", emp_registro_data: "Data do registro",
  emp_aprovacao_numero: "Nº da aprovação municipal", emp_aprovacao_data: "Data da aprovação", emp_lei_municipal: "Lei municipal",
  emp_li_numero: "Nº da Licença de Instalação", emp_li_data: "Data da LI", emp_obras_termo_final: "Termo final das obras", emp_associacao_registro: "Registro da associação",
  emp_trt_rt: "TRT do responsável técnico", rom_creci_pj: "CRECI PJ da Romatec", corr_creci: "CRECI do corretor", corr_creci_validade: "Validade da carteira CRECI",
  corr_certidao_codigo: "Nº da certidão de regularidade", comp_endereco: "Endereço do comprador", conj_nome: "Nome do cônjuge", conj_cpf: "CPF do cônjuge",
  conj_regime_bens: "Regime de bens", plano_saldo_venc1: "1º vencimento do saldo",
};

/** Abre um PDF/arquivo do servidor numa aba nova (rotas com login de sessão) */
const abrir = (url: string) => window.open(url, "_blank", "noopener");

async function postPdf(url: string): Promise<void> {
  const r = await fetch(url, { method: "POST", credentials: "include" });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.mensagem || j.erro || `Falha (${r.status})`);
  }
  const blob = await r.blob();
  window.open(URL.createObjectURL(blob), "_blank", "noopener");
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return <p className="flex justify-between gap-3 border-b border-border/50 py-1 text-sm"><span className="text-muted-foreground">{rotulo}</span><b className="text-right">{valor}</b></p>;
}

export default function ContratoDetalhe() {
  const { id: idStr } = useParams<{ id: string }>();
  const id = Number(idStr);
  const [, navigate] = useLocation();
  const [aba, setAba] = useState<"contrato" | "assinaturas" | "financeiro">("contrato");
  const [bloco, setBloco] = useState<string>("1");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const { data: d, isLoading, error } = trpc.contratos.detalhe.useQuery({ id }, { enabled: id > 0 });
  const recarregar = () => utils.contratos.detalhe.invalidate({ id });
  const gerar = trpc.contratos.gerar.useMutation({
    onSuccess: (r, v) => { toast.success(`${v.alvo === "minuta" ? "Minuta" : "Definitivo"} gerado (versão ${r.versao})`); recarregar(); abrir(`/api/contratos/${id}/versoes/${r.versao}.pdf`); },
    onError: e => toast.error(e.message),
  });
  const assinado = trpc.contratos.registrarAssinado.useMutation({ onSuccess: r => { toast.success(`Contrato ativo — ${r.cobrancas} parcelas no plano de cobrança`); recarregar(); }, onError: e => toast.error(e.message) });
  const cancelar = trpc.contratos.cancelar.useMutation({ onSuccess: () => { toast.success("Contrato cancelado e chácara liberada"); recarregar(); }, onError: e => toast.error(e.message) });
  const emitir = trpc.contratos.emitirCarne.useMutation({ onSuccess: r => { toast.success(`${r.emitidas} cobranças emitidas no Asaas`); recarregar(); }, onError: e => toast.error(e.message) });
  const link = trpc.contratos.linkComprador.useMutation({
    onSuccess: async r => { try { await navigator.clipboard.writeText(r.url); toast.success("Link copiado (vale 7 dias)"); } catch { toast.message(r.url); } },
    onError: e => toast.error(e.message),
  });

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  if (error || !d) return <p className="p-6 text-sm text-red-400">{error?.message ?? "Contrato não encontrado"}</p>;
  const c = d.contrato, p = d.plano as any, f = d.financeiro;
  const gate = d.gate as any;
  const definitivoOk = gate?.definitivo?.ok;
  const encerrado = ["ativo", "quitado", "distratado", "cancelado", "assinado"].includes(c.status);

  const enviarAssinado = () => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "application/pdf";
    inp.onchange = async () => {
      const arq = inp.files?.[0];
      if (!arq) return;
      if (arq.size > 20 * 1024 * 1024) { toast.error("PDF acima de 20 MB"); return; }
      const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(arq); });
      if (confirm(`Ativar o contrato ${c.numero} com o PDF assinado "${arq.name}"? A chácara passa a vendida e o plano de cobrança é gravado.`)) assinado.mutate({ id, pdfBase64: b64 });
    };
    inp.click();
  };
  const acao = async (chave: string, f: () => Promise<void>) => { setOcupado(chave); try { await f(); } catch (e: any) { toast.error(e.message); } finally { setOcupado(null); } };

  return (
    <div>
      <PageHeader icone={FileSignature} titulo={`Contrato ${c.numero}`} voltar={{ rotulo: "Contratos", onClick: () => navigate("/contratos") }}
        subtitulo={<span className="inline-flex flex-wrap items-center gap-2"><SeloStatus status={c.status} /> {c.empreendimento} · Chácara {c.loteCodigo} · {d.comprador?.nome ?? "—"}</span>} />
      <div className="mx-auto max-w-[1400px] space-y-4 px-4 pb-10 md:px-6">
        <div className="flex gap-2 border-b border-border">
          {(["contrato", "assinaturas", "financeiro"] as const).map(a => (
            <button key={a} onClick={() => setAba(a)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === a ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {a === "contrato" ? "Contrato" : a === "assinaturas" ? "Assinaturas" : "Financeiro"}
            </button>
          ))}
        </div>

        {aba === "contrato" && (
          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            <div className="space-y-4">
              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-2 text-sm font-semibold">Documento</h2>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={encerrado || gerar.isPending} onClick={() => gerar.mutate({ id, alvo: "minuta" })}>
                    {gerar.isPending && gerar.variables?.alvo === "minuta" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Gerar minuta
                  </Button>
                  {d.pode.definitivo && (
                    <Button disabled={encerrado || !definitivoOk || gerar.isPending} onClick={() => gerar.mutate({ id, alvo: "definitivo" })}
                      title={definitivoOk ? "" : "Bloqueado — veja a lista ao lado"}>
                      {gerar.isPending && gerar.variables?.alvo === "definitivo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />} Gerar definitivo
                    </Button>
                  )}
                  {d.pode.definitivo && ["apto_assinatura", "em_assinatura", "assinado"].includes(c.status) && (
                    <Button variant="outline" disabled={assinado.isPending} onClick={enviarAssinado}><Upload className="h-4 w-4" /> Registrar contrato assinado</Button>
                  )}
                  {d.pode.cancelar && !["cancelado", "distratado", "ativo", "quitado"].includes(c.status) && (
                    <Button variant="outline" className="text-red-400" onClick={() => { const m = prompt("Motivo do cancelamento (a chácara volta a ficar disponível):"); if (m && m.trim().length >= 3) cancelar.mutate({ id, motivo: m.trim() }); }}>
                      <XCircle className="h-4 w-4" /> Cancelar
                    </Button>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">A geração leva alguns segundos (contrato + 6 anexos). Cada geração vira uma versão nova; nenhuma é sobrescrita.</p>
              </section>

              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-2 text-sm font-semibold">Versões</h2>
                {!d.versoes.length && <p className="text-sm text-muted-foreground">Nenhuma versão gerada ainda.</p>}
                <div className="divide-y divide-border/50">
                  {d.versoes.map(v => (
                    <div key={v.versao} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                      <b>v{v.versao}</b>
                      <span className="text-muted-foreground">{v.etapa === "gerado:minuta" ? "Minuta" : v.etapa === "manuscrito" ? "Assinado (PDF enviado)" : v.etapa === "gerado" ? "Definitivo" : v.etapa}</span>
                      <span className="text-xs text-muted-foreground">{new Date(v.criadoEm as any).toLocaleString("pt-BR")} · {(v.bytes / 1024 / 1024).toFixed(1)} MB</span>
                      <span className="hidden font-mono text-[10px] text-muted-foreground md:inline" title="SHA-256">{v.sha256.slice(0, 16)}…</span>
                      <Button size="sm" variant="outline" className="ml-auto" onClick={() => abrir(`/api/contratos/${id}/versoes/${v.versao}.pdf`)}><Download className="h-4 w-4" /> Abrir</Button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                {[["Comprador", d.comprador], ["Cônjuge", d.conjuge]].filter(([, x]) => x).map(([t, x]: any) => (
                  <div key={t} className="rounded-xl border border-border bg-card p-4">
                    <h2 className="mb-2 text-sm font-semibold">{t}</h2>
                    <Linha rotulo="Nome" valor={x.nome} />
                    <Linha rotulo="CPF" valor={String(x.cpfCnpj).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")} />
                    {x.telefone1 && <Linha rotulo="Telefone" valor={maskPhone(String(x.telefone1))} />}
                    {x.email && <Linha rotulo="E-mail" valor={x.email} />}
                    {x.cidade && <Linha rotulo="Cidade" valor={`${x.cidade}/${x.uf ?? ""}`} />}
                  </div>
                ))}
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-2 text-sm font-semibold">Plano</h2>
                <Linha rotulo="Preço de tabela" valor={brl(p.preco_tabela)} />
                {p.modalidade === "avista" ? <Linha rotulo="À vista" valor={`${brl(p.total_pagar)} em ${br(p.avista_vencimento)}`} /> : <>
                  <Linha rotulo="Entrada" valor={`${p.entrada_qtd}× ${brl(p.entrada_parcela)}`} />
                  <Linha rotulo="Saldo" valor={`${p.saldo_qtd}× ${brl(p.saldo_parcela)}`} />
                  <Linha rotulo="1º do saldo" valor={br(p.saldo_venc1)} />
                  <Linha rotulo="Total a pagar" valor={brl(p.total_pagar)} />
                </>}
                <Linha rotulo="Código de verificação" valor={<span className="font-mono text-xs">{c.codigoVerificacao}</span>} />
              </section>
              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-2 text-sm font-semibold">Para o contrato definitivo</h2>
                {gate?.erro && <p className="text-xs text-red-400">{gate.erro}</p>}
                {gate?.definitivo && (definitivoOk
                  ? <p className="flex items-center gap-2 text-sm text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Tudo pronto para o definitivo</p>
                  : <div className="space-y-2 text-xs">
                    {gate.definitivo.bloqueios.map((b: string) => <p key={b} className="flex gap-2 text-red-300"><AlertTriangle className="h-4 w-4 shrink-0" />{b}</p>)}
                    {!!gate.definitivo.faltantes.length && <>
                      <p className="text-muted-foreground">Campos a preencher ({gate.definitivo.faltantes.length}):</p>
                      <ul className="list-disc pl-5 text-muted-foreground">{gate.definitivo.faltantes.map((x: string) => <li key={x}>{ROTULO_CAMPO[x] ?? x}</li>)}</ul>
                    </>}
                  </div>)}
              </section>
            </aside>
          </div>
        )}

        {aba === "assinaturas" && <PainelAssinaturas id={id} status={c.status} podeEnviar={d.pode.definitivo} />}

        {aba === "financeiro" && (
          !f ? <p className="text-sm text-muted-foreground">O financeiro do contrato é com o administrador e a secretaria.</p> : (
            <div className="space-y-4">
              {!f.asaasConfigurado && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                  Cobrança desligada: a chave do Asaas deste empreendimento ainda não foi configurada. Nada é emitido, cobrado nem enviado ao cliente.
                </p>
              )}
              {!f.cobrancas.length && (
                <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  O plano de cobranças é gravado quando o contrato fica ativo (assinado). Status atual: {c.status}.
                </p>
              )}
              <section className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">Carnê
                  <select className={`${sel} w-56`} value={bloco} onChange={e => setBloco(e.target.value)}>
                    {Array.from({ length: f.blocos }, (_, i) => <option key={i} value={String(i + 1)}>Carnê {i + 1} de {f.blocos} (12 parcelas)</option>)}
                    <option value="completo">Carnê completo (todas as parcelas)</option>
                  </select>
                </label>
                <Button variant="outline" disabled={!f.cobrancas.length} onClick={() => abrir(`/api/financeiro/contratos/${id}/carne-v2.pdf?bloco=${bloco}`)}><Receipt className="h-4 w-4" /> Abrir carnê</Button>
                {d.pode.cobranca && c.status === "ativo" && bloco !== "completo" && (
                  <Button disabled={!f.asaasConfigurado || emitir.isPending} onClick={() => { if (confirm(`Emitir no Asaas as cobranças do carnê ${bloco}? O cliente passa a poder pagar por elas.`)) emitir.mutate({ id, bloco: Number(bloco) }); }}
                    title={f.asaasConfigurado ? "" : "Asaas não configurado"}>
                    {emitir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Emitir no Asaas
                  </Button>
                )}
                <Button variant="outline" disabled={!f.cobrancas.length || link.isPending} onClick={() => link.mutate({ id, bloco: bloco === "completo" ? "completo" : Number(bloco) })}><Copy className="h-4 w-4" /> Link do carnê p/ o comprador</Button>
                <Button variant="outline" onClick={() => abrir(`/api/financeiro/contratos/${id}/plano.xlsx`)}><Download className="h-4 w-4" /> Plano completo (XLSX)</Button>
              </section>

              {!!f.cobrancas.length && (
                <section className="overflow-x-auto rounded-xl border border-border bg-card">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead className="bg-secondary/40 text-left text-xs text-muted-foreground">
                      <tr><th className="p-2">Parcela</th><th className="p-2">Vencimento</th><th className="p-2 text-right">Valor</th><th className="p-2">Situação</th><th className="p-2">Pagamento</th><th className="p-2 text-right">Ações</th></tr>
                    </thead>
                    <tbody>
                      {f.cobrancas.map((x: any) => {
                        const [rot, cor] = STATUS_COB[x.status] ?? [x.status, ""];
                        return (
                          <tr key={x.id} className="border-t border-border/50">
                            <td className="p-2">{ROTULO_TIPO[x.tipo] ?? x.tipo} {x.numero}/{x.total}</td>
                            <td className="p-2">{br(x.vencimento)}{x.valorOriginal != null && <span className="ml-1 text-[10px] text-amber-400">2ª via</span>}</td>
                            <td className="p-2 text-right">{brl(x.valor)}</td>
                            <td className={`p-2 ${cor}`}>
                              {rot}{x.acoes.vencida && ` · ${x.acoes.atraso} dias`}
                              {x.acoes.negociacao && <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">Negociação</span>}
                            </td>
                            <td className="p-2 text-xs">{x.pagoEm ? `${br(x.pagoEm)} · ${brl(x.valorPago ?? x.valor)}` : "—"}{x.reciboNumero && <span className="block text-muted-foreground">{x.reciboNumero}{x.reciboErro ? ` · envio: ${x.reciboErro}` : x.reciboEnviado ? " · enviado" : ""}</span>}</td>
                            <td className="p-2">
                              <div className="flex justify-end gap-1">
                                {x.acoes.boleto && <Button size="sm" variant="outline" onClick={() => abrir(`/api/financeiro/cobrancas/${x.id}/boleto-a4.pdf`)}>Boleto A4</Button>}
                                {x.acoes.segundaVia && d.pode.cobranca && (
                                  <Button size="sm" variant="outline" disabled={ocupado === `2v${x.id}`} onClick={() => acao(`2v${x.id}`, async () => { await postPdf(`/api/financeiro/cobrancas/${x.id}/segunda-via`); recarregar(); })}>
                                    {ocupado === `2v${x.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : null} 2ª via
                                  </Button>
                                )}
                                {x.acoes.recibo && x.reciboId && <Button size="sm" variant="outline" onClick={() => abrir(`/api/financeiro/recibos/${x.reciboId}.pdf`)}>Recibo</Button>}
                                {x.acoes.recibo && x.reciboId && d.pode.cobranca && (
                                  <Button size="sm" variant="ghost" title="Reenviar recibo" disabled={ocupado === `rr${x.id}`}
                                    onClick={() => acao(`rr${x.id}`, async () => {
                                      const r = await fetch(`/api/financeiro/recibos/${x.reciboId}/reenviar`, { method: "POST", credentials: "include" }).then(r => r.json());
                                      r.enviado ? toast.success("Recibo reenviado") : toast.error(r.erro ?? "Não enviado");
                                      recarregar();
                                    })}><RefreshCw className="h-3 w-3" /></Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              )}

              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-2 text-sm font-semibold">Declarações anuais de quitação (Lei 12.007/2009)</h2>
                {!f.declaracoes.length && <p className="text-sm text-muted-foreground">Emitidas automaticamente no 2º dia útil de maio, referentes ao ano anterior.</p>}
                <div className="flex flex-wrap gap-2">
                  {f.declaracoes.sort((a: any, b: any) => b.ano - a.ano).map((x: any) => x.status === "emitida"
                    ? <Button key={x.ano} size="sm" variant="outline" onClick={() => abrir(`/api/financeiro/contratos/${id}/declaracao/${x.ano}.pdf`)}>{x.ano} · {x.valorTotal != null ? brl(x.valorTotal) : ""}</Button>
                    : <span key={x.ano} className="rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-300">{x.ano}: {x.motivo ?? "retida — débito em aberto"}</span>)}
                </div>
              </section>
            </div>
          )
        )}
      </div>
    </div>
  );
}
