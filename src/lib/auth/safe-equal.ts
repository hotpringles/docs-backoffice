import { createHash, timingSafeEqual } from "node:crypto";

/**
 * 두 문자열이 같은지 비교한다. 길이가 달라도 걸리는 시간으로 정보를 흘리지 않도록,
 * 둘 다 SHA-256으로 같은 길이로 만든 뒤 시간이 일정한 방식으로 비교한다.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}
