import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth/session";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { createEventHandlers, type EventDeps } from "./handlers";
import { createEvent, getEvent, listEventsInRange } from "./store";
import type { EventInput } from "./validate";

const SECRET = "s".repeat(32);
const ENV = { EDIT_CODE: "correct-horse-battery", SESSION_SECRET: SECRET, PEOPLE: "p1:민수,p2:지은,p3:하나" };
const NOW = new Date("2026-10-07T03:00:00Z");
const COOKIE = `${SESSION_COOKIE}=${createSessionToken(SECRET, NOW.getTime())}`;

const stored: EventInput = {
  title: "원래 일정",
  date: "2026-10-07",
  startTime: null,
  endTime: null,
  memo: null,
  attendeeIds: [],
  remindOffsets: [0, 1],
};

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(async () => {
  await close();
});

const deps = (overrides: Partial<EventDeps> = {}): EventDeps => ({ getDb: () => db, env: () => ENV, now: () => NOW, ...overrides });

function post(body: unknown, headers: Record<string, string> = { cookie: COOKIE }, contentType = "application/json"): Request {
  return new Request("http://localhost/api/events", {
    method: "POST",
    headers: { "content-type": contentType, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const all = () => listEventsInRange(db, "2000-01-01", "2100-12-31");

describe("create", () => {
  it("편집 권한이 있으면 저장하고 201과 번호를 준다", async () => {
    const response = await createEventHandlers(deps()).create(
      post({ title: " 스터디 ", date: "2026-10-08", startTime: "14:00", endTime: "16:00", attendeeIds: ["p2", "p1"], remindOffsets: [0] }),
    );
    expect(response.status).toBe(201);
    const { id } = await response.json();
    expect(await getEvent(db, id)).toEqual({
      id,
      title: "스터디",
      date: "2026-10-08",
      startTime: "14:00",
      endTime: "16:00",
      memo: null,
      attendeeIds: ["p1", "p2"],
      remindOffsets: [0],
    });
  });

  it("편집 권한이 없으면 401이고 아무것도 저장하지 않는다(본문이 이상해도 인증이 먼저다)", async () => {
    const handlers = createEventHandlers(deps());
    expect((await handlers.create(post({ title: "a", date: "2026-10-08" }, {}))).status).toBe(401);
    expect((await handlers.create(post("{oops", { cookie: `${SESSION_COOKIE}=garbage` }))).status).toBe(401);
    expect(await all()).toEqual([]);
  });

  it("만료된 쿠키는 401이다", async () => {
    const later = new Date(NOW.getTime() + 8 * 24 * 3600 * 1000);
    const response = await createEventHandlers(deps({ now: () => later })).create(post({ title: "a", date: "2026-10-08" }));
    expect(response.status).toBe(401);
  });

  it("검증에 실패하면 400과 필드별 메시지를 주고 저장하지 않는다", async () => {
    const response = await createEventHandlers(deps()).create(post({ title: "", date: "2026-02-30", attendeeIds: ["p9"], remindOffsets: [2] }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(Object.keys(body.errors).sort()).toEqual(["attendeeIds", "date", "remindOffsets", "title"]);
    expect(await all()).toEqual([]);
  });

  it("JSON이 아니면 415, 깨진 JSON이면 400, 20KB가 넘으면 413이다", async () => {
    const handlers = createEventHandlers(deps());
    expect((await handlers.create(post({ title: "a", date: "2026-10-08" }, { cookie: COOKIE }, "text/plain"))).status).toBe(415);
    expect((await handlers.create(post("{oops"))).status).toBe(400);
    expect((await handlers.create(post({ title: "a", date: "2026-10-08", memo: "가".repeat(20_001) }))).status).toBe(413);
    expect(await all()).toEqual([]);
  });

  it("인증 환경변수가 없으면 503, 명단(PEOPLE) 설정이 틀리면 이유와 함께 503이다", async () => {
    expect((await createEventHandlers(deps({ env: () => ({ PEOPLE: ENV.PEOPLE }) })).create(post({ title: "a", date: "2026-10-08" }))).status).toBe(503);

    const response = await createEventHandlers(deps({ env: () => ({ ...ENV, PEOPLE: "p1" }) })).create(post({ title: "a", date: "2026-10-08" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("PEOPLE");
  });

  it("데이터베이스가 없거나 오류가 나면 503이다", async () => {
    expect((await createEventHandlers(deps({ getDb: () => null })).create(post({ title: "a", date: "2026-10-08" }))).status).toBe(503);

    const broken: Db = {
      query: async () => {
        throw new Error("neon down");
      },
    };
    expect((await createEventHandlers(deps({ getDb: () => broken })).create(post({ title: "a", date: "2026-10-08" }))).status).toBe(503);
  });
});

describe("update", () => {
  it("일정을 고치고 200을 준다", async () => {
    const id = await createEvent(db, stored);
    const response = await createEventHandlers(deps()).update(post({ title: "바뀐 일정", date: "2026-10-09", memo: "메모" }), String(id));
    expect(response.status).toBe(200);
    expect(await getEvent(db, id)).toMatchObject({ title: "바뀐 일정", date: "2026-10-09", memo: "메모" });
  });

  it("날짜를 바꾸면 알림 기록을 지우고, 제목만 바꾸면 남긴다", async () => {
    const id = await createEvent(db, stored);
    await db.query("insert into sent_reminders (event_id, offset_days, sent_on) values ($1, 0, '2026-10-07')", [id]);
    const count = async () => (await db.query<{ n: number }>("select count(*)::int as n from sent_reminders"))[0].n;
    const handlers = createEventHandlers(deps());

    await handlers.update(post({ title: "제목만", date: "2026-10-07" }), String(id));
    expect(await count()).toBe(1);
    await handlers.update(post({ title: "제목만", date: "2026-10-08" }), String(id));
    expect(await count()).toBe(0);
  });

  it("없는 일정이거나 번호 모양이 이상하면 404다", async () => {
    const handlers = createEventHandlers(deps());
    for (const id of ["999", "abc", "0", "-1", "1.5", "01", "9999999999", "1;drop", ""]) {
      expect((await handlers.update(post({ title: "a", date: "2026-10-08" }), id)).status, id).toBe(404);
    }
  });

  it("편집 권한이 없으면 401이고 검증이 틀리면 400이다", async () => {
    const id = await createEvent(db, stored);
    const handlers = createEventHandlers(deps());
    expect((await handlers.update(post({ title: "x", date: "2026-10-08" }, {}), String(id))).status).toBe(401);
    expect((await handlers.update(post({ title: "", date: "2026-10-08" }), String(id))).status).toBe(400);
    expect((await getEvent(db, id))?.title).toBe("원래 일정");
  });
});

describe("remove", () => {
  it("일정을 지우고 200을 준다. 다시 지우면 404다", async () => {
    const id = await createEvent(db, stored);
    const handlers = createEventHandlers(deps());
    expect((await handlers.remove(post({}), String(id))).status).toBe(200);
    expect(await getEvent(db, id)).toBeNull();
    expect((await handlers.remove(post({}), String(id))).status).toBe(404);
  });

  it("편집 권한이 없으면 401이고 일정은 그대로다", async () => {
    const id = await createEvent(db, stored);
    expect((await createEventHandlers(deps()).remove(post({}, {}), String(id))).status).toBe(401);
    expect(await getEvent(db, id)).not.toBeNull();
  });

  it("JSON이 아닌 요청(다른 사이트의 폼 등)은 415다", async () => {
    const id = await createEvent(db, stored);
    const response = await createEventHandlers(deps()).remove(post("a=1", { cookie: COOKIE }, "application/x-www-form-urlencoded"), String(id));
    expect(response.status).toBe(415);
    expect(await getEvent(db, id)).not.toBeNull();
  });

  it("번호 모양이 이상하면 404다", async () => {
    for (const id of ["abc", "0", "9999999999"]) {
      expect((await createEventHandlers(deps()).remove(post({}), id)).status, id).toBe(404);
    }
  });
});
