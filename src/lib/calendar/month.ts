import { daysInMonth, formatDate, weekday } from "@/lib/events/dates";

export type MonthRef = { year: number; month: number };
export type DayCell = { date: string; day: number; inMonth: boolean };

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

/** "YYYY-MM-DD"가 속한 달. */
export function monthOf(date: string): MonthRef {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

/** `?month=YYYY-MM`을 읽는다. 이상하거나 2000~2100년 밖이면 대체 값을 쓴다. */
export function parseMonthParam(raw: string | string[] | undefined, fallback: MonthRef): MonthRef {
  if (typeof raw !== "string") return fallback;
  const match = MONTH_PATTERN.exec(raw);
  if (!match) return fallback;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return fallback;
  return { year, month };
}

export function monthKey({ year, month }: MonthRef): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function shiftMonth({ year, month }: MonthRef, delta: number): MonthRef {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function monthTitle({ year, month }: MonthRef): string {
  return `${year}년 ${month}월`;
}

/** 일요일에 시작하는 월 달력. 앞뒤 빈칸은 이웃 달의 날짜로 채우고, 필요한 만큼의 주(4~6주)만 돌려준다. */
export function monthGrid(ref: MonthRef): DayCell[][] {
  const lead = weekday(formatDate(ref.year, ref.month, 1));
  const total = daysInMonth(ref.year, ref.month);
  const weeks = Math.ceil((lead + total) / 7);
  const prev = shiftMonth(ref, -1);
  const next = shiftMonth(ref, 1);
  const prevDays = daysInMonth(prev.year, prev.month);

  const cells: DayCell[] = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const dayNumber = i - lead + 1;
    if (dayNumber < 1) {
      const day = prevDays + dayNumber;
      cells.push({ date: formatDate(prev.year, prev.month, day), day, inMonth: false });
    } else if (dayNumber > total) {
      const day = dayNumber - total;
      cells.push({ date: formatDate(next.year, next.month, day), day, inMonth: false });
    } else {
      cells.push({ date: formatDate(ref.year, ref.month, dayNumber), day: dayNumber, inMonth: true });
    }
  }
  return Array.from({ length: weeks }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

/** 화면에 보이는 첫 칸과 마지막 칸의 날짜(이 범위의 일정을 불러오면 된다). */
export function gridRange(ref: MonthRef): { from: string; to: string } {
  const grid = monthGrid(ref);
  return { from: grid[0][0].date, to: grid[grid.length - 1][6].date };
}
