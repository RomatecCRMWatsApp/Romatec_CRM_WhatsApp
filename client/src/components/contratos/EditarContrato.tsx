import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PessoaCampos, { PESSOA_VAZIA } from "@/components/cadastro/PessoaCampos";
import { Campo, classeCampo, sel } from "@/components/cadastro/campos";
import { CondicoesEspecificas } from "@/components/contratos/CondicoesEspecificas";
import { maskCEP, maskCPF, maskPhone } from "@shared/masks";
import { exigeConjuge, pendenciasComprador, type PessoaForm } from "@shared/contratos";
import { ROTULO_CONDICAO, ROTULO_MODO_C, type ModoPlanoC } from "@shared/condicoesLancamento";

/** Linha do cadastro (pessoas) → formulário */
function paraForm(x: any | null | undefined): PessoaForm {
  if (!x) return { ...PESSOA_VAZIA };
  const v = (k: string) => (x[k] == null ? "" : String(x[k]));
  return {
    ...PESSOA_VAZIA,
    nome: v("nome"), cpf: x.cpfCnpj ? maskCPF(String(x.cpfCnpj)) : "", sexo: v("sexo"), nacionalidade: v("nacionalidade") || "brasileira",
    estadoCivil: v("estadoCivil"), regimeBens: v("regimeBens"), pactoAntenupcial: v("pactoAntenupcial"), profissao: v("profissao"),
    nascimento: v("nascimento").slice(0, 10), rg: v("rg"), rgOrgao: v("rgOrgao"), rgUf: v("rgUf") || "MA", email: v("email"),
    telefone1: x.telefone1 ? maskPhone(String(x.telefone1).replace(/^55(?=\d{10,11}$)/, "")) : "", cep: x.cep ? maskCEP(String(x.cep)) : "",
    logradouro: v("logradouro"), numero: v("numero"), complemento: v("complemento"), bairro: v("bairro"), cidade: v("cidade"), uf: v("uf") || "MA",
  };
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  onSalvo: () => void;
  contrato: { id: number; numero: string; status: string; empreendimentoSlug: string; corretorUserId: number; condicoesEspecificas?: string };
  comprador: any;
  conjuge: any;
  /** Plano atual (snapshot do contrato) — base para a edição do plano */
  plano?: any;
}

type Cond = "padrao" | "A" | "B" | "C";
function planoInicial(p: any) {
  return {
    modalidade: (p?.modalidade === "avista" ? "avista" : "financiado") as "avista" | "financiado",
    condicao: (["A", "B", "C"].includes(p?.condicao) ? p.condicao : "padrao") as Cond,
    prazo: Number(p?.saldo_qtd) || 120,
    entradaParcelas: p?.condicao && p.condicao !== "padrao" ? 1 : Number(p?.entrada_qtd) || 1,
    data1: String(p?.entrada_venc1 || p?.avista_vencimento || "").slice(0, 10),
    modoC: (["unificado", "sequencial", "congelado"].includes(p?.complemento_modo) ? p.complemento_modo : "unificado") as ModoPlanoC,
    inicioComp: Number(p?.complemento_inicio_mes) || 15,
    entradaForma: (p?.entrada_forma === "boleto_cartao" ? "boleto_cartao" : "unica") as "unica" | "boleto_cartao",
    inicioParcelas: String(p?.parcelas_inicio || "").slice(0, 10),
  };
}

/** Editar o contrato (só o administrador, com a senha de login): comprador, cônjuge, corretor e condições específicas */
export function EditarContrato({ aberto, onFechar, onSalvo, contrato, comprador, conjuge, plano }: Props) {
  const pode = trpc.contratos.edicao.useQuery({ id: contrato.id }, { enabled: aberto });
  const opcoes = trpc.contratos.opcoes.useQuery({ slug: contrato.empreendimentoSlug }, { enabled: aberto && !!contrato.empreendimentoSlug });
  const [c, setC] = useState<PessoaForm>(PESSOA_VAZIA);
  const [j, setJ] = useState<PessoaForm>(PESSOA_VAZIA);
  const [corretor, setCorretor] = useState(contrato.corretorUserId);
  const [especificas, setEspecificas] = useState("");
  const [senha, setSenha] = useState("");
  const [mudarPlano, setMudarPlano] = useState(false);
  const [pl, setPl] = useState(planoInicial(plano));
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!aberto) return;
    setC(paraForm(comprador)); setJ(paraForm(conjuge)); setCorretor(contrato.corretorUserId);
    setEspecificas(contrato.condicoesEspecificas === "Não há." ? "" : contrato.condicoesEspecificas ?? ""); setSenha(""); setErros({});
    setPl(planoInicial(plano)); setMudarPlano(false);
  }, [aberto, comprador, conjuge, contrato.corretorUserId, contrato.condicoesEspecificas, plano]);
  const editar = trpc.contratos.editar.useMutation({
    onSuccess: r => {
      toast.success(r.voltouRascunho ? "Contrato atualizado. Ele voltou a rascunho: gere a minuta/definitivo de novo." : r.soCadastral ? "Cadastro corrigido. O PDF assinado continua o oficial (alteração na trilha)." : "Contrato atualizado");
      onSalvo(); onFechar();
    },
    onError: e => toast.error(e.message),
  });
  const temConjuge = exigeConjuge(c.estadoCivil);
  const planoParaEnviar = () => {
    const lanc = pl.modalidade === "financiado" && pl.condicao !== "padrao";
    return {
      modalidade: pl.modalidade, dataPrimeiroPagamento: pl.data1,
      entradaParcelas: pl.modalidade === "avista" || lanc ? 1 : pl.entradaParcelas,
      ...(pl.modalidade === "financiado" ? { prazo: pl.prazo, condicao: pl.condicao } : { condicao: "padrao" as const }),
      ...(pl.modalidade === "financiado" && pl.condicao === "C" ? { modoC: pl.modoC, ...(pl.modoC === "congelado" ? { inicioComplemento: pl.inicioComp } : {}) } : {}),
      ...(lanc ? { entradaForma: pl.entradaForma, ...(/^\d{4}-\d{2}-\d{2}$/.test(pl.inicioParcelas) ? { inicioParcelas: pl.inicioParcelas } : {}) } : {}),
    };
  };
  const prazos: number[] = (opcoes.data as any)?.prazos ?? (opcoes.data as any)?.condicoes?.prazos ?? [12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 180];
  const salvar = () => {
    const e = pendenciasComprador(c, temConjuge ? j : null);
    setErros(e);
    if (Object.keys(e).length) return toast.error(`Confira: ${Object.values(e).join(", ")}`);
    if (!senha) return toast.error("Digite a sua senha de login para confirmar");
    editar.mutate({
      id: contrato.id, senha, comprador: c, conjuge: temConjuge ? j : null,
      ...(corretor && corretor !== contrato.corretorUserId ? { corretorUserId: corretor } : {}),
      condicoesEspecificas: especificas,
      ...(mudarPlano ? { plano: planoParaEnviar() } : {}),
    });
  };
  const corretores: any[] = (opcoes.data as any)?.corretores ?? [];

  return (
    <Dialog open={aberto} onOpenChange={v => !v && !editar.isPending && onFechar()}>
      <DialogContent className="bg-card border-border sm:max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-foreground">Editar contrato {contrato.numero}</DialogTitle>
          <DialogDescription>
            Só o administrador. {pode.data?.voltaRascunho && "O contrato já foi gerado: depois de salvar ele volta a rascunho e a rodada de assinaturas pendente é descartada — gere o PDF de novo. "}
            {pode.data?.soCadastral && "Contrato já assinado: vale como correção do cadastro; o PDF assinado continua o oficial (para mudar condições, use termo aditivo). "}
          </DialogDescription>
        </DialogHeader>
        {pode.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : !pode.data?.editar ? (
          <p className="text-sm text-danger-400">Contrato cancelado ou distratado não pode ser editado.</p>
        ) : (
          <div className="space-y-5">
            <section className="space-y-2"><h3 className="text-sm font-semibold">Comprador(a)</h3><PessoaCampos p={c} set={(k, v) => setC(x => ({ ...x, [k]: v }))} erros={erros} prefixo="comprador" /></section>
            {temConjuge && <section className="space-y-2"><h3 className="text-sm font-semibold">Cônjuge / companheiro(a)</h3><PessoaCampos p={j} set={(k, v) => setJ(x => ({ ...x, [k]: v }))} erros={erros} prefixo="conjuge" conjuge /></section>}
            <section className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Corretor da venda">
                <select className={sel} value={corretor} onChange={e => setCorretor(Number(e.target.value))}>
                  {!corretores.some(x => x.id === contrato.corretorUserId) && <option value={contrato.corretorUserId}>(atual)</option>}
                  {corretores.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
              </Campo>
              <div className="sm:col-span-2">
                <CondicoesEspecificas valor={especificas} onMudar={setEspecificas} admin
                  planoC={mudarPlano ? pl.modalidade === "financiado" && pl.condicao === "C" : plano?.condicao === "C"}
                  inicioComplemento={mudarPlano ? pl.inicioComp : Number(plano?.complemento_inicio_mes) || 15}
                  onCongelamento={ligado => {
                    if (!pode.data?.plano) return;
                    if (ligado) { setMudarPlano(true); setPl(x => ({ ...x, modalidade: "financiado", condicao: "C", modoC: "congelado" })); }
                    else if (pl.modoC === "congelado") setPl(x => ({ ...x, modoC: "unificado" }));
                  }} />
              </div>
            </section>
            <section className="space-y-2 rounded-lg border border-border p-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={mudarPlano} disabled={!pode.data?.plano} onChange={e => setMudarPlano(e.target.checked)} /> Mudar o plano de pagamento
              </label>
              {!pode.data?.plano && <p className="text-xs text-muted-foreground">O plano só muda antes da assinatura e sem boleto emitido (contrato assinado: termo aditivo).</p>}
              {mudarPlano && pode.data?.plano && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Campo rotulo="Modalidade">
                    <select className={sel} value={pl.modalidade === "avista" ? "avista" : pl.condicao} onChange={e => {
                      const v = e.target.value;
                      setPl(x => v === "avista" ? { ...x, modalidade: "avista" } : { ...x, modalidade: "financiado", condicao: v as Cond });
                    }}>
                      <option value="avista">À vista</option>
                      {(["padrao", "A", "B", "C"] as Cond[]).map(k => <option key={k} value={k}>{k === "padrao" ? "Financiado — entrada de 30%" : `Financiado — ${ROTULO_CONDICAO[k].curto}`}</option>)}
                    </select>
                  </Campo>
                  {pl.modalidade === "financiado" && (
                    <Campo rotulo="Prazo do saldo (meses)">
                      <select className={sel} value={pl.prazo} onChange={e => setPl(x => ({ ...x, prazo: Number(e.target.value) }))}>
                        {Array.from(new Set([...prazos, pl.prazo])).sort((a, b) => a - b).map(n => <option key={n} value={n}>{n}×</option>)}
                      </select>
                    </Campo>
                  )}
                  {pl.modalidade === "financiado" && pl.condicao === "padrao" && (
                    <Campo rotulo="Entrada em (vezes)">
                      <input type="number" min={1} max={6} className={classeCampo()} value={pl.entradaParcelas} onChange={e => setPl(x => ({ ...x, entradaParcelas: Math.max(1, Math.min(6, Number(e.target.value) || 1)) }))} />
                    </Campo>
                  )}
                  <Campo rotulo={pl.modalidade === "avista" ? "Vencimento do pagamento" : "Vencimento da entrada (ato)"}>
                    <input type="date" className={classeCampo()} value={pl.data1} onChange={e => setPl(x => ({ ...x, data1: e.target.value }))} />
                  </Campo>
                  {pl.modalidade === "financiado" && pl.condicao !== "padrao" && (<>
                    <Campo rotulo="Forma da entrada (ato)">
                      <select className={sel} value={pl.entradaForma} onChange={e => setPl(x => ({ ...x, entradaForma: e.target.value as "unica" | "boleto_cartao" }))}>
                        <option value="unica">Parcela única (boleto/PIX)</option>
                        <option value="boleto_cartao">Metade boleto/PIX + metade cartão</option>
                      </select>
                    </Campo>
                    <Campo rotulo="1º vencimento das parcelas (vazio = 1 mês depois do ato)">
                      <input type="date" className={classeCampo()} value={pl.inicioParcelas} min={pl.data1} onChange={e => setPl(x => ({ ...x, inicioParcelas: e.target.value }))} />
                    </Campo>
                  </>)}
                  {pl.modalidade === "financiado" && pl.condicao === "C" && (
                    <Campo rotulo="Resto da entrada (Plano C)" className="sm:col-span-2">
                      <select className={sel} value={pl.modoC} onChange={e => setPl(x => ({ ...x, modoC: e.target.value as ModoPlanoC }))}>
                        {(["unificado", "sequencial", "congelado"] as ModoPlanoC[]).map(m => <option key={m} value={m}>{ROTULO_MODO_C[m].titulo}</option>)}
                      </select>
                    </Campo>
                  )}
                  {pl.modalidade === "financiado" && pl.condicao === "C" && pl.modoC === "congelado" && (
                    <Campo rotulo="Complemento começa no mês (contado do ato)">
                      <input type="number" min={2} max={60} className={classeCampo()} value={pl.inicioComp} onChange={e => setPl(x => ({ ...x, inicioComp: Math.max(2, Math.min(60, Number(e.target.value) || 2)) }))} />
                    </Campo>
                  )}
                  {pl.modalidade === "financiado" && pl.condicao === "C" && (
                    <p className="text-xs text-muted-foreground sm:col-span-3">{ROTULO_MODO_C[pl.modoC].resumo}</p>
                  )}
                </div>
              )}
            </section>
            <Campo rotulo="Sua senha de login (confirma a alteração)">
              <input type="password" autoComplete="current-password" className={classeCampo()} value={senha} onChange={e => setSenha(e.target.value)} />
            </Campo>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={editar.isPending}>Fechar</Button>
          {pode.data?.editar && <Button onClick={salvar} disabled={editar.isPending}>{editar.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Salvar alterações</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Excluir o contrato (só o administrador, com a senha): só sem dinheiro envolvido; com pagamento, o caminho é Cancelar */
export function ExcluirContrato({ aberto, onFechar, onExcluido, contrato }: { aberto: boolean; onFechar: () => void; onExcluido: () => void; contrato: { id: number; numero: string; loteCodigo?: string } }) {
  const pode = trpc.contratos.edicao.useQuery({ id: contrato.id }, { enabled: aberto });
  const [motivo, setMotivo] = useState("");
  const [senha, setSenha] = useState("");
  useEffect(() => { if (aberto) { setMotivo(""); setSenha(""); } }, [aberto]);
  const excluir = trpc.contratos.excluir.useMutation({
    onSuccess: r => { toast.success(`Contrato ${r.numero} excluído${r.loteLiberado ? " — chácara de volta a disponível" : ""}`); onExcluido(); },
    onError: e => toast.error(e.message),
  });
  return (
    <Dialog open={aberto} onOpenChange={v => !v && !excluir.isPending && onFechar()}>
      <DialogContent className="bg-card border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">Excluir o contrato {contrato.numero}?</DialogTitle>
          <DialogDescription>Apaga o contrato, as versões, as assinaturas pendentes e as cobranças só previstas{contrato.loteCodigo ? `, e a chácara ${contrato.loteCodigo} volta a disponível` : ""}. A trilha de auditoria fica guardada. Não dá para desfazer.</DialogDescription>
        </DialogHeader>
        {pode.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : !pode.data?.excluir ? (
          <p className="text-sm text-danger-400">{pode.data?.motivoNaoExcluir ?? "Este contrato não pode ser excluído."}</p>
        ) : (
          <div className="space-y-3">
            <Campo rotulo="Motivo"><input className={classeCampo()} value={motivo} maxLength={300} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: contrato de teste" /></Campo>
            <Campo rotulo="Sua senha de login"><input type="password" autoComplete="current-password" className={classeCampo()} value={senha} onChange={e => setSenha(e.target.value)} /></Campo>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={excluir.isPending}>Fechar</Button>
          {pode.data?.excluir && (
            <Button variant="destructive" disabled={excluir.isPending || motivo.trim().length < 3 || !senha} onClick={() => excluir.mutate({ id: contrato.id, motivo, senha })}>
              {excluir.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />} Excluir definitivamente
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Liberar a venda antes do registro do parcelamento (venda na planta): só o administrador, com a senha */
export function LiberarVendaAntesRegistro({ aberto, onFechar, onFeito, contratoId }: { aberto: boolean; onFechar: () => void; onFeito: () => void; contratoId: number }) {
  const [protocolo, setProtocolo] = useState("");
  const [temProtocolo, setTemProtocolo] = useState(false);
  const [prazo, setPrazo] = useState(180);
  const [senha, setSenha] = useState("");
  const [ciente, setCiente] = useState(false);
  useEffect(() => { if (aberto) { setSenha(""); setCiente(false); } }, [aberto]);
  const liberar = trpc.contratos.vendaAntesRegistro.useMutation({
    onSuccess: () => { toast.success("Venda antes do registro liberada: gere o definitivo de novo"); onFeito(); onFechar(); },
    onError: e => toast.error(e.message),
  });
  return (
    <Dialog open={aberto} onOpenChange={v => !v && !liberar.isPending && onFechar()}>
      <DialogContent className="bg-card border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">Liberar a venda antes do registro do parcelamento</DialogTitle>
          <DialogDescription>
            Vale para todos os contratos deste empreendimento. A Cláusula 2.2 passa a dizer que o imóvel está matriculado e o parcelamento em processo de registro, com o protocolo; o registro e as demais aprovações entram por termo aditivo; e, se o registro não sair no prazo, o comprador pode desfazer com devolução integral e corrigida, sem retenção.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* Sem protocolo ainda: libera agora; o protocolo e o registro entram depois, por termo aditivo, quando saírem as certidões */}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={temProtocolo} onChange={e => setTemProtocolo(e.target.checked)} /> Já tenho o protocolo do pedido de registro</label>
          {temProtocolo && <Campo rotulo="Protocolo no Registro de Imóveis"><input className={classeCampo()} value={protocolo} maxLength={60} onChange={e => setProtocolo(e.target.value)} placeholder="Ex.: 12.345" /></Campo>}
          <Campo rotulo="Prazo para obter o registro (dias, contados da assinatura)"><input type="number" min={30} max={720} className={classeCampo()} value={prazo} onChange={e => setPrazo(Math.max(30, Math.min(720, Number(e.target.value) || 180)))} /></Campo>
          <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" className="mt-0.5" checked={ciente} onChange={e => setCiente(e.target.checked)} />
            Estou ciente de que a promessa de venda antes do registro é vedada pela Lei n.º 6.766/1979 (arts. 37 e 50) e assumo a decisão pela gestão do empreendimento.</label>
          <Campo rotulo="Sua senha de login"><input type="password" autoComplete="current-password" className={classeCampo()} value={senha} onChange={e => setSenha(e.target.value)} /></Campo>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={liberar.isPending}>Fechar</Button>
          <Button disabled={liberar.isPending || !ciente || !senha} onClick={() => liberar.mutate({ id: contratoId, ligado: true, protocolo: temProtocolo ? protocolo : "", prazoDias: prazo, senha })}>
            {liberar.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Liberar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
