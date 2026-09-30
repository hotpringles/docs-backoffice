import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  clearSessionCookie,
  createSessionToken,
  readCookie,
  sessionCookie,
  verifySessionToken,
} from "./session";

const SECRET = "s".repeat(32);
const NOW = 1_800_000_000_000;

describe("세션 토큰", () => {
  it("만든 토큰은 만료 전에 통과한다", () => {
    const token = createSessionToken(SECRET, NOW);
    expect(verifySessionToken(token, SECRET, NOW)).toBe(true);
    expect(verifySessionToken(token, SECRET, NOW + (SESSION_TTL_SECONDS - 1) * 1000)).toBe(true);
  });

  it("만료 시각부터는 거부한다", () => {
    const token = createSessionToken(SECRET, NOW);
    const expiresMs = (Math.floor(NOW / 1000) + SESSION_TTL_SECONDS) * 1000;
    expect(verifySessionToken(token, SECRET, expiresMs - 1)).toBe(true);
    expect(verifySessionToken(token, SECRET, expiresMs)).toBe(false);
    expect(verifySessionToken(token, SECRET, expiresMs + 86_400_000)).toBe(false);
  });

  it("만료 시각을 고치거나 서명을 바꾸면 거부한다", () => {
    const token = createSessionToken(SECRET, NOW);
    const [payload, signature] = token.split(".");
    expect(verifySessionToken(`${Number(payload) + 1_000_000}.${signature}`, SECRET, NOW)).toBe(false);
    expect(verifySessionToken(`${payload}.${signature.replace(/.$/, signature.endsWith("0") ? "1" : "0")}`, SECRET, NOW)).toBe(false);
    expect(verifySessionToken(`${payload}.`, SECRET, NOW)).toBe(false);
  });

  it("다른 비밀키로 서명한 토큰은 거부한다", () => {
    const token = createSessionToken("x".repeat(32), NOW);
    expect(verifySessionToken(token, SECRET, NOW)).toBe(false);
  });

  it("모양이 이상한 토큰은 죽지 않고 거부한다", () => {
    for (const token of [undefined, null, "", "abc", ".", "1.2.3", "9999999999999.abc", "-1.abc", "1e9.abc", "abc.def", "  "]) {
      expect(verifySessionToken(token, SECRET, NOW), String(token)).toBe(false);
    }
  });
});

describe("쿠키 문자열", () => {
  it("Set-Cookie 값에 보안 속성이 붙는다", () => {
    const cookie = sessionCookie("tok.en", true);
    expect(cookie).toContain(`${SESSION_COOKIE}=tok.en`);
    for (const part of ["Path=/", "Max-Age=604800", "HttpOnly", "SameSite=Lax", "Secure"]) expect(cookie).toContain(part);
  });

  it("secure가 꺼져 있으면 Secure를 붙이지 않는다(로컬 개발용)", () => {
    expect(sessionCookie("t", false)).not.toContain("Secure");
    expect(clearSessionCookie(false)).not.toContain("Secure");
  });

  it("지우는 쿠키는 값이 비고 Max-Age가 0이다", () => {
    const cookie = clearSessionCookie(true);
    expect(cookie).toContain(`${SESSION_COOKIE}=;`);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
  });

  it("요청의 Cookie 헤더에서 이름으로 값을 찾는다", () => {
    expect(readCookie("a=1; edit_session=abc.def; b=2", "edit_session")).toBe("abc.def");
    expect(readCookie("edit_session=abc", "edit_session")).toBe("abc");
    expect(readCookie("xedit_session=abc", "edit_session")).toBeUndefined();
    expect(readCookie("a=1", "edit_session")).toBeUndefined();
    expect(readCookie("", "edit_session")).toBeUndefined();
    expect(readCookie(null, "edit_session")).toBeUndefined();
    expect(readCookie("edit_session=a=b", "edit_session")).toBe("a=b");
  });
});
