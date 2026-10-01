"use client";

import type { CSSProperties } from "react";
import type { DayCell } from "@/lib/calendar/month";
import { layoutWeekSpans } from "@/lib/calendar/spans";
import { WEEKDAY_LABELS, dayLabel, visibleTitles } from "@/lib/calendar/view";
import type { EventRecord } from "@/lib/events/store";

type Props = {
  /** 화면 낭독기가 읽는 이름("2026년 10월 달력") */
  label: string;
  weeks: DayCell[][];
  eventsByDate: Record<string, EventRecord[]>;
  today: string;
  /** 지금 옆에 창이 열려 있는 날짜 */
  openDate: string | null;
  onSelect: (date: string, element: HTMLElement) => void;
};

/** 칸에 미리 보여 줄 일정 제목 수. 나머지는 "+N"으로 줄인다. */
const TITLES_PER_CELL = 3;

/**
 * 월 달력. 화면(뷰포트)에 맞춰 늘어나고, 각 날짜 칸은 버튼이라서 누르면 그 날짜 옆에 일정 창이 뜬다.
 * 이웃 달의 칸도 같은 방식으로 눌린다(그 날짜의 일정이 함께 내려와 있다).
 * 기간이 있는 일정은 날짜 칸마다 제목을 반복하지 않고, 걸친 칸들 위에 하나의 긴 줄(막대)로 그린다.
 * 막대는 눌리지 않고(터치를 통과시켜 아래 날짜 칸이 받는다), 그 날짜의 일정 창에는 기간 일정도 함께 나온다.
 */
export function CalendarGrid({ label, weeks, eventsByDate, today, openDate, onSelect }: Props) {
  return (
    <div className="cal" role="grid" aria-label={label} style={{ "--weeks": weeks.length } as CSSProperties}>
      <div className="cal-row cal-head" role="row">
        {WEEKDAY_LABELS.map((day, index) => (
          <div key={day} role="columnheader" className={index === 0 ? "sun" : index === 6 ? "sat" : undefined}>
            {day}
          </div>
        ))}
      </div>
      {weeks.map((week) => {
        const { bars, lanes } = layoutWeekSpans(
          week,
          week.flatMap((cell) => eventsByDate[cell.date] ?? []),
        );
        const barIds = new Set(bars.map((bar) => bar.event.id));
        return (
          <div key={week[0].date} className="cal-row" role="row" style={{ "--lanes": lanes } as CSSProperties}>
            {week.map((cell) => {
              const events = eventsByDate[cell.date] ?? [];
              // 막대로 그린 기간 일정은 칸 안의 제목 목록에서 뺀다(줄이 모자라 막대로 못 그린 것은 일반 제목으로 남는다).
              const { shown, more } = visibleTitles(
                events.filter((event) => !barIds.has(event.id)),
                TITLES_PER_CELL,
              );
              const classes = ["cal-cell", cell.inMonth ? "" : "out", cell.date === today ? "today" : "", cell.date === openDate ? "selected" : ""]
                .filter(Boolean)
                .join(" ");
              return (
                <div key={cell.date} role="gridcell" className="cal-td">
                  <button
                    type="button"
                    className={classes}
                    data-date={cell.date}
                    aria-label={`${dayLabel(cell.date)}, 일정 ${events.length}개`}
                    aria-haspopup="dialog"
                    aria-expanded={cell.date === openDate}
                    aria-current={cell.date === today ? "date" : undefined}
                    onClick={(event) => onSelect(cell.date, event.currentTarget)}
                  >
                    <span className="cal-day">{cell.day}</span>
                    {shown.map((event) => (
                      <span key={event.id} className={event.meetupId === null ? "cal-event" : "cal-event meetup"}>
                        {event.title}
                      </span>
                    ))}
                    {more > 0 && <span className="cal-more">+{more}</span>}
                  </button>
                </div>
              );
            })}
            {bars.length > 0 && (
              <div className="cal-spans" aria-hidden="true">
                {bars.map((bar) => (
                  <span
                    key={bar.event.id}
                    className={["cal-span", bar.continuesLeft ? "cont-left" : "", bar.continuesRight ? "cont-right" : ""].filter(Boolean).join(" ")}
                    style={{ "--col": bar.startCol, "--span": bar.span, "--lane": bar.lane } as CSSProperties}
                  >
                    {bar.event.title}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
