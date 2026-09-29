import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/types";
import { createTestDb } from "@/lib/db/testing";
import {
  listSubscriptions,
  MAX_SUBSCRIPTIONS,
  parseSubscription,
  removeSubscription,
  saveSubscription,
  type PushSubscriptionInput,
} from "./subscriptions";

// 실제 브라우저가 만드는 자릿수와 같은 값(p256dh 87자, auth 22자)
const P256DH = "B".repeat(87);
const AUTH = "a".repeat(22);

function sub(n: number, overrides: Partial<PushSubscriptionInput> = {}): PushSubscriptionInput {
  return { endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`, p256dh: P256DH, auth: AUTH, ...overrides };
}

describe("parseSubscription", () => {
  const valid = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: P256DH, auth: AUTH } };

  it("브라우저 PushSubscription JSON 모양을 받아들인다", () => {
    expect(parseSubscription(valid)).toEqual({
      ok: true,
      value: { endpoint: valid.endpoint, p256dh: P256DH, auth: AUTH },
    });
  });

  it("expirationTime 같은 다른 필드는 무시한다", () => {
    expect(parseSubscription({ ...valid, expirationTime: null }).ok).toBe(true);
  });

  it("객체가 아니면 거부한다", () => {
    for (const input of [null, undefined, "x", 1, [], [valid]]) {
      expect(parseSubscription(input).ok, String(input)).toBe(false);
    }
  });

  it("허용되지 않는 주소는 거부한다", () => {
    const result = parseSubscription({ ...valid, endpoint: "https://169.254.169.254/latest" });
    expect(result).toEqual({ ok: false, error: "허용되지 않는 푸시 주소예요." });
  });

  it("키가 없거나 형식이 틀리면 거부한다", () => {
    expect(parseSubscription({ endpoint: valid.endpoint }).ok).toBe(false);
    expect(parseSubscription({ endpoint: valid.endpoint, keys: null }).ok).toBe(false);
    expect(parseSubscription({ ...valid, keys: { p256dh: "short", auth: AUTH } }).ok).toBe(false);
    expect(parseSubscription({ ...valid, keys: { p256dh: P256DH, auth: "짧" } }).ok).toBe(false);
    expect(parseSubscription({ ...valid, keys: { p256dh: `${P256DH}!!`, auth: AUTH } }).ok).toBe(false);
    expect(parseSubscription({ ...valid, keys: { p256dh: 123, auth: AUTH } }).ok).toBe(false);
  });
});

describe("구독 저장소", () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
  });
  afterEach(async () => {
    await close();
  });

  it("새 구독은 created, 같은 주소를 다시 저장하면 updated이고 키만 바뀐다", async () => {
    expect(await saveSubscription(db, sub(1))).toBe("created");
    expect(await saveSubscription(db, sub(1, { auth: "b".repeat(22) }))).toBe("updated");

    const all = await listSubscriptions(db);
    expect(all).toHaveLength(1);
    expect(all[0].auth).toBe("b".repeat(22));
  });

  it("삭제하면 목록에서 사라지고, 없는 주소를 지워도 오류가 없다", async () => {
    await saveSubscription(db, sub(1));
    await saveSubscription(db, sub(2));
    await removeSubscription(db, sub(1).endpoint);
    await removeSubscription(db, "https://fcm.googleapis.com/fcm/send/none");

    expect((await listSubscriptions(db)).map((s) => s.endpoint)).toEqual([sub(2).endpoint]);
  });

  it("상한에 도달하면 새 구독은 limit으로 거부하고, 이미 있는 구독은 계속 갱신할 수 있다", async () => {
    for (let i = 0; i < MAX_SUBSCRIPTIONS; i++) {
      expect(await saveSubscription(db, sub(i))).toBe("created");
    }
    expect(await saveSubscription(db, sub(MAX_SUBSCRIPTIONS))).toBe("limit");
    expect(await listSubscriptions(db)).toHaveLength(MAX_SUBSCRIPTIONS);

    expect(await saveSubscription(db, sub(0, { auth: "c".repeat(22) }))).toBe("updated");
  });

  it("SQL 주입 문자열이 든 주소도 그대로 값으로만 저장된다", async () => {
    const evil = sub(1, { endpoint: "https://fcm.googleapis.com/x'); drop table push_subscriptions; --" });
    expect(await saveSubscription(db, evil)).toBe("created");
    expect(await listSubscriptions(db)).toHaveLength(1);
  });
});
