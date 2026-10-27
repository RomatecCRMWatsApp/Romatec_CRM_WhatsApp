import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, FileSignature, Loader2, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COR_PERFIL, PERFIS, ROTULO_PERFIL, type Perfil } from "@shared/equipe";
import {
  CREDENCIAIS, ESTADOS_CIVIS, ORGAOS_EMISSORES, PROFISSOES, REGIMES_BENS, ROTULO_ESTADO_CIVIL, ROTULO_REGIME, UFS, temConjuge,
} from "@shared/cadastro";
import { isValidCPF, maskCEP, maskCPF, maskPhone, maskRG, onlyDigits } from "@shared/masks";
import AvatarPicker from "@/components/cadastro/AvatarPicker";
import { Campo, InputMascara, Interruptor, classeCampo, sel } from "@/components/cadastro/campos";
import FichaCredenciamento from "./FichaCredenciamento";
import { CredencialCard, DocumentosPessoais, Visualizador, type DocumentoCadastro } from "@/components/cadastro/Credenciais";

interface Listas {
  modulos: { chave: string; rotulo: string }[];
  empreendimentos: { id: number; slug: string; nome: string }[];
  imoveis: { id: number; nome: string }[];
}

/** Lista de caixas com filtro e "marcar todos" (módulos, empreendimentos, imóveis do novo colaborador) */
function Selecao({ titulo, itens, marcados, onMudar }: { titulo: string; itens: { id: string | number; nome: string }[]; marcados: Set<string | number>; onMudar: (s: Set<string | number>) => void }) {
  const [filtro, setFiltro] = useState("");
  const vis = itens.filter(i => !filtro.trim() || i.nome.toLowerCase().includes(filtro.trim().toLowerCase()));
  const troca = (id: string | number, on: boolean) => { const s = new Set(marcados); on ? s.add(id) : s.delete(id); onMudar(s); };
  return (
    <div className="space-y-1.5 rounded-lg border border-border p-2.5">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-xs font-semibold">{titulo} ({marcados.size}/{itens.length})</p>
        <button type="button" className="text-[11px] text-primary" onClick={() => onMudar(new Set(itens.map(i => i.id)))}>todos</button>
        <button type="button" className="text-[11px] text-muted-foreground" onClick={() => onMudar(new Set())}>nenhum</button>
      </div>
      {itens.length > 8 && <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar" className="h-7 w-full rounded border border-border bg-secondary px-2 text-xs" />}
      <div className="max-h-48 space-y-1 overflow-auto">
        {vis.map(i => (
          <label key={i.id} className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={marcados.has(i.id)} onChange={e => troca(i.id, e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            <span className="truncate">{i.nome}</span>
          </label>
        ))}
        {itens.length === 0 && <p className="text-[11px] text-muted-foreground">Nada cadastrado.</p>}
      </div>
    </div>
  );
}

const PESSOA_VAZIA = { nome: "", sexo: "", cpf: "", rg: "", rgOrgao: "", nacionalidade: "brasileira", paisOrigem: "", docEstrangeiroTipo: "RNM", docEstrangeiroNumero: "", profissao: "" };
const CONJUGE_VAZIO = {
  ...PESSOA_VAZIA, dataNascimento: "", telefone: "", email: "", regimeBens: "comunhao_parcial", dataCasamento: "", uniaoDataInicio: "", uniaoRegistrada: false,
  mesmoEndereco: true, cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
};
const FORM_VAZIO = {
  ...PESSOA_VAZIA, email: "", telefone: "", perfil: "corretor" as Perfil, recebeLeads: false, creci: "", creciUf: "MA", instagram: "", estadoCivil: "",
  enderecoCep: "", enderecoLogradouro: "", enderecoNumero: "", enderecoComplemento: "", enderecoBairro: "", enderecoCidade: "", enderecoUf: "", empreendimentoSlug: "",
};
type Form = typeof FORM_VAZIO;
type Conjuge = typeof CONJUGE_VAZIO;

const s = (v: unknown) => (v == null ? "" : String(v));
const ouNull = (v: string) => (v.trim() ? v.trim() : null);

/** Busca o endereço pelo CEP (ViaCEP) */
export async function buscarCep(cep: string) {
  const d = onlyDigits(cep);
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    const j = await r.json();
    return j.erro ? null : { logradouro: s(j.logradouro), bairro: s(j.bairro), cidade: s(j.localidade), uf: s(j.uf) };
  } catch {
    return null;
  }
}

/** Selo colorido do perfil */
export function SeloPerfil({ perfil }: { perfil: Perfil }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: COR_PERFIL[perfil], background: `${COR_PERFIL[perfil]}22`, border: `1px solid ${COR_PERFIL[perfil]}66` }}>
      {ROTULO_PERFIL[perfil]}
    </span>
  );
}

/** Texto da qualificação: **negrito** vira <b> */
function TextoQualificacao({ texto }: { texto: string }) {
  return <p className="text-sm leading-relaxed">{texto.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p))}</p>;
}

function ModalQualificacao({ id, aberto, onFechar }: { id: number; aberto: boolean; onFechar: () => void }) {
  const { data, isLoading, error } = trpc.cadastro.qualificacao.useQuery({ id }, { enabled: aberto });
  const copiar = async () => {
    try { await navigator.clipboard.writeText((data?.texto ?? "").replace(/\*\*/g, "")); toast.success("Qualificação copiada"); } catch { toast.error("Não foi possível copiar"); }
  };
  return (
    <Dialog open={aberto} onOpenChange={o => !o && onFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Qualificação para contratos</DialogTitle></DialogHeader>
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : error ? <p className="text-sm text-red-400">{error.message}</p> : (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-secondary/30 p-3"><TextoQualificacao texto={data?.texto ?? ""} /></div>
            <p className="text-[11px] text-muted-foreground">Salve o cadastro antes de copiar: o texto usa os dados gravados.</p>
            <div className="flex justify-end"><Button type="button" onClick={copiar}><Copy className="mr-1.5 h-4 w-4" /> Copiar</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const Secao = ({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) => (
  <section className="space-y-2.5">
    <div className="flex items-center gap-2 border-b border-border pb-1">
      <p className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {extra}
    </div>
    {children}
  </section>
);

/**
 * Cadastro completo do usuário. Três usos:
 * - novo (admin, Equipe › Novo acesso): dados + acessos iniciais; foto, credenciais e documentos depois de salvar;
 * - editar (admin, Equipe › Cadastro): tudo, inclusive perfil e "Recebe leads";
 * - meu cadastro (o próprio usuário): tudo menos perfil e "Recebe leads".
 */
export default function CadastroUsuario({ id, admin, listas, onSalvo, onCancelar }: {
  /** Ausente com `listas` = novo; ausente sem `listas` = o próprio usuário */
  id?: number; admin: boolean; listas?: Listas;
  onSalvo?: (r: { id: number; link?: string; nome: string; login: string; telefone?: string | null }) => void; onCancelar?: () => void;
}) {
  const novo = !id && !!listas;
  const utils = trpc.useUtils();
  const dados = trpc.cadastro.dados.useQuery(id ? { id } : {}, { enabled: !novo });
  const uid = id ?? dados.data?.id;
  const docs = trpc.cadastro.documentos.useQuery({ id: uid ?? 0 }, { enabled: !!uid });
  const [f, setF] = useState<Form>(FORM_VAZIO);
  const [c, setC] = useState<Conjuge>(CONJUGE_VAZIO);
  const [conjugeSalvo, setConjugeSalvo] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [qualif, setQualif] = useState(false);
  const [ver, setVer] = useState<DocumentoCadastro | null>(null);
  const [versao, setVersao] = useState(1);
  const [modulos, setModulos] = useState<Set<string | number>>(new Set());
  const [emps, setEmps] = useState<Set<string | number>>(new Set());
  const [imoveis, setImoveis] = useState<Set<string | number>>(new Set());
  const criar = trpc.equipe.create.useMutation();
  const salvar = trpc.cadastro.salvar.useMutation();
  const buscarPessoa = trpc.useUtils().cadastro.pessoaPorCpf;

  useEffect(() => {
    const d = dados.data;
    if (!d) return;
    setF({
      ...FORM_VAZIO, ...Object.fromEntries(Object.keys(FORM_VAZIO).map(k => [k, (d as any)[k] ?? (FORM_VAZIO as any)[k]])),
      sexo: s(d.sexo), estadoCivil: s(d.estadoCivil), empreendimentoSlug: s(d.empreendimentoSlug), creciUf: d.creciUf || "MA", perfil: d.perfil as Perfil, recebeLeads: d.recebeLeads,
    } as Form);
    if (d.conjuge) {
      const cj: any = d.conjuge;
      setC({ ...CONJUGE_VAZIO, ...Object.fromEntries(Object.keys(CONJUGE_VAZIO).map(k => [k, cj[k] ?? (CONJUGE_VAZIO as any)[k]])) } as Conjuge);
      setConjugeSalvo(true);
    }
  }, [dados.data]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF(x => ({ ...x, [k]: v })); setErros(e => ({ ...e, [k]: "" })); };
  const setCj = <K extends keyof Conjuge>(k: K, v: Conjuge[K]) => { setC(x => ({ ...x, [k]: v })); setErros(e => ({ ...e, [`conjuge.${k}`]: "" })); };
  const inp = (k: keyof Form) => ({ value: s(f[k]), onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set(k, e.target.value as any), className: classeCampo(erros[k]) });
  const inpC = (k: keyof Conjuge) => ({ value: s(c[k]), onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setCj(k, e.target.value as any), className: classeCampo(erros[`conjuge.${k}`]) });
  const comConjuge = temConjuge(f.estadoCivil);
  const equipe = f.perfil === "corretor" || f.perfil === "secretario";
  const modulosItens = useMemo(() => (listas?.modulos ?? []).map(m => ({ id: m.chave, nome: m.rotulo })), [listas?.modulos]);
  const recarregarDocs = () => { setVersao(v => v + 1); docs.refetch(); utils.cadastro.minhasPendencias.invalidate(); utils.cadastro.credenciamento.invalidate(); };

  const mudarEstadoCivil = (v: string) => {
    if (temConjuge(f.estadoCivil) && !temConjuge(v) && conjugeSalvo) {
      const apagar = confirm("Remover os dados do cônjuge?\n\nOK = apagar ao salvar · Cancelar = guardar inativos");
      setC(x => ({ ...x, _apagar: apagar } as any));
    }
    set("estadoCivil", v);
  };

  const preencherCep = async (cep: string, alvo: "usuario" | "conjuge") => {
    const r = await buscarCep(cep);
    if (!r) { if (onlyDigits(cep).length === 8) toast.error("CEP não encontrado"); return; }
    if (alvo === "usuario") setF(x => ({ ...x, enderecoLogradouro: r.logradouro || x.enderecoLogradouro, enderecoBairro: r.bairro || x.enderecoBairro, enderecoCidade: r.cidade, enderecoUf: r.uf }));
    else setC(x => ({ ...x, logradouro: r.logradouro || x.logradouro, bairro: r.bairro || x.bairro, cidade: r.cidade, uf: r.uf }));
  };

  const procurarConjuge = async () => {
    if (!admin || !isValidCPF(c.cpf)) return;
    const p = await buscarPessoa.fetch({ cpf: c.cpf, exceto: uid }).catch(() => null);
    if (!p) return;
    if (!confirm(`CPF encontrado (${p.origem}): ${p.nome}. Preencher os dados?`)) return;
    setC(x => ({ ...x, nome: p.nome, sexo: s(p.sexo), rg: p.rg, rgOrgao: p.rgOrgao, nacionalidade: p.nacionalidade, paisOrigem: p.paisOrigem, profissao: p.profissao, telefone: p.telefone, email: p.email }));
  };

  const montar = () => {
    const pessoa = (p: typeof PESSOA_VAZIA) => ({
      nome: p.nome, sexo: p.sexo || undefined, cpf: onlyDigits(p.cpf), rg: p.nacionalidade === "brasileira" ? p.rg : null,
      rgOrgao: p.nacionalidade === "brasileira" ? ouNull(p.rgOrgao) : null, nacionalidade: p.nacionalidade,
      paisOrigem: ouNull(p.paisOrigem), docEstrangeiroTipo: p.nacionalidade === "estrangeira" ? p.docEstrangeiroTipo : null,
      docEstrangeiroNumero: ouNull(p.docEstrangeiroNumero), profissao: p.profissao,
    });
    return {
      ...pessoa(f), email: f.email, telefone: f.telefone,
      ...(admin ? { perfil: f.perfil, recebeLeads: f.recebeLeads } : {}),
      creci: ouNull(f.creci), creciUf: f.creci ? f.creciUf : null, instagram: ouNull(f.instagram), estadoCivil: f.estadoCivil || undefined,
      enderecoCep: f.enderecoCep, enderecoLogradouro: f.enderecoLogradouro, enderecoNumero: f.enderecoNumero, enderecoComplemento: ouNull(f.enderecoComplemento),
      enderecoBairro: f.enderecoBairro, enderecoCidade: f.enderecoCidade, enderecoUf: f.enderecoUf,
      empreendimentoSlug: f.perfil === "empreendedor" ? ouNull(f.empreendimentoSlug) : null,
      conjuge: comConjuge ? {
        ...pessoa(c), profissao: ouNull(c.profissao), dataNascimento: c.dataNascimento || null, telefone: c.telefone, email: c.email,
        regimeBens: f.estadoCivil === "casado" ? c.regimeBens : null, dataCasamento: c.dataCasamento || null,
        uniaoDataInicio: c.uniaoDataInicio || null, uniaoRegistrada: c.uniaoRegistrada, mesmoEndereco: c.mesmoEndereco,
        cep: c.cep, logradouro: ouNull(c.logradouro), numero: ouNull(c.numero), complemento: ouNull(c.complemento), bairro: ouNull(c.bairro), cidade: ouNull(c.cidade), uf: c.uf || null,
      } : null,
      apagarConjuge: !!(c as any)._apagar,
    };
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setErros({});
    try {
      const corpo = montar();
      if (novo) {
        const r = await criar.mutateAsync({ dados: corpo, modulos: Array.from(modulos).map(String), empreendimentosIds: Array.from(emps).map(Number), imoveisIds: Array.from(imoveis).map(Number) });
        toast.success(`${f.nome} cadastrado(a). Agora envie a foto e as credenciais.`);
        onSalvo?.({ id: r.id, link: r.link, nome: f.nome, login: f.creci ? `o CRECI ${onlyDigits(f.creci)}` : `o CPF ${maskCPF(f.cpf)}`, telefone: f.telefone });
      } else {
        const r = await salvar.mutateAsync({ id, dados: corpo });
        toast.success(r.sessaoEncerrada ? "Cadastro salvo. O perfil mudou: a pessoa precisa entrar de novo." : "Cadastro salvo");
        setConjugeSalvo(comConjuge);
        utils.cadastro.dados.invalidate();
        utils.cadastro.credenciamento.invalidate();
        onSalvo?.({ id: uid!, nome: f.nome, login: "", telefone: f.telefone });
      }
    } catch (err: any) {
      const campos = err?.data?.campos ?? err?.shape?.data?.campos;
      if (campos) setErros(campos);
      toast.error(err.message);
    } finally {
      setSalvando(false);
    }
  };

  if (!novo && dados.isLoading) return <p className="text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando cadastro…</p>;
  if (!novo && dados.error) return <p className="text-sm text-red-400">{dados.error.message}</p>;

  const documentos = (docs.data?.documentos ?? []) as DocumentoCadastro[];
  const cred = (t: string) => documentos.find(d => d.tipo === t && d.titular === "usuario");

  /** Bloco de dados pessoais (titular ou cônjuge) */
  const blocoPessoa = (p: typeof PESSOA_VAZIA, pre: "" | "conjuge.", mudar: (k: any, v: any) => void, proc?: () => void) => {
    const e = (k: string) => erros[`${pre}${k}`];
    const cl = (k: string) => classeCampo(e(k));
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
        <Campo rotulo="Nome completo" erro={e("nome")} className="md:col-span-4"><input value={p.nome} onChange={x => mudar("nome", x.target.value)} className={cl("nome")} placeholder="Como vai no contrato" autoComplete="off" /></Campo>
        <Campo rotulo="Sexo" erro={e("sexo")} className="md:col-span-2">
          <select value={p.sexo} onChange={x => mudar("sexo", x.target.value)} className={`${sel} ${e("sexo") ? "border-red-500" : ""}`}><option value="">—</option><option value="M">Masculino</option><option value="F">Feminino</option></select>
        </Campo>
        <Campo rotulo="CPF" erro={e("cpf") || (p.cpf && onlyDigits(p.cpf).length === 11 && !isValidCPF(p.cpf) ? "CPF inválido" : undefined)} className="md:col-span-2">
          <span className="flex gap-1">
            <InputMascara valor={p.cpf} mascara={maskCPF} onMudar={v => mudar("cpf", v)} onBlur={proc} inputMode="numeric" placeholder="000.000.000-00" erro={e("cpf")} />
            {proc && admin && <button type="button" onClick={proc} title="Buscar CPF já cadastrado" className="flex h-10 items-center rounded-md border border-border px-2.5 text-muted-foreground hover:text-foreground"><Search className="h-3.5 w-3.5" /></button>}
          </span>
        </Campo>
        <Campo rotulo="Nacionalidade" className="md:col-span-2">
          <select value={p.nacionalidade} onChange={x => mudar("nacionalidade", x.target.value)} className={sel}><option value="brasileira">Brasileira</option><option value="estrangeira">Estrangeira</option></select>
        </Campo>
        {p.nacionalidade === "brasileira" ? (<>
          <Campo rotulo="RG" erro={e("rg")} className="md:col-span-1"><InputMascara valor={p.rg} mascara={maskRG} onMudar={v => mudar("rg", v)} erro={e("rg")} /></Campo>
          <Campo rotulo="Órgão emissor" erro={e("rgOrgao")} className="md:col-span-1">
            <input list="orgaos" value={p.rgOrgao} onChange={x => mudar("rgOrgao", x.target.value)} className={cl("rgOrgao")} placeholder="SSP/MA" />
          </Campo>
        </>) : (<>
          <Campo rotulo="País de origem" erro={e("paisOrigem")} className="md:col-span-2"><input value={p.paisOrigem} onChange={x => mudar("paisOrigem", x.target.value)} className={cl("paisOrigem")} /></Campo>
          <Campo rotulo="Documento" className="md:col-span-2">
            <select value={p.docEstrangeiroTipo} onChange={x => mudar("docEstrangeiroTipo", x.target.value)} className={sel}><option value="RNM">RNM</option><option value="PASSAPORTE">Passaporte</option></select>
          </Campo>
          <Campo rotulo="Nº do documento" erro={e("docEstrangeiroNumero")} className="md:col-span-2"><input value={p.docEstrangeiroNumero} onChange={x => mudar("docEstrangeiroNumero", x.target.value)} className={cl("docEstrangeiroNumero")} /></Campo>
        </>)}
        <Campo rotulo="Profissão" erro={e("profissao")} className="md:col-span-2"><input list="profissoes" value={p.profissao} onChange={x => mudar("profissao", x.target.value)} className={cl("profissao")} /></Campo>
      </div>
    );
  };

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      <datalist id="orgaos">{ORGAOS_EMISSORES.map(o => <option key={o} value={o} />)}</datalist>
      <datalist id="profissoes">{PROFISSOES.map(o => <option key={o} value={o} />)}</datalist>

      <div className="flex flex-wrap items-center gap-4">
        <AvatarPicker usuarioId={uid} fotoUrl={dados.data?.fotoUrl} nome={f.nome} onMudou={() => { utils.equipe.list.invalidate(); utils.cadastro.credenciamento.invalidate(); }} />
        {!novo && uid && f.perfil !== "empreendedor" && <FichaCredenciamento uid={uid} />}
        <div className="ml-auto flex items-center gap-2">{!novo && <SeloPerfil perfil={f.perfil} />}</div>
      </div>

      <Secao titulo="Dados pessoais">{blocoPessoa(f, "", set)}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Campo rotulo="Estado civil" erro={erros.estadoCivil}>
            <select value={f.estadoCivil} onChange={e => mudarEstadoCivil(e.target.value)} className={`${sel} ${erros.estadoCivil ? "border-red-500" : ""}`}>
              <option value="">—</option>{ESTADOS_CIVIS.map(e => <option key={e} value={e}>{ROTULO_ESTADO_CIVIL[e]}</option>)}
            </select>
          </Campo>
          <Campo rotulo="E-mail" erro={erros.email}><input type="email" {...inp("email")} autoComplete="email" /></Campo>
          <Campo rotulo="Telefone / WhatsApp" erro={erros.telefone}><InputMascara valor={f.telefone} mascara={maskPhone} onMudar={v => set("telefone", v)} inputMode="tel" placeholder="(99) 9 9999-9999" erro={erros.telefone} /></Campo>
          <Campo rotulo="Instagram (opcional — sem ele, as peças usam @avalieimob)" erro={(erros as any).instagram}><input {...inp("instagram")} placeholder="@seuperfil" autoCapitalize="none" /></Campo>
        </div>
      </Secao>

      <Secao titulo="Acesso">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {admin && (
            <Campo rotulo="Perfil" erro={erros.perfil}>
              <select value={f.perfil} onChange={e => set("perfil", e.target.value as Perfil)} className={sel} style={{ borderColor: COR_PERFIL[f.perfil] }}>
                {PERFIS.map(p => <option key={p} value={p}>{ROTULO_PERFIL[p]}</option>)}
              </select>
            </Campo>
          )}
          <Campo rotulo={`CRECI ${f.perfil === "corretor" ? "(obrigatório)" : "(opcional)"}`} erro={erros.creci}><input {...inp("creci")} inputMode="numeric" placeholder="4705" /></Campo>
          <Campo rotulo="UF do CRECI" erro={erros.creciUf}><select {...inp("creciUf")} className={sel}>{UFS.map(u => <option key={u}>{u}</option>)}</select></Campo>
          {f.perfil === "empreendedor" && admin && (
            <Campo rotulo="Empreendimento" erro={erros.empreendimentoSlug}>
              <select {...inp("empreendimentoSlug")} className={sel}>
                <option value="">— escolha —</option>
                {(listas?.empreendimentos ?? []).map(e => <option key={e.slug} value={e.slug}>{e.nome}</option>)}
              </select>
            </Campo>
          )}
          {admin && !novo && equipe && (
            <div className="flex items-end pb-2">
              <Interruptor ligado={f.recebeLeads} onMudar={v => set("recebeLeads", v)} rotulo="Recebe leads"
                title={f.perfil === "corretor" ? "Corretor: exige o Cartão de Regularidade CRECI" : undefined} />
            </div>
          )}
        </div>
        {erros.recebeLeads && <p className="text-[11px] text-red-400">{erros.recebeLeads}</p>}
        {admin && <p className="text-[11px] text-muted-foreground">Entra com CRECI, CPF ou e-mail. Trocar o perfil encerra a sessão da pessoa.</p>}
      </Secao>

      <Secao titulo="Endereço">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <Campo rotulo="CEP" erro={erros.enderecoCep}><InputMascara valor={f.enderecoCep} mascara={maskCEP} onMudar={v => { set("enderecoCep", v); if (onlyDigits(v).length === 8) preencherCep(v, "usuario"); }} inputMode="numeric" placeholder="65930-000" erro={erros.enderecoCep} /></Campo>
          <Campo rotulo="Logradouro" erro={erros.enderecoLogradouro} className="md:col-span-3"><input {...inp("enderecoLogradouro")} placeholder="Rua, avenida…" /></Campo>
          <Campo rotulo="Número" erro={erros.enderecoNumero}><input {...inp("enderecoNumero")} /></Campo>
          <Campo rotulo="Complemento"><input {...inp("enderecoComplemento")} /></Campo>
          <Campo rotulo="Bairro" erro={erros.enderecoBairro} className="md:col-span-2"><input {...inp("enderecoBairro")} /></Campo>
          <Campo rotulo="Cidade" erro={erros.enderecoCidade} className="md:col-span-3"><input {...inp("enderecoCidade")} /></Campo>
          <Campo rotulo="UF" erro={erros.enderecoUf}><select {...inp("enderecoUf")} className={`${sel} ${erros.enderecoUf ? "border-red-500" : ""}`}><option value="">—</option>{UFS.map(u => <option key={u}>{u}</option>)}</select></Campo>
        </div>
      </Secao>

      {comConjuge && (
        <Secao titulo={f.estadoCivil === "casado" ? "Cônjuge" : "Companheiro(a)"}>
          {erros.conjuge && <p className="text-[11px] text-red-400">{erros.conjuge}</p>}
          {blocoPessoa(c, "conjuge.", setCj, procurarConjuge)}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <Campo rotulo="Nascimento" className="md:col-span-2"><input type="date" {...inpC("dataNascimento")} /></Campo>
            <Campo rotulo="Telefone" erro={erros["conjuge.telefone"]} className="md:col-span-2"><InputMascara valor={c.telefone} mascara={maskPhone} onMudar={v => setCj("telefone", v)} inputMode="tel" /></Campo>
            <Campo rotulo="E-mail" erro={erros["conjuge.email"]} className="md:col-span-2"><input type="email" {...inpC("email")} /></Campo>
            {f.estadoCivil === "casado" ? (<>
              <Campo rotulo="Regime de bens" erro={erros["conjuge.regimeBens"]} className="md:col-span-3">
                <select {...inpC("regimeBens")} className={sel}>{REGIMES_BENS.map(r => <option key={r} value={r}>{ROTULO_REGIME[r]}</option>)}</select>
              </Campo>
              <Campo rotulo="Data do casamento" className="md:col-span-3"><input type="date" {...inpC("dataCasamento")} /></Campo>
            </>) : (<>
              <Campo rotulo="Início da união" className="md:col-span-3"><input type="date" {...inpC("uniaoDataInicio")} /></Campo>
              <div className="flex items-end pb-2 md:col-span-3"><Interruptor ligado={c.uniaoRegistrada} onMudar={v => setCj("uniaoRegistrada", v)} rotulo="União registrada em cartório" /></div>
            </>)}
          </div>
          <Interruptor ligado={c.mesmoEndereco} onMudar={v => setCj("mesmoEndereco", v)} rotulo="Mora no mesmo endereço" />
          {!c.mesmoEndereco && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <Campo rotulo="CEP" erro={erros["conjuge.cep"]}><InputMascara valor={c.cep} mascara={maskCEP} onMudar={v => { setCj("cep", v); if (onlyDigits(v).length === 8) preencherCep(v, "conjuge"); }} inputMode="numeric" erro={erros["conjuge.cep"]} /></Campo>
              <Campo rotulo="Logradouro" className="md:col-span-3"><input {...inpC("logradouro")} /></Campo>
              <Campo rotulo="Número"><input {...inpC("numero")} /></Campo>
              <Campo rotulo="Complemento"><input {...inpC("complemento")} /></Campo>
              <Campo rotulo="Bairro" className="md:col-span-2"><input {...inpC("bairro")} /></Campo>
              <Campo rotulo="Cidade" className="md:col-span-3"><input {...inpC("cidade")} /></Campo>
              <Campo rotulo="UF"><select {...inpC("uf")} className={sel}><option value="">—</option>{UFS.map(u => <option key={u}>{u}</option>)}</select></Campo>
            </div>
          )}
        </Secao>
      )}

      {novo && equipe && listas && (
        <Secao titulo="Acessos iniciais — nada vem marcado; o que não marcar fica bloqueado">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Selecao titulo="Módulos" itens={modulosItens} marcados={modulos} onMudar={setModulos} />
            {f.perfil === "corretor" && <Selecao titulo="Empreendimentos" itens={listas.empreendimentos.map(e => ({ id: e.id, nome: e.nome }))} marcados={emps} onMudar={setEmps} />}
            {f.perfil === "corretor" && <Selecao titulo="Imóveis" itens={listas.imoveis} marcados={imoveis} onMudar={setImoveis} />}
          </div>
        </Secao>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={salvando} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {salvando ? "Salvando…" : novo ? "Cadastrar e gerar link" : "Salvar cadastro"}
        </Button>
        {!novo && uid && <Button type="button" variant="outline" onClick={() => setQualif(true)}><FileSignature className="mr-1.5 h-4 w-4" /> Ver qualificação</Button>}
        {onCancelar && <Button type="button" variant="ghost" onClick={onCancelar}>Cancelar</Button>}
        {Object.values(erros).some(Boolean) && <span className="text-xs text-red-400">Confira os campos em vermelho.</span>}
      </div>

      {!novo && uid && f.perfil !== "empreendedor" && (
        <Secao titulo="Credenciais profissionais">
          <div className="grid gap-3 lg:grid-cols-3">
            {CREDENCIAIS.map(t => (
              <CredencialCard key={t} uid={uid} tipo={t} doc={cred(t)} versao={versao} onMudou={recarregarDocs} onVer={setVer}
                linkCertidaoPadrao={docs.data?.linkCertidaoPadrao ?? "https://www.crecima.gov.br"} validadeSugerida={docs.data?.validadeSugeridaCertidao ?? ""} />
            ))}
          </div>
        </Secao>
      )}

      {!novo && uid && (
        <Secao titulo="Documentos pessoais">
          <DocumentosPessoais uid={uid} docs={documentos.filter(d => !(CREDENCIAIS as readonly string[]).includes(d.tipo))} temConjuge={comConjuge} versao={versao} onMudou={recarregarDocs} onVer={setVer} />
        </Secao>
      )}

      {uid && <Visualizador uid={uid} doc={ver} versao={versao} onFechar={() => setVer(null)} />}
      {uid && <ModalQualificacao id={uid} aberto={qualif} onFechar={() => setQualif(false)} />}
    </form>
  );
}
