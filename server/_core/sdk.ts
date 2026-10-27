import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
  /** users.sessaoVersao no login: trocar o perfil sobe a versão e encerra as sessões antigas */
  sv?: number;
};

class SDKServer {
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }

  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string; sessaoVersao?: number } = {}
  ): Promise<string> {
    return this.signSession(
      { openId, appId: "romatec", name: options.name || "", sv: options.sessaoVersao ?? 0 },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();
    return new SignJWT({ openId: payload.openId, appId: payload.appId, name: payload.name, sv: payload.sv ?? 0 })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; appId: string; name: string; sv: number } | null> {
    if (!cookieValue) return null;
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, { algorithms: ["HS256"] });
      const { openId, appId, name, sv } = payload as Record<string, unknown>;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) return null;
      return { openId, appId, name, sv: typeof sv === "number" ? sv : 0 };
    } catch {
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<User> {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) throw ForbiddenError("Invalid session cookie");

    const user = await db.getUserByOpenId(session.openId);
    if (!user) throw ForbiddenError("User not found");
    // Perfil trocado pelo admin depois do login: a sessão antiga não vale mais
    if (!sessaoValida(session.sv, (user as any).sessaoVersao)) throw ForbiddenError("Session expired");

    await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
    // "Ver como" do administrador (server/_core/verComo.ts): responde como o usuário escolhido, só leitura
    const { aplicarVerComo } = await import('./verComo');
    return aplicarVerComo(req, user);
  }
}

/** Token vale se foi emitido na versão de sessão atual do usuário (tokens antigos, sem versão, contam como 0) */
export const sessaoValida = (versaoToken: number | undefined, versaoUsuario: number | null | undefined) =>
  (versaoToken ?? 0) === (Number(versaoUsuario) || 0);

export const sdk = new SDKServer();
