import type { Db } from "@/lib/db/types";

/**
 * 같은 IP에서 10분(첫 시도 시각부터) 안에 코드를 평가해 볼 수 있는 시도는 5번까지다.
 * 시도를 **먼저 세고**, 그 번호가 5 이하일 때만 코드를 평가한다. 세기와 확인이 한 문장이라,
 * 요청이 동시에 몰려 들어와도 번호가 겹치거나 빠지지 않고 평가되는 시도는 5번을 넘지 않는다.
 * (확인한 뒤에 세는 방식은 이미 확인을 통과한 요청이 모두 평가돼서 잠금을 뚫린다.)
 */
export const MAX_FAILURES = 5;
export const WINDOW_MINUTES = 10;
const WINDOW_MS = WINDOW_MINUTES * 60_000;

export type AttemptState = {
  /** 이번 창에서 이번 시도가 몇 번째인지. `MAX_FAILURES`보다 크면 평가하지 않고 잠근다. */
  count: number;
  /** 창이 끝날 때(잠금이 풀릴 때)까지 남은 분(올림, 최소 1). */
  retryAfterMinutes: number;
};

type AttemptRow = { failed_count: number; window_ms: number };

// timestamptz도 드라이버마다 읽는 타입이 달라서, 에포크 밀리초 숫자로 바꿔서 받는다.
const WINDOW_MS_SQL = "floor(extract(epoch from window_start) * 1000)::float8 as window_ms";

/** 시도를 하나 기록하고(항상 +1, 창이 지났으면 1부터 다시), 이번 시도의 번호와 남은 시간을 돌려준다. */
export async function recordAttempt(db: Db, ipHash: string, now: Date): Promise<AttemptState> {
  const rows = await db.query<AttemptRow>(
    `insert into auth_attempts (ip_hash, failed_count, window_start)
     values ($1, 1, $2::timestamptz)
     on conflict (ip_hash) do update set
       failed_count = case
         when auth_attempts.window_start <= $2::timestamptz - make_interval(mins => $3::integer) then 1
         else auth_attempts.failed_count + 1 end,
       window_start = case
         when auth_attempts.window_start <= $2::timestamptz - make_interval(mins => $3::integer) then $2::timestamptz
         else auth_attempts.window_start end
     returning failed_count, ${WINDOW_MS_SQL}`,
    [ipHash, now.toISOString(), WINDOW_MINUTES],
  );
  const row = rows[0];
  const remaining = row.window_ms + WINDOW_MS - now.getTime();
  return { count: row.failed_count, retryAfterMinutes: Math.max(1, Math.ceil(remaining / 60_000)) };
}

/** 코드가 맞았을 때 시도 기록을 지운다. */
export async function clearFailures(db: Db, ipHash: string): Promise<void> {
  await db.query("delete from auth_attempts where ip_hash = $1", [ipHash]);
}
