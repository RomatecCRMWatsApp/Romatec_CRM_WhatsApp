import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { FileSignature, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Campo, InputMascara, classeCampo, sel } from "@/components/cadastro/campos";
import { buscarCep } from "@/components/equipe/CadastroUsuario";
import { maskCEP, maskCPF, maskPhone, onlyDigits } from "@shared/masks";
import { UFS } from "@shared/cadastro";
import { perfilDe } from "@shared/equipe";
import { ESTADOS_CIVIS, REGIMES_BENS, exigeConjuge, exigePacto, pendenciasComprador, type PessoaForm } from "@shared/contratos";
import { brl } from "@shared/simulador";

const PESSOA_VAZIA: PessoaForm = {
  nome: "", cpf: "", sexo: "", nacionalidade: "brasileira", estadoCivil: "", regimeBens: "", pactoAntenupcial: "", profissao: "", nascimento: "",
  rg: "", rgOrgao: "SSP", rgUf: "MA", email: "", telefone1: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "MA",
};
const PASSOS = ["Unidade e plano", "Comprador", "Revisão"];

/** Primeiro pagamento sugerido: dia 10 do mês que vem */
function dataSugerida() {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth() + 1, 10);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-10`;
}
const br = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

function PessoaCampos({ p, set, erros, prefixo, conjuge }: {
  p: PessoaForm; set: (k: keyof PessoaForm, v: string) => void; erros: Record<string, string>; prefixo: "comprador" | "conjuge"; conjuge?: boolean;
}) {
  const e = (k: string) => erros[`${prefixo}.${k}`];
  const cep = async (v: string) => {
    set("cep", v);
    if (onlyDigits(v).length === 8) {
      const r = await buscarCep(v);
      if (r) { set("logradouro", r.logradouro); set("bairro", r.bairro); set("cidade", r.cidade); set("uf", r.uf); }
    }
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Campo rotulo="Nome completo" erro={e("nome")} className="sm:col-span-2"><input className={classeCampo(e("nome"))} value={p.nome} onChange={x => set("nome", x.target.value)} /></Campo>
      <Campo rotulo="CPF" erro={e("cpf")}><InputMascara valor={p.cpf} mascara={maskCPF} onMudar={v => set("cpf", v)} inputMode="numeric" placeholder="000.000.000-00" erro={e("cpf")} /></Campo>
      <Campo rotulo="Sexo"><select className={sel} value={p.sexo ?? ""} onChange={x => set("sexo", x.target.value)}><option value="">—</option><option value="F">Feminino</option><option value="M">Masculino</option></select></Campo>
      {!conjuge && (
        <Campo rotulo="Estado civil" erro={e("estadoCivil")}>
          <select className={sel} value={p.estadoCivil ?? ""} onChange={x => set("estadoCivil", x.target.value)}>
            <option value="">Escolha…</option>{ESTADOS_CIVIS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </Campo>
      )}
      {!conjuge && p.estadoCivil === "casado" && (
        <Campo rotulo="Regime de bens" erro={e("regimeBens")}>
          <select className={sel} value={p.regimeBens ?? ""} onChange={x => set("regimeBens", x.target.value)}>
            <option value="">Escolha…</option>{REGIMES_BENS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </Campo>
      )}
      {!conjuge && exigePacto(p.estadoCivil, p.regimeBens) && (
        <Campo rotulo="Pacto antenupcial (cartório, livro, folha, data)" erro={e("pactoAntenupcial")} className="sm:col-span-2">
          <input className={classeCampo(e("pactoAntenupcial"))} value={p.pactoAntenupcial ?? ""} onChange={x => set("pactoAntenupcial", x.target.value)} />
        </Campo>
      )}
      <Campo rotulo="Profissão"><input className={classeCampo()} value={p.profissao ?? ""} onChange={x => set("profissao", x.target.value)} /></Campo>
      <Campo rotulo="Nascimento"><input type="date" className={classeCampo()} value={p.nascimento ?? ""} onChange={x => set("nascimento", x.target.value)} /></Campo>
      <Campo rotulo="RG"><input className={classeCampo()} value={p.rg ?? ""} onChange={x => set("rg", x.target.value)} /></Campo>
      <Campo rotulo="Órgão / UF">
        <div className="flex gap-2">
          <input className={classeCampo()} value={p.rgOrgao ?? ""} onChange={x => set("rgOrgao", x.target.value)} />
          <select className={`${sel} w-20`} value={p.rgUf ?? ""} onChange={x => set("rgUf", x.target.value)}>{UFS.map(u => <option key={u}>{u}</option>)}</select>
        </div>
      </Campo>
      <Campo rotulo="Telefone (WhatsApp)" erro={e("telefone1")}><InputMascara valor={p.telefone1 ?? ""} mascara={maskPhone} onMudar={v => set("telefone1", v)} inputMode="tel" erro={e("telefone1")} /></Campo>
      <Campo rotulo="E-mail"><input type="email" className={classeCampo()} value={p.email ?? ""} onChange={x => set("email", x.target.value)} /></Campo>
      {!conjuge && (
        <>
          <Campo rotulo="CEP"><InputMascara valor={p.cep ?? ""} mascara={maskCEP} onMudar={cep} inputMode="numeric" /></Campo>
          <Campo rotulo="Logradouro" erro={e("endereco")} className="sm:col-span-2"><input className={classeCampo(e("endereco"))} value={p.logradouro ?? ""} onChange={x => set("logradouro", x.target.value)} /></Campo>
          <Campo rotulo="Número"><input className={classeCampo()} value={p.numero ?? ""} onChange={x => set("numero", x.target.value)} /></Campo>
          <Campo rotulo="Complemento"><input className={classeCampo()} value={p.complemento ?? ""} onChange={x => set("complemento", x.target.value)} /></Campo>
          <Campo rotulo="Bairro"><input className={classeCampo()} value={p.bairro ?? ""} onChange={x => set("bairro", x.target.value)} /></Campo>
          <Campo rotulo="Cidade"><input className={classeCampo(e("endereco"))} value={p.cidade ?? ""} onChange={x => set("cidade", x.target.value)} /></Campo>
          <Campo rotulo="UF"><select className={sel} value={p.uf ?? ""} onChange={x => set("uf", x.target.value)}>{UFS.map(u => <option key={u}>{u}</option>)}</select></Campo>
        </>
      )}
    </div>
  );
}

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
  const [data1, setData1] = useState(dataSugerida());
  const [comprador, setComprador] = useState<PessoaForm>(PESSOA_VAZIA);
  const [conjuge, setConjuge] = useState<PessoaForm>({ ...PESSOA_VAZIA });
  const [especificas, setEspecificas] = useState("");
  const [modoAssinatura, setModo] = useState<"eletronica" | "manuscrita">("eletronica");
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => { if (op && corretorUserId == null) setCorretor(op.euId); }, [op, corretorUserId]);
  useEffect(() => {
    if (op?.condicoes.prazos.length && !op.condicoes.prazos.includes(prazo)) setPrazo(op.condicoes.prazos.at(-1)!);
  }, [op, prazo]);
  // Lead escolhido: traz nome, telefone e a chácara de interesse
  useEffect(() => {
    const l = op?.leads.find(x => x.id === leadId);
    if (!l) return;
    setComprador(c => ({ ...c, nome: c.nome || String(l.nome ?? ""), telefone1: c.telefone1 || maskPhone(String(l.telefone ?? "").replace(/^55/, "")) }));
    if (l.loteCodigo && !lote && op?.lotes.some(x => x.codigo === l.loteCodigo)) setLote(l.loteCodigo);
  }, [leadId, op]); // eslint-disable-line react-hooks/exhaustive-deps

  const plano = { modalidade, entradaParcelas: modalidade === "avista" ? 1 : entradaParcelas, prazo: modalidade === "avista" ? undefined : prazo, dataPrimeiroPagamento: data1 };
  const sim = trpc.contratos.simular.useQuery({ slug, lote, plano, corretorUserId: corretorUserId ?? undefined }, { enabled: !!lote && /^\d{4}-\d{2}-\d{2}$/.test(data1) });
  const criar = trpc.contratos.criar.useMutation({
    onSuccess: r => { toast.success(`Contrato ${r.numero} criado — chácara reservada`); navigate(`/contratos/${r.id}`); },
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
  const precisaLead = perfil === "corretor";
  const passo0ok = !!lote && !!sim.data && (!precisaLead || !!leadId);

  const avancar = () => {
    if (passo === 1) {
      const e = pendenciasComprador(comprador, casado ? conjuge : null);
      setErros(e);
      if (Object.keys(e).length) { toast.error("Confira os campos destacados"); return; }
    }
    setPasso(p => Math.min(p + 1, PASSOS.length - 1));
  };
  const enviar = () => criar.mutate({
    slug, lote, leadId, corretorUserId: corretorUserId ?? undefined, plano,
    comprador, conjuge: casado ? conjuge : null, condicoes: { especificas, modoAssinatura },
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
              <Campo rotulo={precisaLead ? "Lead (obrigatório)" : "Lead (opcional)"}>
                <select className={sel} value={leadId ?? ""} onChange={e => setLeadId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">{precisaLead ? "Escolha um lead seu…" : "Sem lead"}</option>
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
                  <Campo rotulo={`Entrada (${Math.round(op.condicoes.entradaPct * 100)}%)`}>
                    <select className={sel} value={entradaParcelas} onChange={e => setEntrada(Number(e.target.value))}>
                      {Array.from({ length: op.condicoes.entradaMaxParcelas }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n === 1 ? "À vista (com desconto)" : `${n}× sem juros`}</option>)}
                    </select>
                  </Campo>
                  <Campo rotulo="Saldo">
                    <select className={sel} value={prazo} onChange={e => setPrazo(Number(e.target.value))}>
                      {op.condicoes.prazos.map(p => <option key={p} value={p}>{p} meses</option>)}
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
                        <p>Entrada: <b>{sim.data.entrada_qtd}× {brl(sim.data.entrada_parcela)}</b> (total {brl(sim.data.entrada_valor)})</p>
                        <p>Saldo: <b>{sim.data.saldo_qtd}× {brl(sim.data.saldo_parcela)}</b> a partir de {br(sim.data.saldo_venc1)}</p>
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
          </section>
        )}

        {passo === 2 && sim.data && (
          <section className="space-y-4 rounded-xl border border-border bg-card p-4 text-sm">
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <p>Chácara: <b>{lote}</b> · {op?.empreendimento.nome}</p>
              <p>Comprador: <b>{comprador.nome}</b> — CPF {comprador.cpf}</p>
              {casado && <p>Cônjuge: <b>{conjuge.nome}</b> — CPF {conjuge.cpf}</p>}
              <p>Plano: <b>{sim.data.modalidade === "avista" ? `à vista ${brl(sim.data.total_pagar)}` : `entrada ${sim.data.entrada_qtd}× ${brl(sim.data.entrada_parcela)} + ${sim.data.saldo_qtd}× ${brl(sim.data.saldo_parcela)}`}</b></p>
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
            : <Button disabled={criar.isPending} onClick={enviar}>{criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Criar contrato e reservar a chácara</Button>}
        </div>
      </div>
    </div>
  );
}
