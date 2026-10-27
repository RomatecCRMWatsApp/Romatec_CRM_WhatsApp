import { Campo, InputMascara, classeCampo, sel } from "@/components/cadastro/campos";
import { buscarCep } from "@/components/equipe/CadastroUsuario";
import { maskCEP, maskCPF, maskPhone, onlyDigits } from "@shared/masks";
import { UFS } from "@shared/cadastro";
import { ESTADOS_CIVIS, REGIMES_BENS, exigePacto, type PessoaForm } from "@shared/contratos";

/** Cadastro completo de pessoa (comprador, cônjuge, cliente): o mesmo formulário no contrato e em Clientes */
export const PESSOA_VAZIA: PessoaForm = {
  nome: "", cpf: "", sexo: "", nacionalidade: "brasileira", estadoCivil: "", regimeBens: "", pactoAntenupcial: "", profissao: "", nascimento: "",
  rg: "", rgOrgao: "SSP", rgUf: "MA", email: "", telefone1: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "MA",
};

export default function PessoaCampos({ p, set, erros, prefixo, conjuge }: {
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
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
          <input className={classeCampo()} value={p.rgOrgao ?? ""} onChange={x => set("rgOrgao", x.target.value)} />
          <select className={sel} value={p.rgUf ?? ""} onChange={x => set("rgUf", x.target.value)}>{UFS.map(u => <option key={u}>{u}</option>)}</select>
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
