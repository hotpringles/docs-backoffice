import { describe, expect, it } from "vitest";
import type { EventRecord } from "@/lib/events/store";
import { monthGrid } from "./month";
import { layoutWeekSpans } from "./spans";
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

// 2026년 10월 달력: 1주 9/27~10/3, 2주 10/4~10/10, 3주 10/11~10/17, 4주 10/18~10/24, 5주 10/25~10/31
const weeks = monthGrid({ year: 2026, month: 10 });

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

describe("layoutWeekSpans", () => {
  it("몇 주에 걸친 일정은 주마다 한 줄씩 나뉘고, 이어지는 쪽은 이어짐 표시가 붙는다", () => {
    const sprint = event(1, "2026-09-28", "2026-10-18"); // 월요일 ~ 3주 뒤 일요일
    const [w1, w2, w3, w4, w5] = weeks.map((week) => layoutWeekSpans(week, [sprint]));

    expect(w1.bars).toEqual([{ event: sprint, startCol: 1, span: 6, lane: 0, continuesLeft: false, continuesRight: true }]);
    expect(w2.bars).toEqual([{ event: sprint, startCol: 0, span: 7, lane: 0, continuesLeft: true, continuesRight: true }]);
    expect(w3.bars).toEqual([{ event: sprint, startCol: 0, span: 7, lane: 0, continuesLeft: true, continuesRight: true }]);
    expect(w4.bars).toEqual([{ event: sprint, startCol: 0, span: 1, lane: 0, continuesLeft: true, continuesRight: false }]);
    expect(w5.bars).toEqual([]);
    expect([w1, w2, w3, w4, w5].map((w) => w.lanes)).toEqual([1, 1, 1, 1, 0]);
  });

  it("한 주 안에서 시작하고 끝나는 일정은 이어짐 표시가 없다", () => {
    const meeting = event(1, "2026-10-06", "2026-10-08");
    const { bars } = layoutWeekSpans(weeks[1], [meeting]);
    expect(bars).toEqual([{ event: meeting, startCol: 2, span: 3, lane: 0, continuesLeft: false, continuesRight: false }]);
  });

  it("하루짜리 일정과 이 주와 상관없는 일정은 줄이 되지 않는다", () => {
    const { bars, lanes } = layoutWeekSpans(weeks[1], [event(1, "2026-10-06"), event(2, "2026-09-01", "2026-09-30"), event(3, "2026-11-01", "2026-11-05")]);
    expect(bars).toEqual([]);
    expect(lanes).toBe(0);
  });

  it("겹치는 일정은 다른 줄(lane)에, 겹치지 않는 일정은 같은 줄에 놓인다", () => {
    const a = event(1, "2026-10-04", "2026-10-07");
    const b = event(2, "2026-10-06", "2026-10-09");
    const c = event(3, "2026-10-08", "2026-10-10"); // a와는 안 겹치고 b와는 겹침 → a가 있던 0번 줄을 쓴다
    const { bars, lanes } = layoutWeekSpans(weeks[1], [c, b, a]);
    const laneOf = (id: number) => bars.find((bar) => bar.event.id === id)?.lane;
    expect(laneOf(1)).toBe(0);
    expect(laneOf(2)).toBe(1);
    expect(laneOf(3)).toBe(0);
    expect(lanes).toBe(2);
  });

  it("먼저 시작하는 일정이, 시작이 같으면 더 긴 일정이 위쪽 줄을 차지한다", () => {
    const short = event(1, "2026-10-05", "2026-10-06");
    const long = event(2, "2026-10-05", "2026-10-09");
    const early = event(3, "2026-10-04", "2026-10-05");
    const { bars } = layoutWeekSpans(weeks[1], [short, long, early]);
    const laneOf = (id: number) => bars.find((bar) => bar.event.id === id)?.lane;
    expect(laneOf(3)).toBe(0); // 가장 먼저 시작
    expect(laneOf(2)).toBe(1); // early(10/4~10/5)와 겹치므로 아래로, 같은 날 시작한 short보다 긴 쪽이 먼저
    expect(laneOf(1)).toBe(2);
  });

  it("줄이 최대 개수를 넘으면 넘친 일정은 줄로 그리지 않고 overflow로 돌려준다", () => {
    const events = [1, 2, 3, 4].map((id) => event(id, "2026-10-05", "2026-10-09"));
    const { bars, lanes, overflow } = layoutWeekSpans(weeks[1], events, 3);
    expect(bars.map((bar) => bar.lane).sort()).toEqual([0, 1, 2]);
    expect(lanes).toBe(3);
    expect(overflow.map((e) => e.id)).toEqual([4]);
  });

  it("같은 일정이 두 번 들어와도 한 줄만 그린다", () => {
    const a = event(1, "2026-10-05", "2026-10-09");
    expect(layoutWeekSpans(weeks[1], [a, a]).bars).toHaveLength(1);
  });
});
