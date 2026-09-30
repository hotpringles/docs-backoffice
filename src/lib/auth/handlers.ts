import type { Db } from "@/lib/db/types";
import { json, readJsonBody } from "@/lib/http";
import { MAX_FAILURES, clearFailures, recordAttempt } from "./attempts";
import { loadAuthConfig } from "./config";
import { clientIp, hashIp } from "./ip";
import { safeEqual } from "./safe-equal";
import { SESSION_COOKIE, clearSessionCookie, createSessionToken, readCookie, sessionCookie, verifySessionToken } from "./session";

type Env = Record<string, string | undefined>;

export type AuthDeps = {
  getDb: () => Db | null;
  env: () => Env;
  now: () => Date;
  /** 프로덕션(HTTPS)에서만 true. 로컬 http에서는 Secure 쿠키가 저장되지 않는다. */
  secureCookies: boolean;
};

const MAX_CODE_LENGTH = 200;

function locked(minutes: number): Response {
  return json(
    { error: `시도가 너무 많아요. ${minutes}분 뒤에 다시 시도해 주세요.`, retryAfterMinutes: minutes },
    429,
    { "retry-after": String(minutes * 60) },
  );
}

/**
 * 쓰기 요청이 편집 권한(서명 쿠키)을 가졌는지 확인한다.
 * 쿠키가 없거나 틀리면 401, 인증 환경변수가 없으면 503.
 */
export function requireEditSession(
  request: Request,
  env: Env,
  now: Date,
): { ok: true } | { ok: false; response: Response } {
  const auth = loadAuthConfig(env);
  if (!auth.ok) return { ok: false, response: json({ error: "편집 코드가 설정되지 않았어요." }, 503) };

  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!verifySessionToken(token, auth.config.sessionSecret, now.getTime())) {
    return { ok: false, response: json({ error: "편집 코드를 먼저 입력해 주세요." }, 401) };
  }
  return { ok: true };
}

export function createAuthHandlers(deps: AuthDeps) {
  return {
    /** 편집 코드를 확인하고 맞으면 서명 쿠키를 준다. 틀리면 IP별로 세고, 5번 틀리면 10분 잠근다. */
    async login(request: Request): Promise<Response> {
      const parsed = await readJsonBody(request);
      if (!parsed.ok) return parsed.response;

      const auth = loadAuthConfig(deps.env());
      if (!auth.ok) return json({ error: "편집 코드가 설정되지 않았어요." }, 503);
      const db = deps.getDb();
      if (!db) return json({ error: "데이터베이스가 설정되지 않았어요." }, 503);

      const now = deps.now();
      const ipHash = hashIp(clientIp(request.headers), auth.config.sessionSecret);
      const code = (parsed.body as { code?: unknown } | null)?.code;

      try {
        // 시도를 먼저 세고, 번호가 5 이하일 때만 코드를 평가한다(동시에 몰려 와도 평가는 5번을 넘지 않는다).
        const attempt = await recordAttempt(db, ipHash, now);
        if (attempt.count > MAX_FAILURES) return locked(attempt.retryAfterMinutes);

        const correct = typeof code === "string" && code.length <= MAX_CODE_LENGTH && safeEqual(code, auth.config.editCode);
        if (!correct) {
          // 5번째 시도가 틀렸으면 바로 잠겼다고 알린다.
          return attempt.count >= MAX_FAILURES ? locked(attempt.retryAfterMinutes) : json({ error: "코드가 맞지 않아요." }, 401);
        }
        await clearFailures(db, ipHash);
      } catch (error) {
        console.error("편집 코드를 확인하다 데이터베이스 오류가 났어요", error);
        return json({ error: "데이터베이스에 연결하지 못했어요." }, 503);
      }

      const token = createSessionToken(auth.config.sessionSecret, now.getTime());
      return json({ ok: true }, 200, { "set-cookie": sessionCookie(token, deps.secureCookies) });
    },

    async logout(): Promise<Response> {
      return json({ ok: true }, 200, { "set-cookie": clearSessionCookie(deps.secureCookies) });
    },
  };
}
