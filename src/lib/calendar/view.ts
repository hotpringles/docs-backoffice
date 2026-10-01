import { addDays, daysBetween, weekday } from "@/lib/events/dates";
import type { EventRecord } from "@/lib/events/store";
import type { DayCell } from "./month";

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 끝 날짜가 있는 기간 일정인지. */
export function isRangeEvent(event: Pick<EventRecord, "endDate">): boolean {
  return event.endDate !== null;
}

/** 일정이 걸친 모든 날짜(시작~끝, 양 끝 포함). 하루짜리는 그 하루다. */
export function eventDays(event: Pick<EventRecord, "date" | "endDate">): string[] {
  const length = event.endDate === null ? 1 : daysBetween(event.date, event.endDate) + 1;
  return Array.from({ length }, (_, index) => addDays(event.date, index));
}

/** 날짜별로 묶는다. 기간 일정은 걸친 모든 날짜에 들어간다(그 날짜의 일정 창에서 보이도록). */
export function groupByDate(events: EventRecord[]): Record<string, EventRecord[]> {
  const grouped: Record<string, EventRecord[]> = {};
  for (const event of events) for (const day of eventDays(event)) (grouped[day] ??= []).push(event);
  return grouped;
}

/** 날짜 칸에는 제목을 `max`개만 보여주고 나머지는 "+N"으로 줄인다. */
export function visibleTitles(events: EventRecord[], max = 2): { shown: EventRecord[]; more: number } {
  return { shown: events.slice(0, max), more: Math.max(0, events.length - max) };
}

export function formatTimeRange(event: Pick<EventRecord, "startTime" | "endTime">): string {
  return event.startTime && event.endTime ? `${event.startTime}–${event.endTime}` : "종일";
}

/** 일정 창에 보일 때: 기간이면 "10/1(목) ~ 10/3(토)", 아니면 시각 범위 또는 "종일". */
export function eventWhenLabel(event: Pick<EventRecord, "date" | "endDate" | "startTime" | "endTime">): string {
  return event.endDate === null ? formatTimeRange(event) : `${shortDayLabel(event.date)} ~ ${shortDayLabel(event.endDate)}`;
}

/** "10월 7일 (수)" */
export function dayLabel(date: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 (${WEEKDAY_LABELS[weekday(date)]})`;
}

/** "10/7(수)" — 알림처럼 좁은 곳에 쓰는 짧은 날짜. */
export function shortDayLabel(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}(${WEEKDAY_LABELS[weekday(date)]})`;
}

const REMIND_LABELS: Record<number, string> = { 0: "당일", 1: "1일 전", 3: "3일 전" };

export function remindLabel(offsets: number[]): string {
  return offsets.length === 0 ? "없음" : offsets.map((offset) => REMIND_LABELS[offset] ?? `${offset}일 전`).join(", ");
}

/**
 * 처음부터 열어 둘 날짜의 창. `?date=`가 지금 보이는 달력 안의 날짜(이웃 달 칸 포함)면 그 날짜, 아니면 null이다.
 * 알림을 눌러 들어오거나 모임을 확정한 뒤 넘어올 때 그 날의 일정을 바로 보여 주려는 것이고, 그 밖에는 아무 창도 열지 않는다.
 */
export function pickOpenDate(raw: string | string[] | undefined, grid: DayCell[][]): string | null {
  if (typeof raw !== "string") return null;
  return grid.flat().some((cell) => cell.date === raw) ? raw : null;
}
