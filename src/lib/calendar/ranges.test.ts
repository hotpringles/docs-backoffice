import { describe, expect, it } from "vitest";
import type { EventRecord } from "@/lib/events/store";
import { eventDays, eventWhenLabel, groupByDate, isRangeEvent } from "./view";

const event = (id: number, date: string, endDate: string | null = null, overrides: Partial<EventRecord> = {}): EventRecord => ({
  id,
  meetupId: null,
  title: `일정 ${id}`,
  date,
  endDate,
  startTime: null,
  endTime: null,
  memo: null,
  attendeeIds: [],
  remindOffsets: [],
  ...overrides,
});

describe("기간 일정 날짜 도우미", () => {
  it("isRangeEvent: 끝 날짜가 있어야 기간 일정이다", () => {
    expect(isRangeEvent(event(1, "2026-10-01", "2026-10-03"))).toBe(true);
    expect(isRangeEvent(event(2, "2026-10-01"))).toBe(false);
  });

  it("eventDays: 시작부터 끝까지 모든 날짜(양 끝 포함), 하루짜리는 그 하루", () => {
    expect(eventDays(event(1, "2026-09-29", "2026-10-02"))).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(eventDays(event(2, "2026-10-07"))).toEqual(["2026-10-07"]);
  });

  it("groupByDate: 기간 일정은 걸친 모든 날짜에 들어가고, 하루짜리와 순서가 섞여도 날짜별로 묶인다", () => {
    const grouped = groupByDate([event(1, "2026-10-01", "2026-10-03"), event(2, "2026-10-02"), event(3, "2026-10-03")]);
    expect(grouped["2026-10-01"].map((e) => e.id)).toEqual([1]);
    expect(grouped["2026-10-02"].map((e) => e.id)).toEqual([1, 2]);
    expect(grouped["2026-10-03"].map((e) => e.id)).toEqual([1, 3]);
    expect(Object.keys(grouped)).toHaveLength(3);
  });

  it("eventWhenLabel: 기간이면 '10/1(목) ~ 10/3(토)', 시각이 있으면 시각 범위, 아니면 종일", () => {
    expect(eventWhenLabel(event(1, "2026-10-01", "2026-10-03"))).toBe("10/1(목) ~ 10/3(토)");
    expect(eventWhenLabel(event(2, "2026-10-01", null, { startTime: "09:00", endTime: "10:00" }))).toBe("09:00–10:00");
    expect(eventWhenLabel(event(3, "2026-10-01"))).toBe("종일");
  });
});
