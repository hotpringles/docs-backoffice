import { describe, expect, it } from "vitest";
import type { Person } from "@/lib/people";
import {
  validateAvailabilityInput,
  validateConfirmInput,
  validateMeetupInput,
  type MeetupShape,
} from "./validate";

const people: Person[] = [
  { id: "p1", name: "참가자 1" },
  { id: "p2", name: "참가자 2" },
];

// 오늘은 10/7로 본다(후보 날짜는 오늘을 포함해 일주일인 10/13까지)
const TODAY = "2026-10-07";

// 10/7~10/8 이틀, 09:00~13:00(칸 8개)
const meetup: MeetupShape = { dates: ["2026-10-07", "2026-10-08"], dayStart: "09:00", dayEnd: "13:00", slotMinutes: 30 };

describe("validateMeetupInput", () => {
  it("제목과 날짜 범위만 있으면 하루 범위는 09:00~22:00이다", () => {
    const result = validateMeetupInput({ title: " 스터디 일정 ", startDate: "2026-10-07", endDate: "2026-10-09" }, TODAY);
    expect(result).toEqual({
      ok: true,
      value: { title: "스터디 일정", dates: ["2026-10-07", "2026-10-08", "2026-10-09"], dayStart: "09:00", dayEnd: "22:00" },
    });
  });

  it("하루 범위를 직접 정할 수 있고, 빈 문자열이면 기본값이다", () => {
    const custom = validateMeetupInput({ title: "a", startDate: "2026-10-07", endDate: "2026-10-07", dayStart: "10:00", dayEnd: "18:30" }, TODAY);
    expect(custom).toMatchObject({ ok: true, value: { dayStart: "10:00", dayEnd: "18:30" } });
    const blank = validateMeetupInput({ title: "a", startDate: "2026-10-07", endDate: "2026-10-07", dayStart: "", dayEnd: " " }, TODAY);
    expect(blank).toMatchObject({ ok: true, value: { dayStart: "09:00", dayEnd: "22:00" } });
  });

  it("제목이 비었거나 101자 이상이면 거부한다", () => {
    for (const title of ["", "  ", undefined, 5, "가".repeat(101)]) {
      const result = validateMeetupInput({ title, startDate: "2026-10-07", endDate: "2026-10-07" }, TODAY);
      expect(result.ok, String(title)).toBe(false);
      if (!result.ok) expect(result.errors.title, String(title)).toBeTruthy();
    }
    expect(validateMeetupInput({ title: "가".repeat(100), startDate: "2026-10-07", endDate: "2026-10-07" }, TODAY).ok).toBe(true);
  });

  it("날짜가 올바르지 않거나 끝이 시작보다 빠르면 거부한다", () => {
    const cases = [
      { startDate: "2026-02-30", endDate: "2026-03-02" },
      { startDate: "abc", endDate: "2026-10-07" },
      { startDate: "2026-10-08", endDate: "2026-10-07" },
      { startDate: undefined, endDate: undefined },
    ];
    for (const dates of cases) {
      const result = validateMeetupInput({ title: "a", ...dates }, TODAY);
      expect(result.ok, JSON.stringify(dates)).toBe(false);
      if (!result.ok) expect(result.errors.dates, JSON.stringify(dates)).toBeTruthy();
    }
  });

  it("후보 날짜는 오늘을 포함해 일주일(오늘~6일 뒤, 양 끝 포함)만 고를 수 있다", () => {
    const ok = [
      { startDate: "2026-10-07", endDate: "2026-10-07" },
      { startDate: "2026-10-13", endDate: "2026-10-13" },
      { startDate: "2026-10-07", endDate: "2026-10-13" },
    ];
    for (const dates of ok) expect(validateMeetupInput({ title: "a", ...dates }, TODAY).ok, JSON.stringify(dates)).toBe(true);

    const rejected = [
      { startDate: "2026-10-06", endDate: "2026-10-07" }, // 어제부터
      { startDate: "2026-10-06", endDate: "2026-10-06" }, // 어제 하루
      { startDate: "2026-10-13", endDate: "2026-10-14" }, // 일주일 다음 날까지
      { startDate: "2026-10-14", endDate: "2026-10-14" }, // 일주일 다음 날 하루
      { startDate: "2026-11-01", endDate: "2026-11-02" }, // 한참 뒤
    ];
    for (const dates of rejected) {
      const result = validateMeetupInput({ title: "a", ...dates }, TODAY);
      expect(result.ok, JSON.stringify(dates)).toBe(false);
      if (!result.ok) expect(result.errors.dates, JSON.stringify(dates)).toContain("10/13(화)");
    }
  });

  it("범위를 알려 주는 메시지에는 오늘 날짜와 마지막 날짜가 들어 있다", () => {
    const result = validateMeetupInput({ title: "a", startDate: "2026-10-20", endDate: "2026-10-21" }, TODAY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.dates).toBe("후보 날짜는 오늘(10/7(수))을 포함해 일주일(10/13(화))까지만 고를 수 있어요.");
  });

  it("수정할 때는 이미 모임에 들어 있던 날짜(keep)는 범위 밖이어도 그대로 둘 수 있다", () => {
    // 오늘 10/7. 모임은 10/5~10/8이었다(10/5, 10/6은 이미 지난 날).
    const keep = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"];
    const same = validateMeetupInput({ title: "새 제목", startDate: "2026-10-05", endDate: "2026-10-08" }, TODAY, keep);
    expect(same.ok).toBe(true);
    const shrink = validateMeetupInput({ title: "a", startDate: "2026-10-06", endDate: "2026-10-07" }, TODAY, keep);
    expect(shrink.ok).toBe(true);
  });

  it("수정할 때도 새로 더하는 날짜는 오늘을 포함한 일주일 안이어야 한다", () => {
    const keep = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"];
    // 10/4는 지난 날이고 keep에도 없다
    expect(validateMeetupInput({ title: "a", startDate: "2026-10-04", endDate: "2026-10-08" }, TODAY, keep).ok).toBe(false);
    // 10/14는 일주일(10/13)을 넘는다
    expect(validateMeetupInput({ title: "a", startDate: "2026-10-05", endDate: "2026-10-14" }, TODAY, keep).ok).toBe(false);
    // 범위 안의 새 날짜(10/9~10/13)는 더할 수 있다
    expect(validateMeetupInput({ title: "a", startDate: "2026-10-05", endDate: "2026-10-13" }, TODAY, keep).ok).toBe(true);
  });

  it("keep이 없으면(새로 만들 때) 지난 날짜는 그대로 거절한다", () => {
    expect(validateMeetupInput({ title: "a", startDate: "2026-10-05", endDate: "2026-10-08" }, TODAY).ok).toBe(false);
  });

  it("오늘이 바뀌면 고를 수 있는 범위도 함께 움직인다", () => {
    const dates = { startDate: "2026-10-20", endDate: "2026-10-21" };
    expect(validateMeetupInput({ title: "a", ...dates }, "2026-10-07").ok).toBe(false);
    expect(validateMeetupInput({ title: "a", ...dates }, "2026-10-15").ok).toBe(true);
  });

  it("하루 범위가 30분 단위가 아니거나 끝이 시작보다 앞서거나 같으면 거부한다", () => {
    const cases = [
      { dayStart: "09:15", dayEnd: "12:00" },
      { dayStart: "09:00", dayEnd: "12:10" },
      { dayStart: "12:00", dayEnd: "09:00" },
      { dayStart: "10:00", dayEnd: "10:00" },
      { dayStart: "9:00", dayEnd: "12:00" },
      { dayStart: "09:00", dayEnd: "24:30" },
      { dayStart: 900, dayEnd: 1200 },
    ];
    for (const range of cases) {
      const result = validateMeetupInput({ title: "a", startDate: "2026-10-07", endDate: "2026-10-07", ...range }, TODAY);
      expect(result.ok, JSON.stringify(range)).toBe(false);
      if (!result.ok) expect(result.errors.time, JSON.stringify(range)).toBeTruthy();
    }
  });

  it("틀린 필드를 한꺼번에 알려주고, 객체가 아닌 본문은 거부한다", () => {
    const result = validateMeetupInput({ title: "", startDate: "abc", endDate: "abc", dayStart: "9" }, TODAY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["dates", "time", "title"]);
    for (const raw of [null, undefined, [], "x", 5]) expect(validateMeetupInput(raw, TODAY).ok, String(raw)).toBe(false);
  });
});

describe("validateAvailabilityInput", () => {
  it("이름과 칸 키 목록을 받아서 칸으로 바꾼다(중복은 하나로)", () => {
    const result = validateAvailabilityInput({ personId: "p2", cells: ["2026-10-07:0", "2026-10-08:7", "2026-10-07:0"] }, meetup, people);
    expect(result).toEqual({
      ok: true,
      value: { personId: "p2", cells: [{ day: "2026-10-07", slot: 0 }, { day: "2026-10-08", slot: 7 }] },
    });
  });

  it("빈 목록도 통과한다(그 사람의 칸을 모두 지운다)", () => {
    expect(validateAvailabilityInput({ personId: "p1", cells: [] }, meetup, people)).toEqual({
      ok: true,
      value: { personId: "p1", cells: [] },
    });
  });

  it("명단에 없거나 문자열이 아닌 이름은 거부한다", () => {
    for (const personId of ["p9", "", undefined, 1, null]) {
      const result = validateAvailabilityInput({ personId, cells: [] }, meetup, people);
      expect(result.ok, String(personId)).toBe(false);
      if (!result.ok) expect(result.errors.personId, String(personId)).toBeTruthy();
    }
  });

  it("후보 날짜 밖, 칸 범위 밖, 이상한 모양의 칸은 거부한다", () => {
    for (const cell of ["2026-10-09:0", "2026-10-07:8", "2026-10-07:-1", "2026-10-07:1.5", "abc", "2026-10-07", 5, null, "2026-10-07:x"]) {
      const result = validateAvailabilityInput({ personId: "p1", cells: [cell] }, meetup, people);
      expect(result.ok, String(cell)).toBe(false);
      if (!result.ok) expect(result.errors.cells, String(cell)).toBeTruthy();
    }
  });

  it("배열이 아니거나 가능한 칸 수(날짜 수 × 칸 수 = 16)보다 많으면 거부한다", () => {
    expect(validateAvailabilityInput({ personId: "p1", cells: "2026-10-07:0" }, meetup, people).ok).toBe(false);
    expect(validateAvailabilityInput({ personId: "p1" }, meetup, people).ok).toBe(false);
    const tooMany = Array.from({ length: 200 }, (_, i) => `2026-10-07:${i % 8}-${i}`);
    expect(validateAvailabilityInput({ personId: "p1", cells: tooMany }, meetup, people).ok).toBe(false);
    const all = ["2026-10-07", "2026-10-08"].flatMap((day) => Array.from({ length: 8 }, (_, slot) => `${day}:${slot}`));
    expect(validateAvailabilityInput({ personId: "p1", cells: all }, meetup, people)).toMatchObject({ ok: true });
  });

  it("객체가 아닌 본문은 거부한다", () => {
    for (const raw of [null, undefined, [], "x", 5]) expect(validateAvailabilityInput(raw, meetup, people).ok, String(raw)).toBe(false);
  });
});

describe("validateConfirmInput", () => {
  it("날짜와 시작·끝 시각을 칸 번호로 바꾼다(알림 시점 기본은 당일과 1일 전)", () => {
    const result = validateConfirmInput({ day: "2026-10-07", startTime: "10:00", endTime: "12:00" }, meetup);
    expect(result).toEqual({
      ok: true,
      value: { day: "2026-10-07", startSlot: 2, endSlot: 6, startTime: "10:00", endTime: "12:00", remindOffsets: [0, 1] },
    });
  });

  it("알림 시점을 고를 수 있고, 하루 끝까지 확정할 수 있다", () => {
    const result = validateConfirmInput({ day: "2026-10-08", startTime: "12:00", endTime: "13:00", remindOffsets: [3] }, meetup);
    expect(result).toMatchObject({ ok: true, value: { startSlot: 6, endSlot: 8, remindOffsets: [3] } });
  });

  it("후보 날짜에 없거나 이상한 날짜는 거부한다", () => {
    for (const day of ["2026-10-09", "2026-10-06", "abc", "", undefined, 5]) {
      const result = validateConfirmInput({ day, startTime: "10:00", endTime: "11:00" }, meetup);
      expect(result.ok, String(day)).toBe(false);
      if (!result.ok) expect(result.errors.day, String(day)).toBeTruthy();
    }
  });

  it("하루 범위 밖이거나 30분 단위가 아니거나 끝이 시작보다 앞서거나 같은 시각은 거부한다", () => {
    const cases = [
      ["08:30", "10:00"],
      ["12:00", "13:30"],
      ["10:15", "11:00"],
      ["10:00", "10:45"],
      ["11:00", "10:00"],
      ["10:00", "10:00"],
      ["10:00", undefined],
      [undefined, "11:00"],
      ["abc", "11:00"],
    ];
    for (const [startTime, endTime] of cases) {
      const result = validateConfirmInput({ day: "2026-10-07", startTime, endTime }, meetup);
      expect(result.ok, `${startTime}~${endTime}`).toBe(false);
      if (!result.ok) expect(result.errors.time, `${startTime}~${endTime}`).toBeTruthy();
    }
  });

  it("허용되지 않은 알림 시점은 거부하고, 객체가 아닌 본문도 거부한다", () => {
    const bad = validateConfirmInput({ day: "2026-10-07", startTime: "10:00", endTime: "11:00", remindOffsets: [2] }, meetup);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.remindOffsets).toBeTruthy();
    for (const raw of [null, undefined, [], "x", 5]) expect(validateConfirmInput(raw, meetup).ok, String(raw)).toBe(false);
  });
});
