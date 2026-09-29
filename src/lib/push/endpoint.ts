/**
 * 브라우저가 알려 주는 푸시 주소(endpoint)는 사용자가 보내는 값이다.
 * 그대로 믿으면 서버가 아무 주소로나 요청을 보내게 되므로(SSRF), 실제 푸시 서비스의 주소만 허용한다.
 *
 * - Chrome, Edge(Chromium), Samsung Internet: fcm.googleapis.com
 * - Firefox: updates.push.services.mozilla.com
 * - Safari(iOS, macOS): *.push.apple.com (예: web.push.apple.com)
 * - Edge(WNS): *.notify.windows.com
 */
const EXACT_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com"]);
const HOST_SUFFIXES = [".push.apple.com", ".notify.windows.com"];

export const MAX_ENDPOINT_LENGTH = 2000;

export function isAllowedPushEndpoint(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_ENDPOINT_LENGTH) return false;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port) return false; // 기본 포트(443)만 허용한다.

  const host = url.hostname.toLowerCase();
  return EXACT_HOSTS.has(host) || HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
