import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { CheckCircle2, FileDown, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { RomatecLockup } from "@/brand";
import { Campo, InputMascara, classeCampo, sel } from "@/components/cadastro/campos";
import { maskCEP, maskCPF, maskPhone, onlyDigits } from "@shared/masks";
import { ESTADOS_CIVIS, ORGAOS_EMISSORES, PROFISSOES, REGIMES_BENS, ROTULO_ESTADO_CIVIL, ROTULO_REGIME, UFS, temConjuge } from "@shared/cadastro";
import { ROTULO_PERFIL_RECRUTAMENTO, type DocRecrutamento } from "@shared/recrutamento";

type Dados = Record<string, any>;
const s = (v: unknown) => (v == null ? "" : String(v));

async function buscarCep(cep: string) {
  const d = onlyDigits(cep);
  if (d.length !== 8) return null;
  try {
    const j = await (await fetch(`https://viacep.com.br/ws/${d}/json/`)).json();
    return j.erro ? null : { logradouro: s(j.logradouro), bairro: s(j.bairro), cidade: s(j.localidade), uf: s(j.uf) };
  } catch { return null; }
}

const Secao = ({ titulo, children, nota }: { titulo: string; children: React.ReactNode; nota?: string }) => (
  <section className="space-y-3 rounded-[18px] border border-[var(--rt-border)] bg-[var(--rt-surface)] p-5">
    <div><h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--rt-gold)]">{titulo}</h2>{nota && <p className="text-xs text-muted-foreground">{nota}</p>}</div>
    {children}
  </section>
);

/** Anexo de um documento pedido (um por tipo; enviar de novo substitui) */
function Anexo({ token, doc, enviado, onMudou }: { token: string; doc: DocRecrutamento; enviado?: string; onMudou: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [validade, setValidade] = useState("");
  const [estado, setEstado] = useState<string | null>(null);
  const remover = trpc.recrutamento.removerDoc.useMutation({ onSuccess: onMudou });
  const enviar = async (f?: File | null) => {
    if (!f) return;
    setEstado("Enviando…");
    try {
      const q = doc.tipo === "certidao_creci" && validade ? `?validade=${validade}` : "";
      const r = await fetch(`/api/public/recrutamento/${encodeURIComponent(token)}/docs/${doc.tipo}${q}`, { method: "POST", headers: { "Content-Type": "application/octet-stream", "x-nome-arquivo": encodeURIComponent(f.name) }, body: f });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Não foi possível enviar");
      setEstado(null); onMudou();
    } catch (e: any) { setEstado(e?.message || "Falhou"); } finally { if (input.current) input.current.value = ""; }
  };
  return (
    <div className="rounded-xl border border-[var(--rt-border)] p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <b>{doc.rotulo}</b>
        <span className={`text-xs ${doc.obrigatorio ? "text-amber-300" : "text-muted-foreground"}`}>{doc.obrigatorio ? "obrigatório" : "opcional"}</span>
        {enviado && <span className="flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> {enviado}</span>}
      </div>
      {doc.dica && <p className="mt-0.5 text-xs text-muted-foreground">{doc.dica}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {doc.tipo === "certidao_creci" && (
          <label className="text-xs text-muted-foreground">Válida até <input type="date" value={validade} onChange={e => setValidade(e.target.value)} className="ml-1 h-8 rounded-md border border-border bg-background px-2 text-sm" /></label>
        )}
        <input ref={input} type="file" hidden accept={doc.tipo === "foto" ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf"}
          {...(doc.tipo === "foto" ? { capture: "user" } : {})} onChange={e => enviar(e.target.files?.[0])} />
        <button type="button" onClick={() => input.current?.click()} className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--rt-gold)]/50 px-3 text-xs text-[var(--rt-gold)] hover:bg-[var(--rt-gold)]/10">
          {estado === "Enviando…" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : enviado ? <Paperclip className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
          {enviado ? "Trocar arquivo" : doc.tipo === "foto" ? "Tirar/enviar foto" : "Anexar (foto ou PDF)"}
        </button>
        {enviado && <button type="button" onClick={() => remover.mutate({ token, tipo: doc.tipo })} className="inline-flex h-8 items-center gap-1 px-2 text-xs text-red-300"><Trash2 className="h-3.5 w-3.5" /> Remover</button>}
        {estado && estado !== "Enviando…" && <span className="text-xs text-red-400">{estado}</span>}
      </div>
    </div>
  );
}

/** Formulário público do recrutamento (/formulario/:token) — marca da plataforma Romatec CRM */
export default function FormularioRecrutamento() {
  const [, params] = useRoute("/formulario/:token");
  const token = params?.token ?? "";
  const { data, error, isLoading, refetch } = trpc.recrutamento.formulario.useQuery({ token }, { enabled: !!token, retry: false, refetchOnWindowFocus: false });
  const [f, setF] = useState<Dados>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviado, setEnviado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    if (!data) return;
    setF({ nacionalidade: "brasileira", rgOrgao: "SSP", creciUf: "MA", enderecoUf: "MA", ...data.dados, conjuge: { nacionalidade: "brasileira", mesmoEndereco: true, ...(data.dados?.conjuge ?? {}) } });
    if (data.status === "preenchido") setEnviado(true);
  }, [data]);
  const salvar = trpc.recrutamento.salvarFormulario.useMutation();
  const set = (k: string, v: unknown) => setF(x => ({ ...x, [k]: v }));
  const setC = (k: string, v: unknown) => setF(x => ({ ...x, conjuge: { ...(x.conjuge ?? {}), [k]: v } }));
  const e = (k: string) => erros[k];
  const inp = (k: string, extra: Record<string, unknown> = {}) => ({ value: s(f[k]), onChange: (x: any) => set(k, x.target.value), className: classeCampo(e(k)), ...extra });
  const inpC = (k: string, extra: Record<string, unknown> = {}) => ({ value: s(f.conjuge?.[k]), onChange: (x: any) => setC(k, x.target.value), className: classeCampo(e(`conjuge.${k}`)), ...extra });

  const cep = async (v: string, conj = false) => {
    if (conj) setC("cep", v); else set("enderecoCep", v);
    const r = await buscarCep(v);
    if (!r) return;
    if (conj) setF(x => ({ ...x, conjuge: { ...x.conjuge, logradouro: r.logradouro, bairro: r.bairro, cidade: r.cidade, uf: r.uf } }));
    else setF(x => ({ ...x, enderecoLogradouro: r.logradouro, enderecoBairro: r.bairro, enderecoCidade: r.cidade, enderecoUf: r.uf }));
  };

  const montar = () => {
    const c = temConjuge(f.estadoCivil) ? { ...f.conjuge, cpf: onlyDigits(s(f.conjuge?.cpf)), telefone: onlyDigits(s(f.conjuge?.telefone)) || null } : null;
    return { ...f, cpf: onlyDigits(s(f.cpf)), telefone: onlyDigits(s(f.telefone)), enderecoCep: onlyDigits(s(f.enderecoCep)), creci: f.creci || null, conjuge: c, apagarConjuge: !c };
  };
  const enviar = async (final: boolean) => {
    setErros({}); setAviso(null);
    try {
      await salvar.mutateAsync({ token, dados: montar(), enviar: final });
      if (final) { setEnviado(true); window.scrollTo({ top: 0, behavior: "smooth" }); } else setAviso("Rascunho salvo. Você pode continuar depois pelo mesmo link.");
    } catch (err: any) {
      const campos = err?.data?.campos ?? err?.shape?.data?.campos;
      if (campos) setErros(campos);
      setAviso(err?.message || "Não foi possível salvar");
    }
  };

  const fundo = { background: "radial-gradient(circle at 50% 0%, #0A1F14 0%, #000 60%)" };
  const topo = (
    <header className="flex flex-col items-center gap-3 pt-8 pb-4 text-center">
      <RomatecLockup variant="stack" height={70} />
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--rt-gold)]">Romatec Consultoria Total · Consultoria Imobiliária</p>
    </header>
  );
  if (isLoading) return <div className="min-h-screen" style={fundo}>{topo}<p className="text-center text-sm text-muted-foreground">Carregando…</p></div>;
  if (error || !data) {
    return <div className="min-h-screen px-4" style={fundo}>{topo}<p className="mx-auto max-w-md rounded-xl border border-[var(--rt-border)] bg-[var(--rt-surface)] p-5 text-center text-sm">{error?.message || "Link inválido."}</p></div>;
  }
  const docsEnviados = new Map(data.docs.map(d => [d.tipo, d.nome]));
  const corretor = data.perfil === "corretor";

  if (enviado) {
    return (
      <div className="min-h-screen px-4" style={fundo}>{topo}
        <div className="mx-auto max-w-md space-y-3 rounded-[18px] border border-[var(--rt-gold)]/40 bg-[var(--rt-surface)] p-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
          <h1 className="text-xl font-semibold">Formulário enviado!</h1>
          <p className="text-sm text-[var(--rt-text-2)]">Obrigado, {s(f.nome).split(" ")[0]}. A Romatec vai conferir os seus dados e documentos. Assim que aprovado, você recebe pelo WhatsApp o login e uma senha provisória para entrar no Romatec CRM.</p>
          <button type="button" onClick={() => setEnviado(false)} className="text-xs text-[var(--rt-gold)] hover:underline">Corrigir alguma informação</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 pb-12" style={fundo}>
      {topo}
      <main className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-[18px] border border-[var(--rt-gold)]/40 bg-[var(--rt-surface)] p-5">
          <h1 className="text-xl font-semibold">Cadastro — {ROTULO_PERFIL_RECRUTAMENTO[data.perfil]}</h1>
          {data.empreendimento && <p className="mt-1 text-sm">Convocação para atuar no empreendimento <b className="text-[var(--rt-gold)]">{data.empreendimento}</b>.</p>}
          <p className="mt-1 text-sm text-[var(--rt-text-2)]">Preencha os seus dados e anexe os documentos. Você pode salvar e terminar depois pelo mesmo link.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <a href={`/api/public/recrutamento/${token}/formulario.pdf`} className="inline-flex items-center gap-1 rounded-md border border-[var(--rt-border)] px-2.5 py-1.5 hover:bg-white/5"><FileDown className="h-3.5 w-3.5" /> Formulário em PDF</a>
            <a href={`/api/public/recrutamento/${token}/formulario.docx`} className="inline-flex items-center gap-1 rounded-md border border-[var(--rt-border)] px-2.5 py-1.5 hover:bg-white/5"><FileDown className="h-3.5 w-3.5" /> Formulário em DOC</a>
          </div>
        </div>

        <Secao titulo="Dados pessoais">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="Nome completo" erro={e("nome")} className="sm:col-span-2"><input {...inp("nome")} autoComplete="name" /></Campo>
            <Campo rotulo="CPF" erro={e("cpf")}><InputMascara valor={s(f.cpf)} mascara={maskCPF} onMudar={v => set("cpf", v)} inputMode="numeric" erro={e("cpf")} /></Campo>
            <Campo rotulo="Sexo" erro={e("sexo")}><select className={sel} value={s(f.sexo)} onChange={x => set("sexo", x.target.value)}><option value="">—</option><option value="F">Feminino</option><option value="M">Masculino</option></select></Campo>
            <Campo rotulo="Nacionalidade"><select className={sel} value={s(f.nacionalidade)} onChange={x => set("nacionalidade", x.target.value)}><option value="brasileira">Brasileira</option><option value="estrangeira">Estrangeira</option></select></Campo>
            {f.nacionalidade === "estrangeira" ? (
              <>
                <Campo rotulo="País de origem" erro={e("paisOrigem")}><input {...inp("paisOrigem")} /></Campo>
                <Campo rotulo="RNM ou passaporte (nº)" erro={e("docEstrangeiroNumero")}><input {...inp("docEstrangeiroNumero")} /></Campo>
              </>
            ) : (
              <>
                <Campo rotulo="RG" erro={e("rg")}><input {...inp("rg")} inputMode="numeric" /></Campo>
                <Campo rotulo="Órgão emissor" erro={e("rgOrgao")}><select className={sel} value={s(f.rgOrgao)} onChange={x => set("rgOrgao", x.target.value)}>{ORGAOS_EMISSORES.map(o => <option key={o}>{o}</option>)}</select></Campo>
              </>
            )}
            <Campo rotulo="Profissão" erro={e("profissao")}><input {...inp("profissao", { list: "profissoes" })} /><datalist id="profissoes">{PROFISSOES.map(p => <option key={p} value={p} />)}</datalist></Campo>
            <Campo rotulo="Estado civil" erro={e("estadoCivil")}><select className={sel} value={s(f.estadoCivil)} onChange={x => set("estadoCivil", x.target.value)}><option value="">—</option>{ESTADOS_CIVIS.map(v => <option key={v} value={v}>{ROTULO_ESTADO_CIVIL[v]}</option>)}</select></Campo>
            <Campo rotulo="E-mail" erro={e("email")} className="sm:col-span-2"><input {...inp("email", { type: "email", autoComplete: "email" })} /></Campo>
            <Campo rotulo="Telefone / WhatsApp" erro={e("telefone")}><InputMascara valor={s(f.telefone)} mascara={maskPhone} onMudar={v => set("telefone", v)} inputMode="tel" erro={e("telefone")} /></Campo>
            <Campo rotulo="Instagram (opcional)" erro={e("instagram")}><input {...inp("instagram", { placeholder: "@seuperfil", autoCapitalize: "none" })} /></Campo>
          </div>
        </Secao>

        {corretor && (
          <Secao titulo="CRECI">
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo rotulo="Nº do CRECI" erro={e("creci")}><input {...inp("creci", { inputMode: "numeric" })} /></Campo>
              <Campo rotulo="UF do CRECI" erro={e("creciUf")}><select className={sel} value={s(f.creciUf)} onChange={x => set("creciUf", x.target.value)}>{UFS.map(u => <option key={u}>{u}</option>)}</select></Campo>
            </div>
          </Secao>
        )}

        <Secao titulo="Endereço">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="CEP" erro={e("enderecoCep")}><InputMascara valor={s(f.enderecoCep)} mascara={maskCEP} onMudar={v => cep(v)} inputMode="numeric" erro={e("enderecoCep")} /></Campo>
            <Campo rotulo="Rua / avenida" erro={e("enderecoLogradouro")} className="sm:col-span-2"><input {...inp("enderecoLogradouro")} /></Campo>
            <Campo rotulo="Número" erro={e("enderecoNumero")}><input {...inp("enderecoNumero")} /></Campo>
            <Campo rotulo="Complemento" erro={e("enderecoComplemento")}><input {...inp("enderecoComplemento")} /></Campo>
            <Campo rotulo="Bairro" erro={e("enderecoBairro")}><input {...inp("enderecoBairro")} /></Campo>
            <Campo rotulo="Cidade" erro={e("enderecoCidade")}><input {...inp("enderecoCidade")} /></Campo>
            <Campo rotulo="UF" erro={e("enderecoUf")}><select className={sel} value={s(f.enderecoUf)} onChange={x => set("enderecoUf", x.target.value)}>{UFS.map(u => <option key={u}>{u}</option>)}</select></Campo>
          </div>
        </Secao>

        {temConjuge(f.estadoCivil) && (
          <Secao titulo="Cônjuge ou companheiro(a)" nota="Os dados entram nos contratos em que você atuar.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Campo rotulo="Nome completo" erro={e("conjuge.nome")} className="sm:col-span-2"><input {...inpC("nome")} /></Campo>
              <Campo rotulo="CPF" erro={e("conjuge.cpf")}><InputMascara valor={s(f.conjuge?.cpf)} mascara={maskCPF} onMudar={v => setC("cpf", v)} inputMode="numeric" erro={e("conjuge.cpf")} /></Campo>
              <Campo rotulo="Sexo" erro={e("conjuge.sexo")}><select className={sel} value={s(f.conjuge?.sexo)} onChange={x => setC("sexo", x.target.value)}><option value="">—</option><option value="F">Feminino</option><option value="M">Masculino</option></select></Campo>
              <Campo rotulo="RG" erro={e("conjuge.rg")}><input {...inpC("rg")} /></Campo>
              <Campo rotulo="Órgão emissor" erro={e("conjuge.rgOrgao")}><select className={sel} value={s(f.conjuge?.rgOrgao || "SSP")} onChange={x => setC("rgOrgao", x.target.value)}>{ORGAOS_EMISSORES.map(o => <option key={o}>{o}</option>)}</select></Campo>
              <Campo rotulo="Profissão" erro={e("conjuge.profissao")}><input {...inpC("profissao", { list: "profissoes" })} /></Campo>
              <Campo rotulo="Nascimento" erro={e("conjuge.dataNascimento")}><input type="date" {...inpC("dataNascimento")} /></Campo>
              <Campo rotulo="Telefone" erro={e("conjuge.telefone")}><InputMascara valor={s(f.conjuge?.telefone)} mascara={maskPhone} onMudar={v => setC("telefone", v)} inputMode="tel" /></Campo>
              <Campo rotulo="E-mail" erro={e("conjuge.email")}><input {...inpC("email", { type: "email" })} /></Campo>
              {f.estadoCivil === "casado" ? (
                <>
                  <Campo rotulo="Regime de bens" erro={e("conjuge.regimeBens")}><select className={sel} value={s(f.conjuge?.regimeBens)} onChange={x => setC("regimeBens", x.target.value)}><option value="">—</option>{REGIMES_BENS.map(r => <option key={r} value={r}>{ROTULO_REGIME[r]}</option>)}</select></Campo>
                  <Campo rotulo="Data do casamento" erro={e("conjuge.dataCasamento")}><input type="date" {...inpC("dataCasamento")} /></Campo>
                </>
              ) : (
                <Campo rotulo="Início da união" erro={e("conjuge.uniaoDataInicio")}><input type="date" {...inpC("uniaoDataInicio")} /></Campo>
              )}
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.conjuge?.mesmoEndereco !== false} onChange={x => setC("mesmoEndereco", x.target.checked)} /> Mora no mesmo endereço</label>
            </div>
            {f.conjuge?.mesmoEndereco === false && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Campo rotulo="CEP" erro={e("conjuge.cep")}><InputMascara valor={s(f.conjuge?.cep)} mascara={maskCEP} onMudar={v => cep(v, true)} inputMode="numeric" /></Campo>
                <Campo rotulo="Rua / avenida" className="sm:col-span-2"><input {...inpC("logradouro")} /></Campo>
                <Campo rotulo="Número"><input {...inpC("numero")} /></Campo>
                <Campo rotulo="Bairro"><input {...inpC("bairro")} /></Campo>
                <Campo rotulo="Cidade"><input {...inpC("cidade")} /></Campo>
                <Campo rotulo="UF"><select className={sel} value={s(f.conjuge?.uf || "MA")} onChange={x => setC("uf", x.target.value)}>{UFS.map(u => <option key={u}>{u}</option>)}</select></Campo>
              </div>
            )}
          </Secao>
        )}

        <Secao titulo="Documentos" nota="Foto pelo celular ou PDF, até 10 MB cada.">
          <div className="space-y-2">
            {data.exigidos.map(d => <Anexo key={d.tipo} token={token} doc={d} enviado={docsEnviados.get(d.tipo)} onMudou={() => refetch()} />)}
          </div>
        </Secao>

        <p className="px-1 text-xs text-[var(--rt-text-3)]">
          Ao enviar, você declara que as informações são verdadeiras e autoriza a Romatec Consultoria Total a usá-las no seu cadastro e nos contratos em que atuar (LGPD — Lei n.º 13.709/2018).
        </p>
        {aviso && <p className={`rounded-xl p-3 text-sm ${Object.keys(erros).length || /Confira|Anexe|já tem/.test(aviso) ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-300"}`}>{aviso}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={salvar.isPending} onClick={() => enviar(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--rt-gold)] px-6 font-semibold text-black disabled:opacity-60">
            {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Enviar formulário
          </button>
          <button type="button" disabled={salvar.isPending} onClick={() => enviar(false)} className="h-11 rounded-xl border border-[var(--rt-border)] px-5 text-sm hover:bg-white/5">Salvar e continuar depois</button>
        </div>
      </main>
    </div>
  );
}
