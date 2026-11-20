/**
 * Tour 3D a partir de fotos — cena Three.js.
 *
 * Cada foto vira uma malha densa deslocada pelo seu mapa de profundidade (o que está perto vem
 * para a frente). A câmera se move diante dessa malha e a perspectiva produz o efeito 3D. O quadro
 * WebGL é composto num canvas 2D com os textos (título, preço, corretor) e o cartão final.
 */
import * as THREE from "three";
import type { MapaProfundidade } from "./profundidade";
import { poseCamera, quadroEm, type Movimento, type Roteiro } from "./roteiro";

export interface FotoCena {
  imagem: ImageBitmap;
  profundidade: MapaProfundidade;
  movimento: Movimento;
}

export interface Legendas {
  titulo: string;
  subtitulo?: string;
  preco?: string;
  corretor?: string;
  telefone?: string;
  chamada?: string;
  /** rótulo pequeno no canto (ex.: "Tour 3D") */
  selo?: string;
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
      this.malhas.push({ mesh, alturaPlano, folga, movimento: f.movimento });
    });
  }

  /** Desenha o instante t e devolve o canvas composto (WebGL + textos). */
  desenhar(roteiro: Roteiro, t: number): HTMLCanvasElement {
    const q = quadroEm(roteiro, t);
    const vh = 2 * Math.tan((FOV * Math.PI) / 360);
    this.malhas.forEach(m => { m.mesh.visible = false; });
    this.renderer.autoClear = false;
    this.renderer.clear();
    // cada foto em camada própria (com a sua câmera); a que entra é desenhada por cima,
    // sem que o relevo da que sai a recorte
    q.cenas.forEach(c => {
      const m = this.malhas[c.indice];
      if (!m) return;
      m.mesh.visible = true;
      m.mesh.material.uniforms.uOpacidade.value = c.opacidade;
      m.mesh.material.uniforms.uRelevo.value = m.alturaPlano * 0.22 * this.estilo.relevo;
      const pose = poseCamera(m.movimento, c.progresso, m.folga);
      this.camera.position.set(pose.x * vh, pose.y * vh, pose.distancia);
      this.camera.lookAt(pose.x * vh * pose.seguir, pose.y * vh * pose.seguir, -0.15 * m.alturaPlano * this.estilo.relevo);
      this.renderer.clearDepth();
      this.renderer.render(this.cena, this.camera);
      m.mesh.visible = false;
    });
    this.compor(q.cartao, t);
    return this.saida;
  }

  private compor(cartao: number, t: number) {
    const { ctx, largura: W, altura: H } = this;
    ctx.globalAlpha = 1;
    ctx.drawImage(this.renderer.domElement, 0, 0);
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
    if (L.selo) {
      ctx.font = `700 ${26 * u}px ${this.fonte}`;
      const tw = ctx.measureText(L.selo).width;
      ctx.fillStyle = this.estilo.corDestaque;
      this.retanguloArredondado(m, m, tw + 36 * u, 50 * u, 25 * u);
      ctx.fillStyle = "#0b1f14";
      ctx.fillText(L.selo, m + 18 * u, m + 35 * u);
    }
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 12 * u;
    const linhasTitulo = this.quebrar(L.titulo || "", `800 ${66 * u}px ${this.fonte}`, W - 2 * m).slice(0, 2);
    ctx.font = `800 ${66 * u}px ${this.fonte}`;
    let y = m + (L.selo ? 130 : 70) * u;
    linhasTitulo.forEach(l => { ctx.fillText(l, m, y); y += 76 * u; });
    if (L.subtitulo) {
      ctx.font = `500 ${36 * u}px ${this.fonte}`;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      this.quebrar(L.subtitulo, ctx.font, W - 2 * m).slice(0, 2).forEach(l => { ctx.fillText(l, m, y); y += 46 * u; });
    }
    // rodapé: preço e corretor
    let yb = H - m;
    if (L.corretor || L.telefone) {
      ctx.font = `600 ${34 * u}px ${this.fonte}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText([L.corretor, L.telefone].filter(Boolean).join("  ·  "), m, yb);
      yb -= 64 * u;
    }
    if (L.preco) {
      ctx.shadowBlur = 0;
      ctx.font = `800 ${52 * u}px ${this.fonte}`;
      const tw = ctx.measureText(L.preco).width;
      ctx.fillStyle = this.estilo.corDestaque;
      this.retanguloArredondado(m, yb - 62 * u, tw + 48 * u, 82 * u, 16 * u);
      ctx.fillStyle = "#0b1f14";
      ctx.fillText(L.preco, m + 24 * u, yb - 4 * u);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    if (cartao > 0) this.cartaoFinal(cartao, u);
  }

  private cartaoFinal(alfa: number, u: number) {
    const { ctx, largura: W, altura: H } = this;
    const L = this.legendas;
    ctx.globalAlpha = alfa;
    ctx.fillStyle = this.estilo.corFundo;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    let y = H / 2 - 150 * u;
    ctx.fillStyle = this.estilo.corDestaque;
    ctx.font = `800 ${60 * u}px ${this.fonte}`;
    ctx.fillText(L.chamada || "Agende sua visita", W / 2, y);
    y += 90 * u;
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${48 * u}px ${this.fonte}`;
    this.quebrar(L.titulo || "", ctx.font, W - 160 * u).slice(0, 2).forEach(l => { ctx.fillText(l, W / 2, y); y += 60 * u; });
    if (L.preco) {
      y += 20 * u;
      ctx.font = `800 ${56 * u}px ${this.fonte}`;
      ctx.fillStyle = this.estilo.corDestaque;
      ctx.fillText(L.preco, W / 2, y);
      y += 40 * u;
    }
    y += 50 * u;
    ctx.fillStyle = "#ffffff";
    if (L.corretor) { ctx.font = `600 ${40 * u}px ${this.fonte}`; ctx.fillText(L.corretor, W / 2, y); y += 56 * u; }
    if (L.telefone) { ctx.font = `800 ${50 * u}px ${this.fonte}`; ctx.fillText(L.telefone, W / 2, y); }
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
