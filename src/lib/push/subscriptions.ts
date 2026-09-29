import type { Db } from "@/lib/db/types";
import { isAllowedPushEndpoint } from "./endpoint";

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type ParseResult = { ok: true; value: PushSubscriptionInput } | { ok: false; error: string };

/** 저장할 수 있는 구독 수의 상한. 로그인이 없는 사이트라 누구나 구독할 수 있어서 테이블이 무한히 커지지 않게 막는다. */
export const MAX_SUBSCRIPTIONS = 100;

// P-256 공개키(65바이트)는 base64url로 87자, auth 비밀(16바이트)은 22자다. 여유를 두고 자릿수만 확인한다.
const P256DH_RE = /^[A-Za-z0-9_-]{80,100}$/;
const AUTH_RE = /^[A-Za-z0-9_-]{16,32}$/;

/** 브라우저의 `PushSubscription.toJSON()` 모양(`{ endpoint, keys: { p256dh, auth } }`)을 검증해서 꺼낸다. */
export function parseSubscription(input: unknown): ParseResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "구독 정보가 올바르지 않아요." };
  }
  const { endpoint, keys } = input as { endpoint?: unknown; keys?: unknown };

  if (!isAllowedPushEndpoint(endpoint)) {
    return { ok: false, error: "허용되지 않는 푸시 주소예요." };
  }
  if (typeof keys !== "object" || keys === null) {
    return { ok: false, error: "구독 키가 없어요." };
  }
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown };
  if (typeof p256dh !== "string" || !P256DH_RE.test(p256dh)) {
    return { ok: false, error: "구독 키(p256dh) 형식이 올바르지 않아요." };
  }
  if (typeof auth !== "string" || !AUTH_RE.test(auth)) {
    return { ok: false, error: "구독 키(auth) 형식이 올바르지 않아요." };
  }
  return { ok: true, value: { endpoint, p256dh, auth } };
}

export type SaveResult = "created" | "updated" | "limit";

/**
 * 구독을 저장한다. 같은 주소가 이미 있으면 키만 갱신한다.
 * 새 구독이면서 이미 상한에 도달했다면 저장하지 않고 "limit"을 돌려준다.
 */
export async function saveSubscription(db: Db, sub: PushSubscriptionInput): Promise<SaveResult> {
  const rows = await db.query<{ inserted: boolean }>(
    `insert into push_subscriptions (endpoint, p256dh, auth)
     select $1::text, $2::text, $3::text
     where exists (select 1 from push_subscriptions where endpoint = $1)
        or (select count(*) from push_subscriptions) < $4
     on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth
     returning (xmax = 0) as inserted`,
    [sub.endpoint, sub.p256dh, sub.auth, MAX_SUBSCRIPTIONS],
  );
  if (rows.length === 0) return "limit";
  return rows[0].inserted ? "created" : "updated";
}

export async function removeSubscription(db: Db, endpoint: string): Promise<void> {
  await db.query("delete from push_subscriptions where endpoint = $1", [endpoint]);
}

export async function listSubscriptions(db: Db): Promise<PushSubscriptionInput[]> {
  return db.query<PushSubscriptionInput>(
    "select endpoint, p256dh, auth from push_subscriptions order by created_at, endpoint",
  );
}
