/**
 * Web Push no navegador (v1.8.0): suporte, permissão e inscrição no service worker.
 * iOS só entrega push para o CRM instalado na tela de início (iOS 16.4 ou mais novo).
 */
export type EstadoPush = "sem_suporte" | "ios_instalar" | "negado" | "ativo" | "disponivel";

export const ehIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const instaladoNaTela = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
const temSuporte = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Chave VAPID (base64url) → bytes para o pushManager */
export function chaveParaBytes(base64url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const bin = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

export async function estadoPush(): Promise<EstadoPush> {
  if (ehIOS() && !instaladoNaTela()) return "ios_instalar";
  if (!temSuporte()) return "sem_suporte";
  if (Notification.permission === "denied") return "negado";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "ativo" : "disponivel";
}

/** Pede a permissão e inscreve este aparelho; devolve a inscrição para gravar no servidor */
export async function inscreverAparelho(chavePublica: string) {
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") throw new Error(permissao === "denied" ? "Notificações bloqueadas no navegador" : "Permissão não concedida");
  const reg = await navigator.serviceWorker.ready;
  const atual = await reg.pushManager.getSubscription();
  const sub = atual ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chavePublica) as BufferSource });
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  return { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } };
}

/** Cancela neste aparelho; devolve o endpoint para apagar no servidor */
export async function cancelarAparelho(): Promise<string | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  await sub.unsubscribe();
  return sub.endpoint;
}
