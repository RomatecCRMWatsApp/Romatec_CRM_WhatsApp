import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Copy, Download, Eye, EyeOff, FileText, Loader2, Lock, Share2, Trash2, Upload, Video } from "lucide-react";
import { useCartaoVendas } from "@/lib/cartaoVendas";
import { bannerDoCorretor, legendaDoMaterial, linkDoMaterial, pdfDoCorretor, urlVideoDoCorretor, videoDoCorretor } from "@/lib/materialDoCorretor";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import {
  ABA_ARQUIVO, CATEGORIAS_ARQUIVO, ROTULO_TIPO_MATERIAL, TIPOS_ARQUIVO_ACEITOS, TIPOS_MATERIAL, bloqueadaPorNome, categoriaDoArquivo, tipoPorNome, tituloPorNome,
  type CategoriaArquivo, type TipoMaterial,
} from "@shared/materiais";
import { enviarParaCloudinary, mimeDoArquivo } from "@/lib/uploadCloudinary";
import LinkAgendamento from "@/components/LinkAgendamento";
import LinkInstagram from "@/components/LinkInstagram";

type Destino = { propertyId?: number | null; empreendimentoSlug?: string | null };

export const ehImagem = (m: any) => (m.mime || "").startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(m.url);
export const ehVideo = (m: any) => (m.mime || "").startsWith("video/") || /\.(mp4|mov|webm)$/i.test(m.url);
export const tamanho = (b?: number | null) => (!b ? "" : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
/** Miniatura leve do Cloudinary para a grade (o original fica para baixar) */
export const miniatura = (url: string) => url.includes("/image/upload/") ? url.replace("/image/upload/", "/image/upload/c_limit,w_480,q_auto,f_auto/") : url;
export const nomeArquivo = (m: any) => {
  const ext = (m.url.split("?")[0].match(/\.[a-z0-9]+$/i)?.[0]) || (ehVideo(m) ? ".mp4" : ehImagem(m) ? ".png" : ".pdf");
  return `${m.titulo.replace(/[^\wÀ-ſ -]+/g, "").trim().replace(/\s+/g, "_") || "material"}${ext}`;
};

export async function baixarBlob(m: any): Promise<Blob | null> {
  try {
    const r = await fetch(m.url);
    if (!r.ok) return null;
    return await r.blob();
  } catch {
    return null;
  }
}

type Cartao = ReturnType<typeof useCartaoVendas>;
type Grupo = { empreendimentoSlug?: string | null; propertyId?: number | null; nome?: string };

/**
 * Arquivo com os dados de quem divulga (lib/materialDoCorretor): banner com faixa, PDF com rodapé e vídeo
 * com a faixa do Cloudinary. Falhou o carimbo: segue o original (a legenda continua com os dados).
 */
async function arquivoDoCorretor(m: any, c: Cartao, link: string, aviso: (t: string) => void): Promise<{ blob: Blob; nome: string; carimbado: boolean; url: string }> {
  const nome = nomeArquivo(m);
  try {
    if (ehImagem(m) && !/\.gif$/i.test(m.url)) return { blob: await bannerDoCorretor(m.url, c, link), nome: nome.replace(/\.[a-z0-9]+$/i, ".jpg"), carimbado: true, url: m.url };
    if (ehVideo(m)) {
      aviso("Preparando o vídeo com os seus dados…");
      const v = await videoDoCorretor(m.url, c, s => aviso(`Gerando o vídeo com os seus dados (${s}s)…`));
      if (v) return { blob: v.blob, nome: nome.replace(/\.[a-z0-9]+$/i, ".mp4"), carimbado: true, url: v.url };
    } else if (!ehImagem(m)) {
      return { blob: await pdfDoCorretor(m.url, c, link), nome, carimbado: true, url: m.url };
    }
  } catch (e) { console.warn("[Materiais] carimbo do corretor:", e); }
  const blob = await baixarBlob(m);
  if (!blob) throw new Error("Não foi possível baixar o arquivo");
  return { blob, nome, carimbado: false, url: m.url };
}

function CardMaterial({ m, onMudou, grupo, cartao, escritorio }: { m: any; onMudou: () => void; grupo: Grupo; cartao: Cartao; escritorio: boolean }) {
  const atualizar = trpc.materiais.update.useMutation({ onSuccess: onMudou, onError: e => toast.error(e.message) });
  const excluir = trpc.materiais.delete.useMutation({ onSuccess: () => { toast.success("Material removido do CRM"); onMudou(); }, onError: e => toast.error(e.message) });
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [pronto, setPronto] = useState<File | null>(null);
  const enviarPronto = async () => {
    if (!pronto) return;
    try { await navigator.share({ files: [pronto], text: legenda, title: m.titulo }); setPronto(null); } catch (e: any) { if (e?.name !== "AbortError") toast.error("Não foi possível compartilhar"); }
  };
  const link = linkDoMaterial(grupo, cartao.ref);
  const legenda = legendaDoMaterial(m.titulo, link, cartao);

  const preparar = async () => {
    setOcupado("Colocando os seus dados no material…");
    try {
      const a = await arquivoDoCorretor(m, cartao, link, setOcupado);
      if (!a.carimbado) toast.warning("Não deu para carimbar este arquivo: ele vai sem a faixa, mas o texto leva os seus dados.");
      return a;
    } finally { setOcupado(null); }
  };

  const baixarArquivo = (blob: Blob, nome: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const baixar = async () => {
    try { const a = await preparar(); baixarArquivo(a.blob, a.nome); } catch (e: any) { toast.error(e?.message || "Não foi possível baixar"); }
  };

  // No celular manda o arquivo (com os dados do corretor) e o texto para o WhatsApp; no computador baixa e copia o texto
  const compartilhar = async () => {
    try {
      const a = await preparar();
      try { await navigator.clipboard.writeText(legenda); } catch { /* sem área de transferência */ }
      const arquivo = new File([a.blob], a.nome, { type: a.blob.type || m.mime || "" });
      if ((navigator as any).canShare?.({ files: [arquivo] })) {
        try { await navigator.share({ files: [arquivo], text: legenda, title: m.titulo }); }
        catch (e: any) {
          // Demorou para gerar (vídeo): o celular exige um toque novo para abrir o compartilhamento
          if (e?.name === "NotAllowedError") { setPronto(arquivo); toast.success("Material pronto com os seus dados — toque em \"Enviar agora\"."); return; }
          throw e;
        }
        return;
      }
      baixarArquivo(a.blob, a.nome);
      toast.success("Arquivo baixado com os seus dados e o texto copiado — cole no WhatsApp junto com o arquivo.");
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error(e?.message || "Não foi possível compartilhar");
    }
  };

  const copiar = async () => {
    const extra = ehVideo(m) ? urlVideoDoCorretor(m.url, cartao) ?? m.url : null;
    try { await navigator.clipboard.writeText(extra ? `${legenda}\n\n🎬 Vídeo: ${extra}` : legenda); toast.success("Texto com o seu link e os seus dados copiado"); } catch { toast.error("Não foi possível copiar"); }
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
        {pronto && <Button size="sm" className="h-7 bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-700" onClick={enviarPronto}><Share2 className="mr-1 h-3.5 w-3.5" /> Enviar agora</Button>}
        {ocupado && <p className="flex items-center gap-1 text-[11px] text-emerald-300"><Loader2 className="h-3 w-3 animate-spin" /> {ocupado}</p>}
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
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={baixar} disabled={!!ocupado} title="Baixar com os seus dados (nome, CRECI, WhatsApp e QR do seu link)"><Download className="h-3.5 w-3.5 mr-1" />Baixar</Button>
          {m.liberado && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={compartilhar} disabled={!!ocupado} title="Enviar com os seus dados e o texto com o seu link"><Share2 className="h-3.5 w-3.5 mr-1" />Enviar</Button>}
          <Button size="sm" variant="ghost" className="h-7 px-2" title="Copiar o texto com o seu link e os seus dados" onClick={copiar}><Copy className="h-3.5 w-3.5" /></Button>
          {escritorio && <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" title="Arquivo original, sem os dados do corretor" asChild><a href={m.url} target="_blank" rel="noreferrer">Original</a></Button>}
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
  // Aba (Todos / Imagens / Vídeos / PDFs): cada arquivo cai na sua pelo tipo; a aba fica lembrada neste aparelho
  const [aba, setAbaEstado] = useState<"" | CategoriaArquivo>(() => {
    try { const v = localStorage.getItem("materiais_aba"); return (CATEGORIAS_ARQUIVO as readonly string[]).includes(v ?? "") ? (v as CategoriaArquivo) : ""; } catch { return ""; }
  });
  const setAba = (v: "" | CategoriaArquivo) => { setAbaEstado(v); try { localStorage.setItem("materiais_aba", v); } catch { /* sem armazenamento */ } };
  const [enviando, setEnviando] = useState<string | null>(null);
  // Limites reais do plano de armazenamento (Cloudinary), para o texto e a checagem antes de enviar
  const [limites, setLimites] = useState<{ imagemMB: number; videoMB: number; pdfMB: number } | null>(null);
  useEffect(() => {
    fetch("/api/materiais/limites", { credentials: "include" }).then(r => (r.ok ? r.json() : null)).then(j => j?.success && setLimites(j)).catch(() => {});
  }, []);
  const cartao = useCartaoVendas();
  const { user } = useAuth();
  const escritorio = ["admin", "secretario"].includes(perfilDe(user as any) ?? "");
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
      const mime = mimeDoArquivo(f);
      const mb = (f.size / 1048576).toFixed(f.size > 10 * 1048576 ? 0 : 1);
      setEnviando(`Enviando ${i + 1} de ${lista.length}: ${f.name} (${mb} MB)…`);
      if (!TIPOS_ARQUIVO_ACEITOS.includes(mime)) { toast.error(`${f.name}: tipo não aceito. Use JPG, PNG, WEBP, GIF, MP4, MOV, WEBM ou PDF.`); continue; }
      if (aba && categoriaDoArquivo(mime, f.name) !== aba) { toast.error(`${f.name}: esta é a aba ${ABA_ARQUIVO[aba].rotulo}. Envie pela aba certa ou por "Todos".`); continue; }
      try {
        // Direto para o armazenamento, em partes (não passa pelo servidor do CRM)
        const up = await enviarParaCloudinary(f, pct => setEnviando(`Enviando ${i + 1} de ${lista.length}: ${f.name} (${mb} MB) — ${pct}%`));
        const bloqueada = bloqueadaPorNome(f.name);
        await criar.mutateAsync({
          ...alvo, titulo: tituloPorNome(f.name), tipo: tipoPorNome(f.name, mime), url: up.url,
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

  const naAba = (m: any) => !aba || categoriaDoArquivo(m.mime, m.url) === aba;
  const doFiltro = (data?.grupos ?? []).filter(g => !filtro || g.chave === filtro);
  const contagem = (c: "" | CategoriaArquivo) => doFiltro.reduce((n, g) => n + g.itens.filter((m: any) => !c || categoriaDoArquivo(m.mime, m.url) === c).length, 0);
  const grupos = doFiltro.map(g => ({ ...g, itens: g.itens.filter(naAba) })).filter(g => g.itens.length > 0);

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
        <input ref={input} type="file" multiple accept={aba ? ABA_ARQUIVO[aba].aceita : "image/*,video/mp4,video/webm,video/quicktime,application/pdf"} className="hidden" onChange={e => enviar(e.target.files)} />
        <Button type="button" onClick={() => input.current?.click()} disabled={!!enviando || (!fixo && !destino)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Upload className="h-4 w-4 mr-1.5" /> {aba ? ABA_ARQUIVO[aba].botao : "Enviar artes, vídeos ou PDF"}
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
      <div role="tablist" aria-label="Tipo de arquivo" className="grid grid-cols-4 gap-1 rounded-lg border border-border bg-secondary/20 p-1">
        {([["", "Todos"], ...CATEGORIAS_ARQUIVO.map(c => [c, ABA_ARQUIVO[c].rotulo])] as ["" | CategoriaArquivo, string][]).map(([c, rotulo]) => (
          <button key={c || "todos"} type="button" role="tab" aria-selected={aba === c} onClick={() => setAba(c)}
            className={`whitespace-nowrap rounded-md px-1 py-1.5 text-xs sm:text-sm font-medium transition-colors ${aba === c ? "bg-emerald-600 text-white" : "text-muted-foreground hover:text-foreground"}`}>
            {c === "video" && <Video className="hidden sm:inline h-3.5 w-3.5 mr-1 -mt-0.5" />}
            {c === "pdf" && <FileText className="hidden sm:inline h-3.5 w-3.5 mr-1 -mt-0.5" />}
            {rotulo} <span className="opacity-70">({contagem(c)})</span>
          </button>
        ))}
      </div>
      {(empreendimentoSlug || destino.startsWith("e:")) && <LinkAgendamento slug={empreendimentoSlug || destino.slice(2)} />}
      <LinkInstagram />
      {enviando && <p className="text-xs text-emerald-300">{enviando}</p>}
      <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
        Tudo o que você baixa ou envia daqui sai com os <b>seus dados</b>: banner com a faixa (nome, {cartao.creci ?? "CRECI"}, WhatsApp e QR do seu link), vídeo com a faixa, PDF com o rodapé e o texto com o seu link — o cliente cai direto com você.
        {!cartao.creci && " Cadastre o seu CRECI em Meu cadastro para ele aparecer."}
      </p>
      <p className="text-[11px] text-muted-foreground">
        Imagem até {limites?.imagemMB ?? 10} MB, PDF até {limites?.pdfMB ?? 10} MB, vídeo até {limites?.videoMB ?? 100} MB (enviado em partes; deixe a tela aberta até 100%). Peças com "condições", "preço" ou "tabela" no nome entram bloqueadas. Os arquivos ficam com link público para poder compartilhar; não envie documentos internos.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando materiais...</p>}
      {!isLoading && grupos.length === 0 && <p className="text-sm text-muted-foreground">{aba ? `Nenhum material em ${ABA_ARQUIVO[aba].rotulo} ainda.` : "Nenhum material ainda."}</p>}
      {grupos.map(g => (
        <section key={g.chave} className="space-y-2">
          {!fixo && <h2 className="text-base font-semibold text-foreground">{g.nome} <span className="text-xs text-muted-foreground font-normal">· {g.itens.length}</span></h2>}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {g.itens.map((m: any) => <CardMaterial key={m.id} m={m} onMudou={recarregar} grupo={g} cartao={cartao} escritorio={escritorio} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
