import { describe, expect, it } from "vitest";
import type { EventRecord } from "@/lib/events/store";
import { monthGrid } from "./month";
import { dayLabel, formatTimeRange, groupByDate, pickOpenDate, remindLabel, visibleTitles } from "./view";

const event = (id: number, date: string, overrides: Partial<EventRecord> = {}): EventRecord => ({
  id,
  meetupId: null,
  title: `일정 ${id}`,
  date,
  endDate: null,
  startTime: null,
  endTime: null,
  memo: null,
  attendeeIds: [],
  remindOffsets: [0, 1],
  ...overrides,
});

describe("groupByDate", () => {
  it("날짜별로 묶고 들어온 순서를 지킨다", () => {
    const grouped = groupByDate([event(1, "2026-10-07"), event(2, "2026-10-08"), event(3, "2026-10-07")]);
    expect(Object.keys(grouped).sort()).toEqual(["2026-10-07", "2026-10-08"]);
    expect(grouped["2026-10-07"].map((e) => e.id)).toEqual([1, 3]);
  });

  it("일정이 없으면 빈 객체다", () => {
    expect(groupByDate([])).toEqual({});
  });
});

describe("visibleTitles", () => {
  it("두 개까지 보여주고 나머지는 개수로 줄인다", () => {
    const events = [event(1, "2026-10-07"), event(2, "2026-10-07"), event(3, "2026-10-07"), event(4, "2026-10-07")];
    const { shown, more } = visibleTitles(events);
    expect(shown.map((e) => e.id)).toEqual([1, 2]);
    expect(more).toBe(2);
  });

  it("둘 이하면 더 있다는 표시가 없다", () => {
    expect(visibleTitles([event(1, "2026-10-07")])).toEqual({ shown: [event(1, "2026-10-07")], more: 0 });
    expect(visibleTitles([])).toEqual({ shown: [], more: 0 });
  });
});

describe("formatTimeRange / dayLabel / remindLabel", () => {
  it("시각이 없으면 종일, 있으면 시작–종료다", () => {
    expect(formatTimeRange(event(1, "2026-10-07"))).toBe("종일");
    expect(formatTimeRange(event(1, "2026-10-07", { startTime: "14:00", endTime: "16:30" }))).toBe("14:00–16:30");
  });

  it("날짜 라벨은 월 일 (요일)이다", () => {
    expect(dayLabel("2026-10-07")).toBe("10월 7일 (수)");
    expect(dayLabel("2026-02-01")).toBe("2월 1일 (일)");
    expect(dayLabel("2026-10-31")).toBe("10월 31일 (토)");
  });

  it("알림 시점을 읽기 쉽게 보여준다", () => {
    expect(remindLabel([0, 1])).toBe("당일, 1일 전");
    expect(remindLabel([3])).toBe("3일 전");
    expect(remindLabel([])).toBe("없음");
  });
});

describe("pickOpenDate", () => {
  const grid = monthGrid({ year: 2026, month: 10 });

  it("주소의 ?date=가 보이는 달력 안의 날짜면 그 날짜의 창을 연다(이웃 달 칸도 포함)", () => {
    expect(pickOpenDate("2026-10-15", grid)).toBe("2026-10-15");
    expect(pickOpenDate("2026-09-28", grid)).toBe("2026-09-28");
  });

  it("없거나, 보이는 달력 밖이거나, 이상한 값이면 아무 창도 열지 않는다(오늘을 자동으로 고르지 않는다)", () => {
    for (const raw of ["2026-12-01", "2026-02-30", "abc", "", undefined, ["2026-10-15"]]) {
      expect(pickOpenDate(raw as string | undefined, grid), String(raw)).toBeNull();
    }
  });
});
