import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Copy, Download, Eye, EyeOff, FileText, Loader2, Lock, Share2, Trash2, Upload, Video } from "lucide-react";
import { useCartaoVendas } from "@/lib/cartaoVendas";
import { legendaDoMaterial, linkDoMaterial, pdfDoCorretor } from "@/lib/materialDoCorretor";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import {
  ABA_ARQUIVO, CATEGORIAS_ARQUIVO, FORMATOS_DOWNLOAD, OPCOES_CORTE_FINAL_S, OPCOES_RECORTE_RODAPE, ROTULO_FORMATO, ROTULO_TIPO_MATERIAL, TIPOS_ARQUIVO_ACEITOS, TIPOS_MATERIAL,
  bloqueadaPorNome, categoriaDoArquivo, recorteRodapeEfetivo, tipoPorNome, tituloPorNome,
  type CategoriaArquivo, type FormatoDownload, type TipoMaterial,
} from "@shared/materiais";
import { enviarParaCloudinary, mimeDoArquivo } from "@/lib/uploadCloudinary";
import LinkAgendamento from "@/components/LinkAgendamento";
import LinkInstagram from "@/components/LinkInstagram";
import CarimboPainel from "@/components/CarimboPainel";
import { aplicarCarimbo, assinaturaDoCarimbo, linhasCarimbo } from "@shared/carimbo";

type Destino = { propertyId?: number | null; empreendimentoSlug?: string | null };

export const ehImagem = (m: any) => (m.mime || "").startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(m.url);
export const ehVideo = (m: any) => (m.mime || "").startsWith("video/") || /\.(mp4|mov|webm)$/i.test(m.url);
export const tamanho = (b?: number | null) => (!b ? "" : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
/** Miniatura leve do Cloudinary para a grade (o original fica para baixar) */
export const miniatura = (url: string) => url.includes("/image/upload/") ? url.replace("/image/upload/", "/image/upload/c_limit,w_480,q_auto,f_auto/") : url;
export { capaDoVideo } from "@/lib/capaVideo";
import { capaDoVideo } from "@/lib/capaVideo";
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

/** Nome do arquivo que o servidor mandou (Content-Disposition) */
const nomeDoCabecalho = (r: Response, padrao: string) => {
  const cd = r.headers.get("content-disposition") || "";
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) || /filename="([^"]+)"/i.exec(cd);
  return m ? decodeURIComponent(m[1]) : padrao;
};

/**
 * Arquivo no formato escolhido, SEM o contato do escritório gravado na peça e COM os dados de quem divulga.
 * Imagem e vídeo: o servidor corta o rodapé/cartão final do escritório e põe a faixa e o cartão do corretor
 * (server/materialFormatado.ts; o vídeo leva alguns segundos e o navegador pergunta até ficar pronto).
 * PDF: rodapé do corretor em todas as páginas, no navegador. GIF segue o original.
 */
async function arquivoDoCorretor(m: any, c: Cartao, link: string, formato: FormatoDownload, aviso: (t: string) => void, linhasPdf?: { nome: string; detalhe: string }): Promise<{ blob: Blob; nome: string; carimbado: boolean }> {
  const nome = nomeArquivo(m);
  if (!ehImagem(m) && !ehVideo(m)) return { blob: await pdfDoCorretor(m.url, c, link, linhasPdf), nome, carimbado: true };
  if (/\.gif$/i.test(m.url)) {
    const blob = await baixarBlob(m);
    if (!blob) throw new Error("Não foi possível baixar o arquivo");
    return { blob, nome, carimbado: false };
  }
  const inicio = Date.now();
  for (;;) {
    const r = await fetch(`/api/materiais/${m.id}/arquivo?formato=${formato}`, { credentials: "include" });
    if (r.status === 202) {
      const s = Math.round((Date.now() - inicio) / 1000);
      if (s > 600) throw new Error("O vídeo está demorando demais. Tente de novo em alguns minutos.");
      aviso(`Montando o vídeo ${ROTULO_FORMATO[formato].rotulo} com os seus dados (${s}s)…`);
      await new Promise(ok => setTimeout(ok, 4000));
      continue;
    }
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `Não foi possível preparar o arquivo (${r.status})`);
    return { blob: await r.blob(), nome: nomeDoCabecalho(r, nome), carimbado: true };
  }
}

function CardMaterial({ m, onMudou, grupo, cartao, escritorio, linhasPdf, assinatura }: { m: any; onMudou: () => void; grupo: Grupo; cartao: Cartao; escritorio: boolean; linhasPdf?: { nome: string; detalhe: string }; assinatura?: string }) {
  const atualizar = trpc.materiais.update.useMutation({ onSuccess: onMudou, onError: e => toast.error(e.message) });
  const excluir = trpc.materiais.delete.useMutation({ onSuccess: () => { toast.success("Material removido do CRM"); onMudou(); }, onError: e => toast.error(e.message) });
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [pronto, setPronto] = useState<File | null>(null);
  const [formato, setFormato] = useState<FormatoDownload>(() => {
    try { const v = localStorage.getItem("materiais_formato"); return (FORMATOS_DOWNLOAD as readonly string[]).includes(v ?? "") ? (v as FormatoDownload) : "original"; } catch { return "original"; }
  });
  const escolherFormato = (f: FormatoDownload) => { setFormato(f); try { localStorage.setItem("materiais_formato", f); } catch { /* sem armazenamento */ } };
  const temFormato = (ehImagem(m) && !/\.gif$/i.test(m.url)) || ehVideo(m);
  const enviarPronto = async () => {
    if (!pronto) return;
    try { await navigator.share({ files: [pronto], text: legenda, title: m.titulo }); setPronto(null); } catch (e: any) { if (e?.name !== "AbortError") toast.error("Não foi possível compartilhar"); }
  };
  const link = linkDoMaterial(grupo, cartao.ref);
  const legenda = legendaDoMaterial(m.titulo, link, cartao, assinatura);

  const preparar = async () => {
    setOcupado("Colocando os seus dados no material…");
    try {
      const a = await arquivoDoCorretor(m, cartao, link, temFormato ? formato : "original", setOcupado, linhasPdf);
      if (!a.carimbado) toast.warning("GIF vai como está (sem a faixa); o texto leva os seus dados.");
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
    try { await navigator.clipboard.writeText(legenda); toast.success("Texto com o seu link e os seus dados copiado"); } catch { toast.error("Não foi possível copiar"); }
  };

  return (
    <div className={`rounded-lg border bg-card overflow-hidden flex flex-col ${m.liberado ? "border-border" : "border-danger-500/40"}`}>
      <a href={m.url} target="_blank" rel="noreferrer" className="block bg-black/40 aspect-[4/5] relative">
        {ehImagem(m) ? (
          <img src={miniatura(m.url)} alt={m.titulo} loading="lazy" className="w-full h-full object-contain" />
        ) : ehVideo(m) ? (
          <video src={m.url} poster={capaDoVideo(m.url, m.empreendimentoSlug)} preload="metadata" muted className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <FileText className="h-10 w-10" /><span className="text-xs">PDF</span>
          </div>
        )}
        {ehVideo(m) && <Video className="absolute top-2 left-2 h-4 w-4 text-white drop-shadow" />}
        {!m.liberado && (
          <span className="absolute top-2 right-2 rounded bg-danger-600 px-1.5 py-0.5 text-[10px] font-bold text-white flex items-center gap-1">
            <Lock className="h-3 w-3" /> NÃO DIVULGAR
          </span>
        )}
      </a>
      <div className="p-2 space-y-1.5 flex-1 flex flex-col">
        <p className="text-sm font-medium text-foreground leading-tight line-clamp-2" title={m.titulo}>{m.titulo}</p>
        {pronto && <Button size="sm" className="h-7 bg-ok-600 px-2 text-xs text-white hover:bg-ok-700" onClick={enviarPronto}><Share2 className="mr-1 h-3.5 w-3.5" /> Enviar agora</Button>}
        {ocupado && <p className="flex items-center gap-1 text-[11px] text-ok-300"><Loader2 className="h-3 w-3 animate-spin" /> {ocupado}</p>}
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
        {temFormato && (
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            Formato
            <select value={formato} onChange={e => escolherFormato(e.target.value as FormatoDownload)} title={ROTULO_FORMATO[formato].dica}
              className="h-7 flex-1 min-w-0 rounded border border-ok-500/40 bg-secondary/30 px-1 text-[11px] text-foreground">
              {FORMATOS_DOWNLOAD.map(f => <option key={f} value={f}>{ROTULO_FORMATO[f].rotulo}</option>)}
            </select>
          </label>
        )}
        {escritorio && temFormato && (
          <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground" title="Onde está o contato do escritório gravado na peça: sai do arquivo do corretor e entra o contato dele">
            <span>Contato do escritório:</span>
            <select value={recorteRodapeEfetivo(m)} onChange={e => atualizar.mutate({ id: m.id, recorteRodapePct: Number(e.target.value) })}
              className="h-6 rounded border border-border bg-secondary/30 px-1 text-[10px]">
              {OPCOES_RECORTE_RODAPE.map(p => <option key={p} value={p}>{p ? `rodapé ${p}%` : "sem rodapé"}</option>)}
            </select>
            {ehVideo(m) && (
              <select value={Math.round((m.corteFinalMs ?? 0) / 1000)} onChange={e => atualizar.mutate({ id: m.id, corteFinalMs: Number(e.target.value) * 1000 })}
                className="h-6 rounded border border-border bg-secondary/30 px-1 text-[10px]">
                {Array.from(new Set([...OPCOES_CORTE_FINAL_S, Math.round((m.corteFinalMs ?? 0) / 1000)])).sort((a, b) => a - b).map(sg => <option key={sg} value={sg}>{sg ? `cartão final ${sg}s` : "sem cartão final"}</option>)}
              </select>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-1 mt-auto pt-1">
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={baixar} disabled={!!ocupado} title={`Baixar ${temFormato ? ROTULO_FORMATO[formato].rotulo + " " : ""}com os seus dados (nome, CRECI, WhatsApp e QR do seu link), sem o contato do escritório`}><Download className="h-3.5 w-3.5 mr-1" />Baixar</Button>
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
            size="sm" variant="ghost" className="h-7 px-2 text-danger-400 hover:text-danger-300" title="Remover do CRM"
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
  // PDF é carimbado no navegador: usa o carimbo salvo (imagem e vídeo o servidor já carimba com ele)
  const carimbo = trpc.materiais.meuCarimbo.useQuery().data;
  // O carimbo salvo vale também para o PDF e para o texto que acompanha a mídia (legenda copiada/enviada)
  const comCarimbo = carimbo?.salvo ? aplicarCarimbo(cartao, cartao.instagramProprio, carimbo.carimbo) : null;
  const linhasPdf = (() => {
    if (!comCarimbo) return undefined;
    const l = linhasCarimbo(comCarimbo);
    return { nome: l.nome, detalhe: [l.detalhe, l.email].filter(Boolean).join("  ·  ") };
  })();
  const assinatura = comCarimbo ? assinaturaDoCarimbo(comCarimbo) : undefined;
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
      <CarimboPainel />
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
        <Button type="button" onClick={() => input.current?.click()} disabled={!!enviando || (!fixo && !destino)} className="bg-ok-600 hover:bg-ok-700 text-white">
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
            className={`whitespace-nowrap rounded-md px-1 py-1.5 text-xs sm:text-sm font-medium transition-colors ${aba === c ? "bg-ok-600 text-white" : "text-muted-foreground hover:text-foreground"}`}>
            {c === "video" && <Video className="hidden sm:inline h-3.5 w-3.5 mr-1 -mt-0.5" />}
            {c === "pdf" && <FileText className="hidden sm:inline h-3.5 w-3.5 mr-1 -mt-0.5" />}
            {rotulo} <span className="opacity-70">({contagem(c)})</span>
          </button>
        ))}
      </div>
      {(empreendimentoSlug || destino.startsWith("e:")) && <LinkAgendamento slug={empreendimentoSlug || destino.slice(2)} />}
      <LinkInstagram />
      {enviando && <p className="text-xs text-ok-300">{enviando}</p>}
      <p className="rounded-md border border-ok-500/30 bg-ok-500/5 px-3 py-2 text-xs text-ok-200">
        Tudo o que você baixa ou envia daqui sai <b>só com o seu contato</b>: o rodapé e o cartão final do escritório saem da peça e entram a sua faixa com os dados do <b>Meu carimbo</b> (nome, {cartao.creci ?? "CRECI"}, WhatsApp, Instagram, e-mail e QR do seu link) e, no vídeo, o seu cartão final. Escolha o <b>formato</b> em cada peça: Feed 4:5, Stories/Reels 9:16, Quadrado 1:1, WhatsApp (leve) ou Original. Vídeo leva alguns segundos para montar.
        {!cartao.creci && " Cadastre o seu CRECI em Meu cadastro para ele aparecer."}
      </p>
      <p className="text-[11px] text-muted-foreground">
        Imagem até {limites?.imagemMB ?? 10} MB, PDF até {limites?.pdfMB ?? 10} MB, vídeo até {limites?.videoMB ?? 100} MB (enviado em partes; deixe a tela aberta até 100%). Peças com "condições", "preço" ou "tabela" no nome entram bloqueadas. Os arquivos ficam com link público para poder compartilhar; não envie documentos internos.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando materiais…</p>}
      {!isLoading && grupos.length === 0 && <p className="text-sm text-muted-foreground">{aba ? `Nenhum material em ${ABA_ARQUIVO[aba].rotulo} ainda.` : "Nenhum material ainda."}</p>}
      {grupos.map(g => (
        <section key={g.chave} className="space-y-2">
          {!fixo && <h2 className="text-base font-semibold text-foreground">{g.nome} <span className="text-xs text-muted-foreground font-normal">· {g.itens.length}</span></h2>}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {g.itens.map((m: any) => <CardMaterial key={m.id} m={m} onMudou={recarregar} grupo={g} cartao={cartao} escritorio={escritorio} linhasPdf={linhasPdf} assinatura={assinatura} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
