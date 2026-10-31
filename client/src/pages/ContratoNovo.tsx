import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { FileSignature, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Campo, InputMascara, classeCampo, sel } from "@/components/cadastro/campos";
import PessoaCampos, { PESSOA_VAZIA } from "@/components/cadastro/PessoaCampos";
import { buscarCep } from "@/components/equipe/CadastroUsuario";
import { maskCEP, maskCPF, maskPhone, onlyDigits } from "@shared/masks";
import { UFS } from "@shared/cadastro";
import { perfilDe } from "@shared/equipe";
import { ESTADOS_CIVIS, REGIMES_BENS, exigeConjuge, exigePacto, pendenciasComprador, pendenciasDependentes, rotuloParentesco, type Dependente, type PessoaForm } from "@shared/contratos";
import DependentesCampos from "@/components/contratos/Dependentes";
import { AnexosNovoContrato, enviarAnexo, vagasDoContrato, type AnexoPendente } from "@/components/contratos/Anexos";
import { brl } from "@shared/simulador";
import { CONDICOES, ROTULO_CONDICAO, prazosDaCondicao, type CondicaoPagamento } from "@shared/condicoesLancamento";

const PASSOS = ["Unidade e plano", "Comprador", "Revisão"];

/** Primeiro pagamento sugerido: dia 10 do mês que vem */
function dataSugerida() {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() + 1, 10);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-10`;
}
const br = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

/** Novo contrato: chácara e plano → comprador (e cônjuge) → revisão. O servidor recalcula o plano e reserva a chácara. */
export default function ContratoNovo() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const perfil = perfilDe(user as any);
  const q = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const { data: emps } = trpc.empreendimentosAdmin.lista.useQuery();
  const [slug, setSlug] = useState(q.get("slug") || "bom-jardims");
  const { data: op, error: erroOp } = trpc.contratos.opcoes.useQuery({ slug }, { enabled: !!slug });
  const [passo, setPasso] = useState(0);
  const [lote, setLote] = useState(q.get("lote") || "");
  const [leadId, setLeadId] = useState<number | null>(q.get("lead") ? Number(q.get("lead")) : null);
  const [corretorUserId, setCorretor] = useState<number | null>(null);
  const [modalidade, setModalidade] = useState<"financiado" | "avista">("financiado");
  const [entradaParcelas, setEntrada] = useState(1);
  const [prazo, setPrazo] = useState(120);
  /** Forma de pagamento do financiado — define o modelo do CPCV (entrada 30% ou Plano A, B, C) */
  const [condicao, setCondicao] = useState<CondicaoPagamento>(() => { const c = q.get("condicao"); return c === "A" || c === "B" || c === "C" ? c : "padrao"; });
  const [data1, setData1] = useState(dataSugerida());
  const [comprador, setComprador] = useState<PessoaForm>(PESSOA_VAZIA);
  const [conjuge, setConjuge] = useState<PessoaForm>({ ...PESSOA_VAZIA });
  const [especificas, setEspecificas] = useState("");
  const [modoAssinatura, setModo] = useState<"eletronica" | "manuscrita">("eletronica");
  const [erros, setErros] = useState<Record<string, string>>({});
  // null = sem dependentes; lista = carteirinhas extras (até 6)
  const [dependentes, setDependentes] = useState<Dependente[] | null>(null);

  useEffect(() => { if (op && corretorUserId == null) setCorretor(op.euId); }, [op, corretorUserId]);
  useEffect(() => {
    if (!op?.condicoes.prazos.length) return;
    const ps = prazosDaCondicao(condicao, op.condicoes);
    if (!ps.includes(prazo)) setPrazo(condicao === "B" ? 180 : ps.at(-1)!);
  }, [op, prazo, condicao]);
  // Lead escolhido: traz nome, telefone e a chácara de interesse
  useEffect(() => {
    const l = op?.leads.find(x => x.id === leadId);
    if (!l) return;
    setComprador(c => ({ ...c, nome: c.nome || String(l.nome ?? ""), telefone1: c.telefone1 || maskPhone(String(l.telefone ?? "").replace(/^55/, "")) }));
    if (l.loteCodigo && !lote && op?.lotes.some(x => x.codigo === l.loteCodigo)) setLote(l.loteCodigo);
  }, [leadId, op]); // eslint-disable-line react-hooks/exhaustive-deps

  const plano = { modalidade, entradaParcelas: modalidade === "avista" || condicao !== "padrao" ? 1 : entradaParcelas, prazo: modalidade === "avista" ? undefined : prazo, dataPrimeiroPagamento: data1, condicao: modalidade === "avista" ? "padrao" as const : condicao };
  const sim = trpc.contratos.simular.useQuery({ slug, lote, plano, corretorUserId: corretorUserId ?? undefined }, { enabled: !!lote && /^\d{4}-\d{2}-\d{2}$/.test(data1) });
  // Documentos escolhidos no passo 2: sobem logo depois de criar (dependente pela posição na lista)
  const [anexos, setAnexos] = useState<AnexoPendente[]>([]);
  const vagas = vagasDoContrato(exigeConjuge(comprador.estadoCivil), (dependentes ?? []).map((d, i) => ({ nome: d.nome, ref: i })));
  const anexosValidos = anexos.filter(a => vagas.some(v => v.alvo === a.alvo && v.tipo === a.tipo && v.dependente === a.dependente));
  const [subindo, setSubindo] = useState(false);
  const criar = trpc.contratos.criar.useMutation({
    onSuccess: async r => {
      toast.success(`Contrato ${r.numero} criado — chácara reservada`);
      if (anexosValidos.length) {
        setSubindo(true);
        let falhas = 0;
        for (const a of anexosValidos) { try { await enviarAnexo(r.id, a, a.arquivo); } catch { falhas++; } }
        setSubindo(false);
        if (falhas) toast.error(`${falhas} documento(s) não subiram — envie pela tela do contrato`);
        else toast.success(`${anexosValidos.length} documento(s) anexados`);
      }
      navigate(`/contratos/${r.id}`);
    },
    onError: e => {
      const campos = (e.data as any)?.campos as Record<string, string> | undefined;
      if (campos) { setErros(campos); setPasso(1); }
      toast.error(e.message);
    },
  });

  const loteSel = op?.lotes.find(l => l.codigo === lote);
  const casado = exigeConjuge(comprador.estadoCivil);
  const setC = (k: keyof PessoaForm, v: string) => setComprador(p => ({ ...p, [k]: v }));
  const setJ = (k: keyof PessoaForm, v: string) => setConjuge(p => ({ ...p, [k]: v }));
  const passo0ok = !!lote && !!sim.data;

  const avancar = () => {
    if (passo === 1) {
      const e = { ...pendenciasComprador(comprador, casado ? conjuge : null), ...pendenciasDependentes(dependentes ?? []) };
      setErros(e);
      if (Object.keys(e).length) { toast.error("Confira os campos destacados"); return; }
    }
    setPasso(p => Math.min(p + 1, PASSOS.length - 1));
  };
  const enviar = () => criar.mutate({
    slug, lote, leadId, corretorUserId: corretorUserId ?? undefined, plano,
    comprador, conjuge: casado ? conjuge : null, dependentes: dependentes ?? [], condicoes: { especificas, modoAssinatura },
  });

  const opcoesEmp = useMemo(() => (emps ?? []).filter(e => e.acesso), [emps]);

  return (
    <div>
      <PageHeader icone={FileSignature} titulo="Novo contrato" subtitulo="Compromisso de compra e venda — a chácara fica reservada por 72 h ao criar"
        voltar={{ rotulo: "Contratos", onClick: () => navigate("/contratos") }} />
      <div className="mx-auto max-w-[1100px] space-y-4 px-4 pb-10 md:px-6">
        <ol className="flex flex-wrap gap-2 text-xs">
          {PASSOS.map((p, i) => (
            <li key={p} className={`rounded-full border px-3 py-1 ${i === passo ? "border-primary bg-primary/15 text-primary" : i < passo ? "border-emerald-600/50 text-emerald-400" : "border-border text-muted-foreground"}`}>
              {i + 1}. {p}
            </li>
          ))}
        </ol>
        {erroOp && <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{erroOp.message}</p>}

        {passo === 0 && op && (
          <section className="space-y-4 rounded-xl border border-border bg-card p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Campo rotulo="Empreendimento">
                <select className={sel} value={slug} onChange={e => { setSlug(e.target.value); setLote(""); }}>
                  {opcoesEmp.map(e => <option key={e.slug} value={e.slug}>{e.nome}</option>)}
                </select>
              </Campo>
              <Campo rotulo={`Chácara (${op.lotes.length} disponíveis)`}>
                <select className={sel} value={lote} onChange={e => setLote(e.target.value)}>
                  <option value="">Escolha…</option>
                  {op.lotes.map(l => <option key={l.codigo} value={l.codigo}>{l.codigo} · {l.areaM2.toLocaleString("pt-BR")} m²{l.precoTabela ? ` · ${brl(l.precoTabela)}` : ""}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Lead (opcional)">
                <select className={sel} value={leadId ?? ""} onChange={e => setLeadId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">{perfil === "corretor" ? "Cliente próprio (sem lead)" : "Sem lead"}</option>
                  {op.leads.map(l => <option key={l.id} value={l.id}>{l.nome}{l.loteCodigo ? ` · ${l.loteCodigo}` : ""}</option>)}
                </select>
              </Campo>
              {perfil !== "corretor" && (
                <Campo rotulo="Corretor da venda">
                  <select className={sel} value={corretorUserId ?? ""} onChange={e => setCorretor(Number(e.target.value))}>
                    {op.corretores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </Campo>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Campo rotulo="Forma de pagamento">
                <select className={sel} value={modalidade} onChange={e => setModalidade(e.target.value as any)}>
                  <option value="financiado">Entrada + saldo parcelado</option>
                  <option value="avista">À vista (total, com desconto)</option>
                </select>
              </Campo>
              {modalidade === "financiado" && (
                <>
                  <Campo rotulo="Condição (modelo do contrato)">
                    <select className={sel} value={condicao} onChange={e => { const k = e.target.value as CondicaoPagamento; setCondicao(k); setPrazo(k === "B" ? 180 : 120); }}>
                      {CONDICOES.map(k => <option key={k} value={k}>{ROTULO_CONDICAO[k].titulo}</option>)}
                    </select>
                  </Campo>
                  {condicao === "padrao" && <Campo rotulo={`Entrada (${Math.round(op.condicoes.entradaPct * 100)}%)`}>
                    <select className={sel} value={entradaParcelas} onChange={e => setEntrada(Number(e.target.value))}>
                      {Array.from({ length: op.condicoes.entradaMaxParcelas }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n === 1 ? "À vista (com desconto)" : `${n}× sem juros`}</option>)}
                    </select>
                  </Campo>}
                  <Campo rotulo="Saldo">
                    <select className={sel} value={prazo} onChange={e => setPrazo(Number(e.target.value))}>
                      {prazosDaCondicao(condicao, op.condicoes).map(p => <option key={p} value={p}>{p} meses</option>)}
                    </select>
                  </Campo>
                </>
              )}
              <Campo rotulo="1º pagamento"><input type="date" className={classeCampo()} value={data1} onChange={e => setData1(e.target.value)} /></Campo>
            </div>
            {lote && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                {sim.isLoading && <p className="text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Calculando…</p>}
                {sim.error && <p className="text-red-400">{sim.error.message}</p>}
                {sim.data && (
                  <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                    <p>Chácara <b>{lote}</b> · {loteSel?.areaM2.toLocaleString("pt-BR")} m²</p>
                    <p>Preço de tabela: <b>{brl(sim.data.preco_tabela)}</b></p>
                    {sim.data.modalidade === "avista"
                      ? <p>À vista: <b>{brl(sim.data.total_pagar)}</b> em {br(sim.data.avista_vencimento)}</p>
                      : <>
                        {sim.data.condicao && sim.data.condicao !== "padrao" && <p className="sm:col-span-2 lg:col-span-3">Condição: <b>{ROTULO_CONDICAO[sim.data.condicao].titulo}</b> — contrato no modelo do {ROTULO_CONDICAO[sim.data.condicao].curto}</p>}
                        <p>Entrada: <b>{sim.data.entrada_qtd}× {brl(sim.data.entrada_parcela)}</b> (total {brl(sim.data.entrada_valor)})</p>
                        {sim.data.complemento_qtd ? <p>Resto da entrada: <b>{sim.data.complemento_qtd}× {brl(sim.data.complemento_parcela ?? 0)}</b> sem juros, de {br(sim.data.complemento_venc1 ?? "")}</p> : null}
                        <p>Saldo: <b>{sim.data.saldo_qtd}× {brl(sim.data.saldo_parcela)}</b> a partir de {br(sim.data.saldo_venc1)}</p>
                        {sim.data.reforco_qtd ? <p>Reforço anual: <b>{sim.data.reforco_qtd}× {brl(sim.data.reforco_valor ?? 0)}</b>, o 1º em {br(sim.data.reforco_venc1 ?? "")}</p> : null}
                        <p>Total a pagar: <b>{brl(sim.data.total_pagar)}</b> · juros {brl(sim.data.total_juros)}</p>
                      </>}
                    <p className="text-xs text-muted-foreground">Comissão: {brl(sim.data.comissao_total)}</p>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {passo === 1 && (
          <section className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Promissário(a) comprador(a)</h2>
              <PessoaCampos p={comprador} set={setC} erros={erros} prefixo="comprador" />
            </div>
            {casado && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-1 text-sm font-semibold">Cônjuge / companheiro(a) anuente</h2>
                <p className="mb-3 text-xs text-muted-foreground">Obrigatório para casado(a) ou em união estável — assina o contrato junto (Código Civil, arts. 1.647 e 1.725).</p>
                <PessoaCampos p={conjuge} set={setJ} erros={erros} prefixo="conjuge" conjuge />
              </div>
            )}
            <div className="rounded-xl border border-border bg-card p-4">
              <DependentesCampos lista={dependentes} onMudar={setDependentes} erros={erros} comConjuge={casado} />
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <AnexosNovoContrato vagas={vagas} pendentes={anexos} onMudar={setAnexos} />
            </div>
          </section>
        )}

        {passo === 2 && sim.data && (
          <section className="space-y-4 rounded-xl border border-border bg-card p-4 text-sm">
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <p>Chácara: <b>{lote}</b> · {op?.empreendimento.nome}</p>
              <p>Comprador: <b>{comprador.nome}</b> — CPF {comprador.cpf}</p>
              {casado && <p>Cônjuge: <b>{conjuge.nome}</b> — CPF {conjuge.cpf}</p>}
              <p>Documentos anexados: <b>{anexosValidos.length}</b>{anexosValidos.length ? ` — ${anexosValidos.map(a => a.titulo.split(" — ")[0]).join(", ")}` : " (envie depois pela tela do contrato)"}</p>
              <p>Carteirinhas: <b>{1 + (casado ? 1 : 0) + (dependentes?.length ?? 0)}</b>{dependentes?.length ? ` — dependentes: ${dependentes.map(d => `${d.nome.split(" ")[0]} (${rotuloParentesco(d.parentesco)})`).join(", ")}` : " (sem dependentes)"}</p>
              <p>Plano: <b>{sim.data.modalidade === "avista" ? `à vista ${brl(sim.data.total_pagar)}` : `${sim.data.condicao && sim.data.condicao !== "padrao" ? `${ROTULO_CONDICAO[sim.data.condicao].curto} · ` : ""}entrada ${sim.data.entrada_qtd}× ${brl(sim.data.entrada_parcela)}${sim.data.complemento_qtd ? ` + ${sim.data.complemento_qtd}× ${brl(sim.data.complemento_parcela ?? 0)} (resto da entrada)` : ""} + ${sim.data.saldo_qtd}× ${brl(sim.data.saldo_parcela)}${sim.data.reforco_qtd ? ` + ${sim.data.reforco_qtd} reforços de ${brl(sim.data.reforco_valor ?? 0)}` : ""}`}</b></p>
              <p>Total a pagar: <b>{brl(sim.data.total_pagar)}</b></p>
            </div>
            <Campo rotulo="Condições específicas deste contrato (opcional)">
              <textarea className={`${classeCampo()} h-24 py-2`} maxLength={2000} value={especificas} onChange={e => setEspecificas(e.target.value)} placeholder="Ex.: entrega das chaves condicionada…" />
            </Campo>
            <Campo rotulo="Assinatura">
              <select className={sel} value={modoAssinatura} onChange={e => setModo(e.target.value as any)}>
                <option value="eletronica">Eletrônica</option>
                <option value="manuscrita">A punho, com 2 testemunhas</option>
              </select>
            </Campo>
            <p className="rounded-lg bg-secondary/40 p-2 text-xs text-muted-foreground">
              Ao criar, a chácara fica reservada para este contrato. Depois, na ficha do contrato, gere a minuta para conferência.
              O definitivo só é liberado com o parcelamento registrado (Lei 6.766/1979, art. 37).
            </p>
          </section>
        )}

        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="outline" disabled={passo === 0} onClick={() => setPasso(p => p - 1)}>Voltar</Button>
          {passo < PASSOS.length - 1
            ? <Button disabled={passo === 0 && !passo0ok} onClick={avancar}>Continuar</Button>
            : <Button disabled={criar.isPending || subindo} onClick={enviar}>{criar.isPending || subindo ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {subindo ? "Enviando documentos…" : "Criar contrato e reservar a chácara"}</Button>}
        </div>
      </div>
    </div>
  );
}
