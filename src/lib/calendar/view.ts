import { weekday } from "@/lib/events/dates";
import type { EventRecord } from "@/lib/events/store";
import type { DayCell } from "./month";

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function groupByDate(events: EventRecord[]): Record<string, EventRecord[]> {
  const grouped: Record<string, EventRecord[]> = {};
  for (const event of events) (grouped[event.date] ??= []).push(event);
  return grouped;
}

/** 날짜 칸에는 제목을 `max`개만 보여주고 나머지는 "+N"으로 줄인다. */
export function visibleTitles(events: EventRecord[], max = 2): { shown: EventRecord[]; more: number } {
  return { shown: events.slice(0, max), more: Math.max(0, events.length - max) };
}

export function formatTimeRange(event: Pick<EventRecord, "startTime" | "endTime">): string {
  return event.startTime && event.endTime ? `${event.startTime}–${event.endTime}` : "종일";
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
 * 화면에서 선택한 날짜. `?date=`가 지금 보이는 달력 안의 날짜면 그 날짜, 아니면
 * 오늘이 이 달 안에 있을 때만 오늘, 그 밖에는 선택하지 않는다.
 */
export function pickSelectedDate(raw: string | string[] | undefined, grid: DayCell[][], today: string): string | null {
  const cells = grid.flat();
  if (typeof raw === "string" && cells.some((cell) => cell.date === raw)) return raw;
  return cells.some((cell) => cell.date === today && cell.inMonth) ? today : null;
}
