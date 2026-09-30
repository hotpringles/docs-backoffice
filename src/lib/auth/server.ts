import "server-only";
import { cookies } from "next/headers";
import { isEditCodeRequired, loadAuthConfig } from "./config";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/** 서버 컴포넌트에서 지금 요청이 편집 권한을 가졌는지 확인한다. 편집 코드를 설정하지 않았으면 누구나 true, 설정이 잘못됐으면 false. */
export async function hasEditSession(now: Date = new Date(), env: Record<string, string | undefined> = process.env): Promise<boolean> {
  if (!isEditCodeRequired(env)) return true;
  const auth = loadAuthConfig(env);
  if (!auth.ok) return false;
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value, auth.config.sessionSecret, now.getTime());
}
