import { describe, expect, it } from "vitest";
import {
  CARTAO_FINAL_S, EASE_IN_OUT, EASE_OUT, FORMATOS, FPS, TRANSICAO_S, curvaBezier, entradaTexto, impactoEm, montarRoteiro, movimentoAutomatico, nomeArquivo,
  poseCamera, progressoCamera, quadroEm, segundosNoRitmo, totalDeQuadros,
} from "../client/src/lib/tour3d/roteiro";

// Tour 3D a partir de fotos: regras puras do roteiro (tempo, transições, câmera, nome do arquivo).

describe("tour 3D — roteiro", () => {
  const cenas = [
    { duracao: 4, movimento: "aproximar" as const },
    { duracao: 4, movimento: "deslizar-direita" as const },
    { duracao: 4, movimento: "orbitar" as const },
  ];

  it("encadeia as cenas com sobreposição de transição e soma o cartão final", () => {
    const r = montarRoteiro(cenas, true);
    expect(r.inicios).toEqual([0, 4 - TRANSICAO_S, 2 * (4 - TRANSICAO_S)]);
    const fimFotos = 12 - 2 * TRANSICAO_S;
    expect(r.inicioCartao).toBeCloseTo(fimFotos - TRANSICAO_S);
    expect(r.duracaoTotal).toBeCloseTo(fimFotos - TRANSICAO_S + CARTAO_FINAL_S);
    expect(totalDeQuadros(r)).toBe(Math.round(r.duracaoTotal * FPS));
  });

  it("sem cartão final, o vídeo termina com a última foto", () => {
    const r = montarRoteiro(cenas, false);
    expect(r.duracaoTotal).toBeCloseTo(12 - 2 * TRANSICAO_S);
    expect(quadroEm(r, r.duracaoTotal - 0.01).cartao).toBe(0);
  });

  it("na transição as duas fotos aparecem e a nova entra aos poucos", () => {
    const r = montarRoteiro(cenas, true);
    const meio = r.inicios[1] + TRANSICAO_S / 2;
    const q = quadroEm(r, meio);
    expect(q.cenas.map(c => c.indice)).toEqual([0, 1]);
    expect(q.cenas[1].opacidade).toBeGreaterThan(0);
    expect(q.cenas[1].opacidade).toBeLessThan(1);
    expect(quadroEm(r, 1).cenas).toEqual([{ indice: 0, progresso: 0.25, opacidade: 1, transicao: "dissolver" }]);
  });

  it("o cartão final aparece no fim e fica totalmente visível", () => {
    const r = montarRoteiro(cenas, true);
    expect(quadroEm(r, r.inicioCartao - 0.1).cartao).toBe(0);
    expect(quadroEm(r, r.duracaoTotal).cartao).toBe(1);
  });

  it("foto bem mais larga que o quadro desliza; as demais seguem o ciclo", () => {
    const reel = FORMATOS.reel.largura / FORMATOS.reel.altura;
    expect(movimentoAutomatico(0, 4 / 3, reel)).toBe("deslizar-direita");
    expect(movimentoAutomatico(1, 4 / 3, reel)).toBe("deslizar-esquerda");
    expect(movimentoAutomatico(0, 9 / 16, reel)).toBe("aproximar");
    expect(movimentoAutomatico(1, 9 / 16, reel)).toBe("deslizar-direita");
  });

  it("câmera: aproximar chega mais perto; deslizar percorre a folga de um lado ao outro", () => {
    expect(poseCamera("aproximar", 0).distancia).toBe(1);
    expect(poseCamera("aproximar", 1).distancia).toBeCloseTo(0.84);
    expect(poseCamera("deslizar-direita", 0, 0.3).x).toBeCloseTo(-0.3);
    expect(poseCamera("deslizar-direita", 1, 0.3).x).toBeCloseTo(0.3);
    expect(poseCamera("deslizar-esquerda", 1, 0.3).x).toBeCloseTo(-0.3);
  });

  it("nome do arquivo sem acento nem espaço", () => {
    expect(nomeArquivo("Casa no Jardim Glória — 3 quartos", "reel", "mp4")).toBe("tour-3d-casa-no-jardim-gloria-3-quartos-reel.mp4");
    expect(nomeArquivo("", "paisagem", "webm")).toBe("tour-3d-imovel-paisagem.webm");
  });

  it("formatos com dimensões pares (exigência do codificador H.264)", () => {
    for (const f of Object.values(FORMATOS)) {
      expect(f.largura % 2).toBe(0);
      expect(f.altura % 2).toBe(0);
    }
  });
});

describe("tour 3D — movimento e ritmo", () => {
  it("as curvas seguem o cubic-bezier do CSS (pontas fixas, ease-out rápido no começo)", () => {
    expect(EASE_OUT(0)).toBe(0);
    expect(EASE_OUT(1)).toBe(1);
    expect(EASE_OUT(0.25)).toBeGreaterThan(0.6);
    // confere com a curva amostrada por força bruta (x(u), y(u) da Bézier)
    const bruta = (x1: number, y1: number, x2: number, y2: number, x: number) => {
      const b = (a: number, c: number, u: number) => 3 * a * u * (1 - u) ** 2 + 3 * c * u * u * (1 - u) + u ** 3;
      let melhor = 0;
      for (let i = 0; i <= 20000; i++) { const u = i / 20000; if (Math.abs(b(x1, x2, u) - x) < Math.abs(b(x1, x2, melhor) - x)) melhor = u; }
      return b(y1, y2, melhor);
    };
    [0.1, 0.5, 0.8].forEach(x => {
      expect(EASE_IN_OUT(x)).toBeCloseTo(bruta(0.77, 0, 0.175, 1, x), 3);
      expect(EASE_OUT(x)).toBeCloseTo(bruta(0.23, 1, 0.32, 1, x), 3);
    });
    expect(curvaBezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 4);
  });

  it("a câmera nunca para: o progresso sempre cresce até o fim da cena", () => {
    let anterior = -1;
    for (let i = 0; i <= 100; i++) {
      const p = progressoCamera(i / 100);
      expect(p).toBeGreaterThan(anterior);
      anterior = p;
    }
    expect(progressoCamera(0.9) - progressoCamera(0.85)).toBeGreaterThan(0.01);
  });

  it("no ritmo da música, cada troca de foto começa numa batida", () => {
    const bpm = 112;
    const batida = 60 / bpm;
    const seg = segundosNoRitmo(4, bpm);
    expect(Math.abs(seg - 4)).toBeLessThan(batida);
    const r = montarRoteiro([4, 4, 4].map(() => ({ duracao: seg, movimento: "aproximar" as const })), false);
    r.inicios.forEach(ini => {
      const b = ini / batida;
      expect(Math.abs(b - Math.round(b))).toBeLessThan(1e-3);
    });
    expect(segundosNoRitmo(4, 0)).toBe(4);
    expect(segundosNoRitmo(0.5, 76)).toBeCloseTo(TRANSICAO_S + 2 * (60 / 76), 3);
  });

  it("os textos entram em cascata e terminam parados no lugar", () => {
    expect(entradaTexto(0, 0).alfa).toBe(0);
    expect(entradaTexto(0.1, 0).alfa).toBeGreaterThan(entradaTexto(0.1, 1).alfa);
    expect(entradaTexto(5, 7)).toEqual({ alfa: 1, subida: 0 });
  });

  it("a tremida só acontece em troca com zoom ou clarão e some em 7 quadros", () => {
    const r = montarRoteiro([
      { duracao: 4, movimento: "aproximar" },
      { duracao: 4, movimento: "aproximar", transicao: "zoom" },
      { duracao: 4, movimento: "aproximar", transicao: "dissolver" },
    ], false);
    const pico = r.inicios[1] + TRANSICAO_S / 2 + 1 / FPS;
    const t = impactoEm(r, pico);
    expect(Math.abs(t.x) + Math.abs(t.y)).toBeGreaterThan(0);
    expect(impactoEm(r, pico + 8 / FPS)).toEqual({ x: 0, y: 0 });
    expect(impactoEm(r, r.inicios[2] + TRANSICAO_S / 2 + 1 / FPS)).toEqual({ x: 0, y: 0 });
  });
});
