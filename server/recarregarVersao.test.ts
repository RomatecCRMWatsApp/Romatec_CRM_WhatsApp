import { describe, it, expect } from "vitest";
import { ehErroDeVersao, recarregarUmaVez } from "../client/src/lib/recarregarVersao";

const memoria = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

describe("recarga ao sair versão nova", () => {
  it("reconhece o erro de pedaço da versão antiga (Chrome, Safari, Firefox)", () => {
    expect(ehErroDeVersao(new TypeError("Failed to fetch dynamically imported module: https://romateccrm.com/assets/Dashboard-wr1WbPZJ.js"))).toBe(true);
    expect(ehErroDeVersao(new TypeError("Importing a module script failed."))).toBe(true);
    expect(ehErroDeVersao(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(ehErroDeVersao(new Error("Cannot read properties of undefined"))).toBe(false);
  });
  it("recarrega uma vez só em 30 s, para não entrar em loop", () => {
    const s = memoria();
    expect(recarregarUmaVez(1_000_000, s)).toBe(true);
    expect(recarregarUmaVez(1_010_000, s)).toBe(false);
    expect(recarregarUmaVez(1_031_000, s)).toBe(true);
  });
});
