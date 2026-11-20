import { describe, expect, it } from "vitest";
import { exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify, decodeProtectedHeader } from "jose";
import { codigoValido, gerarCodigoSala, nomeParticipanteValido, nomeSalaJitsi, textoConviteSala, urlJitsiPublico } from "../shared/salaVideo";
import { configJaas, tokenJaas } from "./salaVideo";
import { podeAbrir } from "../shared/equipe";

// Sala de vídeo (Jitsi): código, links, convite, token JaaS e acesso pelo menu. Dados fictícios.

describe("sala de vídeo — regras", () => {
  it("gera códigos de 10 caracteres sem letras/números ambíguos e os valida", () => {
    for (let i = 0; i < 200; i++) {
      const c = gerarCodigoSala();
      expect(codigoValido(c)).toBe(true);
      expect(c).not.toMatch(/[01ilo]/);
    }
    expect(codigoValido("abc")).toBe(false);
    expect(codigoValido("ABCDEFGHJK")).toBe(false);
    expect(codigoValido("../../etc1")).toBe(false);
  });

  it("monta o nome da sala e o link do Jitsi público com o nome de quem entra", () => {
    expect(nomeSalaJitsi("abcdefghjk")).toBe("RomatecCRM-abcdefghjk");
    const u = urlJitsiPublico("abcdefghjk", "Maria Souza");
    expect(u.startsWith("https://meet.jit.si/RomatecCRM-abcdefghjk#")).toBe(true);
    expect(decodeURIComponent(u)).toContain('userInfo.displayName="Maria Souza"');
  });

  it("convite do WhatsApp traz título, anfitrião e link", () => {
    const t = textoConviteSala({ titulo: "Apresentação do Bom Jardims", link: "https://crm.exemplo.test/sala/abcdefghjk", anfitriao: "José" });
    expect(t).toContain("*Apresentação do Bom Jardims*");
    expect(t).toContain("com José");
    expect(t).toContain("https://crm.exemplo.test/sala/abcdefghjk");
  });

  it("nome do convidado: mínimo de 2 letras, espaços normalizados, até 60", () => {
    expect(nomeParticipanteValido(" a ")).toBeNull();
    expect(nomeParticipanteValido("  Ana   Lúcia ")).toBe("Ana Lúcia");
    expect(nomeParticipanteValido("x".repeat(90))?.length).toBe(60);
  });

  it("corretor e secretária abrem a sala de vídeo pelo menu", () => {
    expect(podeAbrir("corretor", "/sala-video")).toBe(true);
    expect(podeAbrir("secretario", "/sala-video")).toBe(true);
  });
});

describe("sala de vídeo — JaaS", () => {
  it("sem as três variáveis, fica no modo aba (Jitsi público)", () => {
    expect(configJaas({} as NodeJS.ProcessEnv)).toBeNull();
    expect(configJaas({ JAAS_APP_ID: "vpaas-magic-cookie-x", JAAS_KID: "k" } as NodeJS.ProcessEnv)).toBeNull();
  });

  it("assina o token RS256 com kid, sala e papel de moderador", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    // como fica colada numa variável de ambiente: quebras de linha viram "\n"
    const cfg = configJaas({ JAAS_APP_ID: "vpaas-magic-cookie-teste", JAAS_KID: "vpaas-magic-cookie-teste/abc123", JAAS_PRIVATE_KEY: pem.replace(/\n/g, "\\n") } as NodeJS.ProcessEnv);
    expect(cfg).not.toBeNull();
    const jwt = await tokenJaas(cfg!, "abcdefghjk", { id: "u7", nome: "José Romário", email: "corretor@exemplo.test", moderador: true });
    expect(decodeProtectedHeader(jwt)).toMatchObject({ alg: "RS256", kid: "vpaas-magic-cookie-teste/abc123" });
    const { payload } = await jwtVerify(jwt, await importSPKI(await exportSPKI(publicKey), "RS256"), { audience: "jitsi", issuer: "chat" });
    expect(payload.sub).toBe("vpaas-magic-cookie-teste");
    expect(payload.room).toBe("RomatecCRM-abcdefghjk");
    expect((payload.context as any).user).toMatchObject({ name: "José Romário", moderator: "true" });
    expect((payload.context as any).features.recording).toBe("false");
    expect(Number(payload.exp) - Number(payload.iat)).toBe(3 * 3600);
  });

  it("convidado entra sem ser moderador", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const cfg = { appId: "vpaas-magic-cookie-teste", kid: "kid", chave: await exportPKCS8(privateKey) };
    const jwt = await tokenJaas(cfg, "abcdefghjk", { id: "c1", nome: "Cliente", moderador: false });
    const corpo = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
    expect(corpo.context.user.moderator).toBe("false");
  });
});
