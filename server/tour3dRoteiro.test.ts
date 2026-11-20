import { describe, expect, it } from "vitest";
import {
  CARTAO_FINAL_S, FORMATOS, FPS, TRANSICAO_S, montarRoteiro, movimentoAutomatico, nomeArquivo, poseCamera, quadroEm, totalDeQuadros,
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
    expect(quadroEm(r, 1).cenas).toEqual([{ indice: 0, progresso: 0.25, opacidade: 1 }]);
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
