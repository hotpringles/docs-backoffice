/**
 * 날짜는 시간대 없는 "YYYY-MM-DD" 문자열, 시각은 "HH:MM" 문자열로만 다룬다.
 * 계산은 UTC 자정을 기준으로 해서 실행하는 컴퓨터의 시간대나 서머타임에 영향을 받지 않게 한다.
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 86_400_000;
/** 한국은 UTC+9이고 서머타임이 없다. */
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

export const MIN_DATE = "2000-01-01";
export const MAX_DATE = "2100-12-31";

export function parseDate(value: string): { year: number; month: number; day: number } | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  // 2월 30일처럼 없는 날짜는 Date가 다음 달로 넘겨 버리므로, 되돌려 봐서 같은지 확인한다.
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function isValidDate(value: string): boolean {
  return parseDate(value) !== null;
}

/** 고정 폭 형식이라 문자열 비교가 곧 날짜 비교다. */
export function isInSupportedRange(value: string): boolean {
  return value >= MIN_DATE && value <= MAX_DATE;
}

export function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toUtcMs(value: string): number {
  const parts = parseDate(value);
  if (!parts) throw new Error(`올바르지 않은 날짜예요: ${value}`);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

export function addDays(value: string, days: number): string {
  const moved = new Date(toUtcMs(value) + days * DAY_MS);
  return formatDate(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** 0=일요일 … 6=토요일 */
export function weekday(value: string): number {
  return new Date(toUtcMs(value)).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 한국시간 기준 오늘 날짜. */
export function todayInSeoul(now: Date = new Date()): string {
  const seoul = new Date(now.getTime() + SEOUL_OFFSET_MS);
  return formatDate(seoul.getUTCFullYear(), seoul.getUTCMonth() + 1, seoul.getUTCDate());
}

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/**
 * 하루의 끝(자정)은 끝 시각으로만 쓸 수 있고 "24:00"으로 저장한다(Postgres의 time은 24:00을 받는다).
 * 시각 입력칸(<input type="time">)은 24:00을 만들 수 없어서 자정을 00:00으로 입력하는데, 끝 시각의 "00:00"은 그날의 끝으로 본다.
 */
export const END_OF_DAY = "24:00";

/** 끝 시각으로 올바른 값: 00:00~23:59와 24:00. */
export function isValidEndTime(value: string): boolean {
  return value === END_OF_DAY || isValidTime(value);
}

/** 끝 시각 "00:00"은 그날의 끝(24:00)으로 바꾼다. 다른 값은 그대로 돌려준다. */
export function normalizeEndTime(value: string): string {
  return value === "00:00" ? END_OF_DAY : value;
}

/** "HH:MM"은 고정 폭이라 문자열 순서가 시각 순서다. */
export function compareTimes(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
