import { createHmac } from "node:crypto";
import { safeEqual } from "./safe-equal";

export const SESSION_COOKIE = "edit_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** 토큰은 "<만료 시각(초)>.<서명>" 모양이다. 서버에 세션을 저장하지 않고, 서명과 만료 시각만 확인한다. */
export function createSessionToken(secret: string, nowMs: number, ttlSeconds = SESSION_TTL_SECONDS): string {
  const payload = String(Math.floor(nowMs / 1000) + ttlSeconds);
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string | undefined | null, secret: string, nowMs: number): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  if (!/^\d{1,12}$/.test(payload) || !signature) return false;
  if (!safeEqual(signature, sign(payload, secret))) return false;
  return Number(payload) * 1000 > nowMs;
}

function cookieAttributes(maxAge: number, secure: boolean): string[] {
  return ["Path=/", `Max-Age=${maxAge}`, "HttpOnly", "SameSite=Lax", ...(secure ? ["Secure"] : [])];
}

/** `Set-Cookie` 헤더 값. `secure`는 프로덕션(HTTPS)에서만 켠다. */
export function sessionCookie(token: string, secure: boolean): string {
  return [`${SESSION_COOKIE}=${token}`, ...cookieAttributes(SESSION_TTL_SECONDS, secure)].join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  return [`${SESSION_COOKIE}=`, ...cookieAttributes(0, secure)].join("; ");
}

/** 요청의 `Cookie` 헤더에서 이름으로 값을 찾는다. */
export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const equals = trimmed.indexOf("=");
    if (equals > 0 && trimmed.slice(0, equals) === name) return trimmed.slice(equals + 1);
  }
  return undefined;
}
