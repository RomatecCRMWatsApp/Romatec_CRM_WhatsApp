import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Download, Eye, ExternalLink, FileUp, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { DOCUMENTOS_PESSOAIS, MAX_DOCUMENTO_BYTES, MIMES_DOCUMENTO, ROTULO_DOCUMENTO, type TipoCredencial, type TipoDocumento } from "@shared/cadastro";
import { Interruptor, classeCampo, dataBr, sel } from "./campos";

type Doc = {
  id: number; tipo: string; titular: string; nome: string; mime: string; validade: string | null; numero: string | null;
  linkVerificacao: string | null; linkEmissao: string | null; anexarDocumentos: boolean; exibirPerfil: boolean; paginasQtd: number | null;
  rotulo: string; status: "sem_validade" | "valida" | "a_vencer" | "vencida"; dias: number | null;
};

/** Upload cru com progresso (XHR): POST novo documento ou PUT troca de arquivo */
function enviar(url: string, metodo: "POST" | "PUT", arquivo: File, cab: Record<string, string | undefined>, onProgresso: (p: number) => void) {
  return new Promise<{ id?: number }>((ok, falha) => {
    const x = new XMLHttpRequest();
    x.open(metodo, url);
    x.setRequestHeader("Content-Type", "application/octet-stream");
    x.setRequestHeader("X-File-Name", encodeURIComponent(arquivo.name));
    for (const [k, v] of Object.entries(cab)) if (v != null && v !== "") x.setRequestHeader(k, encodeURIComponent(v));
    x.upload.onprogress = e => e.lengthComputable && onProgresso(Math.round((e.loaded / e.total) * 100));
    x.onload = () => {
      let j: any = {};
      try { j = JSON.parse(x.responseText); } catch { /* resposta não-JSON */ }
      if (x.status >= 200 && x.status < 300 && j.success) ok(j);
      else falha(new Error(j.error || (x.status === 413 ? "Arquivo acima de 10 MB" : x.status === 415 ? "Formato não suportado (use PNG, JPG, WEBP ou PDF)" : "Falha no envio")));
    };
    x.onerror = () => falha(new Error("Sem conexão — tente de novo"));
    x.send(arquivo);
  });
}

/** Confere tipo e tamanho antes de enviar (o servidor confere de novo pelos bytes) */
function problemaLocal(f: File): string | null {
  if (!MIMES_DOCUMENTO.includes(f.type)) return "Formato não suportado (use PNG, JPG, WEBP ou PDF)";
  if (f.size > MAX_DOCUMENTO_BYTES) return "Arquivo acima de 10 MB";
  return null;
}

const urlThumb = (uid: number, d: Doc, v: number) => `/api/usuarios/${uid}/documentos/${d.id}/thumb?v=${v}`;
const urlPagina = (uid: number, d: Doc, n: number, v: number) => `/api/usuarios/${uid}/documentos/${d.id}/pagina/${n}?v=${v}`;

/** Visualizador: páginas em PNG (frente/verso quando são 2) e "baixar original" */
export function Visualizador({ uid, doc, versao, onFechar }: { uid: number; doc: Doc | null; versao: number; onFechar: () => void }) {
  const [pag, setPag] = useState(1);
  useEffect(() => setPag(1), [doc?.id]);
  const total = Math.max(1, doc?.paginasQtd ?? 1);
  const nomePag = (n: number) => (total === 2 ? (n === 1 ? "Frente" : "Verso") : `Página ${n}`);
  return (
    <Dialog open={!!doc} onOpenChange={o => !o && onFechar()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader><DialogTitle className="text-base">{doc?.rotulo}</DialogTitle></DialogHeader>
        {doc && (
          <div className="space-y-3">
            {total > 1 && (
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: total }, (_, i) => i + 1).map(n => (
                  <button key={n} type="button" onClick={() => setPag(n)}
                    className={`rounded px-2.5 py-1 text-xs ${pag === n ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{nomePag(n)}</button>
                ))}
              </div>
            )}
            <div className="max-h-[70vh] overflow-auto rounded-lg bg-black/40">
              <img src={urlPagina(uid, doc, pag, versao)} alt={nomePag(pag)} className="mx-auto max-w-full" />
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="outline" asChild>
                <a href={`/api/usuarios/documentos/${doc.id}?baixar=1`}><Download className="mr-1.5 h-3.5 w-3.5" /> Baixar original</a>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Faixa de validade (vencida, a vencer, válida) */
function FaixaValidade({ d }: { d: Doc }) {
  if (d.status === "sem_validade") return null;
  const cfg = {
    vencida: ["bg-red-600/15 text-red-300 border-red-500/40", `Vencida há ${Math.abs(d.dias ?? 0)} dia(s)`],
    a_vencer: ["bg-amber-500/15 text-amber-200 border-amber-500/40", d.dias === 0 ? "Vence hoje" : `Vence em ${d.dias} dia(s) — ${dataBr(d.validade)}`],
    valida: ["bg-emerald-600/15 text-emerald-300 border-emerald-500/40", `Válida até ${dataBr(d.validade)}`],
  }[d.status];
  return <div className={`rounded-md border px-2 py-1 text-xs ${cfg[0]}`}>{cfg[1]}</div>;
}

/** Salva os metadados com 600 ms de espera; mostra "Salvo ✓" */
function useAutoSalvar(docId: number | undefined, aoSalvar: () => void) {
  const mut = trpc.cadastro.atualizarDocumento.useMutation();
  const [estado, setEstado] = useState<"" | "salvando" | "salvo">("");
  const fila = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const agendar = (campos: Record<string, unknown>) => {
    if (!docId) return;
    fila.current = { ...fila.current, ...campos };
    clearTimeout(timer.current);
    setEstado("salvando");
    timer.current = setTimeout(async () => {
      const dados = fila.current;
      fila.current = {};
      try {
        await mut.mutateAsync({ documentoId: docId, ...dados } as any);
        setEstado("salvo"); aoSalvar();
        setTimeout(() => setEstado(e => (e === "salvo" ? "" : e)), 2000);
      } catch (e: any) {
        setEstado(""); toast.error(e.message);
      }
    }, 600);
  };
  return { agendar, estado };
}

const TEXTO_CRED: Record<TipoCredencial, { titulo: string; ajuda: string }> = {
  cartao_creci: { titulo: "Cartão de Regularidade (CRECI)", ajuda: "Obrigatório para receber leads. Vai anexado aos contratos com o selo de verificação." },
  certidao_creci: { titulo: "Certidão de Regularidade (CRECI)", ajuda: "Vale 30 dias. Você recebe um alerta no WhatsApp 5 dias antes de vencer." },
  certificado_cnai: { titulo: "Certificado CNAI", ajuda: "Avaliador Imobiliário. O número pode aparecer na sua qualificação." },
};

/** Card de uma credencial: arrastar e soltar, progresso, miniatura, trocar/visualizar/remover e os campos do tipo */
export function CredencialCard({ uid, tipo, doc, linkCertidaoPadrao, validadeSugerida, versao, onMudou, onVer }: {
  uid: number; tipo: TipoCredencial; doc?: Doc; linkCertidaoPadrao: string; validadeSugerida: string; versao: number; onMudou: () => void; onVer: (d: Doc) => void;
}) {
  const [progresso, setProgresso] = useState<number | null>(null);
  const [sobre, setSobre] = useState(false);
  const [local, setLocal] = useState({ validade: "", numero: "", linkVerificacao: "", linkEmissao: "" });
  const input = useRef<HTMLInputElement>(null);
  const remover = trpc.cadastro.removerDocumento.useMutation();
  const { agendar, estado } = useAutoSalvar(doc?.id, onMudou);
  useEffect(() => {
    setLocal({ validade: doc?.validade ?? "", numero: doc?.numero ?? "", linkVerificacao: doc?.linkVerificacao ?? "", linkEmissao: doc?.linkEmissao ?? "" });
  }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const subir = async (f?: File | null) => {
    if (!f) return;
    const p = problemaLocal(f);
    if (p) { toast.error(p); return; }
    setProgresso(0);
    try {
      if (doc) await enviar(`/api/usuarios/${uid}/documentos/${doc.id}/arquivo`, "PUT", f, {}, setProgresso);
      else await enviar(`/api/usuarios/${uid}/documentos`, "POST", f, {
        "X-Tipo": tipo, "X-Validade": tipo === "certidao_creci" ? validadeSugerida : undefined,
        "X-Link-Emissao": tipo === "certidao_creci" ? linkCertidaoPadrao : undefined,
      }, setProgresso);
      toast.success(`${TEXTO_CRED[tipo].titulo} ${doc ? "trocado(a)" : "enviado(a)"}`);
      onMudou();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProgresso(null);
    }
  };

  const campo = (k: keyof typeof local, extra?: (v: string) => Record<string, unknown>) => ({
    value: local[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setLocal(l => ({ ...l, [k]: v }));
      if (k.startsWith("link") && v && !/^https:\/\//i.test(v)) return; // só salva link válido
      agendar(extra ? extra(v) : { [k]: v || null });
    },
  });

  return (
    <div className={`rounded-xl border p-3 space-y-2.5 ${sobre ? "border-primary bg-primary/5" : "border-border bg-card"}`}
      onDragOver={e => { e.preventDefault(); setSobre(true); }} onDragLeave={() => setSobre(false)}
      onDrop={e => { e.preventDefault(); setSobre(false); subir(e.dataTransfer.files?.[0]); }}>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="text-sm font-semibold">{TEXTO_CRED[tipo].titulo}</p>
          <p className="text-[11px] text-muted-foreground">{TEXTO_CRED[tipo].ajuda}</p>
        </div>
        {estado === "salvando" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {estado === "salvo" && <span className="flex items-center gap-1 text-[11px] text-emerald-400"><Check className="h-3 w-3" /> Salvo</span>}
      </div>

      {doc ? (
        <div className="flex gap-3">
          <button type="button" onClick={() => onVer(doc)} className="relative h-24 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-black/30">
            <img src={urlThumb(uid, doc, versao)} alt="" className="h-full w-full object-cover" />
            {(doc.paginasQtd ?? 1) > 1 && <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[10px] text-white">{doc.paginasQtd} páginas</span>}
          </button>
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="truncate text-xs text-muted-foreground" title={doc.nome}>{doc.nome}</p>
            <FaixaValidade d={doc} />
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onVer(doc)}><Eye className="mr-1 h-3 w-3" /> Visualizar</Button>
              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => input.current?.click()}><RefreshCw className="mr-1 h-3 w-3" /> Trocar</Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-300" disabled={remover.isPending}
                onClick={async () => { if (!confirm(`Remover ${TEXTO_CRED[tipo].titulo}?`)) return; await remover.mutateAsync({ documentoId: doc.id }); onMudou(); }}>
                <Trash2 className="mr-1 h-3 w-3" /> Remover</Button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => input.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-border py-5 text-xs text-muted-foreground hover:border-primary hover:text-foreground">
          <Upload className="h-5 w-5" />
          Arraste aqui ou clique para enviar (PDF, JPG, PNG ou WEBP, até 10 MB)
        </button>
      )}
      {progresso != null && <span data-block-idle="true" hidden />}
      {progresso != null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${progresso}%` }} /></div>
      )}
      <input ref={input} type="file" accept={MIMES_DOCUMENTO.join(",")} hidden onChange={e => { subir(e.target.files?.[0]); e.target.value = ""; }} />

      {doc && (
        <div className="grid gap-2 sm:grid-cols-2">
          {tipo !== "certificado_cnai" && (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Validade
              <input type="date" {...campo("validade")} className={classeCampo()} required={tipo === "certidao_creci"} />
            </label>
          )}
          {tipo === "cartao_creci" && (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Link de verificação (QR do cartão)
              <input type="url" placeholder="https://" {...campo("linkVerificacao")} className={classeCampo(local.linkVerificacao && !/^https:\/\//i.test(local.linkVerificacao) ? "x" : undefined)} />
            </label>
          )}
          {tipo === "certidao_creci" && (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Link para emitir/renovar
              <span className="flex gap-1">
                <input type="url" placeholder={linkCertidaoPadrao} {...campo("linkEmissao")} className={classeCampo()} />
                <a href={local.linkEmissao || linkCertidaoPadrao} target="_blank" rel="noreferrer" className="flex h-10 items-center rounded-md border border-border px-2.5 hover:text-foreground" title="Abrir"><ExternalLink className="h-3.5 w-3.5" /></a>
              </span>
            </label>
          )}
          {tipo === "certificado_cnai" && (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Nº CNAI
              <input inputMode="numeric" maxLength={10} {...campo("numero", v => ({ numero: v.replace(/\D/g, "") || null }))} className={classeCampo(local.numero && !/^\d{4,10}$/.test(local.numero) ? "x" : undefined)} />
            </label>
          )}
          {tipo === "cartao_creci" && doc.linkVerificacao && (
            <a href={doc.linkVerificacao} target="_blank" rel="noreferrer" className="flex items-center gap-1 self-end text-xs text-primary hover:underline"><ExternalLink className="h-3 w-3" /> Verificar no CRECI</a>
          )}
          <div className="flex flex-wrap gap-4 sm:col-span-2">
            <Interruptor ligado={doc.anexarDocumentos} rotulo="Anexar aos contratos" onMudar={v => agendar({ anexarDocumentos: v })} />
            {tipo === "certificado_cnai" && <Interruptor ligado={doc.exibirPerfil} rotulo="Exibir na qualificação" onMudar={v => agendar({ exibirPerfil: v })} />}
          </div>
        </div>
      )}
    </div>
  );
}

/** Documentos pessoais: vários por tipo, do usuário ou do cônjuge */
export function DocumentosPessoais({ uid, docs, temConjuge, versao, onMudou, onVer }: {
  uid: number; docs: Doc[]; temConjuge: boolean; versao: number; onMudou: () => void; onVer: (d: Doc) => void;
}) {
  const [tipo, setTipo] = useState<TipoDocumento>("cnh");
  const [titular, setTitular] = useState<"usuario" | "conjuge">("usuario");
  const [progresso, setProgresso] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const remover = trpc.cadastro.removerDocumento.useMutation();

  const subir = async (arquivos: File[]) => {
    for (const f of arquivos) {
      const p = problemaLocal(f);
      if (p) { toast.error(`${f.name}: ${p}`); continue; }
      setProgresso(0);
      try {
        await enviar(`/api/usuarios/${uid}/documentos`, "POST", f, { "X-Tipo": tipo, "X-Titular": temConjuge ? titular : "usuario" }, setProgresso);
      } catch (e: any) {
        toast.error(`${f.name}: ${e.message}`);
      }
    }
    setProgresso(null);
    onMudou();
  };

  return (
    <div className="space-y-2.5"
      onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); subir(Array.from(e.dataTransfer.files ?? [])); }}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Tipo
          <select value={tipo} onChange={e => setTipo(e.target.value as TipoDocumento)} className={`${sel} w-64`}>
            {DOCUMENTOS_PESSOAIS.map(t => <option key={t} value={t}>{ROTULO_DOCUMENTO[t]}</option>)}
          </select>
        </label>
        {temConjuge && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">De quem
            <select value={titular} onChange={e => setTitular(e.target.value as any)} className={`${sel} w-40`}>
              <option value="usuario">Titular</option><option value="conjuge">Cônjuge</option>
            </select>
          </label>
        )}
        <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={progresso != null}><FileUp className="mr-1.5 h-4 w-4" /> Adicionar arquivo(s)</Button>
        <input ref={input} type="file" multiple accept={MIMES_DOCUMENTO.join(",")} hidden onChange={e => { subir(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      </div>
      {progresso != null && <span data-block-idle="true" hidden />}
      {progresso != null && <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${progresso}%` }} /></div>}
      {!docs.some(d => d.tipo === "cnh" && (d.titular ?? "usuario") === "usuario") && (
        <p className="text-xs text-amber-300">Envie a CNH (frente e verso): é obrigatória e vai anexada na ficha de credenciamento.</p>
      )}
      {docs.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum documento pessoal. Arraste os arquivos para cá.</p> : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map(d => (
            <div key={d.id} className="flex gap-2 rounded-lg border border-border p-2">
              <button type="button" onClick={() => onVer(d)} className="h-16 w-14 shrink-0 overflow-hidden rounded border border-border bg-black/30">
                <img src={urlThumb(uid, d, versao)} alt="" className="h-full w-full object-cover" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{d.rotulo}{d.titular === "conjuge" ? " · cônjuge" : ""}</p>
                <p className="truncate text-[11px] text-muted-foreground" title={d.nome}>{d.nome}</p>
                <div className="mt-1 flex gap-2 text-[11px]">
                  <button type="button" className="text-primary hover:underline" onClick={() => onVer(d)}>Ver</button>
                  <button type="button" className="text-red-300 hover:underline" disabled={remover.isPending}
                    onClick={async () => { if (!confirm(`Remover ${d.nome}?`)) return; await remover.mutateAsync({ documentoId: d.id }); onMudou(); }}>Remover</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type { Doc as DocumentoCadastro };
