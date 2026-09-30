import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { MAX_FAILURES } from "./attempts";
import { createAuthHandlers, requireEditSession, type AuthDeps } from "./handlers";

// 편집 코드를 "실제로 비교한" 횟수를 센다. 상태 코드만 보면, 평가된 뒤 잠금 때문에 429로 바뀐 응답과
// 평가되지 않고 거절된 응답을 구별할 수 없다. (로그인 한 번에 비교는 최대 한 번이다.)
const comparisons = vi.hoisted(() => ({ count: 0 }));
vi.mock("./safe-equal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./safe-equal")>();
  return {
    ...actual,
    safeEqual: (a: string, b: string) => {
      comparisons.count += 1;
      return actual.safeEqual(a, b);
    },
  };
});
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken, readCookie, verifySessionToken } from "./session";

const CODE = "correct-horse-battery";
const SECRET = "s".repeat(32);
const ENV = { EDIT_CODE: CODE, SESSION_SECRET: SECRET };

let db: Db;
let close: () => Promise<void>;
let clock: Date;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  clock = new Date("2026-10-07T03:00:00Z");
});
afterEach(async () => {
  await close();
});

const deps = (overrides: Partial<AuthDeps> = {}): AuthDeps => ({
  getDb: () => db,
  env: () => ENV,
  now: () => clock,
  secureCookies: false,
  ...overrides,
});

function loginRequest(code: unknown, ip = "1.2.3.4", contentType = "application/json"): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": contentType, "x-forwarded-for": ip },
    body: JSON.stringify({ code }),
  });
}

describe("login", () => {
  it("올바른 코드면 200과 서명 쿠키를 준다", async () => {
    const response = await createAuthHandlers(deps()).login(loginRequest(CODE));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    const token = readCookie(cookie.split(";")[0], SESSION_COOKIE);
    expect(verifySessionToken(token, SECRET, clock.getTime())).toBe(true);
  });

  it("프로덕션 설정이면 Secure가 붙는다", async () => {
    const response = await createAuthHandlers(deps({ secureCookies: true })).login(loginRequest(CODE));
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("틀린 코드는 401이고 쿠키를 주지 않는다", async () => {
    const response = await createAuthHandlers(deps()).login(loginRequest("wrong"));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toContain("코드가 맞지 않아요");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("5번 틀리면 잠기고, 잠긴 동안은 올바른 코드도 거부하며, 10분 뒤 풀린다", async () => {
    const handlers = createAuthHandlers(deps());
    for (let i = 0; i < 4; i += 1) expect((await handlers.login(loginRequest("wrong"))).status, `${i + 1}번째`).toBe(401);

    const fifth = await handlers.login(loginRequest("wrong"));
    expect(fifth.status).toBe(429);
    expect(await fifth.json()).toMatchObject({ retryAfterMinutes: 10 });
    expect(fifth.headers.get("retry-after")).toBe("600");

    const whileLocked = await handlers.login(loginRequest(CODE));
    expect(whileLocked.status).toBe(429);
    expect(whileLocked.headers.get("set-cookie")).toBeNull();

    clock = new Date(clock.getTime() + 10 * 60_000);
    expect((await handlers.login(loginRequest(CODE))).status).toBe(200);
  });

  it("동시에 몰려 들어와도 코드를 평가하는 횟수는 5번을 넘지 않는다(올바른 코드가 뒤에 섞여 있어도 잠금을 뚫지 못한다)", async () => {
    const handlers = createAuthHandlers(deps());
    comparisons.count = 0;
    const burst = Array.from({ length: 30 }, (_, i) => handlers.login(loginRequest(i === 29 ? CODE : `wrong-${i}`)));
    const statuses = (await Promise.all(burst)).map((response) => response.status);

    expect(comparisons.count).toBeLessThanOrEqual(MAX_FAILURES);
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThanOrEqual(30 - MAX_FAILURES);
    // 뒤늦게 섞인 올바른 코드는 평가조차 되지 못하고 거절된다.
    expect(statuses[29]).toBe(429);
  });

  it("다른 IP는 잠기지 않는다", async () => {
    const handlers = createAuthHandlers(deps());
    for (let i = 0; i < 5; i += 1) await handlers.login(loginRequest("wrong", "9.9.9.9"));
    expect((await handlers.login(loginRequest(CODE, "9.9.9.9"))).status).toBe(429);
    expect((await handlers.login(loginRequest(CODE, "1.1.1.1"))).status).toBe(200);
  });

  it("성공하면 실패 횟수를 지운다", async () => {
    const handlers = createAuthHandlers(deps());
    for (let i = 0; i < 4; i += 1) await handlers.login(loginRequest("wrong"));
    expect((await handlers.login(loginRequest(CODE))).status).toBe(200);
    for (let i = 0; i < 4; i += 1) expect((await handlers.login(loginRequest("wrong"))).status).toBe(401);
  });

  it("문자열이 아니거나 아주 긴 코드도 죽지 않고 틀린 코드로 센다", async () => {
    const handlers = createAuthHandlers(deps());
    // 같은 IP로 다섯 번 틀리면 잠기므로, 값마다 다른 IP로 보내서 잠금과 섞이지 않게 한다.
    const codes: unknown[] = [undefined, null, 123, {}, [], "x".repeat(10_000)];
    for (const [index, code] of codes.entries()) {
      const response = await handlers.login(loginRequest(code, `10.0.0.${index}`));
      expect(response.status, JSON.stringify(code)?.slice(0, 20)).toBe(401);
    }
  });

  it("JSON이 아니면 415, 깨진 JSON이면 400이다", async () => {
    const handlers = createAuthHandlers(deps());
    expect((await handlers.login(loginRequest(CODE, "1.2.3.4", "text/plain"))).status).toBe(415);
    const broken = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{oops",
    });
    expect((await handlers.login(broken)).status).toBe(400);
  });

  it("편집 코드는 있는데 비밀키가 없거나, 코드가 너무 짧으면 503이다", async () => {
    for (const env of [{ EDIT_CODE: CODE }, { EDIT_CODE: "short", SESSION_SECRET: SECRET }]) {
      const response = await createAuthHandlers(deps({ env: () => env })).login(loginRequest(CODE));
      expect(response.status, JSON.stringify(env)).toBe(503);
      expect((await response.json()).error).toContain("설정");
    }
  });

  it("편집 코드를 설정하지 않았으면 코드를 받지 않으니, 로그인 요청은 쿠키 없이 그냥 통과한다", async () => {
    const response = await createAuthHandlers(deps({ env: () => ({}) })).login(loginRequest("아무거나"));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("데이터베이스가 없거나 오류가 나면 503이다", async () => {
    expect((await createAuthHandlers(deps({ getDb: () => null })).login(loginRequest(CODE))).status).toBe(503);

    const broken: Db = {
      query: async () => {
        throw new Error("neon down");
      },
    };
    const response = await createAuthHandlers(deps({ getDb: () => broken })).login(loginRequest(CODE));
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("logout", () => {
  it("쿠키를 지운다", async () => {
    const response = await createAuthHandlers(deps()).logout();
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("requireEditSession", () => {
  const withCookie = (cookie?: string) =>
    new Request("http://localhost/api/events", { method: "POST", headers: cookie ? { cookie } : {} });

  it("올바른 쿠키면 통과한다(다른 쿠키가 섞여 있어도)", () => {
    const token = createSessionToken(SECRET, clock.getTime());
    expect(requireEditSession(withCookie(`a=1; ${SESSION_COOKIE}=${token}; b=2`), ENV, clock)).toEqual({ ok: true });
  });

  it("쿠키가 없거나 위조·만료·다른 비밀키면 401이다", async () => {
    const token = createSessionToken(SECRET, clock.getTime());
    const [payload, signature] = token.split(".");
    const cases = [
      undefined,
      `${SESSION_COOKIE}=garbage`,
      `${SESSION_COOKIE}=${Number(payload) + 99}.${signature}`,
      `${SESSION_COOKIE}=${createSessionToken("x".repeat(32), clock.getTime())}`,
    ];
    for (const cookie of cases) {
      const result = requireEditSession(withCookie(cookie), ENV, clock);
      expect(result.ok, String(cookie)).toBe(false);
      if (!result.ok) expect(result.response.status, String(cookie)).toBe(401);
    }

    const later = new Date(clock.getTime() + (SESSION_TTL_SECONDS + 1) * 1000);
    const expired = requireEditSession(withCookie(`${SESSION_COOKIE}=${token}`), ENV, later);
    expect(expired.ok).toBe(false);
  });

  it("편집 코드는 있는데 비밀키가 없거나 코드가 너무 짧으면 503이다(닫힌 채로 둔다)", () => {
    for (const env of [{ EDIT_CODE: CODE }, { EDIT_CODE: "short", SESSION_SECRET: SECRET }]) {
      const result = requireEditSession(withCookie(), env, clock);
      expect(result.ok, JSON.stringify(env)).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(503);
    }
  });

  it("편집 코드를 설정하지 않았으면 쿠키가 없어도 통과한다(누구나 편집)", () => {
    expect(requireEditSession(withCookie(), {}, clock)).toEqual({ ok: true });
    expect(requireEditSession(withCookie(), { EDIT_CODE: "  " }, clock)).toEqual({ ok: true });
  });
});
