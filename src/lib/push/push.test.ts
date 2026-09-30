import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/types";
import { createTestDb } from "@/lib/db/testing";
import type { PushPayload } from "./payload";
import { sendToAll, type Sender } from "./send";
import { listSubscriptions, saveSubscription, type PushSubscriptionInput } from "./subscriptions";

const P256DH = "B".repeat(87);
const AUTH = "a".repeat(22);
const sub = (n: number): PushSubscriptionInput => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`,
  p256dh: P256DH,
  auth: AUTH,
});

describe("sendToAll", () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await close();
  });

  const payload: PushPayload = { title: "시험 알림", body: "본문", url: "/", tag: "test" };

  it("모든 구독자에게 JSON 본문을 보낸다", async () => {
    await saveSubscription(db, sub(1));
    await saveSubscription(db, sub(2));
    const calls: [string, string][] = [];
    const sender: Sender = async (s, body) => {
      calls.push([s.endpoint, body]);
    };

    const summary = await sendToAll(db, sender, payload);

    expect(summary).toEqual({ total: 2, sent: 2, removed: 0, failed: 0 });
    expect(calls.map(([endpoint]) => endpoint).sort()).toEqual([sub(1).endpoint, sub(2).endpoint]);
    expect(JSON.parse(calls[0][1])).toEqual(payload);
  });

  it("404, 410으로 사라진 구독은 지우고, 다른 실패는 세기만 하고 나머지는 계속 보낸다", async () => {
    for (const n of [1, 2, 3, 4]) await saveSubscription(db, sub(n));
    const sender: Sender = async (s) => {
      if (s.endpoint.endsWith("device-1")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (s.endpoint.endsWith("device-2")) throw Object.assign(new Error("not found"), { statusCode: 404 });
      if (s.endpoint.endsWith("device-3")) throw Object.assign(new Error("server error"), { statusCode: 500 });
    };

    const summary = await sendToAll(db, sender, payload);

    expect(summary).toEqual({ total: 4, sent: 1, removed: 2, failed: 1 });
    expect((await listSubscriptions(db)).map((s) => s.endpoint).sort()).toEqual([sub(3).endpoint, sub(4).endpoint]);
  });

  it("상태 코드가 없는 오류(네트워크 실패 등)는 구독을 지우지 않는다", async () => {
    await saveSubscription(db, sub(1));
    const sender: Sender = async () => {
      throw new Error("network down");
    };
    const summary = await sendToAll(db, sender, payload);
    expect(summary).toEqual({ total: 1, sent: 0, removed: 0, failed: 1 });
    expect(await listSubscriptions(db)).toHaveLength(1);
  });

  it("구독자가 없으면 아무것도 보내지 않는다", async () => {
    const sender = vi.fn<Sender>();
    expect(await sendToAll(db, sender, payload)).toEqual({ total: 0, sent: 0, removed: 0, failed: 0 });
    expect(sender).not.toHaveBeenCalled();
  });

  it("구독자가 많아도(25명) 모두에게 보낸다", async () => {
    for (let i = 0; i < 25; i++) await saveSubscription(db, sub(i));
    const sender = vi.fn<Sender>(async () => undefined);
    expect((await sendToAll(db, sender, payload)).sent).toBe(25);
    expect(sender).toHaveBeenCalledTimes(25);
  });
});
