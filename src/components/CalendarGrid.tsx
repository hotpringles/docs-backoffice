import Link from "next/link";
import { monthKey, monthOf, type DayCell, type MonthRef } from "@/lib/calendar/month";
import { WEEKDAY_LABELS, dayLabel, visibleTitles } from "@/lib/calendar/view";
import type { EventRecord } from "@/lib/events/store";

type Props = {
  month: MonthRef;
  weeks: DayCell[][];
  eventsByDate: Record<string, EventRecord[]>;
  today: string;
  selected: string | null;
};

/** 월 달력 표. 날짜 칸은 링크라서 누르면 그 날짜가 선택된다(서버가 그려 주므로 자바스크립트가 없어도 동작한다). */
export function CalendarGrid({ month, weeks, eventsByDate, today, selected }: Props) {
  return (
    <table className="cal">
      <caption className="sr-only">{`${month.year}년 ${month.month}월 달력`}</caption>
      <thead>
        <tr>
          {WEEKDAY_LABELS.map((label, index) => (
            <th key={label} scope="col" className={index === 0 ? "sun" : index === 6 ? "sat" : undefined}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0].date}>
            {week.map((cell) => {
              const events = eventsByDate[cell.date] ?? [];
              const { shown, more } = visibleTitles(events);
              const classes = ["cal-cell", cell.inMonth ? "" : "out", cell.date === today ? "today" : "", cell.date === selected ? "selected" : ""]
                .filter(Boolean)
                .join(" ");
              // 이웃 달의 칸을 누르면 그 달로 넘어가고, 이 달의 칸은 지금 보는 달을 유지한다.
              const target = cell.inMonth ? month : monthOf(cell.date);
              return (
                <td key={cell.date}>
                  <Link
                    href={`/calendar?month=${monthKey(target)}&date=${cell.date}`}
                    className={classes}
                    aria-label={`${dayLabel(cell.date)}, 일정 ${events.length}개`}
                    aria-current={cell.date === today ? "date" : undefined}
                  >
                    <span className="cal-day">{cell.day}</span>
                    {shown.map((event) => (
                      <span key={event.id} className="cal-event">
                        {event.title}
                      </span>
                    ))}
                    {more > 0 && <span className="cal-more">+{more}</span>}
                  </Link>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
