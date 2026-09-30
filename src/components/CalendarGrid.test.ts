import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { monthGrid } from "@/lib/calendar/month";
import type { EventRecord } from "@/lib/events/store";
import { CalendarGrid } from "./CalendarGrid";

const weeks = monthGrid({ year: 2026, month: 10 }); // 5주
const event = (id: number, date: string, title: string, meetupId: number | null = null): EventRecord => ({
  id,
  title,
  date,
  startTime: null,
  endTime: null,
  memo: null,
  attendeeIds: [],
  remindOffsets: [0],
  meetupId,
});

function render(eventsByDate: Record<string, EventRecord[]> = {}, openDate: string | null = null, today = "2026-10-07"): string {
  return renderToStaticMarkup(createElement(CalendarGrid, { label: "2026년 10월 달력", weeks, eventsByDate, today, openDate, onSelect: () => undefined }));
}

describe("CalendarGrid", () => {
  it("모든 날짜 칸이 버튼이고 날짜(data-date)와 일정 수를 이름으로 가진다", () => {
    const html = render({ "2026-10-05": [event(1, "2026-10-05", "회의")] });
    expect(html.match(/<button/g)).toHaveLength(35); // 5주 × 7일, 이웃 달 칸 포함
    expect(html).toContain('data-date="2026-10-05"');
    expect(html).toContain('aria-label="10월 5일 (월), 일정 1개"');
    expect(html).toContain('aria-label="9월 27일 (일), 일정 0개"');
  });

  it("주 수를 CSS 변수로 알려서 화면 높이를 그 수만큼 똑같이 나눈다", () => {
    expect(render()).toContain("--weeks:5");
  });

  it("창이 열려 있는 날짜 칸만 selected이고 aria-expanded가 true다", () => {
    const html = render({}, "2026-10-12");
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html).toMatch(/class="cal-cell selected"[^>]*data-date="2026-10-12"/);
  });

  it("오늘 칸에 today 표시와 aria-current가 붙는다", () => {
    const html = render({}, null, "2026-10-07");
    expect(html).toMatch(/class="cal-cell today"[^>]*data-date="2026-10-07"[^>]*aria-current="date"/);
  });

  it("한 칸에는 제목 3개까지 보이고 나머지는 +N이며, 모임에서 확정된 일정은 meetup 색이다", () => {
    const day = "2026-10-05";
    const html = render({
      [day]: [event(1, day, "가"), event(2, day, "나"), event(3, day, "다", 9), event(4, day, "라"), event(5, day, "마")],
    });
    expect(html).toContain(">가<");
    expect(html).toContain(">다<");
    expect(html).not.toContain(">라<");
    expect(html).toContain("+2");
    expect(html).toContain('class="cal-event meetup">다');
  });

  it("요일 머리글의 일요일·토요일에 색 표시 클래스가 붙는다", () => {
    const html = render();
    expect(html).toContain('class="sun">일');
    expect(html).toContain('class="sat">토');
  });
});
