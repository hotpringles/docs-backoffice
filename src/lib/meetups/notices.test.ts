import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import type { Sender } from "@/lib/push/send";
import { saveSubscription, type PushSubscriptionInput } from "@/lib/push/subscriptions";
import { claimNotice, meetupConfirmedPayload, meetupOpenedPayload, releaseNotice, sendNoticeOnce } from "./notices";

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
const noticeRows = async () => (await db.query<{ n: number }>("select count(*)::int as n from sent_notices"))[0].n;

describe("claimNotice / releaseNotice", () => {
  it("처음 차지하면 true, 같은 알림을 다시 차지하면 false다", async () => {
    expect(await claimNotice(db, "meetup-opened", 1)).toBe(true);
    expect(await claimNotice(db, "meetup-opened", 1)).toBe(false);
  });

  it("종류나 모임 번호가 다르면 따로 센다", async () => {
    expect(await claimNotice(db, "meetup-opened", 1)).toBe(true);
    expect(await claimNotice(db, "meetup-confirmed", 1)).toBe(true);
    expect(await claimNotice(db, "meetup-opened", 2)).toBe(true);
  });

  it("풀면 다시 차지할 수 있다", async () => {
    await claimNotice(db, "meetup-opened", 1);
    await releaseNotice(db, "meetup-opened", 1);
    expect(await claimNotice(db, "meetup-opened", 1)).toBe(true);
  });

  it("동시에 차지해도 하나만 true다", async () => {
    const results = await Promise.all([claimNotice(db, "meetup-opened", 7), claimNotice(db, "meetup-opened", 7), claimNotice(db, "meetup-opened", 7)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe("알림 문구", () => {
  it("열림 알림은 모임 화면을 열고, 모임마다 다른 tag를 쓴다", () => {
    expect(meetupOpenedPayload({ id: 12, title: "스터디 일정" })).toEqual({
      title: "새 모임",
      body: "스터디 일정 — 가능한 시간을 표시해 주세요",
      url: "/meetups/12",
      tag: "meetup-opened-12",
    });
  });

  it("확정 알림은 날짜와 시간을 알리고 그 날의 달력을 연다", () => {
    expect(meetupConfirmedPayload({ id: 12, title: "스터디 일정" }, { day: "2026-10-07", startTime: "14:00", endTime: "16:00" })).toEqual({
      title: "모임 확정",
      body: "스터디 일정 확정: 10/7(수) 14:00–16:00",
      url: "/calendar?month=2026-10&date=2026-10-07",
      tag: "meetup-confirmed-12",
    });
  });

  it("아주 긴 제목은 40자로 잘라서 본문이 커지지 않는다", () => {
    const long = "가".repeat(300);
    const opened = meetupOpenedPayload({ id: 1, title: long });
    const confirmed = meetupConfirmedPayload({ id: 1, title: long }, { day: "2026-10-07", startTime: "14:00", endTime: "16:00" });
    for (const payload of [opened, confirmed]) {
      expect(payload.body).toContain(`${"가".repeat(39)}…`);
      expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBeLessThan(600);
    }
  });
});

describe("sendNoticeOnce", () => {
  const payload = meetupOpenedPayload({ id: 1, title: "스터디" });

  it("구독자 전체에게 한 번 보내고, 같은 알림을 다시 요청하면 보내지 않는다", async () => {
    await saveSubscription(db, sub(1));
    await saveSubscription(db, sub(2));
    const sender = vi.fn<Sender>(async () => undefined);

    const first = await sendNoticeOnce({ db, sender }, "meetup-opened", 1, payload);
    const second = await sendNoticeOnce({ db, sender }, "meetup-opened", 1, payload);

    expect(first).toEqual({ status: "sent", summary: { total: 2, sent: 2, removed: 0, failed: 0 }, released: false });
    expect(second).toEqual({ status: "skipped-duplicate" });
    expect(sender).toHaveBeenCalledTimes(2);
    expect(JSON.parse(sender.mock.calls[0][1])).toEqual(payload);
  });

  it("구독자가 있는데 전부 실패하면 기록을 풀어서 다시 요청하면 재시도된다", async () => {
    await saveSubscription(db, sub(1));
    const broken: Sender = async () => {
      throw new Error("bad vapid key");
    };
    const first = await sendNoticeOnce({ db, sender: broken }, "meetup-opened", 1, payload);
    expect(first).toMatchObject({ status: "sent", released: true });
    expect(await noticeRows()).toBe(0);

    const working = vi.fn<Sender>(async () => undefined);
    expect(await sendNoticeOnce({ db, sender: working }, "meetup-opened", 1, payload)).toMatchObject({ status: "sent", released: false });
    expect(working).toHaveBeenCalledTimes(1);
  });

  it("구독 목록을 읽다 오류가 나면 기록을 풀고 오류를 그대로 던진다", async () => {
    await saveSubscription(db, sub(1));
    let failing = true;
    const flaky: Db = {
      query: async (text, params) => {
        if (failing && text.includes("push_subscriptions")) throw new Error("neon blip");
        return db.query(text, params);
      },
    };
    const sender = vi.fn<Sender>(async () => undefined);

    await expect(sendNoticeOnce({ db: flaky, sender }, "meetup-opened", 1, payload)).rejects.toThrow("neon blip");
    expect(await noticeRows()).toBe(0);

    failing = false;
    expect(await sendNoticeOnce({ db: flaky, sender }, "meetup-opened", 1, payload)).toMatchObject({ status: "sent" });
  });

  it("구독자가 없거나, 일부만 받았거나, 만료된 구독만 정리했으면 기록을 남긴다", async () => {
    const sender = vi.fn<Sender>(async () => undefined);
    expect(await sendNoticeOnce({ db, sender }, "meetup-opened", 1, payload)).toMatchObject({ released: false });
    expect(await noticeRows()).toBe(1);

    await saveSubscription(db, sub(1));
    await saveSubscription(db, sub(2));
    const partial: Sender = async (subscription) => {
      if (subscription.endpoint.endsWith("device-1")) throw new Error("boom");
    };
    expect(await sendNoticeOnce({ db, sender: partial }, "meetup-opened", 2, payload)).toMatchObject({ released: false });

    const gone: Sender = async () => {
      throw Object.assign(new Error("gone"), { statusCode: 410 });
    };
    expect(await sendNoticeOnce({ db, sender: gone }, "meetup-opened", 3, payload)).toMatchObject({ released: false });
    expect(await noticeRows()).toBe(3);
  });

  it("같은 알림을 동시에 요청해도 한 번만 보낸다", async () => {
    await saveSubscription(db, sub(1));
    const sender = vi.fn<Sender>(async () => undefined);
    const results = await Promise.all([
      sendNoticeOnce({ db, sender }, "meetup-opened", 5, payload),
      sendNoticeOnce({ db, sender }, "meetup-opened", 5, payload),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["sent", "skipped-duplicate"]);
    expect(sender).toHaveBeenCalledTimes(1);
  });
});
