import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { createEvent, updateEvent } from "@/lib/events/store";
import type { EventInput } from "@/lib/events/validate";
import type { Sender } from "@/lib/push/send";
import { saveSubscription, type PushSubscriptionInput } from "@/lib/push/subscriptions";
import { runReminders } from "./run";

const NOW = new Date("2026-10-07T00:30:00Z"); // 한국시간 2026-10-07 09:30

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

const sub = (n: number): PushSubscriptionInput => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`,
  p256dh: "B".repeat(87),
  auth: "a".repeat(22),
});

const ev = (title: string, date: string, overrides: Partial<EventInput> = {}): EventInput => ({
  title,
  date,
  endDate: null,
  startTime: null,
  endTime: null,
  memo: null,
  attendeeIds: [],
  remindOffsets: [0, 1],
  ...overrides,
});

const claimedRows = async () => (await db.query<{ n: number }>("select count(*)::int as n from sent_reminders"))[0].n;

describe("runReminders", () => {
  it("일정 알림은 높은 우선순위(high)로 보낸다 — 아침 알림이 기기의 절전 때문에 몇 시간 늦게 도착하지 않도록", async () => {
    await createEvent(db, ev("오늘 일정", "2026-10-07"));
    await saveSubscription(db, sub(1));
    const sender = vi.fn<Sender>(async () => undefined);

    await runReminders({ db, sender }, NOW);

    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender.mock.calls[0][2]).toEqual({ urgency: "high" });
  });

  it("보낼 일정이 없으면 발송하지 않는다", async () => {
    await saveSubscription(db, sub(1));
    const sender = vi.fn<Sender>(async () => undefined);
    expect(await runReminders({ db, sender }, NOW)).toEqual({ today: "2026-10-07", claimed: 0, summary: null, released: false });
    expect(sender).not.toHaveBeenCalled();
  });

  it("오늘 보낼 항목을 한 통으로 묶어 모든 구독자에게 보낸다", async () => {
    await saveSubscription(db, sub(1));
    await saveSubscription(db, sub(2));
    await createEvent(db, ev("스터디", "2026-10-07", { startTime: "14:00", endTime: "16:00" }));
    await createEvent(db, ev("발표", "2026-10-08"));
    const bodies: string[] = [];
    const sender: Sender = async (_subscription, body) => {
      bodies.push(body);
    };

    const result = await runReminders({ db, sender }, NOW);

    expect(result).toMatchObject({ today: "2026-10-07", claimed: 2, released: false });
    expect(result.summary).toEqual({ total: 2, sent: 2, removed: 0, failed: 0 });
    expect(bodies).toHaveLength(2);
    expect(JSON.parse(bodies[0])).toEqual({
      title: "일정 알림",
      body: "오늘 14:00: 스터디\n내일: 발표",
      url: "/calendar?month=2026-10",
      tag: "event-reminders",
    });
  });

  it("같은 날 두 번 실행해도 알림은 한 번만 간다", async () => {
    await saveSubscription(db, sub(1));
    await createEvent(db, ev("스터디", "2026-10-07"));
    const sender = vi.fn<Sender>(async () => undefined);

    expect((await runReminders({ db, sender }, NOW)).claimed).toBe(1);
    expect((await runReminders({ db, sender }, NOW)).claimed).toBe(0);
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it("구독자가 있는데 전부 실패하면 기록을 풀어서 다시 실행하면 재시도된다", async () => {
    await saveSubscription(db, sub(1));
    await saveSubscription(db, sub(2));
    await createEvent(db, ev("스터디", "2026-10-07"));
    const broken: Sender = async () => {
      throw new Error("bad vapid key");
    };

    const first = await runReminders({ db, sender: broken }, NOW);
    expect(first).toMatchObject({ claimed: 1, released: true });
    expect(first.summary).toEqual({ total: 2, sent: 0, removed: 0, failed: 2 });
    expect(await claimedRows()).toBe(0);

    const fixed = vi.fn<Sender>(async () => undefined);
    const second = await runReminders({ db, sender: fixed }, NOW);
    expect(second).toMatchObject({ claimed: 1, released: false });
    expect(fixed).toHaveBeenCalledTimes(2);
  });

  it("구독 목록을 읽다 오류가 나면 기록을 풀고 오류를 그대로 던진다", async () => {
    await saveSubscription(db, sub(1));
    await createEvent(db, ev("스터디", "2026-10-07"));
    let failing = true;
    const flaky: Db = {
      query: async (text, params) => {
        if (failing && text.includes("push_subscriptions")) throw new Error("neon blip");
        return db.query(text, params);
      },
    };
    const sender = vi.fn<Sender>(async () => undefined);

    await expect(runReminders({ db: flaky, sender }, NOW)).rejects.toThrow("neon blip");
    expect(await claimedRows()).toBe(0);

    failing = false;
    expect((await runReminders({ db: flaky, sender }, NOW)).claimed).toBe(1);
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it("일부만 받았거나 만료된 구독만 정리했으면 기록을 남긴다", async () => {
    await saveSubscription(db, sub(1));
    await saveSubscription(db, sub(2));
    await createEvent(db, ev("A", "2026-10-07"));
    const partial: Sender = async (subscription) => {
      if (subscription.endpoint.endsWith("device-1")) throw new Error("boom");
    };
    expect(await runReminders({ db, sender: partial }, NOW)).toMatchObject({ claimed: 1, released: false });
    expect(await claimedRows()).toBe(1);

    await db.query("delete from sent_reminders");
    const gone: Sender = async () => {
      throw Object.assign(new Error("gone"), { statusCode: 410 });
    };
    expect(await runReminders({ db, sender: gone }, NOW)).toMatchObject({ claimed: 1, released: false });
    expect(await claimedRows()).toBe(1);
  });

  it("구독자가 없으면 발송 없이 끝나고 기록은 남는다", async () => {
    await createEvent(db, ev("스터디", "2026-10-07"));
    const sender = vi.fn<Sender>(async () => undefined);
    const result = await runReminders({ db, sender }, NOW);
    expect(result).toMatchObject({ claimed: 1, released: false });
    expect(result.summary).toEqual({ total: 0, sent: 0, removed: 0, failed: 0 });
    expect(sender).not.toHaveBeenCalled();
  });

  it("'오늘'은 한국시간 자정(UTC 15:00)에 바뀐다", async () => {
    await saveSubscription(db, sub(1));
    await createEvent(db, ev("자정 경계", "2026-10-07", { remindOffsets: [0] }));
    const sender = vi.fn<Sender>(async () => undefined);

    const before = await runReminders({ db, sender }, new Date("2026-10-06T14:59:59Z"));
    expect(before).toMatchObject({ today: "2026-10-06", claimed: 0 });

    const after = await runReminders({ db, sender }, new Date("2026-10-06T15:00:00Z"));
    expect(after).toMatchObject({ today: "2026-10-07", claimed: 1 });
  });

  it("보낸 뒤 날짜를 고친 일정은 새 날짜에 다시 알린다", async () => {
    await saveSubscription(db, sub(1));
    const id = await createEvent(db, ev("옮긴 일정", "2026-10-07", { remindOffsets: [0] }));
    const sender = vi.fn<Sender>(async () => undefined);
    await runReminders({ db, sender }, NOW);

    await updateEvent(db, id, ev("옮긴 일정", "2026-10-09", { remindOffsets: [0] }));
    const later = new Date("2026-10-09T00:30:00Z");
    expect((await runReminders({ db, sender }, later)).claimed).toBe(1);
    expect(sender).toHaveBeenCalledTimes(2);
  });
});
