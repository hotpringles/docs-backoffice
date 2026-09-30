import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import type { PushDepsResult, Sender } from "@/lib/push/send";
import { saveSubscription } from "@/lib/push/subscriptions";
import { meetupOpenedPayload } from "./notices";
import { notifyIfConfigured } from "./notify";

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(async () => {
  vi.restoreAllMocks();
  await close();
});

const payload = meetupOpenedPayload({ id: 1, title: "스터디" });
const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/device-1", p256dh: "B".repeat(87), auth: "a".repeat(22) };
const quiet = () => ({
  warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
  error: vi.spyOn(console, "error").mockImplementation(() => undefined),
});

describe("notifyIfConfigured", () => {
  it("푸시 설정이 부족하면 보내지 않고 무엇이 없는지 로그만 남긴다", async () => {
    const { warn } = quiet();
    const loadDeps = (): PushDepsResult => ({ ok: false, missing: ["DATABASE_URL", "VAPID_PRIVATE_KEY"] });
    await expect(notifyIfConfigured(loadDeps, "meetup-opened", 1, payload)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain("DATABASE_URL");
  });

  it("설정이 있으면 구독자에게 보낸다", async () => {
    const { error } = quiet();
    await saveSubscription(db, sub);
    const sender = vi.fn<Sender>(async () => undefined);
    await notifyIfConfigured(() => ({ ok: true, deps: { db, sender } }), "meetup-opened", 1, payload);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it("아무에게도 보내지 못하면 던지지 않고 오류를 로그로 남긴다(기록은 풀려서 다시 시도할 수 있다)", async () => {
    const { error } = quiet();
    await saveSubscription(db, sub);
    const broken: Sender = async () => {
      throw new Error("bad vapid key");
    };
    await expect(notifyIfConfigured(() => ({ ok: true, deps: { db, sender: broken } }), "meetup-opened", 1, payload)).resolves.toBeUndefined();
    expect(error.mock.calls.some((call) => String(call[0]).includes("meetup-opened"))).toBe(true);
  });

  it("발송 중 예외가 나도 던지지 않는다", async () => {
    const { error } = quiet();
    const brokenDb: Db = {
      query: async () => {
        throw new Error("neon down");
      },
    };
    const sender = vi.fn<Sender>();
    await expect(notifyIfConfigured(() => ({ ok: true, deps: { db: brokenDb, sender } }), "meetup-opened", 1, payload)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });

  it("설정을 읽다 예외가 나도 던지지 않는다", async () => {
    const { error } = quiet();
    const loadDeps = (): PushDepsResult => {
      throw new Error("config boom");
    };
    await expect(notifyIfConfigured(loadDeps, "meetup-opened", 1, payload)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
