import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LIMITE_ANEXO_MB, TIPOS_ANEXO, type AlvoAnexo, type TipoAnexo } from "@shared/contratos";
import { CheckCircle2, Download, FileUp, Loader2, Paperclip, Trash2 } from "lucide-react";

/** Um campo de documento: de quem (comprador, cônjuge ou o dependente da posição/id) e de que tipo */
export interface Vaga { alvo: AlvoAnexo; dependente?: number; tipo: TipoAnexo; titulo: string; opcional?: boolean }
export interface AnexoPendente extends Vaga { arquivo: File }

const ACEITA = "application/pdf,image/jpeg,image/png,image/webp";
const chave = (v: Vaga) => `${v.alvo}:${v.dependente ?? ""}:${v.tipo}`;

/** Campos de documento conforme o contrato: comprador sempre, cônjuge se casado(a), um por dependente */
export function vagasDoContrato(casado: boolean, dependentes: { nome: string; ref: number }[]): Vaga[] {
  const v: Vaga[] = [
    { alvo: "comprador", tipo: "documento_foto", titulo: "Documento com foto (RG/CNH) — frente" },
    { alvo: "comprador", tipo: "documento_foto_verso", titulo: "Documento com foto — verso", opcional: true },
    { alvo: "comprador", tipo: "cpf", titulo: "CPF (se não estiver no documento)", opcional: true },
    { alvo: "comprador", tipo: "comprovante_residencia", titulo: "Comprovante de endereço" },
    { alvo: "comprador", tipo: "comprovante_renda", titulo: "Comprovante de renda (se precisar)", opcional: true },
  ];
  if (casado) v.push(
    { alvo: "comprador", tipo: "certidao_casamento", titulo: "Certidão de casamento / união estável" },
    { alvo: "conjuge", tipo: "documento_foto", titulo: "Cônjuge — documento com foto (frente)" },
    { alvo: "conjuge", tipo: "documento_foto_verso", titulo: "Cônjuge — verso", opcional: true },
  );
  for (const d of dependentes) v.push({ alvo: "dependente", dependente: d.ref, tipo: "documento_dependente", titulo: `${d.nome || "Dependente"} — RG ou certidão de nascimento` });
  return v;
}

const grande = (f: File) => f.size > LIMITE_ANEXO_MB * 1024 * 1024;

export async function enviarAnexo(contratoId: number, v: Vaga, arquivo: File) {
  const q = new URLSearchParams({ alvo: v.alvo, tipo: v.tipo, nome: arquivo.name });
  if (v.dependente != null) q.set("dependente", String(v.dependente));
  const r = await fetch(`/api/contratos/${contratoId}/anexos?${q}`, { method: "POST", body: arquivo, credentials: "include" });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `Falha ao enviar ${arquivo.name}`);
}

/** Novo contrato: escolhe os arquivos agora; eles sobem logo depois que o contrato é criado */
export function AnexosNovoContrato({ vagas, pendentes, onMudar }: { vagas: Vaga[]; pendentes: AnexoPendente[]; onMudar: (p: AnexoPendente[]) => void }) {
  const escolher = (v: Vaga, f: File | undefined) => {
    if (!f) return;
    if (grande(f)) { toast.error(`${f.name}: acima de ${LIMITE_ANEXO_MB} MB`); return; }
    onMudar([...pendentes.filter(p => chave(p) !== chave(v)), { ...v, arquivo: f }]);
  };
  const tirar = (v: Vaga) => onMudar(pendentes.filter(p => chave(p) !== chave(v)));
  return (
    <div className="space-y-2">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4" /> Documentos — anexos do contrato</h2>
        <p className="text-xs text-muted-foreground">PDF ou foto (até {LIMITE_ANEXO_MB} MB cada). Sobem junto quando o contrato é criado; o que faltar dá para enviar depois, na tela do contrato.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {vagas.map(v => {
          const p = pendentes.find(x => chave(x) === chave(v));
          return (
            <div key={chave(v)} className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${p ? "border-emerald-600/50" : "border-border"}`}>
              {p ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : <FileUp className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <div className="min-w-0 flex-1">
                <p className="truncate">{v.titulo}{v.opcional ? <span className="text-muted-foreground"> (opcional)</span> : null}</p>
                {p && <p className="truncate text-[11px] text-muted-foreground">{p.arquivo.name}</p>}
              </div>
              {p && <button type="button" className="text-xs text-red-300 hover:underline" onClick={() => tirar(v)}>tirar</button>}
              <label className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary">
                {p ? "Trocar" : "Escolher"}
                <input type="file" accept={ACEITA} className="hidden" onChange={e => { escolher(v, e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface AnexoSalvo { id: number; alvo: AlvoAnexo; dependenteId: number | null; dependente: string | null; tipo: TipoAnexo; rotulo: string; nome: string; bytes: number; enviadoEm: string }

/** Tela do contrato: anexos enviados (abrir/remover) e envio do que falta */
export function AnexosContrato({ contratoId, casado, dependentes }: { contratoId: number; casado: boolean; dependentes: { id: number; nome: string }[] }) {
  const [lista, setLista] = useState<AnexoSalvo[] | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const carregar = () => fetch(`/api/contratos/${contratoId}/anexos`, { credentials: "include" }).then(r => (r.ok ? r.json() : [])).then(setLista).catch(() => setLista([]));
  useEffect(() => { carregar(); }, [contratoId]);
  const vagas = vagasDoContrato(casado, dependentes.map(d => ({ nome: d.nome, ref: d.id })));
  vagas.push({ alvo: "comprador", tipo: "outro", titulo: "Outro documento", opcional: true });
  const daVaga = (v: Vaga) => (lista ?? []).filter(a => a.alvo === v.alvo && a.tipo === v.tipo && (v.alvo !== "dependente" || a.dependenteId === v.dependente));
  const enviar = async (v: Vaga, f: File | undefined) => {
    if (!f) return;
    if (grande(f)) { toast.error(`${f.name}: acima de ${LIMITE_ANEXO_MB} MB`); return; }
    setEnviando(chave(v));
    try { await enviarAnexo(contratoId, v, f); toast.success("Documento anexado"); await carregar(); }
    catch (e: any) { toast.error(e.message); } finally { setEnviando(null); }
  };
  const remover = async (a: AnexoSalvo) => {
    if (!confirm(`Remover "${a.nome}" dos anexos?`)) return;
    const r = await fetch(`/api/contratos/${contratoId}/anexos/${a.id}`, { method: "DELETE", credentials: "include" });
    if (!r.ok) toast.error((await r.json().catch(() => null))?.error ?? "Falha ao remover"); else carregar();
  };
  const faltam = vagas.filter(v => !v.opcional && !daVaga(v).length).length;
  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4" /> Documentos anexados
        {lista && <span className={`text-xs font-normal ${faltam ? "text-amber-300" : "text-emerald-400"}`}>{faltam ? `faltam ${faltam}` : "completos"}</span>}
      </h2>
      {!lista ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
        <div className="divide-y divide-border/50">
          {vagas.map(v => {
            const salvos = daVaga(v);
            return (
              <div key={chave(v)} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <p className="min-w-0 flex-1">{v.titulo}{v.opcional && !salvos.length ? <span className="text-muted-foreground"> (opcional)</span> : null}</p>
                {salvos.map(a => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs">
                    <a className="max-w-[180px] truncate text-primary hover:underline" href={`/api/contratos/${contratoId}/anexos/${a.id}`} target="_blank" rel="noreferrer"><Download className="mr-0.5 inline h-3 w-3" />{a.nome}</a>
                    <button type="button" title="Remover" onClick={() => remover(a)}><Trash2 className="h-3 w-3 text-red-300" /></button>
                  </span>
                ))}
                <label className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary">
                  {enviando === chave(v) ? <Loader2 className="inline h-3 w-3 animate-spin" /> : salvos.length ? "Adicionar" : "Enviar"}
                  <input type="file" accept={ACEITA} className="hidden" disabled={!!enviando} onChange={e => { enviar(v, e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              </div>
            );
          })}
        </div>
      )}
      {lista && lista.some(a => a.alvo === "dependente" && !dependentes.some(d => d.id === a.dependenteId)) && (
        <p className="text-xs text-muted-foreground">Há documentos de dependentes removidos guardados no contrato.</p>
      )}
    </section>
  );
}
