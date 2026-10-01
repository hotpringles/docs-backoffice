"use client";

import type { CSSProperties } from "react";
import type { DayCell } from "@/lib/calendar/month";
import { WEEKDAY_LABELS, dayLabel, isRangeEvent, visibleTitles } from "@/lib/calendar/view";
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

/** 일정 종류별 칩 색: 모임에서 확정된 일정(초록), 기간이 있는 일정(보라), 그 밖(파랑). */
function chipClass(event: EventRecord): string {
  if (event.meetupId !== null) return "cal-event meetup";
  return isRangeEvent(event) ? "cal-event range" : "cal-event";
}

/**
 * 월 달력. 화면(뷰포트)에 맞춰 늘어나고, 각 날짜 칸은 버튼이라서 누르면 그 날짜 옆에 일정 창이 뜬다.
 * 이웃 달의 칸도 같은 방식으로 눌린다(그 날짜의 일정이 함께 내려와 있다).
 * 기간이 있는 일정은 시작 날짜 칸에만 제목이 들어가고 다른 색(보라)으로 보인다.
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
      {weeks.map((week) => (
        <div key={week[0].date} className="cal-row" role="row">
          {week.map((cell) => {
            const events = eventsByDate[cell.date] ?? [];
            const { shown, more } = visibleTitles(events, TITLES_PER_CELL);
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
                    <span key={event.id} className={chipClass(event)}>
                      {event.title}
                    </span>
                  ))}
                  {more > 0 && <span className="cal-more">+{more}</span>}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
