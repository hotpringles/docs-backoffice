import type { Db } from "@/lib/db/types";

/** 10분 안에 5번 틀리면 그 IP를 10분(첫 실패 시각 기준) 동안 잠근다. */
export const MAX_FAILURES = 5;
export const WINDOW_MINUTES = 10;
const WINDOW_MS = WINDOW_MINUTES * 60_000;

export type LockState = { locked: false } | { locked: true; retryAfterMinutes: number };

type AttemptRow = { failed_count: number; window_ms: number };

// timestamptz도 드라이버마다 읽는 타입이 달라서, 에포크 밀리초 숫자로 바꿔서 받는다.
const WINDOW_MS_SQL = "floor(extract(epoch from window_start) * 1000)::float8 as window_ms";

function stateOf(row: AttemptRow | undefined, now: Date): LockState {
  if (!row || row.failed_count < MAX_FAILURES) return { locked: false };
  const remaining = row.window_ms + WINDOW_MS - now.getTime();
  if (remaining <= 0) return { locked: false };
  return { locked: true, retryAfterMinutes: Math.ceil(remaining / 60_000) };
}

export async function checkLock(db: Db, ipHash: string, now: Date): Promise<LockState> {
  const rows = await db.query<AttemptRow>(
    `select failed_count, ${WINDOW_MS_SQL} from auth_attempts where ip_hash = $1`,
    [ipHash],
  );
  return stateOf(rows[0], now);
}

/** 실패를 하나 기록하고, 이번 실패까지 센 잠금 상태를 돌려준다. 한 문장이라 동시에 들어와도 하나도 빠지지 않는다. */
export async function recordFailure(db: Db, ipHash: string, now: Date): Promise<LockState> {
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
  return stateOf(rows[0], now);
}

export async function clearFailures(db: Db, ipHash: string): Promise<void> {
  await db.query("delete from auth_attempts where ip_hash = $1", [ipHash]);
}
