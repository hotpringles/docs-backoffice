import { addDays, daysBetween, isInSupportedRange, isValidDate } from "@/lib/events/dates";

/** 칸 크기는 30분으로 고정이다. */
export const SLOT_MINUTES = 30;
export const DEFAULT_DAY_START = "09:00";
export const DEFAULT_DAY_END = "22:00";
export const MAX_MEETUP_DAYS = 14;
/** 후보 날짜는 오늘을 포함해 이만큼의 날(일주일) 안에서만 고를 수 있다. */
export const MEETUP_WINDOW_DAYS = 7;

/** "HH:MM"을 자정부터의 분으로. (형식은 호출하는 쪽이 이미 확인했다고 본다.) */
export function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

/** 자정부터의 분을 "HH:MM"으로. */
export function timeOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** 하루 범위(시작~끝)의 칸 수. 끝이 시작보다 앞서거나 같거나 칸 크기로 나누어 떨어지지 않으면 0. */
export function slotCount(dayStart: string, dayEnd: string, slotMinutes: number = SLOT_MINUTES): number {
  const span = minutesOf(dayEnd) - minutesOf(dayStart);
  return span > 0 && span % slotMinutes === 0 ? span / slotMinutes : 0;
}

/** 칸 번호의 시작 시각. `slot`이 칸 수이면 하루의 끝 시각이다. */
export function slotTime(dayStart: string, slot: number, slotMinutes: number = SLOT_MINUTES): string {
  return timeOf(minutesOf(dayStart) + slot * slotMinutes);
}

/**
 * 시각을 칸 경계 번호로 바꾼다(시작 시각 → 0, 끝 시각 → 칸 수).
 * 하루 범위 밖이거나 칸 경계에 맞지 않으면 null.
 */
export function boundaryOf(dayStart: string, dayEnd: string, time: string, slotMinutes: number = SLOT_MINUTES): number | null {
  const count = slotCount(dayStart, dayEnd, slotMinutes);
  const offset = minutesOf(time) - minutesOf(dayStart);
  if (count === 0 || offset < 0 || offset % slotMinutes !== 0) return null;
  const index = offset / slotMinutes;
  return index <= count ? index : null;
}

/** 시작~끝(양 끝 포함)의 날짜 목록. 올바르지 않거나 끝이 시작보다 빠르거나 14일을 넘으면 null. */
export function datesInRange(startDate: string, endDate: string): string[] | null {
  if (!isValidDate(startDate) || !isValidDate(endDate)) return null;
  if (!isInSupportedRange(startDate) || !isInSupportedRange(endDate)) return null;
  const length = daysBetween(startDate, endDate) + 1;
  if (length < 1 || length > MAX_MEETUP_DAYS) return null;
  return Array.from({ length }, (_, index) => addDays(startDate, index));
}

/** 새 모임의 후보 날짜를 고를 수 있는 범위: 오늘을 포함한 일주일(오늘~6일 뒤, 양 끝 포함). `today`는 서울 기준 오늘("YYYY-MM-DD")이다. */
export function meetupDateWindow(today: string): { min: string; max: string } {
  return { min: today, max: addDays(today, MEETUP_WINDOW_DAYS - 1) };
}

/** 새 모임 폼의 처음 후보 날짜: 시작은 오늘, 끝은 고를 수 있는 마지막 날(오늘을 포함한 일주일의 끝)이다. */
export function defaultMeetupDates(today: string): { startDate: string; endDate: string } {
  const { min, max } = meetupDateWindow(today);
  return { startDate: min, endDate: max };
}

const CELL_KEY = /^(\d{4}-\d{2}-\d{2}):(\d{1,3})$/;

/** 날짜와 칸 번호를 하나의 키로("2026-10-07:4"). 화면과 서버가 같은 모양을 쓴다. */
export function cellKey(day: string, slot: number): string {
  return `${day}:${slot}`;
}

export function parseCellKey(key: string): { day: string; slot: number } | null {
  const match = CELL_KEY.exec(key);
  if (!match) return null;
  return { day: match[1], slot: Number(match[2]) };
}
