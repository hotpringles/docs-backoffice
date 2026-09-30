import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth/session";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { getEvent, listEventsInRange } from "@/lib/events/store";
import type { Sender } from "@/lib/push/send";
import { saveSubscription } from "@/lib/push/subscriptions";
import { createMeetupHandlers, type MeetupDeps } from "./handlers";
import { cellKey } from "./slots";
import { confirmMeetup, createMeetup, getMeetup, listAvailability, listMeetups, saveAvailability } from "./store";

const SECRET = "s".repeat(32);
const ENV = { EDIT_CODE: "correct-horse-battery", SESSION_SECRET: SECRET, PEOPLE: "p1:민수,p2:지은,p3:하나" };
const NOW = new Date("2026-10-07T03:00:00Z");
const COOKIE = `${SESSION_COOKIE}=${createSessionToken(SECRET, NOW.getTime())}`;
const D1 = "2026-10-07";
const D2 = "2026-10-08";
const NEW_MEETUP = { title: "스터디 일정", startDate: D1, endDate: D2, dayStart: "09:00", dayEnd: "13:00" };
const CONFIRM = { day: D1, startTime: "10:00", endTime: "11:30" };
const cells = (day: string, slots: number[]) => slots.map((slot) => ({ day, slot }));

let db: Db;
let close: () => Promise<void>;
let sender: ReturnType<typeof vi.fn<Sender>>;
let scheduled: Array<() => Promise<void>>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  sender = vi.fn<Sender>(async () => undefined);
  scheduled = [];
  await saveSubscription(db, { endpoint: "https://fcm.googleapis.com/fcm/send/device-1", p256dh: "B".repeat(87), auth: "a".repeat(22) });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await close();
});

const deps = (overrides: Partial<MeetupDeps> = {}): MeetupDeps => ({
  getDb: () => db,
  env: () => ENV,
  now: () => NOW,
  runAfter: (task) => {
    scheduled.push(task);
  },
  loadPushDeps: () => ({ ok: true, deps: { db, sender } }),
  ...overrides,
});

/** 응답 뒤에 예약된 작업(알림)을 지금 실행한다. */
async function flush(): Promise<void> {
  while (scheduled.length > 0) await scheduled.shift()?.();
}

function post(body: unknown, headers: Record<string, string> = { cookie: COOKIE }, contentType = "application/json"): Request {
  return new Request("http://localhost/api/meetups", {
    method: "POST",
    headers: { "content-type": contentType, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function openMeetup(): Promise<number> {
  return createMeetup(db, { title: "스터디 일정", dates: [D1, D2], dayStart: "09:00", dayEnd: "13:00" });
}

describe("create", () => {
  it("편집 권한이 있으면 모임을 만들고 201을 주며, 알림은 응답 뒤에 보낸다", async () => {
    const response = await createMeetupHandlers(deps()).create(post(NEW_MEETUP));
    expect(response.status).toBe(201);
    const { id } = await response.json();
    expect(await getMeetup(db, id)).toMatchObject({ title: "스터디 일정", status: "open", dates: [D1, D2], dayStart: "09:00", dayEnd: "13:00" });

    expect(sender).not.toHaveBeenCalled(); // 응답 시점에는 예약만 됐다.
    expect(scheduled).toHaveLength(1);
    await flush();
    expect(sender).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sender.mock.calls[0][1])).toMatchObject({ title: "새 모임", url: `/meetups/${id}`, tag: `meetup-opened-${id}` });
  });

  it("편집 권한이 없으면 401이고 아무것도 만들지 않으며 알림도 예약하지 않는다(본문이 이상해도 인증이 먼저다)", async () => {
    const handlers = createMeetupHandlers(deps());
    expect((await handlers.create(post(NEW_MEETUP, {}))).status).toBe(401);
    expect((await handlers.create(post("{oops", { cookie: `${SESSION_COOKIE}=garbage` }))).status).toBe(401);
    expect(await listMeetups(db)).toEqual([]);
    expect(scheduled).toEqual([]);
  });

  it("입력이 틀리면 400과 필드별 메시지를 주고 만들지 않으며 알림도 예약하지 않는다", async () => {
    const response = await createMeetupHandlers(deps()).create(
      post({ title: "", startDate: "2026-10-01", endDate: "2026-10-20", dayStart: "09:15" }),
    );
    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).errors).sort()).toEqual(["dates", "time", "title"]);
    expect(await listMeetups(db)).toEqual([]);
    expect(scheduled).toEqual([]);
  });

  it("후보 날짜는 서버 시계 기준 오늘부터 7일 뒤까지만 받는다(어제, 8일 뒤는 400)", async () => {
    const handlers = createMeetupHandlers(deps());
    // 오늘(NOW)은 서울 시간으로 10/7이다.
    expect((await handlers.create(post({ ...NEW_MEETUP, startDate: "2026-10-06", endDate: "2026-10-07" }))).status).toBe(400);
    const late = await handlers.create(post({ ...NEW_MEETUP, startDate: "2026-10-14", endDate: "2026-10-15" }));
    expect(late.status).toBe(400);
    expect((await late.json()).errors.dates).toContain("일주일");
    expect(await listMeetups(db)).toEqual([]);
    expect(scheduled).toEqual([]);

    expect((await handlers.create(post({ ...NEW_MEETUP, startDate: "2026-10-14", endDate: "2026-10-14" }))).status).toBe(201);
  });

  it("알림 설정이 없거나 발송이 전부 실패해도 만들기는 성공한다", async () => {
    const missing = createMeetupHandlers(deps({ loadPushDeps: () => ({ ok: false, missing: ["VAPID_PRIVATE_KEY"] }) }));
    expect((await missing.create(post(NEW_MEETUP))).status).toBe(201);
    await expect(flush()).resolves.toBeUndefined();

    sender.mockRejectedValue(new Error("bad vapid key"));
    expect((await createMeetupHandlers(deps()).create(post(NEW_MEETUP))).status).toBe(201);
    await expect(flush()).resolves.toBeUndefined();
    expect(await listMeetups(db)).toHaveLength(2);
  });

  it("JSON이 아니면 415, 깨진 JSON이면 400이다", async () => {
    const handlers = createMeetupHandlers(deps());
    expect((await handlers.create(post(NEW_MEETUP, { cookie: COOKIE }, "text/plain"))).status).toBe(415);
    expect((await handlers.create(post("{oops"))).status).toBe(400);
  });

  it("데이터베이스가 없거나 명단(PEOPLE) 설정이 틀리면 503이다", async () => {
    expect((await createMeetupHandlers(deps({ getDb: () => null })).create(post(NEW_MEETUP))).status).toBe(503);
    const response = await createMeetupHandlers(deps({ env: () => ({ ...ENV, PEOPLE: "p1" }) })).create(post(NEW_MEETUP));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("PEOPLE");
  });
});

describe("availability", () => {
  it("편집 권한 없이도 저장되고, 그 사람의 칸만 바뀐다", async () => {
    const id = await openMeetup();
    await saveAvailability(db, id, "p2", cells(D1, [5]));
    const handlers = createMeetupHandlers(deps());

    const first = await handlers.availability(post({ personId: "p1", cells: [cellKey(D1, 0), cellKey(D1, 1)] }, {}), String(id));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, count: 2 });
    await handlers.availability(post({ personId: "p1", cells: [cellKey(D1, 1), cellKey(D2, 7)] }, {}), String(id));

    expect(await listAvailability(db, id)).toEqual({
      p1: [cellKey(D1, 1), cellKey(D2, 7)],
      p2: [cellKey(D1, 5)],
    });
  });

  it("빈 목록을 보내면 그 사람의 칸이 모두 지워진다", async () => {
    const id = await openMeetup();
    await saveAvailability(db, id, "p1", cells(D1, [0, 1]));
    const response = await createMeetupHandlers(deps()).availability(post({ personId: "p1", cells: [] }, {}), String(id));
    expect(response.status).toBe(200);
    expect(await listAvailability(db, id)).toEqual({});
  });

  it("명단에 없는 이름, 후보 날짜 밖·칸 범위 밖의 칸, 너무 많은 칸은 400이고 아무것도 바꾸지 않는다", async () => {
    const id = await openMeetup();
    await saveAvailability(db, id, "p1", cells(D1, [3]));
    const handlers = createMeetupHandlers(deps());
    const tooMany = Array.from({ length: 100 }, (_, i) => cellKey(D1, i));

    for (const body of [
      { personId: "p9", cells: [] },
      { personId: "p1", cells: [cellKey("2026-10-09", 0)] },
      { personId: "p1", cells: [cellKey(D1, 8)] },
      { personId: "p1", cells: tooMany },
      { personId: "p1", cells: "x" },
      { personId: "p1" },
    ]) {
      const response = await handlers.availability(post(body, {}), String(id));
      expect(response.status, JSON.stringify(body).slice(0, 60)).toBe(400);
    }
    expect(await listAvailability(db, id)).toEqual({ p1: [cellKey(D1, 3)] });
  });

  it("확정된 모임은 409이고, 없는 모임이나 이상한 번호는 404다", async () => {
    const id = await openMeetup();
    await saveAvailability(db, id, "p1", cells(D1, [2, 3, 4]));
    await confirmMeetup(db, id, { day: D1, startSlot: 2, endSlot: 5, startTime: "10:00", endTime: "11:30", remindOffsets: [0, 1] }, [
      { id: "p1", name: "민수" },
    ]);
    const handlers = createMeetupHandlers(deps());

    const confirmed = await handlers.availability(post({ personId: "p1", cells: [] }, {}), String(id));
    expect(confirmed.status).toBe(409);
    expect(await listAvailability(db, id)).toEqual({ p1: [cellKey(D1, 2), cellKey(D1, 3), cellKey(D1, 4)] });

    for (const rawId of ["999", "abc", "0", "-1", "01", "9999999999", ""]) {
      expect((await handlers.availability(post({ personId: "p1", cells: [] }, {}), rawId)).status, rawId).toBe(404);
    }
  });

  it("JSON이 아니면 415, 데이터베이스가 없거나 오류가 나면 503이다", async () => {
    const id = await openMeetup();
    expect((await createMeetupHandlers(deps()).availability(post({ personId: "p1", cells: [] }, {}, "text/plain"), String(id))).status).toBe(415);
    expect((await createMeetupHandlers(deps({ getDb: () => null })).availability(post({ personId: "p1", cells: [] }, {}), String(id))).status).toBe(503);

    const broken: Db = {
      query: async () => {
        throw new Error("neon down");
      },
    };
    expect((await createMeetupHandlers(deps({ getDb: () => broken })).availability(post({ personId: "p1", cells: [] }, {}), String(id))).status).toBe(503);
  });
});

describe("confirm", () => {
  it("편집 권한이 없으면 401이고 확정되지 않는다", async () => {
    const id = await openMeetup();
    expect((await createMeetupHandlers(deps()).confirm(post(CONFIRM, {}), String(id))).status).toBe(401);
    expect((await getMeetup(db, id))?.status).toBe("open");
    expect(scheduled).toEqual([]);
  });

  it("확정하면 일정이 만들어지고 참석자는 확정 구간 전체에서 가능한 사람이며, 확정 알림은 응답 뒤에 간다", async () => {
    const id = await openMeetup();
    await saveAvailability(db, id, "p1", cells(D1, [2, 3, 4]));
    await saveAvailability(db, id, "p2", cells(D1, [2, 3]));
    await saveAvailability(db, id, "p3", cells(D1, [1, 2, 3, 4]));

    const response = await createMeetupHandlers(deps()).confirm(post({ ...CONFIRM, remindOffsets: [1] }), String(id));

    expect(response.status).toBe(200);
    const { eventId, day } = await response.json();
    expect(day).toBe(D1);
    expect(await getEvent(db, eventId)).toMatchObject({
      meetupId: id,
      title: "스터디 일정",
      date: D1,
      startTime: "10:00",
      endTime: "11:30",
      attendeeIds: ["p1", "p3"],
      remindOffsets: [1],
    });
    expect((await getMeetup(db, id))?.status).toBe("confirmed");

    expect(sender).not.toHaveBeenCalled();
    await flush();
    expect(sender).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sender.mock.calls[0][1])).toEqual({
      title: "모임 확정",
      body: "스터디 일정 확정: 10/7(수) 10:00–11:30",
      url: "/calendar?month=2026-10&date=2026-10-07",
      tag: `meetup-confirmed-${id}`,
    });
  });

  it("이미 확정된 모임은 409이고 일정도 알림도 더 만들지 않는다", async () => {
    const id = await openMeetup();
    const handlers = createMeetupHandlers(deps());
    expect((await handlers.confirm(post(CONFIRM), String(id))).status).toBe(200);
    await flush();
    sender.mockClear();

    const second = await handlers.confirm(post(CONFIRM), String(id));
    expect(second.status).toBe(409);
    expect(scheduled).toEqual([]);
    expect(await listEventsInRange(db, D1, D2)).toHaveLength(1);
  });

  it("동시에 두 번 확정해도 일정은 하나이고 하나만 성공한다", async () => {
    const id = await openMeetup();
    const handlers = createMeetupHandlers(deps());
    const statuses = (await Promise.all([handlers.confirm(post(CONFIRM), String(id)), handlers.confirm(post(CONFIRM), String(id))])).map(
      (response) => response.status,
    );
    expect(statuses.sort()).toEqual([200, 409]);
    expect(await listEventsInRange(db, D1, D2)).toHaveLength(1);
    expect(scheduled).toHaveLength(1);
  });

  it("후보 날짜가 아니거나, 하루 범위 밖이거나, 30분 단위가 아니거나, 끝이 시작보다 앞서면 400이고 확정되지 않는다", async () => {
    const id = await openMeetup();
    const handlers = createMeetupHandlers(deps());
    for (const body of [
      { day: "2026-10-09", startTime: "10:00", endTime: "11:00" },
      { day: D1, startTime: "08:30", endTime: "10:00" },
      { day: D1, startTime: "12:00", endTime: "13:30" },
      { day: D1, startTime: "10:15", endTime: "11:00" },
      { day: D1, startTime: "11:00", endTime: "10:00" },
      { day: D1, startTime: "10:00", endTime: "10:00" },
      { ...CONFIRM, remindOffsets: [2] },
    ]) {
      const response = await handlers.confirm(post(body), String(id));
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect((await response.json()).errors).toBeTruthy();
    }
    expect((await getMeetup(db, id))?.status).toBe("open");
    expect(await listEventsInRange(db, D1, D2)).toEqual([]);
  });

  it("없는 모임이나 이상한 번호는 404다", async () => {
    const handlers = createMeetupHandlers(deps());
    for (const rawId of ["999", "abc", "0", "9999999999"]) expect((await handlers.confirm(post(CONFIRM), rawId)).status, rawId).toBe(404);
  });

  it("알림이 실패해도 확정은 성공한다", async () => {
    const id = await openMeetup();
    sender.mockRejectedValue(new Error("bad vapid key"));
    expect((await createMeetupHandlers(deps()).confirm(post(CONFIRM), String(id))).status).toBe(200);
    await expect(flush()).resolves.toBeUndefined();
    expect((await getMeetup(db, id))?.status).toBe("confirmed");
  });
});

describe("remove", () => {
  it("편집 권한이 없으면 401이고 모임이 그대로다", async () => {
    const id = await openMeetup();
    expect((await createMeetupHandlers(deps()).remove(post({}, {}), String(id))).status).toBe(401);
    expect(await getMeetup(db, id)).not.toBeNull();
  });

  it("모임을 지우면 가능한 시간도 지워지고, 확정으로 만든 일정은 남는다. 다시 지우면 404다", async () => {
    const id = await openMeetup();
    await saveAvailability(db, id, "p1", cells(D1, [2, 3, 4]));
    const confirmed = await createMeetupHandlers(deps()).confirm(post(CONFIRM), String(id));
    const { eventId } = await confirmed.json();

    const handlers = createMeetupHandlers(deps());
    expect((await handlers.remove(post({}), String(id))).status).toBe(200);
    expect(await getMeetup(db, id)).toBeNull();
    expect(await listAvailability(db, id)).toEqual({});
    expect(await getEvent(db, eventId)).toMatchObject({ meetupId: null });
    expect((await handlers.remove(post({}), String(id))).status).toBe(404);
  });

  it("JSON이 아닌 요청은 415이고, 이상한 번호는 404다", async () => {
    const id = await openMeetup();
    expect((await createMeetupHandlers(deps()).remove(post("a=1", { cookie: COOKIE }, "application/x-www-form-urlencoded"), String(id))).status).toBe(415);
    expect(await getMeetup(db, id)).not.toBeNull();
    for (const rawId of ["abc", "0", "9999999999"]) expect((await createMeetupHandlers(deps()).remove(post({}), rawId)).status, rawId).toBe(404);
  });
});
