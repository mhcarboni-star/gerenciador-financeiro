/** Web Push no navegador: suporte, permissão e inscrição deste aparelho. */

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export type PushSupport = "ok" | "ios-install" | "unsupported";

export function pushSupport(): PushSupport {
  const has = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIOS() && !isStandalone()) return "ios-install"; // no iPhone, só funciona com o app na tela inicial
  return has ? "ok" : "unsupported";
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function currentSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Pede permissão e inscreve. Lança erro com mensagem em português se não der. */
export async function subscribe(publicKey: string) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "As notificações estão bloqueadas para este site. Libere nas configurações do navegador/celular e tente de novo."
        : "Permissão não concedida.",
    );
  }
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  return { endpoint: j.endpoint, keys: j.keys, userAgent: navigator.userAgent.slice(0, 300) };
}

/** Nome amigável do aparelho a partir do navegador. */
export function deviceName(ua: string | null) {
  if (!ua) return "Aparelho";
  const os = /iphone/i.test(ua) ? "iPhone" : /ipad/i.test(ua) ? "iPad" : /android/i.test(ua) ? "Android" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "Mac" : /linux/i.test(ua) ? "Linux" : "Aparelho";
  const br = /edg\//i.test(ua) ? "Edge" : /chrome|crios/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "";
  return br ? `${os} · ${br}` : os;
}
