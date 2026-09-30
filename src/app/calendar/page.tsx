import { CalendarView } from "@/components/CalendarView";
import { hasEditSession } from "@/lib/auth/server";
import { gridRange, monthGrid, monthKey, monthOf, monthTitle, parseMonthParam, shiftMonth } from "@/lib/calendar/month";
import { groupByDate, pickOpenDate } from "@/lib/calendar/view";
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

  return (
    <CalendarView
      key={monthKey(month)}
      title={monthTitle(month)}
      prevHref={`/calendar?month=${monthKey(shiftMonth(month, -1))}`}
      nextHref={`/calendar?month=${monthKey(shiftMonth(month, 1))}`}
      weeks={weeks}
      eventsByDate={groupByDate(events)}
      today={today}
      initialDate={problem ? null : pickOpenDate(params.date, weeks)}
      people={people.ok ? people.people : []}
      canEdit={canEdit}
      problem={problem}
      notices={people.ok ? [] : [people.error]}
    />
  );
}
