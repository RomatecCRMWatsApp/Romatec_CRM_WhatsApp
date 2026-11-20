import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, Box, Camera, Clapperboard, Download, Home, ImagePlus, Loader2, Music, Pause, Play, RotateCcw, Share2, Sparkles, Trash2, Volume2, VolumeX, X,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useCartaoVendas } from "@/lib/cartaoVendas";
import {
  FORMATOS, MOVIMENTOS, TRANSICOES, montarRoteiro, movimentoAutomatico, nomeArquivo, transicaoVariada,
  type Formato, type Movimento, type Roteiro, type Transicao,
} from "@/lib/tour3d/roteiro";
import type { CenaTour3D, PosicaoLogo } from "@/lib/tour3d/cena";
import type { MapaProfundidade } from "@/lib/tour3d/profundidade";
import type { VideoGerado } from "@/lib/tour3d/video";
import { TRILHAS, type EscolhaTrilha, type EstiloTrilha } from "@/lib/tour3d/trilha";

/*
 * Tour 3D a partir de fotos: o corretor escolhe ou tira as fotos do imóvel, o sistema calcula a
 * profundidade de cada uma (IA no próprio aparelho), monta a cena 3D com movimento de câmera e
 * gera o vídeo (reel 9:16, apresentação 16:9 ou feed 1:1) com título, preço e contato.
 * Tudo roda no navegador: as fotos não são enviadas a nenhum servidor.
 */

const campo = "mt-1 block h-11 w-full rounded-md border border-border bg-background px-3 text-base md:text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring";
const rotulo = "text-xs font-medium text-muted-foreground";
const MAX_FOTOS = 20;

type MovimentoEscolha = Movimento | "auto";
type TransicaoEscolha = Transicao | "padrao";
type TransicaoGeral = Transicao | "variado";

/** Identificação profissional que sai carimbada no vídeo (fica salva no aparelho). */
interface Carimbo {
  corretor: string;
  creciF: string;
  escritorio: string;
  creciJ: string;
  telefone: string;
  cnpj: string;
  enderecoEscritorio: string;
  instagram: string;
  site: string;
  mostrar: { cnpj: boolean; enderecoEscritorio: boolean; instagram: boolean; whatsapp: boolean; site: boolean };
}
const CHAVE_CARIMBO = "romatec-tour3d-carimbo";
const CARIMBO_VAZIO: Carimbo = {
  corretor: "", creciF: "", escritorio: "", creciJ: "", telefone: "", cnpj: "", enderecoEscritorio: "", instagram: "", site: "",
  mostrar: { cnpj: false, enderecoEscritorio: false, instagram: false, whatsapp: true, site: false },
};
function carimboSalvo(): Carimbo | null {
  try {
    const t = localStorage.getItem(CHAVE_CARIMBO);
    if (!t) return null;
    const c = JSON.parse(t) as Partial<Carimbo>;
    return { ...CARIMBO_VAZIO, ...c, mostrar: { ...CARIMBO_VAZIO.mostrar, ...(c.mostrar ?? {}) } };
  } catch { return null; }
}
const digitos = (v: string) => v.replace(/\D/g, "");
const linkWhatsApp = (tel: string) => { const d = digitos(tel); return d.length >= 10 ? `wa.me/${d.startsWith("55") ? d : `55${d}`}` : ""; };

interface FotoLocal {
  id: string;
  url: string;
  imagem: ImageBitmap;
  movimento: MovimentoEscolha;
  transicao: TransicaoEscolha;
  comodo: string;
  profundidade?: MapaProfundidade;
}

/** Sugestões do campo "cômodo" (o corretor pode digitar qualquer nome). */
const COMODOS = [
  "Fachada", "Entrada", "Garagem", "Sala de estar", "Sala de jantar", "Sala de TV", "Cozinha", "Copa", "Área de serviço", "Lavanderia",
  "Quarto", "Quarto de casal", "Suíte", "Suíte master", "Closet", "Banheiro", "Banheiro social", "Lavabo", "Escritório", "Corredor",
  "Varanda", "Sacada", "Área gourmet", "Churrasqueira", "Piscina", "Quintal", "Jardim", "Área externa", "Vista", "Portaria", "Área de lazer",
];

const POSICOES_LOGO: { valor: PosicaoLogo; rotulo: string }[] = [
  { valor: "sup-dir", rotulo: "Canto superior direito" },
  { valor: "sup-esq", rotulo: "Canto superior esquerdo" },
  { valor: "inf-dir", rotulo: "Canto inferior direito" },
  { valor: "inf-esq", rotulo: "Canto inferior esquerdo" },
];
const CHAVE_LOGO = "romatec-tour3d-logo";
const CHAVE_POS_LOGO = "romatec-tour3d-logo-pos";

type Etapa = "editar" | "preparando" | "pronto" | "gerando" | "gerado";

const novoId = () => Math.random().toString(36).slice(2, 10);
const brl = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "";
};

async function bitmapDeBlob(b: Blob): Promise<ImageBitmap> {
  return createImageBitmap(b, { imageOrientation: "from-image" } as ImageBitmapOptions);
}

export default function Tour3DFotos() {
  const cartao = useCartaoVendas();
  const { data: imoveis } = trpc.properties.list.useQuery();
  const [fotos, setFotos] = useState<FotoLocal[]>([]);
  const [formato, setFormato] = useState<Formato>("reel");
  const [segundos, setSegundos] = useState(4);
  const [relevo, setRelevo] = useState(0.55);
  const [titulo, setTitulo] = useState("");
  const [subtitulo, setSubtitulo] = useState("");
  const [preco, setPreco] = useState("");
  const [carimbo, setCarimbo] = useState<Carimbo>(() => carimboSalvo() ?? CARIMBO_VAZIO);
  const [enderecoImovel, setEnderecoImovel] = useState("");
  const [transicaoGeral, setTransicaoGeral] = useState<TransicaoGeral>("variado");
  const mudarCarimbo = (campo: keyof Omit<Carimbo, "mostrar">, valor: string) => setCarimbo(c => ({ ...c, [campo]: valor }));
  const mostrarCampo = (campo: keyof Carimbo["mostrar"], v: boolean) => setCarimbo(c => ({ ...c, mostrar: { ...c.mostrar, [campo]: v } }));
  const [chamada, setChamada] = useState("Agende sua visita");
  const [cartaoFinal, setCartaoFinal] = useState(true);
  const [etapa, setEtapa] = useState<Etapa>("editar");
  const [progresso, setProgresso] = useState({ texto: "", pct: 0 });
  const [semIa, setSemIa] = useState(false);
  const [tocando, setTocando] = useState(true);
  const [video, setVideo] = useState<(VideoGerado & { url: string; nome: string }) | null>(null);
  const [imovelId, setImovelId] = useState("");
  const [carregandoImovel, setCarregandoImovel] = useState(false);
  const [trilhaEscolha, setTrilhaEscolha] = useState<EscolhaTrilha>("suave");
  const [arquivoMusica, setArquivoMusica] = useState<File | null>(null);
  const [volume, setVolume] = useState(0.8);
  const [somPrevia, setSomPrevia] = useState(false);
  const [logo, setLogo] = useState<{ url: string; imagem: ImageBitmap } | null>(null);
  const [posLogo, setPosLogo] = useState<PosicaoLogo>(() => {
    try { return (localStorage.getItem(CHAVE_POS_LOGO) as PosicaoLogo) || "sup-dir"; } catch { return "sup-dir"; }
  });

  const palco = useRef<HTMLDivElement>(null);
  const cenaRef = useRef<CenaTour3D | null>(null);
  const roteiroRef = useRef<Roteiro | null>(null);
  const cancelar = useRef(false);
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const tocandoRef = useRef(true);
  const musica = useRef<HTMLInputElement>(null);
  const inputLogo = useRef<HTMLInputElement>(null);
  const trilhaRef = useRef<AudioBuffer | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const fonteAudio = useRef<AudioBufferSourceNode | null>(null);
  const ganhoAudio = useRef<GainNode | null>(null);
  const reiniciarPrevia = useRef(false);
  tocandoRef.current = tocando;

  // na primeira vez, o carimbo vem do cartão de vendas (nome, CRECI, telefone, Instagram); depois, do que foi salvo
  useEffect(() => {
    setCarimbo(c => ({
      ...c,
      corretor: c.corretor || cartao.nome || "",
      creciF: c.creciF || cartao.creci || "",
      telefone: c.telefone || cartao.telefones?.[0] || "",
      instagram: c.instagram || cartao.instagramProprio || "",
    }));
  }, [cartao.nome, cartao.creci, cartao.telefones, cartao.instagramProprio]);
  useEffect(() => { try { localStorage.setItem(CHAVE_CARIMBO, JSON.stringify(carimbo)); } catch { /* sem armazenamento */ } }, [carimbo]);

  // libera memória ao sair
  useEffect(() => () => {
    cancelar.current = true;
    cenaRef.current?.destruir();
  }, []);

  const roteiroAtual = useMemo(() => {
    const { largura, altura } = FORMATOS[formato];
    const aspQ = largura / altura;
    return montarRoteiro(
      fotos.map((f, i) => ({
        duracao: segundos,
        movimento: f.movimento === "auto" ? movimentoAutomatico(i, f.imagem.width / f.imagem.height, aspQ) : f.movimento,
        transicao: i === 0 ? undefined : f.transicao !== "padrao" ? f.transicao : transicaoGeral === "variado" ? transicaoVariada(i - 1) : transicaoGeral,
      })),
      cartaoFinal,
    );
  }, [fotos, formato, segundos, cartaoFinal, transicaoGeral]);

  const legendas = () => ({
    titulo: titulo.trim() || "Imóvel à venda",
    subtitulo: subtitulo.trim() || undefined,
    preco: preco.trim() || undefined,
    endereco: enderecoImovel.trim() || undefined,
    corretor: carimbo.corretor.trim() || undefined,
    creciF: carimbo.creciF.trim() || undefined,
    escritorio: carimbo.escritorio.trim() || undefined,
    creciJ: carimbo.creciJ.trim() || undefined,
    telefone: carimbo.telefone.trim() || undefined,
    cnpj: carimbo.mostrar.cnpj ? carimbo.cnpj.trim() || undefined : undefined,
    enderecoEscritorio: carimbo.mostrar.enderecoEscritorio ? carimbo.enderecoEscritorio.trim() || undefined : undefined,
    instagram: carimbo.mostrar.instagram ? carimbo.instagram.trim().replace(/^@/, "") || undefined : undefined,
    site: [carimbo.mostrar.whatsapp ? linkWhatsApp(carimbo.telefone) : "", carimbo.mostrar.site ? carimbo.site.trim().replace(/^https?:\/\//, "") : ""].filter(Boolean).join("   ") || undefined,
    chamada: chamada.trim() || undefined,
    selo: "Tour 3D",
    logo: logo?.imagem,
    logoPosicao: posLogo,
  });

  // o logo fica guardado neste aparelho para os próximos vídeos
  useEffect(() => {
    let url: string | null = null;
    try { url = localStorage.getItem(CHAVE_LOGO); } catch { /* sem armazenamento */ }
    if (!url) return;
    fetch(url).then(r => r.blob()).then(b => createImageBitmap(b)).then(imagem => setLogo({ url: url!, imagem })).catch(() => undefined);
  }, []);
  useEffect(() => { try { localStorage.setItem(CHAVE_POS_LOGO, posLogo); } catch { /* */ } }, [posLogo]);

  async function escolherLogo(arq: File | undefined) {
    if (!arq) return;
    if (!arq.type.startsWith("image/")) { toast.error("Escolha uma imagem (PNG, JPG ou WebP)."); return; }
    try {
      const original = await createImageBitmap(arq);
      // reduz para no máximo 600 px e guarda como PNG (mantém o fundo transparente)
      const esc = Math.min(1, 600 / Math.max(original.width, original.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(original.width * esc));
      c.height = Math.max(1, Math.round(original.height * esc));
      c.getContext("2d")!.drawImage(original, 0, 0, c.width, c.height);
      original.close();
      const url = c.toDataURL("image/png");
      const imagem = await createImageBitmap(c);
      setLogo({ url, imagem });
      try { localStorage.setItem(CHAVE_LOGO, url); } catch { toast.info("Logo aplicado, mas não deu para guardar neste aparelho para a próxima vez."); }
    } catch {
      toast.error("Não consegui abrir essa imagem.");
    }
  }
  const removerLogo = () => {
    setLogo(null);
    try { localStorage.removeItem(CHAVE_LOGO); } catch { /* */ }
  };

  const pararSom = () => {
    try { fonteAudio.current?.stop(); } catch { /* já parado */ }
    fonteAudio.current = null;
    setSomPrevia(false);
  };

  /** Liga o som da prévia (precisa de toque do usuário) e recomeça do início, junto com a música. */
  const ligarSom = () => {
    const buf = trilhaRef.current, r = roteiroRef.current;
    if (!buf || !r) return;
    if (!audioCtx.current) audioCtx.current = new AudioContext();
    const ctx = audioCtx.current;
    void ctx.resume();
    try { fonteAudio.current?.stop(); } catch { /* já parado */ }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopEnd = Math.min(buf.duration, r.duracaoTotal);
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(ctx.destination);
    src.start();
    fonteAudio.current = src;
    ganhoAudio.current = g;
    reiniciarPrevia.current = true;
    setTocando(true);
    setSomPrevia(true);
  };

  useEffect(() => { if (ganhoAudio.current) ganhoAudio.current.gain.value = volume; }, [volume]);
  useEffect(() => () => { try { fonteAudio.current?.stop(); } catch { /* */ } void audioCtx.current?.close(); }, []);

  async function montarTrilha(duracao: number): Promise<AudioBuffer | null> {
    if (trilhaEscolha === "nenhuma") return null;
    const t = await import("@/lib/tour3d/trilha");
    if (trilhaEscolha === "arquivo") {
      if (!arquivoMusica) return null;
      try { return await t.trilhaDeArquivo(arquivoMusica, duracao); } catch {
        toast.error("Não consegui ler esse arquivo de música. Use MP3, M4A ou WAV.");
        return null;
      }
    }
    return t.gerarTrilha(trilhaEscolha, duracao);
  }

  const voltarParaEdicao = () => {
    pararSom();
    cancelar.current = true;
    cenaRef.current?.destruir();
    cenaRef.current = null;
    if (video) URL.revokeObjectURL(video.url);
    setVideo(null);
    setEtapa("editar");
  };

  async function adicionarArquivos(lista: FileList | null) {
    if (!lista?.length) return;
    const espaco = MAX_FOTOS - fotos.length;
    const arquivos = Array.from(lista).filter(f => f.type.startsWith("image/")).slice(0, Math.max(0, espaco));
    if (lista.length > espaco) toast.warning(`Use até ${MAX_FOTOS} fotos por vídeo.`);
    const novas: FotoLocal[] = [];
    for (const a of arquivos) {
      try {
        const imagem = await bitmapDeBlob(a);
        novas.push({ id: novoId(), url: URL.createObjectURL(a), imagem, movimento: "auto", transicao: "padrao", comodo: "" });
      } catch {
        toast.error(`Não consegui abrir ${a.name}.`);
      }
    }
    setFotos(f => [...f, ...novas]);
  }

  async function usarImovel(id: string) {
    setImovelId(id);
    const im = imoveis?.find(p => String(p.id) === id);
    if (!im) return;
    setTitulo(im.denomination ?? "");
    setSubtitulo([im.city, im.state].filter(Boolean).join(" - "));
    setPreco(brl(im.offerPrice ?? im.price));
    const urls = (im.images ?? []).slice(0, MAX_FOTOS - fotos.length);
    if (!urls.length) { toast.info("Esse imóvel não tem fotos cadastradas. Adicione pela câmera ou galeria."); return; }
    setCarregandoImovel(true);
    const novas: FotoLocal[] = [];
    let falhas = 0;
    for (const u of urls) {
      try {
        const r = await fetch(u, { credentials: "include" });
        if (!r.ok) throw new Error(String(r.status));
        const b = await r.blob();
        novas.push({ id: novoId(), url: URL.createObjectURL(b), imagem: await bitmapDeBlob(b), movimento: "auto", transicao: "padrao", comodo: "" });
      } catch { falhas++; }
    }
    setCarregandoImovel(false);
    setFotos(f => [...f, ...novas]);
    if (falhas) toast.warning(`${falhas} foto(s) do imóvel não puderam ser abertas (link externo). Envie-as pela galeria.`);
    else toast.success(`${novas.length} foto(s) do imóvel adicionadas.`);
  }

  const mover = (i: number, d: -1 | 1) => setFotos(f => {
    const j = i + d;
    if (j < 0 || j >= f.length) return f;
    const c = [...f];
    [c[i], c[j]] = [c[j], c[i]];
    return c;
  });
  const remover = (id: string) => setFotos(f => {
    const alvo = f.find(x => x.id === id);
    if (alvo) { URL.revokeObjectURL(alvo.url); alvo.imagem.close(); }
    return f.filter(x => x.id !== id);
  });
  const trocarMovimento = (id: string, m: MovimentoEscolha) => setFotos(f => f.map(x => (x.id === id ? { ...x, movimento: m } : x)));
  const trocarTransicao = (id: string, t: TransicaoEscolha) => setFotos(f => f.map(x => (x.id === id ? { ...x, transicao: t } : x)));
  const trocarComodo = (id: string, comodo: string) => setFotos(f => f.map(x => (x.id === id ? { ...x, comodo } : x)));

  async function preparar() {
    if (fotos.length < 1) { toast.error("Adicione pelo menos uma foto."); return; }
    if (!carimbo.creciF.trim() && !carimbo.creciJ.trim()) toast.warning("Anúncio de imóvel deve trazer o CRECI. Preencha o CRECI-F ou o CRECI-J no carimbo.");
    cancelar.current = false;
    setEtapa("preparando");
    try {
      const { mapaDeProfundidade, prepararModelo } = await import("@/lib/tour3d/profundidade");
      let usarIa = !semIa;
      if (usarIa && fotos.some(f => !f.profundidade || f.profundidade.origem !== "ia")) {
        setProgresso({ texto: "Baixando a inteligência que enxerga a profundidade (só na primeira vez)…", pct: 0 });
        usarIa = await prepararModelo(pct => setProgresso({ texto: "Baixando a inteligência que enxerga a profundidade (só na primeira vez)…", pct }));
        if (!usarIa) toast.warning("Não deu para carregar a IA neste aparelho. O vídeo sai com profundidade estimada.");
      }
      const comProf: FotoLocal[] = [];
      for (let i = 0; i < fotos.length; i++) {
        if (cancelar.current) return;
        const f = fotos[i];
        setProgresso({ texto: `Calculando a profundidade da foto ${i + 1} de ${fotos.length}…`, pct: Math.round((i / fotos.length) * 100) });
        const reaproveita = f.profundidade && (f.profundidade.origem === "ia" || !usarIa);
        const profundidade = reaproveita ? f.profundidade! : await mapaDeProfundidade(f.imagem, usarIa);
        comProf.push({ ...f, profundidade });
      }
      setFotos(comProf);
      setProgresso({ texto: "Montando a cena 3D…", pct: 100 });
      const { CenaTour3D } = await import("@/lib/tour3d/cena");
      cenaRef.current?.destruir();
      const { largura, altura } = FORMATOS[formato];
      const cena = new CenaTour3D(largura, altura, { relevo, corDestaque: "#d4b25a", corFundo: "#0b1f14" }, legendas());
      const r = roteiroAtual;
      cena.carregar(comProf.map((f, i) => ({ imagem: f.imagem, profundidade: f.profundidade!, movimento: r.cenas[i].movimento, comodo: f.comodo })));
      cenaRef.current = cena;
      roteiroRef.current = r;
      if (trilhaEscolha !== "nenhuma") setProgresso({ texto: "Compondo a música de fundo…", pct: 100 });
      trilhaRef.current = await montarTrilha(r.duracaoTotal);
      setTocando(true);
      setEtapa("pronto");
    } catch (e) {
      console.error(e);
      toast.error("Não consegui montar o tour 3D neste aparelho. Tente com menos fotos ou outro navegador.");
      setEtapa("editar");
    }
  }

  // prévia em loop dentro do palco
  useEffect(() => {
    if (etapa !== "pronto" || !cenaRef.current || !palco.current) return;
    const cena = cenaRef.current;
    const r = roteiroRef.current!;
    const el = cena.saida;
    el.className = "h-full w-full object-contain";
    el.setAttribute("aria-label", "Prévia do tour 3D");
    palco.current.replaceChildren(el);
    let raf = 0;
    let inicio = performance.now();
    let pausadoEm = 0;
    const passo = (agora: number) => {
      if (reiniciarPrevia.current) { reiniciarPrevia.current = false; inicio = agora; }
      if (tocandoRef.current) {
        const t = ((agora - inicio) / 1000) % r.duracaoTotal;
        pausadoEm = t;
        cena.desenhar(r, t);
      } else {
        inicio = agora - pausadoEm * 1000;
      }
      raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [etapa]);

  async function gerar() {
    const cena = cenaRef.current, r = roteiroRef.current;
    if (!cena || !r) return;
    cancelar.current = false;
    pararSom();
    setEtapa("gerando");
    setProgresso({ texto: "Gerando o vídeo…", pct: 0 });
    try {
      const { gerarVideo } = await import("@/lib/tour3d/video");
      const { comVolume } = await import("@/lib/tour3d/trilha");
      const trilha = trilhaRef.current ? comVolume(trilhaRef.current, volume) : null;
      const { precisaAjuste, ajustarParaWhatsApp } = await import("@/lib/tour3d/video");
      let v = await gerarVideo(cena, r, pct => setProgresso({ texto: "Gerando o vídeo…", pct }), () => cancelar.current, trilha);
      if (precisaAjuste(v)) {
        setProgresso({ texto: "Ajustando o som para tocar no WhatsApp…", pct: 100 });
        try { v = await ajustarParaWhatsApp(v); } catch (e) {
          console.error(e);
          toast.warning("Não consegui ajustar o som para o WhatsApp agora. O vídeo foi gerado, mas a música pode não tocar lá.");
        }
      }
      const nome = nomeArquivo(titulo, formato, v.extensao);
      setVideo({ ...v, url: URL.createObjectURL(v.blob), nome });
      setEtapa("gerado");
      if (v.semAudio) toast.warning("Vídeo pronto, mas este navegador não conseguiu gravar a música. Use o Chrome ou adicione a trilha no Instagram.");
      else toast.success("Vídeo pronto!");
    } catch (e) {
      if ((e as Error)?.message !== "cancelado") {
        console.error(e);
        toast.error("Não consegui gerar o vídeo. Tente novamente com menos fotos.");
      }
      setEtapa("pronto");
    }
  }

  const baixar = () => {
    if (!video) return;
    const a = document.createElement("a");
    a.href = video.url;
    a.download = video.nome;
    a.click();
  };

  const compartilhar = async () => {
    if (!video) return;
    const arquivo = new File([video.blob], video.nome, { type: video.mime });
    const ig = carimbo.instagram.trim().replace(/^@/, "");
    const texto = [
      titulo, enderecoImovel || subtitulo, preco,
      [carimbo.corretor, carimbo.creciF].filter(Boolean).join(" · "),
      [carimbo.escritorio, carimbo.creciJ].filter(Boolean).join(" · "),
      carimbo.telefone && linkWhatsApp(carimbo.telefone) ? `WhatsApp: https://${linkWhatsApp(carimbo.telefone)}` : carimbo.telefone,
      ig ? `Instagram: https://instagram.com/${ig}` : "",
      carimbo.site.trim(),
    ].filter(Boolean).join("\n");
    if (navigator.canShare?.({ files: [arquivo] })) {
      try { await navigator.share({ files: [arquivo], title: titulo || "Tour 3D", text: texto }); } catch { /* cancelado */ }
    } else {
      baixar();
      toast.info("Seu navegador não envia vídeo direto. O arquivo foi baixado: envie pelo WhatsApp ou Instagram.");
    }
  };

  const ocupado = etapa === "preparando" || etapa === "gerando";
  const { largura, altura } = FORMATOS[formato];

  return (
    <div>
      <PageHeader icone={Box} titulo="Tour 3D a partir de fotos" subtitulo="Tire ou escolha fotos do imóvel e o sistema cria um vídeo com movimento em 3D para reels, status e apresentação ao cliente" />
      <div className="mx-auto grid max-w-[1400px] gap-6 px-4 pb-10 md:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="space-y-6">
          {/* 1. Fotos */}
          <section className="rounded-xl border border-border bg-card p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">1. Fotos do imóvel</h2>
              <span className="text-xs text-muted-foreground">{fotos.length} de {MAX_FOTOS}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Fotos de dentro e de fora, bem iluminadas, com o celular deitado ou em pé. Cada foto vira uma cena de alguns segundos.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={() => camera.current?.click()} disabled={ocupado || etapa !== "editar"}><Camera className="mr-2 h-4 w-4" aria-hidden />Tirar foto</Button>
              <Button type="button" variant="outline" onClick={() => galeria.current?.click()} disabled={ocupado || etapa !== "editar"}><ImagePlus className="mr-2 h-4 w-4" aria-hidden />Escolher da galeria</Button>
              <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => { void adicionarArquivos(e.target.files); e.target.value = ""; }} />
              <input ref={galeria} type="file" accept="image/*" multiple className="sr-only" onChange={e => { void adicionarArquivos(e.target.files); e.target.value = ""; }} />
            </div>
            {!!imoveis?.length && (
              <label className="mt-4 block max-w-md">
                <span className={rotulo}>Ou usar as fotos de um imóvel cadastrado</span>
                <span className="relative block">
                  <select className={campo} value={imovelId} disabled={ocupado || etapa !== "editar" || carregandoImovel} onChange={e => e.target.value && void usarImovel(e.target.value)}>
                    <option value="">Selecione o imóvel…</option>
                    {imoveis.map(p => <option key={p.id} value={p.id}>{p.denomination}{p.city ? ` — ${p.city}` : ""}</option>)}
                  </select>
                  {carregandoImovel && <Loader2 className="absolute right-9 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Carregando fotos" />}
                </span>
              </label>
            )}
            {fotos.length > 0 && (
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {fotos.map((f, i) => (
                  <li key={f.id} className="overflow-hidden rounded-lg border border-border bg-background">
                    <div className="relative aspect-[4/3] bg-muted">
                      <img src={f.url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                      <span className="absolute left-2 top-2 rounded-md bg-black/65 px-2 py-0.5 text-xs font-semibold text-white">{i + 1}</span>
                      {f.profundidade?.origem === "ia" && <span className="absolute right-2 top-2 rounded-md bg-black/65 px-2 py-0.5 text-[11px] text-white">3D pronto</span>}
                    </div>
                    <div className="space-y-2 p-2">
                      <input
                        list="tour3d-comodos"
                        aria-label={`Cômodo da foto ${i + 1}`}
                        placeholder="Cômodo (ex.: Cozinha)"
                        maxLength={30}
                        className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                        value={f.comodo}
                        disabled={etapa !== "editar"}
                        onChange={e => trocarComodo(f.id, e.target.value)}
                      />
                      <select aria-label={`Movimento da foto ${i + 1}`} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={f.movimento} disabled={etapa !== "editar"} onChange={e => trocarMovimento(f.id, e.target.value as MovimentoEscolha)}>
                        <option value="auto">Automático</option>
                        {(Object.keys(MOVIMENTOS) as Movimento[]).map(m => <option key={m} value={m}>{MOVIMENTOS[m]}</option>)}
                      </select>
                      {i > 0 && (
                        <select aria-label={`Transição de entrada da foto ${i + 1}`} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={f.transicao} disabled={etapa !== "editar"} onChange={e => trocarTransicao(f.id, e.target.value as TransicaoEscolha)}>
                          <option value="padrao">Transição padrão</option>
                          {(Object.keys(TRANSICOES) as Transicao[]).map(t => <option key={t} value={t}>{TRANSICOES[t]}</option>)}
                        </select>
                      )}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex gap-1">
                          <Button type="button" size="icon" variant="ghost" className="h-9 w-9" aria-label="Mover para antes" disabled={i === 0 || etapa !== "editar"} onClick={() => mover(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                          <Button type="button" size="icon" variant="ghost" className="h-9 w-9" aria-label="Mover para depois" disabled={i === fotos.length - 1 || etapa !== "editar"} onClick={() => mover(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                        </div>
                        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-destructive" aria-label={`Remover foto ${i + 1}`} disabled={etapa !== "editar"} onClick={() => remover(f.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <datalist id="tour3d-comodos">{COMODOS.map(c => <option key={c} value={c} />)}</datalist>
          </section>

          {/* 2. Textos e formato */}
          <section className="rounded-xl border border-border bg-card p-4 md:p-5">
            <h2 className="text-base font-semibold text-foreground">2. Textos e formato</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className={rotulo}>Título</span><input className={campo} value={titulo} maxLength={70} onChange={e => setTitulo(e.target.value)} placeholder="Ex.: Casa com 3 quartos no Jardim Glória" disabled={etapa !== "editar"} /></label>
              <label><span className={rotulo}>Bairro / cidade</span><input className={campo} value={subtitulo} maxLength={60} onChange={e => setSubtitulo(e.target.value)} placeholder="Ex.: Açailândia - MA" disabled={etapa !== "editar"} /></label>
              <label><span className={rotulo}>Preço (opcional)</span><input className={campo} value={preco} maxLength={30} onChange={e => setPreco(e.target.value)} placeholder="Ex.: R$ 350.000" disabled={etapa !== "editar"} /></label>
              <label className="sm:col-span-2"><span className={rotulo}>Endereço do imóvel (aparece no final)</span><input className={campo} value={enderecoImovel} maxLength={90} onChange={e => setEnderecoImovel(e.target.value)} placeholder="Ex.: Rua das Flores, 120 — Vila São Francisco" disabled={etapa !== "editar"} /></label>
              <label className="sm:col-span-2"><span className={rotulo}>Frase do final</span><input className={campo} value={chamada} maxLength={40} onChange={e => setChamada(e.target.value)} disabled={etapa !== "editar" || !cartaoFinal} /></label>
            </div>
            <fieldset className="mt-5" disabled={etapa !== "editar"}>
              <legend className={rotulo}>Formato do vídeo</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {(Object.keys(FORMATOS) as Formato[]).map(f => (
                  <label key={f} className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${formato === f ? "border-[var(--rt-gold)] bg-[var(--rt-gold)]/10" : "border-border hover:bg-muted/50"}`}>
                    <input type="radio" name="formato" value={f} checked={formato === f} onChange={() => setFormato(f)} className="sr-only" />
                    <span className="block font-semibold text-foreground">{FORMATOS[f].rotulo}</span>
                    <span className="block text-xs text-muted-foreground">{FORMATOS[f].uso}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label><span className={rotulo}>Tempo de cada foto: {segundos} s</span>
                <input type="range" min={3} max={7} step={0.5} value={segundos} onChange={e => setSegundos(Number(e.target.value))} disabled={etapa !== "editar"} className="mt-3 w-full accent-[var(--rt-gold)]" />
              </label>
              <label><span className={rotulo}>Intensidade do 3D: {relevo < 0.4 ? "suave" : relevo < 0.75 ? "média" : "forte"}</span>
                <input type="range" min={0.2} max={1} step={0.05} value={relevo} onChange={e => setRelevo(Number(e.target.value))} disabled={etapa !== "editar"} className="mt-3 w-full accent-[var(--rt-gold)]" />
              </label>
            </div>
            <label className="mt-5 block max-w-sm">
              <span className={rotulo}>Transição entre as fotos</span>
              <select className={campo} value={transicaoGeral} disabled={etapa !== "editar"} onChange={e => setTransicaoGeral(e.target.value as TransicaoGeral)}>
                <option value="variado">Variado (um efeito diferente em cada troca)</option>
                {(Object.keys(TRANSICOES) as Transicao[]).map(t => <option key={t} value={t}>{TRANSICOES[t]}</option>)}
              </select>
              <span className="mt-1 block text-xs text-muted-foreground">Cada foto também pode ter a sua, no quadro da foto.</span>
            </label>
            <fieldset className="mt-5" disabled={etapa !== "editar"}>
              <legend className={rotulo}>Logo do escritório</legend>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="flex h-16 w-28 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-[repeating-conic-gradient(#ffffff14_0_25%,transparent_0_50%)] bg-[length:12px_12px]">
                  {logo ? <img src={logo.url} alt="Logo do escritório" className="max-h-14 max-w-24 object-contain" /> : <span className="px-2 text-center text-[11px] text-muted-foreground">sem logo</span>}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => inputLogo.current?.click()}><ImagePlus className="mr-2 h-4 w-4" aria-hidden />{logo ? "Trocar logo" : "Enviar logo"}</Button>
                    {logo && <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={removerLogo}><Trash2 className="mr-2 h-4 w-4" aria-hidden />Remover</Button>}
                  </div>
                  <p className="text-xs text-muted-foreground">PNG com fundo transparente fica melhor. Fica salvo neste aparelho para os próximos vídeos.</p>
                </div>
                <input ref={inputLogo} type="file" accept="image/*" className="sr-only" onChange={e => { void escolherLogo(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
              {logo && (
                <label className="mt-3 block max-w-xs">
                  <span className={rotulo}>Posição do logo</span>
                  <select className={campo} value={posLogo} onChange={e => setPosLogo(e.target.value as PosicaoLogo)}>
                    {POSICOES_LOGO.map(p => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
                  </select>
                </label>
              )}
            </fieldset>
            <fieldset className="mt-5" disabled={etapa !== "editar"}>
              <legend className={`${rotulo} flex items-center gap-1`}><Music className="h-3.5 w-3.5" aria-hidden />Música de fundo</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {(Object.keys(TRILHAS) as EstiloTrilha[]).map(t => (
                  <label key={t} className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${trilhaEscolha === t ? "border-[var(--rt-gold)] bg-[var(--rt-gold)]/10" : "border-border hover:bg-muted/50"}`}>
                    <input type="radio" name="trilha" value={t} checked={trilhaEscolha === t} onChange={() => setTrilhaEscolha(t)} className="sr-only" />
                    <span className="block font-semibold text-foreground">{TRILHAS[t].rotulo}</span>
                    <span className="block text-xs text-muted-foreground">{TRILHAS[t].descricao}</span>
                  </label>
                ))}
                <label className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${trilhaEscolha === "arquivo" ? "border-[var(--rt-gold)] bg-[var(--rt-gold)]/10" : "border-border hover:bg-muted/50"}`}>
                  <input type="radio" name="trilha" value="arquivo" checked={trilhaEscolha === "arquivo"} onChange={() => { setTrilhaEscolha("arquivo"); if (!arquivoMusica) musica.current?.click(); }} className="sr-only" />
                  <span className="block font-semibold text-foreground">Minha música</span>
                  <span className="block truncate text-xs text-muted-foreground">{arquivoMusica ? arquivoMusica.name : "Escolha um arquivo do aparelho"}</span>
                </label>
                <label className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${trilhaEscolha === "nenhuma" ? "border-[var(--rt-gold)] bg-[var(--rt-gold)]/10" : "border-border hover:bg-muted/50"}`}>
                  <input type="radio" name="trilha" value="nenhuma" checked={trilhaEscolha === "nenhuma"} onChange={() => setTrilhaEscolha("nenhuma")} className="sr-only" />
                  <span className="block font-semibold text-foreground">Sem música</span>
                  <span className="block text-xs text-muted-foreground">Vídeo mudo</span>
                </label>
              </div>
              <input ref={musica} type="file" accept="audio/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) { setArquivoMusica(f); setTrilhaEscolha("arquivo"); } e.target.value = ""; }} />
              {trilhaEscolha === "arquivo" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  <button type="button" className="font-semibold text-[var(--rt-gold-light)] underline-offset-2 hover:underline" onClick={() => musica.current?.click()}>{arquivoMusica ? "Trocar música" : "Escolher música"}</button>
                  {" "}— use só música que você tem direito de usar; o Instagram pode bloquear vídeo com música protegida. As trilhas Suave, Animada e Elegante são criadas pelo sistema e são livres.
                </p>
              )}
            </fieldset>
            {trilhaEscolha !== "nenhuma" && (
              <label className="mt-4 block max-w-xs"><span className={rotulo}>Volume da música: {Math.round(volume * 100)}%</span>
                <input type="range" min={0.1} max={1} step={0.05} value={volume} onChange={e => setVolume(Number(e.target.value))} className="mt-3 w-full accent-[var(--rt-gold)]" />
              </label>
            )}
            <div className="mt-4 flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={cartaoFinal} onChange={e => setCartaoFinal(e.target.checked)} disabled={etapa !== "editar"} className="h-4 w-4" />Cartão final com contato</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={semIa} onChange={e => setSemIa(e.target.checked)} disabled={etapa !== "editar"} className="h-4 w-4" />Modo leve (sem IA — para aparelho lento ou sem internet)</label>
            </div>
          </section>

          {/* Carimbo profissional */}
          <section className="rounded-xl border border-border bg-card p-4 md:p-5">
            <h2 className="text-base font-semibold text-foreground">Carimbo profissional</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sai no rodapé de todas as cenas e completo no final. Anúncio de imóvel deve trazer o CRECI. Fica salvo neste aparelho.</p>
            <fieldset className="mt-4 grid gap-4 sm:grid-cols-2" disabled={etapa !== "editar"}>
              <label><span className={rotulo}>Nome do corretor</span><input className={campo} value={carimbo.corretor} maxLength={60} onChange={e => mudarCarimbo("corretor", e.target.value)} /></label>
              <label><span className={rotulo}>CRECI-F (pessoa física)</span><input className={campo} value={carimbo.creciF} maxLength={30} onChange={e => mudarCarimbo("creciF", e.target.value)} placeholder="Ex.: CRECI/MA F-4.705" /></label>
              <label><span className={rotulo}>Imobiliária / escritório</span><input className={campo} value={carimbo.escritorio} maxLength={60} onChange={e => mudarCarimbo("escritorio", e.target.value)} placeholder="Ex.: Romatec Consultoria Imobiliária" /></label>
              <label><span className={rotulo}>CRECI-J (pessoa jurídica)</span><input className={campo} value={carimbo.creciJ} maxLength={30} onChange={e => mudarCarimbo("creciJ", e.target.value)} placeholder="Ex.: CRECI/MA J-1.234" /></label>
              <label><span className={rotulo}>Telefone / WhatsApp</span><input className={campo} value={carimbo.telefone} maxLength={30} onChange={e => mudarCarimbo("telefone", e.target.value)} /></label>
            </fieldset>
            <p className={`${rotulo} mt-5`}>Opcionais (aparecem no final do vídeo e na mensagem de envio)</p>
            <fieldset className="mt-2 space-y-3" disabled={etapa !== "editar"}>
              {([
                ["cnpj", "CNPJ", "cnpj", "00.000.000/0001-00", 20],
                ["enderecoEscritorio", "Endereço do escritório", "enderecoEscritorio", "Rua, número — bairro, cidade", 90],
                ["instagram", "Instagram", "instagram", "@seuperfil", 40],
                ["site", "Site ou outro link", "site", "www.seusite.com.br", 80],
              ] as const).map(([chave, rotuloCampo, campoTexto, exemplo, max]) => (
                <div key={chave} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="flex w-52 shrink-0 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={carimbo.mostrar[chave]} onChange={e => mostrarCampo(chave, e.target.checked)} />{rotuloCampo}</label>
                  {carimbo.mostrar[chave] && <input aria-label={rotuloCampo} className={`${campo} mt-0 sm:flex-1`} value={carimbo[campoTexto]} maxLength={max} placeholder={exemplo} onChange={e => mudarCarimbo(campoTexto, e.target.value)} />}
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={carimbo.mostrar.whatsapp} onChange={e => mostrarCampo("whatsapp", e.target.checked)} />Link do WhatsApp {linkWhatsApp(carimbo.telefone) && <span className="text-muted-foreground">({linkWhatsApp(carimbo.telefone)})</span>}</label>
            </fieldset>
          </section>
        </div>

        {/* 3. Prévia e vídeo */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-xl border border-border bg-card p-4 md:p-5">
            <h2 className="text-base font-semibold text-foreground">3. Prévia e vídeo</h2>
            <div className="mx-auto mt-4 overflow-hidden rounded-lg bg-black" style={{ aspectRatio: `${largura} / ${altura}`, maxHeight: "62vh" }}>
              {etapa === "gerado" && video ? (
                <video src={video.url} controls playsInline loop className="h-full w-full object-contain" aria-label="Vídeo gerado" />
              ) : etapa === "pronto" || etapa === "gerando" ? (
                <div ref={palco} className="h-full w-full" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-white/80">
                  {ocupado ? <Loader2 className="h-8 w-8 animate-spin" aria-hidden /> : <Clapperboard className="h-8 w-8" aria-hidden />}
                  <p className="text-sm">{ocupado ? progresso.texto : "A prévia aparece aqui depois de preparar o 3D."}</p>
                </div>
              )}
            </div>

            {ocupado && (
              <div className="mt-4" aria-live="polite">
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-[var(--rt-gold)] transition-[width]" style={{ width: `${progresso.pct}%` }} /></div>
                <p className="mt-2 text-xs text-muted-foreground">{progresso.texto} {progresso.pct > 0 ? `${progresso.pct}%` : ""}</p>
                <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => { cancelar.current = true; if (etapa === "preparando") voltarParaEdicao(); }}><X className="mr-1 h-4 w-4" />Cancelar</Button>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2">
              {etapa === "editar" && (
                <Button type="button" size="lg" onClick={() => void preparar()} disabled={!fotos.length}>
                  <Sparkles className="mr-2 h-4 w-4" aria-hidden />Preparar o 3D ({fotos.length} foto{fotos.length === 1 ? "" : "s"} · ~{Math.round(roteiroAtual.duracaoTotal)} s)
                </Button>
              )}
              {etapa === "pronto" && (
                <>
                  <Button type="button" size="lg" onClick={() => void gerar()}><Clapperboard className="mr-2 h-4 w-4" aria-hidden />Gerar vídeo</Button>
                  <div className="flex gap-2">
                    {trilhaRef.current && (
                      <Button type="button" variant="outline" className="flex-1" onClick={() => (somPrevia ? pararSom() : ligarSom())} aria-pressed={somPrevia}>
                        {somPrevia ? <><VolumeX className="mr-2 h-4 w-4" />Sem som</> : <><Volume2 className="mr-2 h-4 w-4" />Ouvir</>}
                      </Button>
                    )}
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setTocando(v => !v)}>{tocando ? <><Pause className="mr-2 h-4 w-4" />Pausar</> : <><Play className="mr-2 h-4 w-4" />Tocar</>}</Button>
                    <Button type="button" variant="outline" className="flex-1" onClick={voltarParaEdicao}><RotateCcw className="mr-2 h-4 w-4" />Editar</Button>
                  </div>
                </>
              )}
              {etapa === "gerado" && video && (
                <>
                  <Button type="button" size="lg" onClick={() => void compartilhar()}><Share2 className="mr-2 h-4 w-4" aria-hidden />Enviar (WhatsApp, Instagram…)</Button>
                  <Button type="button" variant="outline" onClick={baixar}><Download className="mr-2 h-4 w-4" aria-hidden />Baixar {video.extensao.toUpperCase()} ({(video.blob.size / 1_048_576).toFixed(1)} MB)</Button>
                  <Button type="button" variant="ghost" onClick={voltarParaEdicao}><RotateCcw className="mr-2 h-4 w-4" />Fazer outro</Button>
                </>
              )}
            </div>
            <p className="mt-4 flex gap-2 text-xs text-muted-foreground"><Home className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />As fotos ficam só no seu aparelho (quando o celular não grava o som no formato do WhatsApp, o vídeo passa pelo servidor só para ajustar o áudio e é apagado em seguida). O 3D é um efeito de profundidade sobre cada foto, não uma planta do imóvel. A música entra no próprio vídeo.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
