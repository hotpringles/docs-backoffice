import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { createEvent } from "@/lib/events/store";
import type { PushDepsResult, Sender } from "@/lib/push/send";
import { saveSubscription } from "@/lib/push/subscriptions";
import { createReminderHandler, type ReminderHandlerDeps } from "./handler";

const SECRET = "cron-secret-1234567890";
const NOW = new Date("2026-10-07T00:10:00Z");

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await createTestDb());
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await close();
});

const request = (authorization?: string) =>
  new Request("http://localhost/api/cron/reminders", { headers: authorization ? { authorization } : {} });

function handler(sender: Sender, overrides: Partial<ReminderHandlerDeps> = {}) {
  const loadDeps = vi.fn((): PushDepsResult => ({ ok: true, deps: { db, sender } }));
  const get = createReminderHandler({ env: () => ({ CRON_SECRET: SECRET }), loadDeps, now: () => NOW, ...overrides });
  return { get, loadDeps };
}

const seedEvent = () =>
  createEvent(db, {
    title: "스터디",
    date: "2026-10-07",
    endDate: null,
    startTime: "14:00",
    endTime: "16:00",
    memo: null,
    attendeeIds: [],
    remindOffsets: [0],
  });

describe("GET /api/cron/reminders", () => {
  it("CRON_SECRET이 설정되지 않았으면 열어 두지 않고 503이다", async () => {
    const sender = vi.fn<Sender>(async () => undefined);
    const { get, loadDeps } = handler(sender, { env: () => ({}) });
    expect((await get(request(`Bearer ${SECRET}`))).status).toBe(503);
    expect((await get(request())).status).toBe(503);
    expect(loadDeps).not.toHaveBeenCalled();
    expect(sender).not.toHaveBeenCalled();
  });

  it("Authorization이 없거나 틀리면 401이고 아무것도 실행하지 않는다", async () => {
    await seedEvent();
    await saveSubscription(db, { endpoint: "https://fcm.googleapis.com/fcm/send/d1", p256dh: "B".repeat(87), auth: "a".repeat(22) });
    const sender = vi.fn<Sender>(async () => undefined);
    const { get, loadDeps } = handler(sender);

    for (const header of [undefined, "", "Bearer", "Bearer wrong", SECRET, `bearer ${SECRET}`, `Basic ${SECRET}`, `Bearer  ${SECRET}`]) {
      const response = await get(request(header));
      expect(response.status, String(header)).toBe(401);
    }
    expect(loadDeps).not.toHaveBeenCalled();
    expect(sender).not.toHaveBeenCalled();
  });

  it("올바른 Bearer 값이면 오늘의 알림을 보내고 결과를 200으로 알려준다", async () => {
    await seedEvent();
    await saveSubscription(db, { endpoint: "https://fcm.googleapis.com/fcm/send/d1", p256dh: "B".repeat(87), auth: "a".repeat(22) });
    const sender = vi.fn<Sender>(async () => undefined);

    const response = await handler(sender).get(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      today: "2026-10-07",
      claimed: 1,
      summary: { total: 1, sent: 1, removed: 0, failed: 0 },
      released: false,
    });
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it("같은 날 다시 불러도 알림이 또 가지 않는다", async () => {
    await seedEvent();
    await saveSubscription(db, { endpoint: "https://fcm.googleapis.com/fcm/send/d1", p256dh: "B".repeat(87), auth: "a".repeat(22) });
    const sender = vi.fn<Sender>(async () => undefined);
    const { get } = handler(sender);

    await get(request(`Bearer ${SECRET}`));
    const second = await get(request(`Bearer ${SECRET}`));

    expect((await second.json()).claimed).toBe(0);
    expect(sender).toHaveBeenCalledTimes(1);
  });

  // Vercel은 cron이 실패해도 다시 시도하지 않고, 대시보드에는 응답 코드만 보인다. 200으로 응답하면 알림이 한 명에게도
  // 가지 않았는데 성공으로 보이므로, 아무에게도 못 보낸 실행은 오류 상태로 알려서 눈에 띄게 한다.
  it("구독자가 있는데 아무에게도 보내지 못했으면 502로 알려서 대시보드에서 실패로 보이게 한다(기록은 풀려서 다시 호출하면 재시도된다)", async () => {
    await seedEvent();
    await saveSubscription(db, { endpoint: "https://fcm.googleapis.com/fcm/send/d1", p256dh: "B".repeat(87), auth: "a".repeat(22) });
    const broken: Sender = async () => {
      throw new Error("bad vapid key");
    };
    const { get } = handler(broken);

    const first = await get(request(`Bearer ${SECRET}`));
    expect(first.status).toBe(502);
    expect(await first.json()).toMatchObject({ released: true, claimed: 1, summary: { total: 1, sent: 0, failed: 1 } });

    const working = vi.fn<Sender>(async () => undefined);
    const retry = await handler(working).get(request(`Bearer ${SECRET}`));
    expect(retry.status).toBe(200);
    expect((await retry.json()).claimed).toBe(1);
    expect(working).toHaveBeenCalledTimes(1);
  });

  it("푸시 설정이 부족하면 503과 무엇이 없는지 알려준다", async () => {
    const sender = vi.fn<Sender>(async () => undefined);
    const { get } = handler(sender, { loadDeps: () => ({ ok: false, missing: ["DATABASE_URL", "VAPID_PRIVATE_KEY"] }) });
    const response = await get(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ missing: ["DATABASE_URL", "VAPID_PRIVATE_KEY"] });
  });

  it("실행 중 오류가 나면 500이고, 비밀 값이나 내부 오류 문구를 응답에 싣지 않는다", async () => {
    const broken: Db = {
      query: async () => {
        throw new Error(`neon down ${SECRET}`);
      },
    };
    const { get } = handler(vi.fn<Sender>(), { loadDeps: () => ({ ok: true, deps: { db: broken, sender: vi.fn<Sender>() } }) });
    const response = await get(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("neon down");
  });
});
