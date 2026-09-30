import { createHmac } from "node:crypto";

const MAX_IP_LENGTH = 100;

/**
 * 요청한 사람의 IP. Vercel은 `x-forwarded-for`에 클라이언트의 공개 IP를 넣고, 밖에서 위조하지 못하게 덮어쓴다.
 * 로컬처럼 헤더가 없으면 모두 "unknown" 하나로 센다.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim() || "unknown";
  return ip.slice(0, MAX_IP_LENGTH);
}

/** IP를 그대로 저장하지 않고, 비밀키로 해시한 값만 저장한다. */
export function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32);
}
