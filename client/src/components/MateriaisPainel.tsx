import { useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Copy, Download, Eye, EyeOff, FileText, Lock, Share2, Trash2, Upload, Video } from "lucide-react";
import { ROTULO_TIPO_MATERIAL, TIPOS_MATERIAL, bloqueadaPorNome, problemaArquivo, tipoPorNome, tituloPorNome, type TipoMaterial } from "@shared/materiais";

type Destino = { propertyId?: number | null; empreendimentoSlug?: string | null };

const ehImagem = (m: any) => (m.mime || "").startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(m.url);
const ehVideo = (m: any) => (m.mime || "").startsWith("video/") || /\.(mp4|mov|webm)$/i.test(m.url);
const tamanho = (b?: number | null) => (!b ? "" : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
/** Miniatura leve do Cloudinary para a grade (o original fica para baixar) */
const miniatura = (url: string) => url.includes("/image/upload/") ? url.replace("/image/upload/", "/image/upload/c_limit,w_480,q_auto,f_auto/") : url;
const nomeArquivo = (m: any) => {
  const ext = (m.url.split("?")[0].match(/\.[a-z0-9]+$/i)?.[0]) || (ehVideo(m) ? ".mp4" : ehImagem(m) ? ".png" : ".pdf");
  return `${m.titulo.replace(/[^\wÀ-ſ -]+/g, "").trim().replace(/\s+/g, "_") || "material"}${ext}`;
};

async function baixarBlob(m: any): Promise<Blob | null> {
  try {
    const r = await fetch(m.url);
    if (!r.ok) return null;
    return await r.blob();
  } catch {
    return null;
  }
}

function CardMaterial({ m, onMudou }: { m: any; onMudou: () => void }) {
  const atualizar = trpc.materiais.update.useMutation({ onSuccess: onMudou, onError: e => toast.error(e.message) });
  const excluir = trpc.materiais.delete.useMutation({ onSuccess: () => { toast.success("Material removido do CRM"); onMudou(); }, onError: e => toast.error(e.message) });
  const [ocupado, setOcupado] = useState(false);

  const baixar = async () => {
    setOcupado(true);
    const blob = await baixarBlob(m);
    setOcupado(false);
    if (!blob) { window.open(m.url, "_blank", "noopener"); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nomeArquivo(m);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // No celular manda o arquivo para o WhatsApp/Instagram; no computador copia o link
  const compartilhar = async () => {
    setOcupado(true);
    try {
      const blob = await baixarBlob(m);
      const arquivo = blob ? new File([blob], nomeArquivo(m), { type: blob.type || m.mime || "" }) : null;
      if (arquivo && (navigator as any).canShare?.({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo], title: m.titulo });
        return;
      }
      await navigator.clipboard.writeText(m.url);
      toast.success("Link copiado. No celular, este botão envia o arquivo direto para o WhatsApp.");
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error("Não foi possível compartilhar");
    } finally {
      setOcupado(false);
    }
  };

  const copiar = async () => {
    try { await navigator.clipboard.writeText(m.url); toast.success("Link copiado"); } catch { toast.error("Não foi possível copiar"); }
  };

  return (
    <div className={`rounded-lg border bg-card overflow-hidden flex flex-col ${m.liberado ? "border-border" : "border-red-500/40"}`}>
      <a href={m.url} target="_blank" rel="noreferrer" className="block bg-black/40 aspect-[4/5] relative">
        {ehImagem(m) ? (
          <img src={miniatura(m.url)} alt={m.titulo} loading="lazy" className="w-full h-full object-contain" />
        ) : ehVideo(m) ? (
          <video src={m.url} preload="metadata" muted className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <FileText className="h-10 w-10" /><span className="text-xs">PDF</span>
          </div>
        )}
        {ehVideo(m) && <Video className="absolute top-2 left-2 h-4 w-4 text-white drop-shadow" />}
        {!m.liberado && (
          <span className="absolute top-2 right-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white flex items-center gap-1">
            <Lock className="h-3 w-3" /> NÃO DIVULGAR
          </span>
        )}
      </a>
      <div className="p-2 space-y-1.5 flex-1 flex flex-col">
        <p className="text-sm font-medium text-foreground leading-tight line-clamp-2" title={m.titulo}>{m.titulo}</p>
        <div className="flex items-center gap-2">
          <select
            value={m.tipo}
            onChange={e => atualizar.mutate({ id: m.id, tipo: e.target.value as TipoMaterial })}
            className="h-7 flex-1 min-w-0 rounded border border-border bg-secondary/30 px-1 text-[11px] text-muted-foreground"
          >
            {TIPOS_MATERIAL.map(t => <option key={t} value={t}>{ROTULO_TIPO_MATERIAL[t]}</option>)}
          </select>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{tamanho(m.tamanhoBytes)}</span>
        </div>
        <div className="flex flex-wrap gap-1 mt-auto pt-1">
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={baixar} disabled={ocupado}><Download className="h-3.5 w-3.5 mr-1" />Baixar</Button>
          {m.liberado && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={compartilhar} disabled={ocupado}><Share2 className="h-3.5 w-3.5 mr-1" />Enviar</Button>}
          <Button size="sm" variant="ghost" className="h-7 px-2" title="Copiar link" onClick={copiar}><Copy className="h-3.5 w-3.5" /></Button>
          <Button
            size="sm" variant="ghost" className="h-7 px-2" title={m.liberado ? "Bloquear (não divulgar)" : "Liberar para divulgar"}
            onClick={() => {
              if (!m.liberado && !confirm(`Liberar "${m.titulo}" para divulgação? Confira se a peça não mostra preço, parcela ou condições ainda não aprovadas.`)) return;
              atualizar.mutate({ id: m.id, liberado: !m.liberado });
            }}
          >
            {m.liberado ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-300" title="Remover do CRM"
            onClick={() => { if (confirm(`Remover "${m.titulo}" do CRM?`)) excluir.mutate({ id: m.id }); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Materiais de divulgação. Com propertyId/empreendimentoSlug mostra só os daquele
 * imóvel (cadastro do imóvel); sem eles mostra todos, agrupados, com escolha do destino no envio.
 */
export default function MateriaisPainel({ propertyId, empreendimentoSlug }: Destino) {
  const fixo = !!(propertyId || empreendimentoSlug);
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.materiais.list.useQuery(fixo ? { propertyId: propertyId ?? null, empreendimentoSlug: empreendimentoSlug ?? null } : undefined);
  const criar = trpc.materiais.create.useMutation();
  const [destino, setDestino] = useState("");
  const [filtro, setFiltro] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const recarregar = () => utils.materiais.list.invalidate();

  const enviar = async (files: FileList | null) => {
    if (!files?.length) return;
    let alvo: Destino = { propertyId, empreendimentoSlug };
    if (!fixo) {
      const d = data?.destinos.find(x => x.chave === destino);
      if (!d) { toast.error("Escolha primeiro o imóvel ou empreendimento"); return; }
      alvo = { propertyId: d.propertyId, empreendimentoSlug: d.empreendimentoSlug };
    }
    let ok = 0;
    const lista = Array.from(files);
    for (let i = 0; i < lista.length; i++) {
      const f = lista[i];
      setEnviando(`Enviando ${i + 1} de ${lista.length}: ${f.name}`);
      const erro = problemaArquivo(f.type, f.size);
      if (erro) { toast.error(`${f.name}: ${erro}`); continue; }
      try {
        const r = await fetch("/api/materiais/upload", {
          method: "POST",
          headers: { "Content-Type": f.type, "X-File-Name": encodeURIComponent(f.name), "X-File-Type": f.type },
          body: await f.arrayBuffer(),
        });
        const up = await r.json();
        if (!up.success) { toast.error(`${f.name}: ${up.error || "falha no upload"}`); continue; }
        const bloqueada = bloqueadaPorNome(f.name);
        await criar.mutateAsync({
          ...alvo, titulo: tituloPorNome(f.name), tipo: tipoPorNome(f.name, f.type), url: up.url,
          mime: up.mime, tamanhoBytes: up.tamanhoBytes, liberado: !bloqueada,
          observacao: bloqueada ? "Bloqueada automaticamente: o nome indica condições/preço" : null,
        });
        if (bloqueada) toast.warning(`${f.name} entrou BLOQUEADA (o nome indica condições/preço)`);
        ok++;
      } catch (e: any) {
        toast.error(`${f.name}: ${e?.message || "falha"}`);
      }
    }
    setEnviando(null);
    if (input.current) input.current.value = "";
    if (ok) toast.success(`${ok} material(is) enviado(s)`);
    recarregar();
  };

  const grupos = (data?.grupos ?? []).filter(g => !filtro || g.chave === filtro);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        {!fixo && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Enviar para
            <select value={destino} onChange={e => setDestino(e.target.value)} className="h-9 min-w-[220px] max-w-full rounded-md border border-border bg-secondary/30 px-2 text-sm text-foreground">
              <option value="">— escolha o imóvel ou empreendimento —</option>
              {data?.destinos.map(d => <option key={d.chave} value={d.chave}>{d.nome}</option>)}
            </select>
          </label>
        )}
        <input ref={input} type="file" multiple accept="image/*,video/mp4,video/webm,video/quicktime,application/pdf" className="hidden" onChange={e => enviar(e.target.files)} />
        <Button type="button" onClick={() => input.current?.click()} disabled={!!enviando || (!fixo && !destino)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Upload className="h-4 w-4 mr-1.5" /> Enviar artes, vídeos ou PDF
        </Button>
        {!fixo && (data?.grupos.length ?? 0) > 1 && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground ml-auto">
            Mostrar
            <select value={filtro} onChange={e => setFiltro(e.target.value)} className="h-9 rounded-md border border-border bg-secondary/30 px-2 text-sm text-foreground">
              <option value="">Todos</option>
              {data?.grupos.map(g => <option key={g.chave} value={g.chave}>{g.nome} ({g.itens.length})</option>)}
            </select>
          </label>
        )}
      </div>
      {enviando && <p className="text-xs text-emerald-300">{enviando}</p>}
      <p className="text-[11px] text-muted-foreground">
        Imagem e PDF até 10 MB, vídeo até 100 MB. Peças com "condições", "preço" ou "tabela" no nome entram bloqueadas. Os arquivos ficam com link público para poder compartilhar; não envie documentos internos.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando materiais...</p>}
      {!isLoading && grupos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum material ainda.</p>}
      {grupos.map(g => (
        <section key={g.chave} className="space-y-2">
          {!fixo && <h2 className="text-base font-semibold text-foreground">{g.nome} <span className="text-xs text-muted-foreground font-normal">· {g.itens.length}</span></h2>}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {g.itens.map((m: any) => <CardMaterial key={m.id} m={m} onMudou={recarregar} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
