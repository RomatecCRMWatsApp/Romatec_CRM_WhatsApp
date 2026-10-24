import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROTULO_PERFIL } from "@shared/equipe";
import { ESTADOS_CIVIS, ROTULO_DOCUMENTO, TIPOS_DOCUMENTO, UFS, cpfValido, type TipoDocumento } from "@shared/cadastro";

/** Envia um arquivo cru (mesmo padrão dos arquivos do empreendimento) */
export async function enviarArquivo(url: string, arquivo: File, cabecalhos: Record<string, string> = {}) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(arquivo.name), "X-File-Type": arquivo.type || "application/octet-stream", ...cabecalhos },
    body: await arquivo.arrayBuffer(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(`${arquivo.name}: ${j.error || "falha no envio"}`);
  return j;
}

const CAMPOS_CADASTRO = ["creciUf", "cpf", "rg", "rgOrgao", "nacionalidade", "estadoCivil", "enderecoLogradouro", "enderecoNumero", "enderecoComplemento",
  "enderecoBairro", "enderecoCidade", "enderecoUf", "enderecoCep", "certidaoCreciValidade"] as const;
type Cadastro = Record<(typeof CAMPOS_CADASTRO)[number], string>;

export interface PessoaCadastro {
  id: number; nome: string; email: string; creci: string | null; telefone: string | null; perfil: string; empreendimentoSlug: string | null;
  cadastro: Partial<Record<(typeof CAMPOS_CADASTRO)[number], string | null>>;
}

interface Listas {
  modulos: { chave: string; rotulo: string }[];
  empreendimentos: { id: number; slug: string; nome: string }[];
  imoveis: { id: number; nome: string }[];
}

const sel = "h-10 px-3 rounded-md border border-border bg-secondary/30 text-foreground text-sm w-full";
const Campo = ({ rotulo, children, largo }: { rotulo: string; children: React.ReactNode; largo?: boolean }) => (
  <label className={`flex flex-col gap-1 text-sm ${largo ? "md:col-span-2" : ""}`}><span className="text-muted-foreground text-xs">{rotulo}</span>{children}</label>
);

/** Lista de caixas com filtro e "marcar todos" (módulos, empreendimentos, imóveis do novo corretor) */
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

/**
 * Cadastro completo (novo ou edição): dados que o contrato puxa, foto, certidão do CRECI (obrigatória
 * para corretor) e documentos. Novo corretor: o admin marca módulos, empreendimentos e imóveis — nada vem marcado.
 */
export default function CadastroUsuario({ pessoa, listas, onSalvo, onCancelar }: {
  pessoa?: PessoaCadastro; listas: Listas; onSalvo: (r: { id: number; link?: string; nome: string; login: string; telefone?: string | null }) => void; onCancelar: () => void;
}) {
  const novo = !pessoa;
  const [perfil, setPerfil] = useState<"equipe" | "empreendedor">(pessoa?.perfil === "empreendedor" ? "empreendedor" : "equipe");
  const [base, setBase] = useState({ nome: pessoa?.nome ?? "", email: pessoa?.email ?? "", creci: pessoa?.creci ?? "", telefone: pessoa?.telefone ?? "", empreendimentoSlug: pessoa?.empreendimentoSlug ?? "" });
  const [cad, setCad] = useState<Cadastro>(() => Object.fromEntries(CAMPOS_CADASTRO.map(k => [k, pessoa?.cadastro?.[k] ?? (k === "nacionalidade" && novo ? "brasileira" : "")])) as Cadastro);
  const [foto, setFoto] = useState<File | null>(null);
  const [certidao, setCertidao] = useState<File | null>(null);
  const [docs, setDocs] = useState<File[]>([]);
  const [tipoDoc, setTipoDoc] = useState<TipoDocumento>("rg");
  const [modulos, setModulos] = useState<Set<string | number>>(new Set());
  const [emps, setEmps] = useState<Set<string | number>>(new Set());
  const [imoveis, setImoveis] = useState<Set<string | number>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const criar = trpc.equipe.create.useMutation();
  const atualizar = trpc.equipe.update.useMutation();
  const corretor = perfil === "equipe" && pessoa?.perfil !== "admin";
  const c = (k: keyof Cadastro) => ({ value: cad[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setCad(v => ({ ...v, [k]: e.target.value })) });
  const cpfRuim = !!cad.cpf && !cpfValido(cad.cpf);
  const modulosItens = useMemo(() => listas.modulos.map(m => ({ id: m.chave, nome: m.rotulo })), [listas.modulos]);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cpfRuim) { toast.error("CPF inválido"); return; }
    if (novo && corretor && (!certidao || !cad.certidaoCreciValidade)) { toast.error("A certidão de quitação do CRECI (arquivo e validade) é obrigatória"); return; }
    if (certidao && !cad.certidaoCreciValidade) { toast.error("Informe a validade da certidão"); return; }
    setSalvando(true);
    try {
      const vazioNull = Object.fromEntries(CAMPOS_CADASTRO.map(k => [k, cad[k] || null]));
      const comuns = { nome: base.nome, email: base.email, creci: base.creci || null, telefone: base.telefone || null, ...vazioNull };
      let id = pessoa?.id ?? 0, link: string | undefined;
      if (novo) {
        const r = await criar.mutateAsync({
          ...comuns, perfil, empreendimentoSlug: perfil === "empreendedor" ? base.empreendimentoSlug || null : null,
          modulos: Array.from(modulos).map(String), empreendimentosIds: Array.from(emps).map(Number), imoveisIds: Array.from(imoveis).map(Number),
        } as any);
        id = r.id; link = r.link;
      } else {
        await atualizar.mutateAsync({ id, ...comuns } as any);
      }
      // Arquivos depois do cadastro (precisam do id): falha num arquivo não desfaz o cadastro
      const falhas: string[] = [];
      const tenta = async (f: () => Promise<unknown>) => { try { await f(); } catch (err: any) { falhas.push(err.message); } };
      if (foto) await tenta(() => enviarArquivo(`/api/usuarios/${id}/foto`, foto));
      if (certidao) await tenta(() => enviarArquivo(`/api/usuarios/${id}/documentos`, certidao, { "X-Tipo": "certidao_creci", "X-Validade": cad.certidaoCreciValidade }));
      for (const d of docs) await tenta(() => enviarArquivo(`/api/usuarios/${id}/documentos`, d, { "X-Tipo": tipoDoc }));
      falhas.forEach(f => toast.error(f));
      toast.success(novo ? `${base.nome} cadastrado(a)` : "Cadastro atualizado");
      onSalvo({ id, link, nome: base.nome, login: base.creci ? `o CRECI ${base.creci.replace(/\D/g, "")}` : base.email, telefone: base.telefone });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={salvar} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {novo && (
          <Campo rotulo="Tipo de acesso">
            <select value={perfil} onChange={e => setPerfil(e.target.value as any)} className={sel}>
              <option value="equipe">{ROTULO_PERFIL.equipe} — corretor/secretária</option>
              <option value="empreendedor">{ROTULO_PERFIL.empreendedor} — só gráficos de leads e artes</option>
            </select>
          </Campo>
        )}
        <Campo rotulo="Nome completo"><Input required value={base.nome} onChange={e => setBase(b => ({ ...b, nome: e.target.value }))} placeholder="Como vai no contrato" /></Campo>
        <Campo rotulo="E-mail (confirmado no primeiro acesso)"><Input required type="email" value={base.email} onChange={e => setBase(b => ({ ...b, email: e.target.value }))} /></Campo>
        <Campo rotulo="Telefone / WhatsApp"><Input inputMode="tel" value={base.telefone} onChange={e => setBase(b => ({ ...b, telefone: e.target.value }))} placeholder="(99) 9 9999-9999" /></Campo>
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <Campo rotulo={`CRECI nº ${perfil === "empreendedor" ? "(opcional)" : "(é o login)"}`}><Input required={perfil !== "empreendedor" && pessoa?.perfil !== "admin"} inputMode="numeric" value={base.creci} onChange={e => setBase(b => ({ ...b, creci: e.target.value }))} placeholder="4705" /></Campo>
          <Campo rotulo="UF"><select {...c("creciUf")} className={sel}><option value="">—</option>{UFS.map(u => <option key={u}>{u}</option>)}</select></Campo>
        </div>
        {novo && perfil === "empreendedor" && (
          <Campo rotulo="Empreendimento">
            <select required value={base.empreendimentoSlug} onChange={e => setBase(b => ({ ...b, empreendimentoSlug: e.target.value }))} className={sel}>
              <option value="">— escolha —</option>
              {listas.empreendimentos.map(e => <option key={e.slug} value={e.slug}>{e.nome}</option>)}
            </select>
          </Campo>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dados pessoais (vão para o contrato)</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Campo rotulo="CPF"><Input {...c("cpf")} inputMode="numeric" placeholder="000.000.000-00" className={cpfRuim ? "border-red-500" : ""} /></Campo>
          <Campo rotulo="RG"><Input {...c("rg")} /></Campo>
          <Campo rotulo="Órgão emissor"><Input {...c("rgOrgao")} placeholder="SSP/MA" /></Campo>
          <Campo rotulo="Nacionalidade"><Input {...c("nacionalidade")} /></Campo>
          <Campo rotulo="Estado civil"><select {...c("estadoCivil")} className={sel}><option value="">—</option>{ESTADOS_CIVIS.map(e => <option key={e}>{e}</option>)}</select></Campo>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Endereço</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Campo rotulo="CEP"><Input {...c("enderecoCep")} inputMode="numeric" placeholder="65930-000" /></Campo>
          <div className="md:col-span-2"><Campo rotulo="Logradouro"><Input {...c("enderecoLogradouro")} placeholder="Rua, avenida…" /></Campo></div>
          <Campo rotulo="Número"><Input {...c("enderecoNumero")} /></Campo>
          <Campo rotulo="Complemento"><Input {...c("enderecoComplemento")} /></Campo>
          <Campo rotulo="Bairro"><Input {...c("enderecoBairro")} /></Campo>
          <Campo rotulo="Cidade"><Input {...c("enderecoCidade")} /></Campo>
          <Campo rotulo="UF"><select {...c("enderecoUf")} className={sel}><option value="">—</option>{UFS.map(u => <option key={u}>{u}</option>)}</select></Campo>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Foto e documentos</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Campo rotulo="Foto de perfil (JPG/PNG/WEBP, até 5 MB)"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFoto(e.target.files?.[0] ?? null)} className="text-xs" /></Campo>
          {corretor && (
            <div className="space-y-1 rounded-lg border border-amber-500/40 p-2">
              <p className="text-xs font-semibold">Certidão de quitação do CRECI {novo ? "(obrigatória)" : "(nova certidão)"}</p>
              <input type="file" accept="application/pdf,image/*" onChange={e => setCertidao(e.target.files?.[0] ?? null)} className="text-xs" />
              <label className="flex items-center gap-2 text-xs">Validade <input type="date" required={novo} {...c("certidaoCreciValidade")} className="h-8 rounded border border-border bg-secondary px-2 text-xs" /></label>
            </div>
          )}
          <div className="space-y-1 rounded-lg border border-border p-2">
            <p className="text-xs font-semibold">Documentos pessoais (opcional)</p>
            <select value={tipoDoc} onChange={e => setTipoDoc(e.target.value as TipoDocumento)} className="h-8 w-full rounded border border-border bg-secondary px-2 text-xs">
              {TIPOS_DOCUMENTO.filter(t => t !== "certidao_creci").map(t => <option key={t} value={t}>{ROTULO_DOCUMENTO[t]}</option>)}
            </select>
            <input type="file" multiple accept="application/pdf,image/*" onChange={e => setDocs(Array.from(e.target.files ?? []))} className="text-xs" />
          </div>
        </div>
      </div>

      {novo && corretor && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acessos do corretor — nada vem marcado; o que não marcar fica bloqueado</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Selecao titulo="Módulos" itens={modulosItens} marcados={modulos} onMudar={setModulos} />
            <Selecao titulo="Empreendimentos" itens={listas.empreendimentos.map(e => ({ id: e.id, nome: e.nome }))} marcados={emps} onMudar={setEmps} />
            <Selecao titulo="Imóveis" itens={listas.imoveis} marcados={imoveis} onMudar={setImoveis} />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={salvando} className="bg-emerald-600 hover:bg-emerald-700 text-white">{salvando ? "Salvando…" : novo ? "Cadastrar e gerar link" : "Salvar cadastro"}</Button>
        <Button type="button" variant="ghost" onClick={onCancelar}>Cancelar</Button>
      </div>
    </form>
  );
}
