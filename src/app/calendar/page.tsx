import Link from "next/link";
import { CalendarGrid } from "@/components/CalendarGrid";
import { EventEditor } from "@/components/EventEditor";
import { hasEditSession } from "@/lib/auth/server";
import { gridRange, monthGrid, monthKey, monthOf, monthTitle, parseMonthParam, shiftMonth } from "@/lib/calendar/month";
import { dayLabel, groupByDate, pickSelectedDate } from "@/lib/calendar/view";
import { getDbOrNull } from "@/lib/db";
import { todayInSeoul } from "@/lib/events/dates";
import { listEventsInRange, type EventRecord } from "@/lib/events/store";
import { loadPeople } from "@/lib/people";

export const metadata = { title: "달력" };

type SearchParams = Promise<{ month?: string | string[]; date?: string | string[] }>;

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const today = todayInSeoul();
  const month = parseMonthParam(params.month, monthOf(today));
  const weeks = monthGrid(month);
  const range = gridRange(month);
  const selected = pickSelectedDate(params.date, weeks, today);

  // 데이터베이스 문제는 달력 화면에서만 안내하고, 문서 뷰어에는 영향을 주지 않는다.
  let events: EventRecord[] = [];
  let problem: string | null = null;
  const db = getDbOrNull();
  if (!db) {
    problem = "데이터베이스가 설정되지 않아서 일정을 불러올 수 없어요.";
  } else {
    try {
      events = await listEventsInRange(db, range.from, range.to);
    } catch (error) {
      console.error("일정을 불러오지 못했어요", error);
      problem = "일정을 불러오지 못했어요. 잠시 뒤에 다시 시도해 주세요.";
    }
  }

  const people = loadPeople();
  const canEdit = await hasEditSession();
  const eventsByDate = groupByDate(events);
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <main className="page page-wide">
      <div className="cal-nav">
        <Link href={`/calendar?month=${monthKey(prev)}`} aria-label="이전 달">
          ‹
        </Link>
        <h1>{monthTitle(month)}</h1>
        <Link href={`/calendar?month=${monthKey(next)}`} aria-label="다음 달">
          ›
        </Link>
        <Link href="/calendar" className="cal-today">
          오늘
        </Link>
      </div>

      {problem && <p className="banner">{problem}</p>}
      {!people.ok && <p className="banner">{people.error}</p>}

      <CalendarGrid month={month} weeks={weeks} eventsByDate={eventsByDate} today={today} selected={selected} />

      {selected && !problem ? (
        <section className="day-panel" aria-label={`${dayLabel(selected)} 일정`}>
          <h2>{dayLabel(selected)}</h2>
          <EventEditor
            key={selected}
            date={selected}
            events={eventsByDate[selected] ?? []}
            people={people.ok ? people.people : []}
            canEdit={canEdit}
          />
        </section>
      ) : (
        !problem && <p className="empty">날짜를 눌러 그날의 일정을 확인하세요.</p>
      )}
    </main>
  );
}
