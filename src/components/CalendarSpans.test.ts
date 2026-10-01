import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { monthGrid } from "@/lib/calendar/month";
import { eventDays, groupByDate } from "@/lib/calendar/view";
import type { EventRecord } from "@/lib/events/store";
import { CalendarGrid } from "./CalendarGrid";

const event = (id: number, title: string, date: string, endDate: string | null = null): EventRecord => ({
  id,
  meetupId: null,
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

describe("달력의 기간 일정 막대", () => {
  const sprint = event(1, "스프린트 2", "2026-09-28", "2026-10-18"); // 월요일 ~ 3주 뒤 일요일

  it("기간 일정은 걸친 주마다 막대 하나가 그려진다(4개 주), 제목은 막대에 들어간다", () => {
    const html = render([sprint]);
    expect(html.match(/class="cal-span[ "]/g)).toHaveLength(4);
    expect(html.match(/>스프린트 2</g)).toHaveLength(4);
  });

  it("첫 주 막대는 월요일(1)부터 6칸이고 오른쪽으로 이어진다. 마지막 주 막대는 하루이고 왼쪽에서 이어진다", () => {
    const html = render([sprint]);
    expect(html).toContain('class="cal-span cont-right" style="--col:1;--span:6;--lane:0"');
    expect(html).toContain('class="cal-span cont-left" style="--col:0;--span:1;--lane:0"');
    expect(html).toContain('class="cal-span cont-left cont-right" style="--col:0;--span:7;--lane:0"');
  });

  it("막대는 눌리거나 읽히지 않는다(aria-hidden). 대신 날짜 칸의 일정 개수에 기간 일정도 센다", () => {
    const html = render([sprint]);
    expect(html).toContain('class="cal-spans" aria-hidden="true"');
    expect(html).toContain('aria-label="10월 5일 (월), 일정 1개"'); // 기간 중간의 날
    expect(html).toContain('aria-label="10월 19일 (월), 일정 0개"'); // 기간이 끝난 다음 날
  });

  it("막대로 그린 기간 일정은 날짜 칸 안의 제목 목록에 또 나오지 않는다. 하루짜리 일정은 그대로 나온다", () => {
    const html = render([sprint, event(2, "실무특강 7", "2026-10-08")]);
    expect(html.match(/class="cal-event"/g)).toHaveLength(1);
    expect(html).toContain('class="cal-event">실무특강 7<');
  });

  it("기간 일정이 있는 주는 날짜 숫자 아래에 줄 수(--lanes)만큼 자리를 비워 둔다. 없는 주는 0이다", () => {
    const html = render([sprint]);
    expect(html).toContain('class="cal-row" role="row" style="--lanes:1"');
    expect(html).toContain('class="cal-row" role="row" style="--lanes:0"'); // 5주차(10/25~10/31)는 기간 일정이 이미 끝났다
  });

  it("하루짜리 일정만 있으면 막대 덮개를 만들지 않는다", () => {
    expect(render([event(3, "하루", "2026-10-08")])).not.toContain("cal-span");
  });

  it("기간 일정이 이웃 달 칸으로 걸치는 것도 그 칸의 일정으로 센다", () => {
    expect(eventDays(sprint)).toContain("2026-09-28"); // 10월 달력의 맨 앞 주(9/27~)에 들어 있는 날짜
    expect(render([sprint])).toContain('aria-label="9월 30일 (수), 일정 1개"');
  });
});
