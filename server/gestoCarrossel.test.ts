import { describe, it, expect } from "vitest";
import { acaoDoGesto } from "../client/src/lib/gestoCarrossel";

describe("carrossel de fotos: gestos", () => {
  it("para cima baixa, para baixo envia no WhatsApp", () => {
    expect(acaoDoGesto(5, -140)).toBe("baixar");
    expect(acaoDoGesto(-8, 150)).toBe("enviar");
  });
  it("para o lado troca de foto, respeitando a primeira e a última", () => {
    expect(acaoDoGesto(-120, 10)).toBe("proxima");
    expect(acaoDoGesto(120, -10)).toBe("anterior");
    expect(acaoDoGesto(120, 0, { inicio: true, fim: false })).toBeNull();
    expect(acaoDoGesto(-120, 0, { inicio: false, fim: true })).toBeNull();
  });
  it("toque ou arraste curto não faz nada (não baixa nem envia sem querer)", () => {
    expect(acaoDoGesto(0, 0)).toBeNull();
    expect(acaoDoGesto(20, -60)).toBeNull();
    expect(acaoDoGesto(40, 30)).toBeNull();
  });
});
