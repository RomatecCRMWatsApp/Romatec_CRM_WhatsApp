import { Campo, InputMascara, classeCampo, sel } from "@/components/cadastro/campos";
import { buscarCep } from "@/components/equipe/CadastroUsuario";
import { maskCEP, maskCPF, maskPhone, onlyDigits } from "@shared/masks";
import { UFS } from "@shared/cadastro";
import type { PessoaForm, SocioForm } from "@shared/contratos";
import { Button } from "@/components/ui/button";

/** 00.000.000/0000-00 */
export const maskCNPJ = (v: string) => onlyDigits(v).slice(0, 14)
  .replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
  .replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");

const SOCIO_VAZIO: SocioForm = { nome: "", cpf: "", telefone1: "", email: "" };
const MAX_SOCIOS = 10;

/** Empresa compradora: razão social, CNPJ, sede e os sócios (cada um assina pela empresa com o próprio CPF e WhatsApp) */
export default function EmpresaCampos({ p, set, setSocios, erros }: {
  p: PessoaForm; set: (k: keyof PessoaForm, v: string) => void; setSocios: (s: SocioForm[]) => void; erros: Record<string, string>;
}) {
  const e = (k: string) => erros[`comprador.${k}`];
  const socios = p.socios?.length ? p.socios : [SOCIO_VAZIO];
  const mudarSocio = (i: number, k: keyof SocioForm, v: string) => setSocios(socios.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const cep = async (v: string) => {
    set("cep", v);
    if (onlyDigits(v).length === 8) {
      const r = await buscarCep(v);
      if (r) { set("logradouro", r.logradouro); set("bairro", r.bairro); set("cidade", r.cidade); set("uf", r.uf); }
    }
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo rotulo="Razão social" erro={e("nome")} className="sm:col-span-2"><input className={classeCampo(e("nome"))} value={p.nome} onChange={x => set("nome", x.target.value)} /></Campo>
        <Campo rotulo="CNPJ" erro={e("cpf")}><InputMascara valor={p.cpf} mascara={maskCNPJ} onMudar={v => set("cpf", v)} inputMode="numeric" placeholder="00.000.000/0000-00" erro={e("cpf")} /></Campo>
        <Campo rotulo="Telefone da empresa" erro={e("telefone1")}><InputMascara valor={p.telefone1 ?? ""} mascara={maskPhone} onMudar={v => set("telefone1", v)} inputMode="tel" erro={e("telefone1")} /></Campo>
        <Campo rotulo="E-mail" className="sm:col-span-2"><input type="email" className={classeCampo()} value={p.email ?? ""} onChange={x => set("email", x.target.value)} /></Campo>
        <Campo rotulo="CEP da sede"><InputMascara valor={p.cep ?? ""} mascara={maskCEP} onMudar={cep} inputMode="numeric" /></Campo>
        <Campo rotulo="Logradouro" erro={e("endereco")}><input className={classeCampo(e("endereco"))} value={p.logradouro ?? ""} onChange={x => set("logradouro", x.target.value)} /></Campo>
        <Campo rotulo="Número"><input className={classeCampo()} value={p.numero ?? ""} onChange={x => set("numero", x.target.value)} /></Campo>
        <Campo rotulo="Complemento"><input className={classeCampo()} value={p.complemento ?? ""} onChange={x => set("complemento", x.target.value)} /></Campo>
        <Campo rotulo="Bairro"><input className={classeCampo()} value={p.bairro ?? ""} onChange={x => set("bairro", x.target.value)} /></Campo>
        <Campo rotulo="Cidade / UF" erro={e("endereco")}>
          <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
            <input className={classeCampo(e("endereco"))} value={p.cidade ?? ""} onChange={x => set("cidade", x.target.value)} aria-label="Cidade" />
            <select className={sel} value={p.uf ?? ""} onChange={x => set("uf", x.target.value)} aria-label="UF">{UFS.map(u => <option key={u}>{u}</option>)}</select>
          </div>
        </Campo>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Sócios que assinam pela empresa</h3>
        <p className="mb-2 text-xs text-muted-foreground">Cada sócio recebe o próprio link e código no WhatsApp e assina em nome da empresa.</p>
        {e("socios") && <p className="mb-2 text-xs text-danger-500">{e("socios")}</p>}
        <div className="space-y-2">
          {socios.map((s, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <Campo rotulo={`Sócio ${i + 1} — nome completo`} erro={erros[`socio.${i}.nome`]}><input className={classeCampo(erros[`socio.${i}.nome`])} value={s.nome} onChange={x => mudarSocio(i, "nome", x.target.value)} /></Campo>
              <Campo rotulo="CPF" erro={erros[`socio.${i}.cpf`]}><InputMascara valor={s.cpf} mascara={maskCPF} onMudar={v => mudarSocio(i, "cpf", v)} inputMode="numeric" erro={erros[`socio.${i}.cpf`]} /></Campo>
              <Campo rotulo="WhatsApp" erro={erros[`socio.${i}.telefone1`]}><InputMascara valor={s.telefone1} mascara={maskPhone} onMudar={v => mudarSocio(i, "telefone1", v)} inputMode="tel" erro={erros[`socio.${i}.telefone1`]} /></Campo>
              <Button type="button" variant="outline" size="sm" disabled={socios.length === 1} onClick={() => setSocios(socios.filter((_, j) => j !== i))}>Remover</Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="mt-2" disabled={socios.length >= MAX_SOCIOS} onClick={() => setSocios([...socios, { ...SOCIO_VAZIO }])}>Adicionar sócio</Button>
      </div>
    </div>
  );
}
