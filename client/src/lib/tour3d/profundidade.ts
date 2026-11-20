/**
 * Tour 3D a partir de fotos — mapa de profundidade de cada foto.
 *
 * Usa o Depth Anything V2 (small) rodando no próprio navegador (WebGPU quando há, senão
 * WebAssembly): a foto não sai do aparelho. O modelo (~27 MB) é baixado uma vez e fica no cache
 * do navegador. Se o modelo não puder ser carregado (sem internet, aparelho antigo), cai numa
 * profundidade estimada pela posição na foto, para o vídeo sair mesmo assim.
 */
import ortWasm from "@ort-dist/ort-wasm-simd-threaded.jsep.wasm?url";
import ortMjs from "@ort-dist/ort-wasm-simd-threaded.jsep.mjs?url";

export interface MapaProfundidade {
  /** 0 = longe, 1 = perto; row-major, de cima para baixo */
  dados: Float32Array;
  largura: number;
  altura: number;
  origem: "ia" | "estimada";
}

const MODELO = "onnx-community/depth-anything-v2-small";
/** Lado maior da imagem enviada ao modelo (o modelo trabalha em 518). */
const LADO_ENTRADA = 518;

type Estimador = (img: unknown) => Promise<{ predicted_depth?: { data: Float32Array; dims: number[] }; depth?: unknown }>;
let estimador: Promise<Estimador> | null = null;

async function carregarEstimador(aoProgresso?: (pct: number) => void): Promise<Estimador> {
  const t = await import("@huggingface/transformers");
  t.env.allowLocalModels = false;
  const wasm = t.env.backends.onnx.wasm;
  if (wasm) {
    wasm.wasmPaths = { mjs: ortMjs, wasm: ortWasm } as never;
    wasm.numThreads = 1;
  }
  const temWebGpu = typeof navigator !== "undefined" && "gpu" in navigator && !!(await (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu?.requestAdapter().catch(() => null));
  const arquivos = new Map<string, { carregado: number; total: number }>();
  const progresso = (e: { status?: string; file?: string; loaded?: number; total?: number }) => {
    if (!aoProgresso || e.status !== "progress" || !e.file) return;
    arquivos.set(e.file, { carregado: e.loaded ?? 0, total: e.total ?? 0 });
    let c = 0, tt = 0;
    arquivos.forEach(v => { c += v.carregado; tt += v.total; });
    if (tt > 0) aoProgresso(Math.min(100, Math.round((c / tt) * 100)));
  };
  const criar = (device: "webgpu" | "wasm") =>
    t.pipeline("depth-estimation", MODELO, { device, dtype: device === "webgpu" ? "fp16" : "q8", progress_callback: progresso } as never) as unknown as Promise<Estimador>;
  if (temWebGpu) {
    try { return await criar("webgpu"); } catch { /* cai para WebAssembly */ }
  }
  return criar("wasm");
}

/** Pré-carrega o modelo (mostra progresso do download). Devolve false se não deu. */
export async function prepararModelo(aoProgresso?: (pct: number) => void): Promise<boolean> {
  if (!estimador) estimador = carregarEstimador(aoProgresso);
  try { await estimador; return true; } catch { estimador = null; return false; }
}

function canvasReduzido(bitmap: ImageBitmap, lado: number): HTMLCanvasElement {
  const esc = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.max(8, Math.round(bitmap.width * esc));
  c.height = Math.max(8, Math.round(bitmap.height * esc));
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  return c;
}

/** Normaliza para 0..1 usando percentis (ignora pontos extremos isolados). */
export function normalizar(dados: Float32Array): Float32Array {
  const ordenado = Float32Array.from(dados).sort();
  const lo = ordenado[Math.floor(ordenado.length * 0.02)];
  const hi = ordenado[Math.floor(ordenado.length * 0.98)];
  const faixa = hi - lo || 1;
  const saida = new Float32Array(dados.length);
  for (let i = 0; i < dados.length; i++) saida[i] = Math.min(1, Math.max(0, (dados[i] - lo) / faixa));
  return saida;
}

/** Desfoque em caixa separável — suaviza as bordas de profundidade e reduz o "rasgo" no movimento. */
export function suavizar(dados: Float32Array, largura: number, altura: number, raio: number): Float32Array {
  if (raio < 1) return dados;
  const tmp = new Float32Array(dados.length);
  const saida = new Float32Array(dados.length);
  const passar = (de: Float32Array, para: Float32Array, horizontal: boolean) => {
    const n = horizontal ? largura : altura, m = horizontal ? altura : largura;
    for (let j = 0; j < m; j++) {
      let soma = 0, cont = 0;
      const idx = (i: number) => (horizontal ? j * largura + i : i * largura + j);
      for (let i = -raio; i <= raio; i++) if (i >= 0 && i < n) { soma += de[idx(i)]; cont++; }
      for (let i = 0; i < n; i++) {
        para[idx(i)] = soma / cont;
        const sai = i - raio, entra = i + raio + 1;
        if (sai >= 0) { soma -= de[idx(sai)]; cont--; }
        if (entra < n) { soma += de[idx(entra)]; cont++; }
      }
    }
  };
  passar(dados, tmp, true);
  passar(tmp, saida, false);
  return saida;
}

/** Profundidade estimada sem IA: o chão (embaixo) está perto, o fundo (em cima) está longe. */
export function profundidadeEstimada(largura: number, altura: number): Float32Array {
  const d = new Float32Array(largura * altura);
  for (let y = 0; y < altura; y++) {
    const v = y / Math.max(1, altura - 1);
    const valor = Math.pow(v, 1.6);
    for (let x = 0; x < largura; x++) {
      const borda = Math.abs(x / Math.max(1, largura - 1) - 0.5) * 0.25;
      d[y * largura + x] = Math.min(1, valor + borda * v);
    }
  }
  return d;
}

export async function mapaDeProfundidade(bitmap: ImageBitmap, usarIa = true): Promise<MapaProfundidade> {
  const reduzido = canvasReduzido(bitmap, LADO_ENTRADA);
  if (usarIa) {
    try {
      if (!estimador) estimador = carregarEstimador();
      const est = await estimador;
      const { RawImage } = await import("@huggingface/transformers");
      const img = RawImage.fromCanvas(reduzido);
      const r = await est(img);
      const pd = r.predicted_depth;
      if (pd && pd.dims.length >= 2) {
        const altura = pd.dims[pd.dims.length - 2];
        const largura = pd.dims[pd.dims.length - 1];
        const dados = suavizar(normalizar(Float32Array.from(pd.data)), largura, altura, Math.max(1, Math.round(largura / 160)));
        return { dados, largura, altura, origem: "ia" };
      }
    } catch (e) {
      console.warn("[tour3d] profundidade por IA indisponível, usando estimativa", e);
    }
  }
  const largura = 128, altura = Math.max(8, Math.round((128 * reduzido.height) / reduzido.width));
  return { dados: profundidadeEstimada(largura, altura), largura, altura, origem: "estimada" };
}
