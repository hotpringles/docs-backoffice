import { requireEditSession } from "@/lib/auth/handlers";
import type { Db } from "@/lib/db/types";
import { json, readJsonBody } from "@/lib/http";
import { loadPeople, type Person } from "@/lib/people";

type Env = Record<string, string | undefined>;

export type GuardDeps = {
  getDb: () => Db | null;
  env: () => Env;
  now: () => Date;
};

export type GuardContext = { db: Db; body: unknown; people: Person[] };

export type GuardOptions = {
  /** 편집 권한(서명 쿠키)이 필요한지. 기본은 필요하다. 가능한 시간 저장처럼 이름만 고르는 쓰기는 false. */
  requireSession?: boolean;
  /** DB 오류를 서버 로그에 남길 때 붙이는 말. */
  failureLog?: string;
};

/**
 * 쓰기 요청의 공통 확인: 편집 권한(선택) → JSON 본문 → 명단 → DB 순으로 확인한 뒤 실행한다.
 * 인증이 가장 먼저라서 권한 없는 요청에는 검증 정보를 알려주지 않는다. 실행 중 DB 오류는 503으로 바꾼다.
 * 일정 API와 모임 API가 함께 쓴다.
 */
export async function guardedWrite(
  deps: GuardDeps,
  request: Request,
  run: (context: GuardContext) => Promise<Response>,
  options: GuardOptions = {},
): Promise<Response> {
  const { requireSession = true, failureLog = "쓰기 요청을 처리하다 데이터베이스 오류가 났어요" } = options;

  if (requireSession) {
    const session = requireEditSession(request, deps.env(), deps.now());
    if (!session.ok) return session.response;
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const people = loadPeople(deps.env());
  if (!people.ok) return json({ error: people.error }, 503);

  const db = deps.getDb();
  if (!db) return json({ error: "데이터베이스가 설정되지 않았어요." }, 503);

  try {
    return await run({ db, body: parsed.body, people: people.people });
  } catch (error) {
    console.error(failureLog, error);
    return json({ error: "데이터베이스에 연결하지 못했어요." }, 503);
  }
}
