/**
 * Sala de vídeo (Jitsi) — regras puras compartilhadas entre tela e servidor.
 *
 * Dois modos:
 * - "embutido": a chamada roda DENTRO do CRM (Jitsi como serviço, 8x8 JaaS), com token assinado pelo
 *   servidor. Ativado quando JAAS_APP_ID / JAAS_KID / JAAS_PRIVATE_KEY estão configurados.
 * - "aba": sem JaaS, a sala abre no Jitsi público (meet.jit.si) numa aba do navegador — grátis, mas o
 *   meet.jit.si não permite mais embutir a chamada em outro site e pede login (Google/GitHub) de quem abre.
 */

export type ModoSala = "embutido" | "aba";

export const MAX_TITULO_SALA = 120;
export const MAX_NOME_PARTICIPANTE = 60;

/** Código da sala: 10 caracteres sem ambiguidade (sem 0/o/1/l/i) — difícil de adivinhar e fácil de ditar. */
const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";
export function gerarCodigoSala(aleatorio: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 10; i++) s += ALFABETO[Math.floor(aleatorio() * ALFABETO.length)];
  return s;
}

export function codigoValido(c: string): boolean {
  return /^[a-hjkmnp-z2-9]{10}$/.test(c);
}

/** Nome da sala no Jitsi (o mesmo nos dois modos): prefixo do CRM + código. */
export function nomeSalaJitsi(codigo: string): string {
  return `RomatecCRM-${codigo}`;
}

/** Link da sala no Jitsi público, já com o nome de quem entra. */
export function urlJitsiPublico(codigo: string, nome?: string): string {
  const base = `https://meet.jit.si/${nomeSalaJitsi(codigo)}`;
  const partes = [`config.prejoinConfig.enabled=true`, `config.defaultLanguage="ptBR"`];
  if (nome?.trim()) partes.push(`userInfo.displayName=${encodeURIComponent(JSON.stringify(nome.trim()))}`);
  return `${base}#${partes.join("&")}`;
}

/** Mensagem de convite para WhatsApp. */
export function textoConviteSala(d: { titulo: string; link: string; anfitriao?: string | null }): string {
  return [
    `Olá! Você foi convidado(a) para uma reunião por vídeo${d.anfitriao ? ` com ${d.anfitriao}` : ""}:`,
    `*${d.titulo}*`,
    "",
    "Para entrar, toque no link (funciona no celular e no computador, sem instalar nada):",
    d.link,
  ].join("\n");
}

export function nomeParticipanteValido(nome: string): string | null {
  const n = nome.trim().replace(/\s+/g, " ");
  if (n.length < 2) return null;
  return n.slice(0, MAX_NOME_PARTICIPANTE);
}
