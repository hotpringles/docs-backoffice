export type AuthConfig = { editCode: string; sessionSecret: string };
export type AuthConfigResult = { ok: true; config: AuthConfig } | { ok: false; missing: string[] };

/**
 * 편집 코드를 받을지. `EDIT_CODE`를 비워 두면(없거나 공백뿐) 코드 없이 누구나 편집한다.
 * 무언가 적혀 있으면 받는 쪽이다: 너무 짧은 값처럼 잘못 적은 경우에도 문을 열지 않고 닫은 채로 둔다(`loadAuthConfig`가 이유를 알려준다).
 */
export function isEditCodeRequired(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.EDIT_CODE?.trim());
}

/** 편집 인증에 필요한 환경변수. 없거나 너무 짧으면 편집을 막고(조회는 된다), 무엇이 문제인지 알려준다. */
export function loadAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfigResult {
  const editCode = env.EDIT_CODE?.trim();
  const sessionSecret = env.SESSION_SECRET?.trim();

  const missing: string[] = [];
  if (!editCode || editCode.length < 8) missing.push("EDIT_CODE (8자 이상)");
  if (!sessionSecret || sessionSecret.length < 16) missing.push("SESSION_SECRET (16자 이상)");
  if (missing.length > 0 || !editCode || !sessionSecret) return { ok: false, missing };
  return { ok: true, config: { editCode, sessionSecret } };
}
