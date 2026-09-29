export type PushEnv = {
  userAgent: string;
  maxTouchPoints: number;
  /** 홈 화면에 추가한 앱(standalone)으로 열렸는지 */
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  permission: NotificationPermission | "unsupported";
};

/**
 * - unsupported: 이 브라우저는 웹 푸시를 지원하지 않는다.
 * - ios-needs-install: iPhone/iPad의 Safari 탭에서는 알림을 받을 수 없고, 홈 화면에 추가한 앱에서만 된다.
 * - denied: 사용자가 알림을 차단했다. 사이트에서 다시 물어볼 수 없다.
 * - ready: 구독할 수 있다.
 */
export type PushSupport = "unsupported" | "ios-needs-install" | "denied" | "ready";

function isIos(env: Pick<PushEnv, "userAgent" | "maxTouchPoints">): boolean {
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return true;
  // iPadOS 13 이상은 Mac처럼 보이는 user agent를 보내므로 터치 지원으로 구분한다.
  return /Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1;
}

export function detectPushSupport(env: PushEnv): PushSupport {
  // iOS의 Safari 탭에는 PushManager 자체가 없어서, 지원 여부보다 먼저 "홈 화면에 추가"를 안내해야 한다.
  if (isIos(env) && !env.standalone) return "ios-needs-install";
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return "unsupported";
  if (env.permission === "denied") return "denied";
  return "ready";
}

/** VAPID 공개키(base64url 문자열)를 `pushManager.subscribe`가 받는 바이트로 바꾼다. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
