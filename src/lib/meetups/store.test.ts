import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { getEvent, listEventsInRange } from "@/lib/events/store";
import type { Person } from "@/lib/people";
import { confirmMeetup, createMeetup, deleteMeetup, getMeetup, getMeetupEventId, listAvailability, listMeetups, saveAvailability } from "./store";
import { cellKey } from "./slots";
import type { ConfirmInput, MeetupInput } from "./validate";

const D1 = "2026-10-07";
const D2 = "2026-10-08";
const input: MeetupInput = { title: "스터디 일정", dates: [D1, D2], dayStart: "09:00", dayEnd: "13:00" };
const roster: Person[] = ["p1", "p2", "p3"].map((id, index) => ({ id, name: `참가자 ${index + 1}` }));
// 10:00~11:30 (칸 2, 3, 4)
const span: ConfirmInput = { day: D1, startSlot: 2, endSlot: 5, startTime: "10:00", endTime: "11:30", remindOffsets: [0, 1] };
const cells = (day: string, slots: number[]) => slots.map((slot) => ({ day, slot }));

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(async () => {
  await close();
});

const eventCount = async () => (await db.query<{ n: number }>("select count(*)::int as n from events"))[0].n;

describe("createMeetup / getMeetup", () => {
  it("만든 모임을 그대로 읽는다(날짜는 정렬된 문자열 배열, 시각은 HH:MM)", async () => {
    const id = await createMeetup(db, { ...input, dates: [D2, D1] });
    expect(await getMeetup(db, id)).toEqual({
      id,
      title: "스터디 일정",
      status: "open",
      dates: [D1, D2],
      dayStart: "09:00",
      dayEnd: "13:00",
      slotMinutes: 30,
    });
  });

  it("없는 모임은 null이다", async () => {
    expect(await getMeetup(db, 999)).toBeNull();
  });
});

describe("listMeetups", () => {
  it("열린 모임이 먼저, 그 안에서는 최근에 만든 것이 먼저다", async () => {
    const a = await createMeetup(db, { ...input, title: "A" });
    const b = await createMeetup(db, { ...input, title: "B" });
    const c = await createMeetup(db, { ...input, title: "C" });
    await confirmMeetup(db, b, span, roster);

    const list = await listMeetups(db);
    expect(list.map((m) => [m.title, m.status])).toEqual([
      ["C", "open"],
      ["A", "open"],
      ["B", "confirmed"],
    ]);
    expect([a, c].every((id) => list.some((m) => m.id === id))).toBe(true);
  });

  it("모임이 없으면 빈 배열이다", async () => {
    expect(await listMeetups(db)).toEqual([]);
  });
});

describe("saveAvailability / listAvailability", () => {
  it("사람별 칸 키 목록으로 읽는다", async () => {
    const id = await createMeetup(db, input);
    expect(await saveAvailability(db, id, "p1", [...cells(D1, [0, 1]), ...cells(D2, [7])])).toBe(true);
    expect(await saveAvailability(db, id, "p2", cells(D1, [1]))).toBe(true);

    expect(await listAvailability(db, id)).toEqual({
      p1: [cellKey(D1, 0), cellKey(D1, 1), cellKey(D2, 7)],
      p2: [cellKey(D1, 1)],
    });
  });

  it("다시 저장하면 그 사람의 칸만 통째로 바뀌고 다른 사람은 그대로다", async () => {
    const id = await createMeetup(db, input);
    await saveAvailability(db, id, "p1", cells(D1, [0, 1, 2]));
    await saveAvailability(db, id, "p2", cells(D1, [5, 6]));

    await saveAvailability(db, id, "p1", cells(D1, [2, 3]));

    expect(await listAvailability(db, id)).toEqual({
      p1: [cellKey(D1, 2), cellKey(D1, 3)],
      p2: [cellKey(D1, 5), cellKey(D1, 6)],
    });
  });

  it("같은 내용으로 다시 저장해도 그대로이고, 겹치는 칸이 들어 있어도 문제없다", async () => {
    const id = await createMeetup(db, input);
    await saveAvailability(db, id, "p1", cells(D1, [0, 0, 1]));
    await saveAvailability(db, id, "p1", cells(D1, [0, 1]));
    expect(await listAvailability(db, id)).toEqual({ p1: [cellKey(D1, 0), cellKey(D1, 1)] });
  });

  it("빈 목록으로 저장하면 그 사람의 칸이 모두 지워진다", async () => {
    const id = await createMeetup(db, input);
    await saveAvailability(db, id, "p1", cells(D1, [0, 1]));
    await saveAvailability(db, id, "p2", cells(D1, [3]));

    expect(await saveAvailability(db, id, "p1", [])).toBe(true);
    expect(await listAvailability(db, id)).toEqual({ p2: [cellKey(D1, 3)] });
  });

  it("없는 모임이나 확정된 모임에는 저장하지 않고 false다", async () => {
    const id = await createMeetup(db, input);
    await saveAvailability(db, id, "p1", cells(D1, [2, 3, 4]));
    await confirmMeetup(db, id, span, roster);

    expect(await saveAvailability(db, id, "p1", cells(D1, [0]))).toBe(false);
    expect(await saveAvailability(db, id, "p2", cells(D1, [0]))).toBe(false);
    expect(await saveAvailability(db, 999, "p1", cells(D1, [0]))).toBe(false);
    expect(await listAvailability(db, id)).toEqual({ p1: [cellKey(D1, 2), cellKey(D1, 3), cellKey(D1, 4)] });
  });

  it("여러 사람이 동시에 저장해도 각자의 칸이 그대로 남는다", async () => {
    const id = await createMeetup(db, input);
    await Promise.all([
      saveAvailability(db, id, "p1", cells(D1, [0, 1])),
      saveAvailability(db, id, "p2", cells(D1, [2, 3])),
      saveAvailability(db, id, "p3", cells(D2, [4, 5])),
    ]);
    expect(await listAvailability(db, id)).toEqual({
      p1: [cellKey(D1, 0), cellKey(D1, 1)],
      p2: [cellKey(D1, 2), cellKey(D1, 3)],
      p3: [cellKey(D2, 4), cellKey(D2, 5)],
    });
  });

  it("아무도 저장하지 않은 모임은 빈 객체다", async () => {
    const id = await createMeetup(db, input);
    expect(await listAvailability(db, id)).toEqual({});
  });
});

describe("confirmMeetup", () => {
  it("일정을 만들고 모임을 확정한다. 참석자는 확정 구간 전체에서 가능한 사람만(명단 순서)이다", async () => {
    const id = await createMeetup(db, input);
    await saveAvailability(db, id, "p1", cells(D1, [2, 3, 4]));
    await saveAvailability(db, id, "p2", cells(D1, [2, 3])); // 마지막 칸이 빠졌다 → 참석자가 아니다
    await saveAvailability(db, id, "p3", [...cells(D1, [0, 2, 3, 4]), ...cells(D2, [2, 3, 4])]);
    await saveAvailability(db, id, "p9", cells(D1, [2, 3, 4])); // 명단에 없는 번호

    const eventId = await confirmMeetup(db, id, span, roster);

    expect(eventId).not.toBeNull();
    expect(await getEvent(db, eventId as number)).toEqual({
      id: eventId,
      meetupId: id,
      title: "스터디 일정",
      date: D1,
      startTime: "10:00",
      endTime: "11:30",
      memo: null,
      attendeeIds: ["p1", "p3"],
      remindOffsets: [0, 1],
    });
    expect((await getMeetup(db, id))?.status).toBe("confirmed");
    expect(await getMeetupEventId(db, id)).toBe(eventId);
  });

  it("참석자 순서는 번호순이 아니라 명단 순서다", async () => {
    const id = await createMeetup(db, input);
    for (const person of ["p1", "p2", "p3"]) await saveAvailability(db, id, person, cells(D1, [2, 3, 4]));
    const reordered = [roster[1], roster[0], roster[2]];

    const eventId = await confirmMeetup(db, id, span, reordered);
    expect((await getEvent(db, eventId as number))?.attendeeIds).toEqual(["p2", "p1", "p3"]);
  });

  it("아무도 가능하지 않아도 일정은 만들어지고 참석자는 비어 있다. 알림 시점도 그대로 담긴다", async () => {
    const id = await createMeetup(db, input);
    const eventId = await confirmMeetup(db, id, { ...span, remindOffsets: [3] }, roster);
    expect(await getEvent(db, eventId as number)).toMatchObject({ attendeeIds: [], remindOffsets: [3] });
  });

  it("이미 확정된 모임과 없는 모임은 null이고 일정을 더 만들지 않는다", async () => {
    const id = await createMeetup(db, input);
    expect(await confirmMeetup(db, id, span, roster)).not.toBeNull();
    expect(await confirmMeetup(db, id, span, roster)).toBeNull();
    expect(await confirmMeetup(db, 999, span, roster)).toBeNull();
    expect(await eventCount()).toBe(1);
  });

  it("동시에 두 번 확정해도 일정은 하나만 생긴다", async () => {
    const id = await createMeetup(db, input);
    const results = await Promise.all([confirmMeetup(db, id, span, roster), confirmMeetup(db, id, span, roster)]);

    expect(results.filter((eventId) => eventId !== null)).toHaveLength(1);
    expect(await eventCount()).toBe(1);
  });

  it("확정된 일정이 달력 조회에서 모임 번호와 함께 나온다", async () => {
    const id = await createMeetup(db, input);
    await confirmMeetup(db, id, span, roster);
    const events = await listEventsInRange(db, D1, D2);
    expect(events).toHaveLength(1);
    expect(events[0].meetupId).toBe(id);
  });
});

describe("getMeetupEventId / deleteMeetup", () => {
  it("확정 전에는 일정이 없어서 null이다", async () => {
    const id = await createMeetup(db, input);
    expect(await getMeetupEventId(db, id)).toBeNull();
  });

  it("모임을 지우면 가능한 시간은 함께 지워지고, 확정으로 만든 일정은 남는다(모임 연결만 비워진다)", async () => {
    const id = await createMeetup(db, input);
    await saveAvailability(db, id, "p1", cells(D1, [2, 3, 4]));
    const eventId = await confirmMeetup(db, id, span, roster);

    expect(await deleteMeetup(db, id)).toBe(true);

    expect(await getMeetup(db, id)).toBeNull();
    expect(await listAvailability(db, id)).toEqual({});
    expect(await getEvent(db, eventId as number)).toMatchObject({ meetupId: null, title: "스터디 일정" });
    expect(await deleteMeetup(db, id)).toBe(false);
  });

  it("열린 모임도 지울 수 있다", async () => {
    const id = await createMeetup(db, input);
    await saveAvailability(db, id, "p1", cells(D1, [0]));
    expect(await deleteMeetup(db, id)).toBe(true);
    expect(await listMeetups(db)).toEqual([]);
  });
});
