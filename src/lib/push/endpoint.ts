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

/** 문자열에 적힌 그대로의 호스트 부분(`https://` 뒤부터 첫 `/`, `?`, `#` 앞까지). */
const WRITTEN_AUTHORITY = /^https:\/\/([^/?#]*)/i;
/** 소문자 영문, 숫자, 하이픈이 점으로 이어진 이름. 끝 점, 백틱, 따옴표, 유니코드는 여기서 걸러진다. */
const PLAIN_HOSTNAME = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/**
 * 허용된 푸시 서비스의 주소인지 검사한다.
 *
 * 검사는 WHATWG `new URL`로 하지만, 발송하는 web-push는 같은 문자열을 옛 `url.parse`로 다시 읽어 그 호스트로 연결한다.
 * 두 파서는 백틱, 따옴표, 탭·줄바꿈, `%2e`, 유니코드 점 같은 문자에서 호스트를 다르게 읽는다
 * (예: `https://evil.example`.web.push.apple.com/`은 여기서는 애플 도메인이지만 web-push는 evil.example로 연결한다).
 * 그래서 "문자열에 적힌 호스트가 파서가 읽은 호스트와 글자 그대로 같고, 평범한 호스트 이름 문자만 쓴" 주소만 통과시킨다.
 * 그러면 어느 파서로 읽어도 호스트가 같다.
 */
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
  if (WRITTEN_AUTHORITY.exec(raw)?.[1]?.toLowerCase() !== host) return false;
  if (!PLAIN_HOSTNAME.test(host)) return false;

  return EXACT_HOSTS.has(host) || HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
