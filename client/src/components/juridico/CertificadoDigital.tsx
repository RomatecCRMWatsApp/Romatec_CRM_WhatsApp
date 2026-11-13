import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileKey2, Loader2, PenTool, ShieldCheck, Trash2, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { AcoesPdf } from "@/components/sistema/AcoesPdf";

const dataBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
/** Erro sem resposta do servidor (reinício no deploy, queda de rede) vira um aviso legível */
const erroLegivel = (m: string) => /transform response|Failed to fetch|NetworkError|Load failed/i.test(m)
  ? "O servidor não respondeu (pode estar atualizando). Aguarde um minuto e tente de novo."
  : m;
const campo = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground";

/** Lê o arquivo do certificado em base64 (sem guardar nada no navegador) */
async function base64(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));
  return btoa(bin);
}

/**
 * Meu certificado digital (ICP-Brasil A1): guarda o .pfx cifrado no servidor para assinar documentos.
 * A senha NUNCA é guardada — é pedida a cada assinatura.
 */
export function CertificadoDigital() {
  const utils = trpc.useUtils();
  const { data: cert, isLoading } = trpc.certificado.meu.useQuery();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const guardar = trpc.certificado.guardar.useMutation({
    onSuccess: r => { toast.success(`Certificado guardado: ${r?.titular}`); setArquivo(null); setSenha(""); if (input.current) input.current.value = ""; utils.certificado.meu.invalidate(); },
    onError: e => toast.error(erroLegivel(e.message)),
  });
  const remover = trpc.certificado.remover.useMutation({ onSuccess: () => { toast.success("Certificado removido"); utils.certificado.meu.invalidate(); }, onError: e => toast.error(erroLegivel(e.message)) });

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="flex items-center gap-2 font-semibold"><FileKey2 className="h-4 w-4 text-[var(--rt-gold-light)]" /> Certificado digital (ICP-Brasil A1)</h2>
      <p className="text-xs text-muted-foreground">
        Guarde o seu certificado (.pfx ou .p12) para assinar ofícios, notificações, atas e alterações com assinatura digital. O arquivo fica cifrado no servidor e a <b>senha nunca é guardada</b>: o sistema pede a senha a cada assinatura. Só vale certificado ICP-Brasil, dentro da validade e com o CPF do seu cadastro.
      </p>
      {isLoading ? <p className="text-xs text-muted-foreground">Carregando…</p> : cert ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-ok-500/30 bg-ok-600/10 p-3">
          <ShieldCheck className="h-5 w-5 text-ok-300" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{cert.titular}{cert.cpf ? ` · CPF ${cert.cpf}` : ""}</p>
            <p className={`text-xs ${cert.vencido ? "text-danger-300" : "text-muted-foreground"}`}>{cert.emissor} · {cert.vencido ? "vencido em" : "válido até"} {dataBr(cert.validade)}</p>
          </div>
          <Button size="sm" variant="outline" className="text-danger-300" disabled={remover.isPending} onClick={() => { if (confirm("Remover o certificado guardado?")) remover.mutate(); }}><Trash2 className="mr-1 h-4 w-4" /> Remover</Button>
          {(cert as any).legivel === false && (
            <p className="basis-full rounded-md border border-danger-500/40 bg-danger-500/10 p-2 text-xs text-danger-200">
              O servidor não consegue mais abrir este certificado (a chave de cifra mudou depois que ele foi guardado). Envie o arquivo .pfx de novo logo abaixo e guarde — a senha continua não sendo guardada.
            </p>
          )}
        </div>
      ) : <p className="text-xs text-warn-300">Nenhum certificado guardado.</p>}
      <div className="grid gap-2 sm:grid-cols-[1fr_200px_auto] sm:items-end">
        <label className="text-xs text-muted-foreground">{cert ? "Trocar pelo certificado" : "Arquivo do certificado"}
          <input ref={input} type="file" accept=".pfx,.p12,application/x-pkcs12" className="mt-1 block w-full text-xs file:mr-2 file:rounded-md file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-foreground"
            onChange={e => setArquivo(e.target.files?.[0] ?? null)} />
        </label>
        <label className="text-xs text-muted-foreground">Senha do certificado
          <input type="password" className={`${campo} mt-1`} value={senha} onChange={e => setSenha(e.target.value)} autoComplete="new-password" name="senha-certificado-icp" />
        </label>
        <Button disabled={!arquivo || !senha || guardar.isPending} onClick={async () => { if (arquivo) guardar.mutate({ pfxBase64: await base64(arquivo), senha }); }}>
          {guardar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />} Guardar
        </Button>
      </div>
    </section>
  );
}

/**
 * Assinar um documento jurídico com o certificado: só a senha (certificado guardado) ou um .pfx enviado agora
 * (não é guardado).
 */
export function AssinarComCertificado({ documentoId, onAssinado, rotulo = "Assinar com certificado", abertoInicial = false }: { documentoId: number; onAssinado: () => void; rotulo?: string; abertoInicial?: boolean }) {
  const [aberto, setAberto] = useState(abertoInicial);
  const [senha, setSenha] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const assinar = trpc.juridico.assinarDocumento.useMutation({
    onSuccess: r => { toast.success(`Assinado digitalmente por ${r.nome} (${r.assinaturas} assinatura${r.assinaturas > 1 ? "s" : ""})`); setAberto(false); setSenha(""); setArquivo(null); onAssinado(); },
    onError: e => toast.error(erroLegivel(e.message)),
  });
  if (!aberto) return <Button size="sm" onClick={() => setAberto(true)}><PenTool className="mr-1 h-4 w-4" /> {rotulo}</Button>;
  return (
    <div className="flex w-full flex-wrap items-end gap-2 rounded-lg border border-[var(--rt-gold)]/40 bg-background/40 p-2">
      <label className="text-xs text-muted-foreground">Senha do certificado
        <input type="password" className={`${campo} mt-1 w-48`} value={senha} onChange={e => setSenha(e.target.value)} autoComplete="new-password" name="senha-certificado-icp" autoFocus />
      </label>
      <label className="text-xs text-muted-foreground">Outro certificado (opcional, não é guardado)
        <input type="file" accept=".pfx,.p12,application/x-pkcs12" className="mt-1 block text-xs file:mr-2 file:rounded-md file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-foreground" onChange={e => setArquivo(e.target.files?.[0] ?? null)} />
      </label>
      <Button size="sm" disabled={!senha || assinar.isPending} onClick={async () => assinar.mutate({ id: documentoId, senha, pfxBase64: arquivo ? await base64(arquivo) : null })}>
        {assinar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PenTool className="mr-1 h-4 w-4" />} Assinar
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setAberto(false)}>Cancelar</Button>
    </div>
  );
}

/** Lista dos documentos jurídicos com as assinaturas e o botão de assinar (portal jurídico e portal do empreendedor) */
export function DocumentosJuridicos({ slug, podeEnviar, admin }: { slug?: string; podeEnviar?: boolean; admin?: boolean }) {
  const utils = trpc.useUtils();
  const { data: docs = [], isLoading } = trpc.juridico.documentos.useQuery(slug ? { slug } : undefined);
  const { data: eu } = trpc.auth.me.useQuery();
  const [titulo, setTitulo] = useState("");
  const [arquivoPdf, setArquivoPdf] = useState<File | null>(null);
  const [recemEnviado, setRecemEnviado] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const arq = useRef<HTMLInputElement>(null);
  const recarregar = () => { utils.juridico.documentos.invalidate(); utils.juridico.inadimplencia.invalidate(); };
  const enviar = async () => {
    const f = arquivoPdf ?? arq.current?.files?.[0];
    if (!f) return toast.error("Escolha o arquivo PDF");
    const t = (titulo.trim() || f.name.replace(/\.pdf$/i, "")).trim();
    if (t.length < 3) return toast.error("Dê um título ao documento (mínimo 3 letras)");
    setEnviando(true);
    try {
      const r = await fetch("/api/juridico/documentos/avulso", { method: "POST", credentials: "include", headers: { "Content-Type": "application/octet-stream", "x-titulo": encodeURIComponent(t), ...(admin && slug ? { "x-slug": encodeURIComponent(slug) } : {}) }, body: f });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Não foi possível enviar");
      toast.success("Documento enviado — digite a senha do certificado e assine"); setTitulo(""); setArquivoPdf(null); if (arq.current) arq.current.value = "";
      setRecemEnviado(Number(j.id) || null); recarregar();
    } catch (e: any) { toast.error(e.message); } finally { setEnviando(false); }
  };
  return (
    <div className="space-y-2">
      {podeEnviar && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3 text-sm">
          <label className="min-w-[220px] flex-1 text-xs text-muted-foreground">Ofício, alteração ou solicitação (PDF) — título
            <input className={`${campo} mt-1`} value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex.: Ofício ao Cartório do 1.º Ofício — certidão" autoComplete="off" name="titulo-documento-juridico" />
          </label>
          <input ref={arq} type="file" accept="application/pdf" className="text-xs file:mr-2 file:rounded-md file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-foreground"
            onChange={e => { const f = e.target.files?.[0] ?? null; setArquivoPdf(f); if (f && !titulo.trim()) setTitulo(f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim()); }} />
          <Button size="sm" disabled={enviando || !arquivoPdf} onClick={enviar}>{enviando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />} Enviar para assinar</Button>
          <p className="basis-full text-[11px] text-muted-foreground">Escolha o PDF (o título vem do nome do arquivo e pode ser editado) e toque em Enviar para assinar; em seguida digite a senha do certificado.</p>
        </div>
      )}
      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {!isLoading && !docs.length && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum documento jurídico ainda.</p>}
      {docs.map(d => {
        const jaAssinei = d.assinaturas.some(a => Number(a.usuarioId) === Number((eu as any)?.id));
        return (
          <div key={d.id} className="space-y-1.5 rounded-xl border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px]">{d.rotuloTipo}</span>
              <b className="min-w-0 flex-1">{d.titulo}</b>
              <AcoesPdf compacto rotulo="PDF" url={d.url} nomeArquivo={`${d.titulo}.pdf`} mensagem={d.titulo} />
            </div>
            <p className="text-xs text-muted-foreground">{d.contrato ? `${d.contrato} · ` : ""}gerado em {dataBr(d.criadoEm)}</p>
            <p className="text-xs">{d.assinaturas.length
              ? <span className="text-ok-300">Assinado digitalmente (ICP-Brasil) por: {d.assinaturas.map(a => `${a.nome} em ${dataBr(a.em)}`).join("; ")}</span>
              : <span className="text-warn-300">Ainda sem assinatura</span>}</p>
            {!jaAssinei && <AssinarComCertificado key={`${d.id}-${recemEnviado === d.id}`} documentoId={d.id} onAssinado={() => { setRecemEnviado(null); recarregar(); }} abertoInicial={recemEnviado === d.id} />}
          </div>
        );
      })}
    </div>
  );
}
