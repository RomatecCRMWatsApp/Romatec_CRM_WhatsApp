/**
 * Tour 3D a partir de fotos — cena Three.js.
 *
 * Cada foto vira uma malha densa deslocada pelo seu mapa de profundidade (o que está perto vem
 * para a frente). A câmera se move diante dessa malha e a perspectiva produz o efeito 3D. O quadro
 * WebGL é composto num canvas 2D com os textos (título, preço, corretor) e o cartão final.
 */
import * as THREE from "three";
import type { MapaProfundidade } from "./profundidade";
import { poseCamera, quadroEm, type CenaNoQuadro, type Movimento, type Roteiro } from "./roteiro";

export interface FotoCena {
  imagem: ImageBitmap;
  profundidade: MapaProfundidade;
  movimento: Movimento;
  /** nome do cômodo/ambiente mostrado na cena (ex.: "Cozinha") */
  comodo?: string;
}

export type PosicaoLogo = "sup-dir" | "sup-esq" | "inf-dir" | "inf-esq";

export interface Legendas {
  titulo: string;
  subtitulo?: string;
  preco?: string;
  /** endereço do imóvel (aparece no fechamento) */
  endereco?: string;
  corretor?: string;
  /** "CRECI-F 4.705" ou "CRECI/MA F-4.705" */
  creciF?: string;
  escritorio?: string;
  creciJ?: string;
  cnpj?: string;
  enderecoEscritorio?: string;
  telefone?: string;
  instagram?: string;
  site?: string;
  chamada?: string;
  /** rótulo pequeno no canto (ex.: "Tour 3D") */
  selo?: string;
  /** logo do escritório (PNG com fundo transparente fica melhor) */
  logo?: CanvasImageSource & { width: number; height: number };
  logoPosicao?: PosicaoLogo;
}

export interface Estilo {
  /** intensidade do relevo 0..1 (padrão 0.5) */
  relevo: number;
  corDestaque: string;
  corFundo: string;
}

const FOV = 40;
const MARGEM = 1.2;
const LADO_TEXTURA = 2048;

const VERT = /* glsl */ `
uniform sampler2D uProf;
uniform float uRelevo;
varying vec2 vUv;
void main() {
  vUv = uv;
  float d = texture2D(uProf, uv).r;
  vec3 p = position;
  p.z += (d - 0.5) * uRelevo;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uFoto;
uniform float uOpacidade;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uFoto, vUv);
  gl_FragColor = vec4(c.rgb, uOpacidade);
}`;

interface Malha {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  alturaPlano: number;
  folga: number;
  movimento: Movimento;
  comodo?: string;
}

function texturaDaFoto(img: ImageBitmap): THREE.Texture {
  const esc = Math.min(1, LADO_TEXTURA / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * esc);
  c.height = Math.round(img.height * esc);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  return t;
}

function texturaDaProfundidade(m: MapaProfundidade): THREE.DataTexture {
  const px = new Uint8Array(m.largura * m.altura * 4);
  // a textura WebGL começa embaixo; o mapa começa em cima
  for (let y = 0; y < m.altura; y++) {
    for (let x = 0; x < m.largura; x++) {
      const v = Math.round(m.dados[y * m.largura + x] * 255);
      const o = ((m.altura - 1 - y) * m.largura + x) * 4;
      px[o] = v; px[o + 1] = v; px[o + 2] = v; px[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(px, m.largura, m.altura, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export class CenaTour3D {
  readonly largura: number;
  readonly altura: number;
  readonly saida: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private cena = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private malhas: Malha[] = [];
  private ctx: CanvasRenderingContext2D;
  private fonte: string;

  constructor(largura: number, altura: number, private estilo: Estilo, private legendas: Legendas) {
    this.largura = largura;
    this.altura = altura;
    const gl = document.createElement("canvas");
    gl.width = largura;
    gl.height = altura;
    this.renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, preserveDrawingBuffer: true, alpha: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(largura, altura, false);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(new THREE.Color(estilo.corFundo), 1);
    this.camera = new THREE.PerspectiveCamera(FOV, largura / altura, 0.01, 50);
    this.saida = document.createElement("canvas");
    this.saida.width = largura;
    this.saida.height = altura;
    this.ctx = this.saida.getContext("2d")!;
    const familia = typeof document !== "undefined" ? getComputedStyle(document.body).fontFamily : "";
    this.fonte = familia || "Inter, system-ui, sans-serif";
  }

  atualizarLegendas(l: Legendas, estilo?: Partial<Estilo>) {
    this.legendas = l;
    if (estilo) this.estilo = { ...this.estilo, ...estilo };
  }

  carregar(fotos: FotoCena[]) {
    this.limparMalhas();
    const aspQuadro = this.largura / this.altura;
    const vh = 2 * Math.tan((FOV * Math.PI) / 360); // altura visível a distância 1
    fotos.forEach((f, i) => {
      const asp = f.imagem.width / f.imagem.height;
      const alturaPlano = MARGEM * Math.max(vh, (vh * aspQuadro) / asp);
      const larguraPlano = alturaPlano * asp;
      const seg = 220;
      const geo = new THREE.PlaneGeometry(larguraPlano, alturaPlano, asp >= 1 ? seg : Math.round(seg * asp), asp >= 1 ? Math.round(seg / asp) : seg);
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: true,
        uniforms: {
          uFoto: { value: texturaDaFoto(f.imagem) },
          uProf: { value: texturaDaProfundidade(f.profundidade) },
          uRelevo: { value: 0 },
          uOpacidade: { value: 1 },
        },
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = i;
      this.cena.add(mesh);
      // quanto da largura sobra além do quadro (em alturas visíveis), para o deslize percorrer a foto
      const folga = Math.max(0, (larguraPlano - vh * aspQuadro) / 2 / vh) * 0.85;
      this.malhas.push({ mesh, alturaPlano, folga, movimento: f.movimento, comodo: f.comodo?.trim() || undefined });
    });
  }

  /** Desenha o instante t e devolve o canvas composto (WebGL + textos). */
  desenhar(roteiro: Roteiro, t: number): HTMLCanvasElement {
    const q = quadroEm(roteiro, t);
    const { ctx, largura: W, altura: H } = this;
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.estilo.corFundo;
    ctx.fillRect(0, 0, W, H);
    // cada foto é renderizada sozinha (com a sua câmera) e colada no quadro com o efeito da transição
    const entra = q.cenas.length > 1 ? q.cenas[q.cenas.length - 1] : null;
    let veu: { cor: string; alfa: number } | null = null;
    q.cenas.forEach(c => {
      const ehNova = entra !== null && c === entra;
      const ehVelha = entra !== null && !ehNova;
      const tr = entra?.transicao ?? "dissolver";
      const p = entra?.opacidade ?? 1;
      this.renderizarCena(c);
      const efeito = ehNova ? this.efeitoEntrada(tr, p) : ehVelha ? this.efeitoSaida(tr, p) : { x: 0, y: 0, escala: 1, giro: 0, alfa: 1 };
      if (efeito.alfa <= 0.001) return;
      ctx.save();
      ctx.globalAlpha = efeito.alfa;
      ctx.translate(W / 2 + efeito.x * W, H / 2 + efeito.y * H);
      if (efeito.giro) ctx.rotate(efeito.giro);
      if (efeito.escala !== 1) ctx.scale(efeito.escala, efeito.escala);
      ctx.drawImage(this.renderer.domElement, -W / 2, -H / 2, W, H);
      ctx.restore();
      if (ehNova && (tr === "flash" || tr === "escurecer")) veu = { cor: tr === "flash" ? "255,255,255" : "0,0,0", alfa: 1 - Math.abs(2 * p - 1) };
    });
    if (veu) {
      const v = veu as { cor: string; alfa: number };
      ctx.fillStyle = `rgba(${v.cor},${v.alfa})`;
      ctx.fillRect(0, 0, W, H);
    }
    this.compor(q.cartao, t, q.cenas);
    return this.saida;
  }

  private renderizarCena(c: CenaNoQuadro) {
    const m = this.malhas[c.indice];
    if (!m) return;
    const vh = 2 * Math.tan((FOV * Math.PI) / 360);
    this.malhas.forEach(x => { x.mesh.visible = x === m; });
    m.mesh.material.uniforms.uOpacidade.value = 1;
    m.mesh.material.uniforms.uRelevo.value = m.alturaPlano * 0.22 * this.estilo.relevo;
    const pose = poseCamera(m.movimento, c.progresso, m.folga);
    this.camera.position.set(pose.x * vh, pose.y * vh, pose.distancia);
    this.camera.lookAt(pose.x * vh * pose.seguir, pose.y * vh * pose.seguir, -0.15 * m.alturaPlano * this.estilo.relevo);
    this.renderer.autoClear = true;
    this.renderer.render(this.cena, this.camera);
  }

  /** Como a foto nova entra (p: 0 → 1). x/y em frações do quadro. */
  private efeitoEntrada(tr: string, p: number) {
    const base = { x: 0, y: 0, escala: 1, giro: 0, alfa: 1 };
    switch (tr) {
      case "deslizar-esquerda": return { ...base, x: 1 - p };
      case "deslizar-direita": return { ...base, x: -(1 - p) };
      case "deslizar-cima": return { ...base, y: 1 - p };
      case "deslizar-baixo": return { ...base, y: -(1 - p) };
      case "girar": return { ...base, giro: -(1 - p) * 0.9, escala: 0.55 + 0.45 * p, alfa: Math.min(1, p * 1.6) };
      case "zoom": return { ...base, escala: 1.7 - 0.7 * p, alfa: p };
      case "flash":
      case "escurecer": return { ...base, alfa: p >= 0.5 ? 1 : 0 };
      default: return { ...base, alfa: p };
    }
  }

  /** O que acontece com a foto que sai enquanto a nova entra. */
  private efeitoSaida(tr: string, p: number) {
    const base = { x: 0, y: 0, escala: 1, giro: 0, alfa: 1 };
    switch (tr) {
      case "deslizar-esquerda": return { ...base, x: -p };
      case "deslizar-direita": return { ...base, x: p };
      case "deslizar-cima": return { ...base, y: -p };
      case "deslizar-baixo": return { ...base, y: p };
      case "girar": return { ...base, escala: 1 + 0.15 * p, giro: 0.25 * p };
      case "zoom": return { ...base, escala: 1 + 0.35 * p };
      case "flash":
      case "escurecer": return { ...base, alfa: p < 0.5 ? 1 : 0 };
      default: return base;
    }
  }

  /** Tamanho do logo no quadro (cabe numa caixa proporcional ao vídeo). */
  private tamanhoLogo(u: number): { w: number; h: number } | null {
    const lg = this.legendas.logo;
    if (!lg || !lg.width || !lg.height) return null;
    const maxW = Math.min(this.largura * 0.26, 300 * u), maxH = 130 * u;
    const esc = Math.min(maxW / lg.width, maxH / lg.height);
    return { w: lg.width * esc, h: lg.height * esc };
  }

  private compor(cartao: number, t: number, cenas: CenaNoQuadro[] = []) {
    const { ctx, largura: W, altura: H } = this;
    ctx.globalAlpha = 1;
    const u = Math.min(W, H) / 1080; // unidade de escala do texto
    const L = this.legendas;
    const entrada = Math.min(1, t / 0.8);
    // faixa escura em cima e embaixo para os textos lerem sobre qualquer foto
    const topo = ctx.createLinearGradient(0, 0, 0, H * 0.28);
    topo.addColorStop(0, "rgba(0,0,0,0.62)");
    topo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = topo;
    ctx.fillRect(0, 0, W, H * 0.28);
    const base = ctx.createLinearGradient(0, H * 0.66, 0, H);
    base.addColorStop(0, "rgba(0,0,0,0)");
    base.addColorStop(1, "rgba(0,0,0,0.72)");
    ctx.fillStyle = base;
    ctx.fillRect(0, H * 0.66, W, H * 0.34);

    const m = 64 * u;
    ctx.globalAlpha = entrada;
    ctx.textBaseline = "alphabetic";
    // logo: no canto escolhido; se dividir o canto com o título ou o rodapé, empurra o texto
    const tl = this.tamanhoLogo(u);
    const pos = L.logoPosicao ?? "sup-dir";
    const gapLogo = 24 * u;
    let topoTexto = m;
    let baseTexto = H - m;
    if (tl && L.logo) {
      const x = pos.endsWith("dir") ? W - m - tl.w : m;
      const yl = pos.startsWith("sup") ? m : H - m - tl.h;
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 10 * u;
      ctx.drawImage(L.logo, x, yl, tl.w, tl.h);
      ctx.shadowBlur = 0;
      if (pos === "sup-esq") topoTexto = m + tl.h + gapLogo;
      if (pos === "inf-esq") baseTexto = H - m - tl.h - gapLogo;
    }
    if (L.selo) {
      ctx.font = `700 ${26 * u}px ${this.fonte}`;
      const tw = ctx.measureText(L.selo).width;
      ctx.fillStyle = this.estilo.corDestaque;
      this.retanguloArredondado(m, topoTexto, tw + 36 * u, 50 * u, 25 * u);
      ctx.fillStyle = "#0b1f14";
      ctx.fillText(L.selo, m + 18 * u, topoTexto + 35 * u);
    }
    // com logo no canto superior direito, o título não passa por baixo dele
    const larguraTitulo = tl && pos === "sup-dir" ? W - 2 * m - tl.w - gapLogo : W - 2 * m;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 12 * u;
    const linhasTitulo = this.quebrar(L.titulo || "", `800 ${66 * u}px ${this.fonte}`, larguraTitulo).slice(0, 2);
    ctx.font = `800 ${66 * u}px ${this.fonte}`;
    let y = topoTexto + (L.selo ? 130 : 70) * u;
    linhasTitulo.forEach(l => { ctx.fillText(l, m, y); y += 76 * u; });
    if (L.subtitulo) {
      ctx.font = `500 ${36 * u}px ${this.fonte}`;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      this.quebrar(L.subtitulo, ctx.font, larguraTitulo).slice(0, 2).forEach(l => { ctx.fillText(l, m, y); y += 46 * u; });
    }
    // rodapé: preço e corretor
    let yb = baseTexto;
    const larguraRodape = tl && pos === "inf-dir" ? W - 2 * m - tl.w - gapLogo : W - 2 * m;
    // carimbo profissional (obrigatório em anúncio imobiliário): corretor + CRECI-F, imobiliária + CRECI-J
    const linhaEscritorio = [L.escritorio, L.creciJ].filter(Boolean).join("  ·  ");
    const linhaCorretor = [L.corretor, L.creciF, L.telefone].filter(Boolean).join("  ·  ");
    ctx.fillStyle = "#ffffff";
    if (linhaEscritorio) {
      ctx.font = `500 ${30 * u}px ${this.fonte}`;
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.fillText(linhaEscritorio, m, yb, larguraRodape);
      yb -= 44 * u;
    }
    if (linhaCorretor) {
      ctx.font = `600 ${34 * u}px ${this.fonte}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(linhaCorretor, m, yb, larguraRodape);
      yb -= 64 * u;
    } else if (linhaEscritorio) yb -= 20 * u;
    if (L.preco) {
      ctx.shadowBlur = 0;
      ctx.font = `800 ${52 * u}px ${this.fonte}`;
      const tw = ctx.measureText(L.preco).width;
      ctx.fillStyle = this.estilo.corDestaque;
      this.retanguloArredondado(m, yb - 62 * u, tw + 48 * u, 82 * u, 16 * u);
      ctx.fillStyle = "#0b1f14";
      ctx.fillText(L.preco, m + 24 * u, yb - 4 * u);
      yb -= 62 * u;
    }
    ctx.shadowBlur = 0;
    // nome do cômodo de cada foto, centralizado acima do rodapé; troca junto com a foto
    const entra = cenas.length > 1 ? cenas[cenas.length - 1].opacidade : 1; // 0..1 da transição
    cenas.forEach((c, i) => {
      const nome = this.malhas[c.indice]?.comodo;
      if (!nome) return;
      const alfa = cenas.length > 1 && i < cenas.length - 1 ? 1 - entra : c.opacidade;
      if (alfa <= 0.01) return;
      ctx.globalAlpha = alfa;
      ctx.font = `700 ${46 * u}px ${this.fonte}`;
      const tw = Math.min(ctx.measureText(nome).width, W - 2 * m - 60 * u);
      const bw = tw + 60 * u, bh = 78 * u;
      const bx = (W - bw) / 2, by = yb - 44 * u - bh;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      this.retanguloArredondado(bx, by, bw, bh, bh / 2);
      ctx.fillStyle = this.estilo.corDestaque;
      ctx.fillRect(bx + bh / 2 - 4 * u, by + bh - 10 * u, bw - bh + 8 * u, 4 * u);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(nome, W / 2, by + bh / 2 + 16 * u, W - 2 * m - 60 * u);
      ctx.textAlign = "left";
    });
    ctx.globalAlpha = 1;
    if (cartao > 0) this.cartaoFinal(cartao, u);
  }

  private cartaoFinal(alfa: number, u0: number) {
    const { ctx, largura: W, altura: H } = this;
    const L = this.legendas;
    ctx.globalAlpha = alfa;
    ctx.fillStyle = this.estilo.corFundo;
    ctx.fillRect(0, 0, W, H);
    const branco = "#ffffff", suave = "rgba(255,255,255,0.78)", ouro = this.estilo.corDestaque;
    type Linha = { texto: string; peso: number; tam: number; cor: string; antes: number };
    const montar = (u: number): Linha[] => {
      const ls: Linha[] = [];
      const add = (texto: string | undefined, peso: number, tam: number, cor: string, antes = 14) => { if (texto?.trim()) ls.push({ texto: texto.trim(), peso, tam: tam * u, cor, antes: antes * u }); };
      add(L.chamada || "Agende sua visita", 800, 60, ouro, 0);
      this.quebrar(L.titulo || "", `700 ${48 * u}px ${this.fonte}`, W - 160 * u).slice(0, 2).forEach((l, i) => add(l, 700, 48, branco, i ? 8 : 34));
      add(L.endereco || L.subtitulo, 500, 34, suave, 12);
      add(L.preco, 800, 58, ouro, 26);
      // carimbo
      add(L.corretor, 700, 42, branco, 46);
      add(L.creciF, 600, 32, suave, 8);
      add(L.escritorio, 700, 38, branco, 22);
      add(L.creciJ, 600, 32, suave, 8);
      add(L.cnpj ? `CNPJ ${L.cnpj}` : undefined, 500, 28, suave, 8);
      add(L.enderecoEscritorio, 500, 28, suave, 8);
      add(L.telefone, 800, 50, branco, 34);
      add(L.instagram ? `@${L.instagram.replace(/^@/, "")}` : undefined, 600, 34, suave, 10);
      add(L.site, 600, 32, suave, 8);
      return ls;
    };
    const tl = this.tamanhoLogo(u0);
    const alturaLogo = tl && L.logo ? tl.h * 1.4 + 40 * u0 : 0;
    const altura = (ls: Linha[]) => ls.reduce((h, l) => h + l.antes + l.tam * 1.15, 0);
    let u = u0;
    let linhas = montar(u);
    // encolhe o bloco se não couber (vídeo deitado com muitas informações)
    const limite = H * 0.9 - alturaLogo;
    if (altura(linhas) > limite) { u = u0 * (limite / altura(linhas)); linhas = montar(u); }
    let y = (H - altura(linhas) - alturaLogo) / 2;
    if (tl && L.logo) {
      const esc = 1.4 * (u / u0);
      ctx.drawImage(L.logo, (W - tl.w * esc) / 2, y, tl.w * esc, tl.h * esc);
      y += tl.h * esc + 40 * u;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    linhas.forEach(l => {
      y += l.antes + l.tam;
      ctx.font = `${l.peso} ${l.tam}px ${this.fonte}`;
      ctx.fillStyle = l.cor;
      ctx.fillText(l.texto, W / 2, y, W - 100 * u);
      y += l.tam * 0.15;
    });
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }

  private quebrar(texto: string, fonte: string, max: number): string[] {
    this.ctx.font = fonte;
    const palavras = texto.split(/\s+/).filter(Boolean);
    const linhas: string[] = [];
    let atual = "";
    for (const p of palavras) {
      const teste = atual ? `${atual} ${p}` : p;
      if (this.ctx.measureText(teste).width > max && atual) { linhas.push(atual); atual = p; } else atual = teste;
    }
    if (atual) linhas.push(atual);
    return linhas;
  }

  private retanguloArredondado(x: number, y: number, w: number, h: number, r: number) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    c.fill();
  }

  private limparMalhas() {
    this.malhas.forEach(m => {
      this.cena.remove(m.mesh);
      m.mesh.geometry.dispose();
      (m.mesh.material.uniforms.uFoto.value as THREE.Texture).dispose();
      (m.mesh.material.uniforms.uProf.value as THREE.Texture).dispose();
      m.mesh.material.dispose();
    });
    this.malhas = [];
  }

  destruir() {
    this.limparMalhas();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
