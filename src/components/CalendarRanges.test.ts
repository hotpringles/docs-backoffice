import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { monthGrid } from "@/lib/calendar/month";
import { groupByDate } from "@/lib/calendar/view";
import type { EventRecord } from "@/lib/events/store";
import { CalendarGrid } from "./CalendarGrid";

const event = (id: number, title: string, date: string, endDate: string | null = null, meetupId: number | null = null): EventRecord => ({
  id,
  meetupId,
  title,
  date,
  endDate,
  startTime: null,
  endTime: null,
  memo: null,
  attendeeIds: [],
  remindOffsets: [],
});

const weeks = monthGrid({ year: 2026, month: 10 });
const render = (events: EventRecord[]) =>
  renderToStaticMarkup(
    createElement(CalendarGrid, {
      label: "2026년 10월 달력",
      weeks,
      eventsByDate: groupByDate(events),
      today: "2026-10-07",
      openDate: null,
      onSelect: () => undefined,
    }),
  );

describe("달력의 기간 일정 표시", () => {
  const sprint = event(1, "스프린트 2", "2026-09-28", "2026-10-18"); // 21일

  it("기간 일정은 시작 날짜 칸에만 제목이 들어가고, 색이 다르다(range)", () => {
    const html = render([sprint]);
    expect(html.match(/class="cal-event range">스프린트 2</g)).toHaveLength(1);
  });

  it("긴 줄(막대)은 그리지 않는다", () => {
    const html = render([sprint]);
    expect(html).not.toContain("cal-span");
    expect(html).not.toContain("--lanes");
  });

  it("하루짜리 일정은 기본 색, 모임 확정 일정은 모임 색, 기간 일정은 기간 색이다", () => {
    const html = render([event(2, "하루", "2026-10-08"), event(3, "모임", "2026-10-09", null, 5), event(4, "기간", "2026-10-12", "2026-10-13")]);
    expect(html).toContain('class="cal-event">하루<');
    expect(html).toContain('class="cal-event meetup">모임<');
    expect(html.match(/class="cal-event range">기간</g)).toHaveLength(1);
  });

  it("날짜 칸의 일정 개수는 시작 날짜 칸에만 세고, 기간 중간이나 끝 날짜 칸은 0개다", () => {
    const html = render([sprint]);
    expect(html).toContain('aria-label="9월 28일 (월), 일정 1개"');
    expect(html).toContain('aria-label="10월 5일 (월), 일정 0개"');
    expect(html).toContain('aria-label="10월 18일 (일), 일정 0개"');
  });

  it("한 칸에 제목은 3개까지만 보이고 나머지는 +N이다(기간 일정도 똑같이 센다)", () => {
    const events = [event(1, "스프린트", "2026-10-06", "2026-10-18"), event(2, "a", "2026-10-06"), event(3, "b", "2026-10-06"), event(4, "c", "2026-10-06")];
    const html = render(events);
    expect(html).toContain('class="cal-more">+1<');
  });
});

describe("기간 일정 색", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  it("기간 일정 칩은 일정·모임과 다른 색 변수(--range-bg, --range-fg)를 쓴다", () => {
    const rule = /\.cal-event\.range\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(rule).toMatch(/background:\s*var\(--range-bg\)/);
    expect(rule).toMatch(/color:\s*var\(--range-fg\)/);
  });

  it("긴 줄 스타일은 남아 있지 않다", () => {
    expect(css).not.toContain(".cal-span");
    expect(css).not.toContain("--lane-h");
  });
});
