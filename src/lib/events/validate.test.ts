import { describe, expect, it } from "vitest";
import type { Person } from "@/lib/people";
import { validateEventInput, type EventInput, type FieldErrors } from "./validate";

const people: Person[] = [
  { id: "p1", name: "참가자 1" },
  { id: "p2", name: "참가자 2" },
  { id: "p3", name: "참가자 3" },
];

function valid(raw: unknown): EventInput {
  const result = validateEventInput(raw, people);
  if (!result.ok) throw new Error(`통과해야 하는데 실패했어요: ${JSON.stringify(result.errors)}`);
  return result.value;
}

function errors(raw: unknown): FieldErrors {
  const result = validateEventInput(raw, people);
  if (result.ok) throw new Error("실패해야 하는데 통과했어요");
  return result.errors;
}

describe("validateEventInput — 통과하는 입력", () => {
  it("제목과 날짜만 있으면 종일 일정이고 알림은 당일과 1일 전이 기본이다", () => {
    expect(valid({ title: "  회의 ", date: "2026-10-07" })).toEqual({
      title: "회의",
      date: "2026-10-07",
      endDate: null,
      startTime: null,
      endTime: null,
      memo: null,
      attendeeIds: [],
      remindOffsets: [0, 1],
    });
  });

  it("시작·종료 시각과 메모, 참석자, 알림 시점을 모두 받는다", () => {
    expect(
      valid({
        title: "스터디",
        date: "2026-10-07",
        startTime: "14:00",
        endTime: "16:30",
        memo: " 3층 ",
        attendeeIds: ["p3", "p1"],
        remindOffsets: [3, 0],
      }),
    ).toEqual({
      title: "스터디",
      date: "2026-10-07",
      endDate: null,
      startTime: "14:00",
      endTime: "16:30",
      memo: "3층",
      attendeeIds: ["p1", "p3"],
      remindOffsets: [0, 3],
    });
  });

  it("시각이 빈 문자열이거나 null이면 종일이다", () => {
    for (const times of [{ startTime: "", endTime: "" }, { startTime: null, endTime: null }, { startTime: "  ", endTime: undefined }]) {
      const value = valid({ title: "a", date: "2026-10-07", ...times });
      expect([value.startTime, value.endTime]).toEqual([null, null]);
    }
  });

  it("알림 시점은 중복을 없애고 정렬하며, 빈 배열은 알림 없음이다", () => {
    expect(valid({ title: "a", date: "2026-10-07", remindOffsets: [3, 0, 3] }).remindOffsets).toEqual([0, 3]);
    expect(valid({ title: "a", date: "2026-10-07", remindOffsets: [] }).remindOffsets).toEqual([]);
  });

  it("참석자는 중복을 없애고 명단 순서로 정렬한다", () => {
    expect(valid({ title: "a", date: "2026-10-07", attendeeIds: ["p2", "p2", "p1"] }).attendeeIds).toEqual(["p1", "p2"]);
  });

  it("경계 길이(제목 100자, 메모 500자)는 통과한다", () => {
    const value = valid({ title: "가".repeat(100), date: "2026-10-07", memo: "나".repeat(500) });
    expect(value.title).toHaveLength(100);
    expect(value.memo).toHaveLength(500);
  });

  it("메모가 빈 문자열이면 null이다", () => {
    expect(valid({ title: "a", date: "2026-10-07", memo: "   " }).memo).toBeNull();
  });
});

describe("validateEventInput — 제목", () => {
  it("비었거나 공백뿐이거나 문자열이 아니면 거부한다", () => {
    for (const title of ["", "   ", undefined, null, 5, {}]) {
      expect(errors({ title, date: "2026-10-07" }).title, String(title)).toBeTruthy();
    }
  });

  it("101자부터 거부하고, 이모지는 한 글자로 센다", () => {
    expect(errors({ title: "가".repeat(101), date: "2026-10-07" }).title).toContain("100");
    expect(validateEventInput({ title: "😀".repeat(100), date: "2026-10-07" }, people).ok).toBe(true);
    expect(errors({ title: "😀".repeat(101), date: "2026-10-07" }).title).toBeTruthy();
  });
});

describe("validateEventInput — 날짜", () => {
  it("없는 날짜, 다른 모양, 범위 밖은 거부한다", () => {
    for (const date of ["2026-02-30", "2026-13-01", "2026/10/07", "2026-1-1", "", undefined, 20261007, "1999-12-31", "2101-01-01"]) {
      expect(errors({ title: "a", date }).date, String(date)).toBeTruthy();
    }
  });

  it("윤일은 윤년에만 통과한다", () => {
    expect(validateEventInput({ title: "a", date: "2024-02-29" }, people).ok).toBe(true);
    expect(errors({ title: "a", date: "2026-02-29" }).date).toBeTruthy();
  });
});

describe("validateEventInput — 시각", () => {
  it("시작만 있거나 종료만 있으면 거부한다", () => {
    expect(errors({ title: "a", date: "2026-10-07", startTime: "14:00" }).time).toContain("함께");
    expect(errors({ title: "a", date: "2026-10-07", endTime: "14:00" }).time).toContain("함께");
  });

  it("종료가 시작과 같거나 앞서면 거부한다", () => {
    for (const [startTime, endTime] of [["14:00", "14:00"], ["14:00", "13:59"], ["23:59", "00:00"]]) {
      expect(errors({ title: "a", date: "2026-10-07", startTime, endTime }).time, `${startTime}~${endTime}`).toContain("뒤");
    }
  });

  it("HH:MM이 아니면 거부한다", () => {
    for (const [startTime, endTime] of [["9:00", "10:00"], ["09:00", "24:00"], ["09:00", "10:60"], ["abc", "10:00"], [900, 1000]]) {
      expect(errors({ title: "a", date: "2026-10-07", startTime, endTime }).time, `${startTime}~${endTime}`).toBeTruthy();
    }
  });

  it("자정 직전까지의 일정도 통과한다", () => {
    const value = valid({ title: "a", date: "2026-10-07", startTime: "00:00", endTime: "23:59" });
    expect([value.startTime, value.endTime]).toEqual(["00:00", "23:59"]);
  });
});

describe("validateEventInput — 메모, 참석자, 알림 시점", () => {
  it("메모는 501자부터 거부하고 문자열이 아니면 거부한다", () => {
    expect(errors({ title: "a", date: "2026-10-07", memo: "가".repeat(501) }).memo).toContain("500");
    expect(errors({ title: "a", date: "2026-10-07", memo: 5 }).memo).toBeTruthy();
  });

  it("명단에 없는 참석자나 배열이 아닌 값은 거부한다", () => {
    expect(errors({ title: "a", date: "2026-10-07", attendeeIds: ["p9"] }).attendeeIds).toContain("명단");
    expect(errors({ title: "a", date: "2026-10-07", attendeeIds: "p1" }).attendeeIds).toBeTruthy();
    expect(errors({ title: "a", date: "2026-10-07", attendeeIds: [1] }).attendeeIds).toBeTruthy();
  });

  it("허용되지 않은 알림 시점은 거부한다", () => {
    for (const remindOffsets of [[2], [-1], ["0"], "0", null, [0, 7], [1.5]]) {
      expect(errors({ title: "a", date: "2026-10-07", remindOffsets }).remindOffsets, JSON.stringify(remindOffsets)).toBeTruthy();
    }
  });
});

describe("validateEventInput — 여러 오류와 이상한 본문", () => {
  it("틀린 필드를 한꺼번에 알려준다", () => {
    const result = errors({ title: "", date: "2026-02-30", memo: "가".repeat(501), attendeeIds: ["p9"] });
    expect(Object.keys(result).sort()).toEqual(["attendeeIds", "date", "memo", "title"]);
  });

  it("객체가 아닌 본문은 거부한다", () => {
    for (const raw of [null, undefined, [], "text", 5, true]) {
      const result = validateEventInput(raw, people);
      expect(result.ok, String(raw)).toBe(false);
    }
  });
});
