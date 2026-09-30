import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { createEvent, deleteEvent, getEvent, listEventsInRange, updateEvent } from "./store";
import type { EventInput } from "./validate";

const base: EventInput = {
  title: "회의",
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

async function markSent(id: number, offset: number): Promise<void> {
  await db.query("insert into sent_reminders (event_id, offset_days, sent_on) values ($1, $2, '2026-10-07')", [id, offset]);
}
async function sentCount(id: number): Promise<number> {
  return (await db.query<{ n: number }>("select count(*)::int as n from sent_reminders where event_id = $1", [id]))[0].n;
}

describe("createEvent / getEvent", () => {
  it("만든 일정을 그대로 읽는다", async () => {
    const input: EventInput = {
      title: "스터디",
      date: "2026-10-07",
      startTime: "14:00",
      endTime: "16:30",
      memo: "3층 회의실",
      attendeeIds: ["p1", "p2"],
      remindOffsets: [0, 3],
    };
    const id = await createEvent(db, input);
    expect(await getEvent(db, id)).toEqual({ id, meetupId: null, ...input });
  });

  it("종일 일정과 빈 메모, 빈 목록은 null과 빈 배열로 읽는다", async () => {
    const id = await createEvent(db, { ...base, remindOffsets: [] });
    expect(await getEvent(db, id)).toEqual({ id, meetupId: null, ...base, remindOffsets: [] });
  });

  it("번호가 계속 늘어나고, 참석자 값에 공백·따옴표·쉼표가 있어도 그대로 저장된다", async () => {
    const tricky = ["p 1", 'a"b', "c'd", "e,f", "{x}"];
    const first = await createEvent(db, { ...base, attendeeIds: tricky });
    const second = await createEvent(db, base);
    expect(second).toBeGreaterThan(first);
    expect((await getEvent(db, first))?.attendeeIds).toEqual(tricky);
  });

  it("없는 일정은 null이다", async () => {
    expect(await getEvent(db, 999)).toBeNull();
  });
});

describe("listEventsInRange", () => {
  it("범위 안의 일정만, 날짜 → 종일 먼저 → 시각 순으로 돌려준다(양 끝 포함)", async () => {
    const at = (date: string, startTime: string | null, title: string): EventInput => ({
      ...base,
      title,
      date,
      startTime,
      endTime: startTime ? "23:00" : null,
    });
    await createEvent(db, at("2026-10-07", "14:00", "오후"));
    await createEvent(db, at("2026-10-07", null, "종일"));
    await createEvent(db, at("2026-10-07", "09:00", "오전"));
    await createEvent(db, at("2026-10-06", null, "전날"));
    await createEvent(db, at("2026-10-08", "08:00", "다음날"));
    await createEvent(db, at("2026-10-05", null, "범위 밖 앞"));
    await createEvent(db, at("2026-10-09", null, "범위 밖 뒤"));

    const events = await listEventsInRange(db, "2026-10-06", "2026-10-08");
    expect(events.map((e) => e.title)).toEqual(["전날", "종일", "오전", "오후", "다음날"]);
  });

  it("일정이 없는 범위는 빈 배열이다", async () => {
    expect(await listEventsInRange(db, "2026-01-01", "2026-01-31")).toEqual([]);
  });
});

describe("updateEvent", () => {
  it("내용을 바꾸고 true를 돌려준다. 없는 일정이면 false다", async () => {
    const id = await createEvent(db, base);
    const changed: EventInput = { ...base, title: "바뀐 제목", startTime: "10:00", endTime: "11:00", memo: "메모", attendeeIds: ["p2"] };
    expect(await updateEvent(db, id, changed)).toBe(true);
    expect(await getEvent(db, id)).toEqual({ id, meetupId: null, ...changed });
    expect(await updateEvent(db, 999, changed)).toBe(false);
  });

  it("날짜를 바꾸면 그 일정의 알림 기록이 지워진다(다른 일정은 그대로)", async () => {
    const id = await createEvent(db, base);
    const other = await createEvent(db, base);
    await markSent(id, 0);
    await markSent(id, 1);
    await markSent(other, 0);

    await updateEvent(db, id, { ...base, date: "2026-10-08" });

    expect(await sentCount(id)).toBe(0);
    expect(await sentCount(other)).toBe(1);
  });

  it("알림 시점을 바꾸면 알림 기록이 지워진다", async () => {
    const id = await createEvent(db, base);
    await markSent(id, 0);
    await updateEvent(db, id, { ...base, remindOffsets: [0, 3] });
    expect(await sentCount(id)).toBe(0);
  });

  it("제목, 메모, 시각, 참석자만 바꾸면 알림 기록이 남는다", async () => {
    const id = await createEvent(db, base);
    await markSent(id, 0);
    await markSent(id, 1);

    await updateEvent(db, id, { ...base, title: "제목만 바뀜", memo: "메모", startTime: "10:00", endTime: "11:00", attendeeIds: ["p1"] });

    expect(await sentCount(id)).toBe(2);
  });

  it("같은 값으로 저장해도 알림 기록이 남는다", async () => {
    const id = await createEvent(db, base);
    await markSent(id, 0);
    await updateEvent(db, id, base);
    expect(await sentCount(id)).toBe(1);
  });
});

describe("deleteEvent", () => {
  it("일정과 알림 기록을 함께 지우고 true를 돌려준다. 없으면 false다", async () => {
    const id = await createEvent(db, base);
    await markSent(id, 0);

    expect(await deleteEvent(db, id)).toBe(true);
    expect(await getEvent(db, id)).toBeNull();
    expect(await sentCount(id)).toBe(0);
    expect(await deleteEvent(db, id)).toBe(false);
  });
});
