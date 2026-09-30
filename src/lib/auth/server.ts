import "server-only";
import { cookies } from "next/headers";
import { loadAuthConfig } from "./config";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/** 서버 컴포넌트에서 지금 요청이 편집 권한을 가졌는지 확인한다. 인증 설정이 없으면 false. */
export async function hasEditSession(now: Date = new Date(), env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const auth = loadAuthConfig(env);
  if (!auth.ok) return false;
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value, auth.config.sessionSecret, now.getTime());
}
