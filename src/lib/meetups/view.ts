import { shortDayLabel } from "@/lib/calendar/view";
import type { Recommendation } from "./overlap";
import { cellKey, parseCellKey, slotTime } from "./slots";

/** 후보 날짜 표기: 하루면 "10/7(수)", 여럿이면 "10/7(수) ~ 10/13(화)". */
export function meetupRangeLabel(dates: string[]): string {
  if (dates.length === 0) return "";
  const first = shortDayLabel(dates[0]);
  return dates.length === 1 ? first : `${first} ~ ${shortDayLabel(dates[dates.length - 1])}`;
}

/** 추천 한 줄: "10/7(수) 14:00–16:00 · 5명 모두 가능" 또는 "5명 중 4명 가능". */
export function recommendationLabel(rec: Recommendation): string {
  const who = rec.count === rec.total ? `${rec.total}명 모두 가능` : `${rec.total}명 중 ${rec.count}명 가능`;
  return `${shortDayLabel(rec.day)} ${rec.startTime}–${rec.endTime} · ${who}`;
}

/** 히트맵 진하기 0~4. 0은 아무도 없음, 4는 (거의) 전원. */
export function heatLevel(count: number, total: number): number {
  if (count <= 0 || total <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((count / total) * 4)));
}

/** 표의 왼쪽에 쓰는 칸별 시작 시각("09:00", "09:30", …). */
export function slotLabels(dayStart: string, count: number, slotMinutes = 30): string[] {
  return Array.from({ length: count }, (_, slot) => slotTime(dayStart, slot, slotMinutes));
}

/** 그 날의 모든 칸 키. */
export function columnKeys(day: string, count: number): string[] {
  return Array.from({ length: count }, (_, slot) => cellKey(day, slot));
}

export function isColumnSelected(keys: string[], day: string, count: number): boolean {
  if (count === 0) return false;
  const selected = new Set(keys);
  return columnKeys(day, count).every((key) => selected.has(key));
}

/** 칠하기: `on`이면 칸을 더하고 아니면 뺀 새 배열(중복 없음, 원본은 그대로). */
export function paintKeys(current: string[], keys: string[], on: boolean): string[] {
  const next = new Set(current);
  for (const key of keys) {
    if (on) next.add(key);
    else next.delete(key);
  }
  return [...next];
}

/**
 * 끌다가 `from`에서 `to`로 옮겨 갔을 때 칠할 칸들. 같은 날이면 사이 칸까지 모두(빨리 끌어서 건너뛴 칸이 비지 않게),
 * 다른 날로 넘어갔거나 이전 칸이 없으면 도착한 칸만이다.
 */
export function keysBetween(from: string | null, to: string): string[] {
  const start = from === null ? null : parseCellKey(from);
  const end = parseCellKey(to);
  if (!start || !end || start.day !== end.day) return [to];
  const step = start.slot <= end.slot ? 1 : -1;
  const keys: string[] = [];
  for (let slot = start.slot; slot !== end.slot + step; slot += step) keys.push(cellKey(end.day, slot));
  return keys;
}

/** 날짜 머리글을 눌렀을 때: 그 날이 전부 켜져 있으면 모두 끄고, 아니면 모두 켠다. */
export function toggleColumn(current: string[], day: string, count: number): string[] {
  return paintKeys(current, columnKeys(day, count), !isColumnSelected(current, day, count));
}

/** 칸 키를 날짜 → 칸 번호(숫자) 순으로 정렬한다. 저장할 때 순서를 안정적으로 하려는 것이다. */
export function sortedKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const left = parseCellKey(a);
    const right = parseCellKey(b);
    if (!left || !right) return a < b ? -1 : a > b ? 1 : 0;
    return left.day === right.day ? left.slot - right.slot : left.day < right.day ? -1 : 1;
  });
}

/** 순서와 상관없이 같은 칸들인지. 저장하지 않은 변경이 있는지 볼 때 쓴다. */
export function sameKeys(a: string[], b: string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((key) => right.has(key));
}
