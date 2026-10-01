import { describe, expect, it } from "vitest";
import type { EventRecord } from "@/lib/events/store";
import { eventWhenLabel, groupByDate, isRangeEvent } from "./view";

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

  it("groupByDate: 기간 일정도 시작 날짜에만 들어간다(끝 날짜나 중간 날짜 칸에는 나오지 않는다)", () => {
    const grouped = groupByDate([event(1, "2026-10-01", "2026-10-03"), event(2, "2026-10-02"), event(3, "2026-10-03")]);
    expect(grouped["2026-10-01"].map((e) => e.id)).toEqual([1]);
    expect(grouped["2026-10-02"].map((e) => e.id)).toEqual([2]);
    expect(grouped["2026-10-03"].map((e) => e.id)).toEqual([3]);
    expect(Object.keys(grouped)).toHaveLength(3);
  });

  it("groupByDate: 같은 날 시작하는 일정은 들어온 순서를 지킨다", () => {
    const grouped = groupByDate([event(1, "2026-10-01", "2026-10-09"), event(2, "2026-10-01"), event(3, "2026-10-01", "2026-10-02")]);
    expect(grouped["2026-10-01"].map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("eventWhenLabel: 기간이면 '10/1(목) ~ 10/3(토)', 시각이 있으면 시각 범위, 아니면 종일", () => {
    expect(eventWhenLabel(event(1, "2026-10-01", "2026-10-03"))).toBe("10/1(목) ~ 10/3(토)");
    expect(eventWhenLabel(event(2, "2026-10-01", null, { startTime: "09:00", endTime: "10:00" }))).toBe("09:00–10:00");
    expect(eventWhenLabel(event(3, "2026-10-01"))).toBe("종일");
  });
});
