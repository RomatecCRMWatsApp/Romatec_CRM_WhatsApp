/**
 * Segurança do login e da configuração da empresa.
 *
 * - Senha com scrypt (node:crypto) e sal aleatório: "scrypt$<sal hex>$<hash hex>"
 * - Primeiro acesso de quem ainda não tem senha: só com CRM_INITIAL_PASSWORD
 *   (variável do Railway); a senha digitada vira a senha do usuário
 * - Segredos da companyConfig (tokens Z-API/Telegram/OpenAI) nunca saem
 *   inteiros pela API: vão mascarados e o update ignora valor mascarado
 */

import crypto from 'crypto';

const KEY_LEN = 64;
const MIN_PASSWORD_LEN = 8;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LEN, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'));
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

/** Mensagem de erro se a senha for fraca; null se ok */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LEN) return `A senha precisa ter pelo menos ${MIN_PASSWORD_LEN} caracteres`;
  if (/^\d+$/.test(password)) return 'A senha não pode ter só números';
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export type LoginCheck =
  | { ok: true; setPasswordHash?: string }
  | { ok: false; reason: 'wrong_password' | 'no_password_set' };

/** Hash antigo (changePassword de abr/2026): SHA-256 hex da senha, sem sal */
function legacySha256(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Confere a senha de um usuário. Ordem:
 * 1. hash scrypt (coluna password_hash)
 * 2. hash antigo SHA-256 (coluna passwordHash) → se conferir, devolve o scrypt para regravar
 * 3. sem nenhum hash: só a senha inicial CRM_INITIAL_PASSWORD, que vira a senha do usuário
 */
export async function checkLogin(
  password: string,
  stored: { scryptHash?: string | null; legacySha256?: string | null },
  initialPassword: string | undefined = process.env.CRM_INITIAL_PASSWORD,
): Promise<LoginCheck> {
  if (stored.scryptHash) {
    return (await verifyPassword(password, stored.scryptHash)) ? { ok: true } : { ok: false, reason: 'wrong_password' };
  }
  if (stored.legacySha256) {
    if (!safeEqual(legacySha256(password), stored.legacySha256.toLowerCase())) return { ok: false, reason: 'wrong_password' };
    return { ok: true, setPasswordHash: await hashPassword(password) };
  }
  if (!initialPassword || initialPassword.length < MIN_PASSWORD_LEN) return { ok: false, reason: 'no_password_set' };
  if (!safeEqual(password, initialPassword)) return { ok: false, reason: 'wrong_password' };
  return { ok: true, setPasswordHash: await hashPassword(password) };
}

// ─── Configuração da empresa ─────────────────────────────────────────────────
export const SECRET_CONFIG_FIELDS = ['zApiInstanceId', 'zApiToken', 'zApiClientToken', 'telegramBotToken', 'openAiApiKey'] as const;
const MASK = '••••••';

export function maskSecret(value: string | null | undefined): string {
  if (!value) return '';
  return `${MASK}${value.length > 8 ? value.slice(-4) : ''}`;
}

export function isMasked(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(MASK);
}

/** companyConfig para o navegador: segredos mascarados */
export function publicCompanyConfig<T extends Record<string, any>>(config: T | null | undefined): T | null {
  if (!config) return null;
  const out: Record<string, any> = { ...config };
  for (const f of SECRET_CONFIG_FIELDS) out[f] = maskSecret(config[f]);
  return out as T;
}

/** Remove do update os campos que voltaram mascarados (o usuário não mexeu neles) */
export function stripMaskedFields<T extends Record<string, any>>(input: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(input)) if (!isMasked(v)) out[k] = v;
  return out as Partial<T>;
}
