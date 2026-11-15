import { describe, expect, it } from "vitest";
import { contatosSuporte, numeroWhatsApp } from "../shared/suporte";

describe("central de suporte", () => {
  it("monta o número do WhatsApp com DDI 55", () => {
    expect(numeroWhatsApp("(99) 99181-1246")).toBe("5599991811246");
    expect(numeroWhatsApp("+55 99 99181-1246")).toBe("5599991811246");
    expect(numeroWhatsApp("123")).toBeNull();
    expect(numeroWhatsApp(null)).toBeNull();
  });

  it("lista administrador antes da secretaria e ignora cadastro vazio", () => {
    const r = contatosSuporte([
      { name: "Ana Secretária", email: "ana@x.test", telefone: "99 98888-7777", role: "user", perfil: "secretario" },
      { name: null, email: null, telefone: null, role: "user", perfil: "secretario" },
      { name: "José Admin", email: "jose@x.test", telefone: null, role: "admin", perfil: null },
    ]);
    expect(r.map(c => [c.papel, c.nome])).toEqual([["Administrador", "José Admin"], ["Secretaria", "Ana Secretária"]]);
    expect(r[0].whatsapp).toBeNull();
    expect(r[1].whatsapp).toBe("5599988887777");
  });
});
