import type { Person } from "@/lib/people";
import { cellKey, slotCount, slotTime } from "./slots";

export type OverlapInput = {
  dates: string[];
  dayStart: string;
  dayEnd: string;
  slotMinutes: number;
  people: Person[];
  /** 사람 번호 → 가능한 칸 키("2026-10-07:4") 목록 */
  availability: Record<string, string[]>;
};

export type CellSummary = { count: number; personIds: string[] };

export type Recommendation = {
  day: string;
  startSlot: number;
  /** 끝 칸의 다음 번호(구간은 startSlot 이상 endSlot 미만) */
  endSlot: number;
  startTime: string;
  endTime: string;
  count: number;
  total: number;
  personIds: string[];
};

export type OverlapResult = { total: number; cells: Record<string, CellSummary>; recommendations: Recommendation[] };

/** 최소 2칸(1시간) 이상 연속인 구간만 후보다. */
const MIN_SLOTS = 2;
const MAX_RECOMMENDATIONS = 3;

/**
 * 칸별 가능한 사람과 추천 구간을 계산한다(스펙 7.1).
 * - 구간의 인원은 그 구간의 **모든 칸에서** 가능한 사람 수다.
 * - 더 늘려도 인원이 그대로인 구간은 늘려서 하나로 합친다(극대 구간만 남는다).
 * - 순위: 인원 많은 순 → 긴 구간 → 이른 날짜 → 이른 시각. 최대 3개. 구간은 하루를 넘지 않는다.
 */
export function computeOverlap(input: OverlapInput): OverlapResult {
  const { dates, dayStart, dayEnd, slotMinutes, people } = input;
  const perDay = slotCount(dayStart, dayEnd, slotMinutes);
  const roster = people.map((person) => person.id);
  const marked = new Map(roster.map((id) => [id, new Set(input.availability[id] ?? [])]));

  const cells: Record<string, CellSummary> = {};
  const candidates: Recommendation[] = [];

  for (const day of dates) {
    const perSlot: string[][] = [];
    for (let slot = 0; slot < perDay; slot += 1) {
      const key = cellKey(day, slot);
      const personIds = roster.filter((id) => marked.get(id)?.has(key));
      cells[key] = { count: personIds.length, personIds };
      perSlot.push(personIds);
    }

    // spans[a][b] = 칸 a부터 b까지(양 끝 포함) 모두 가능한 사람들(명단 순서)
    const spans: string[][][] = [];
    for (let a = 0; a < perDay; a += 1) {
      spans[a] = [];
      for (let b = a; b < perDay; b += 1) {
        spans[a][b] = b === a ? perSlot[a] : spans[a][b - 1].filter((id) => perSlot[b].includes(id));
      }
    }

    for (let a = 0; a < perDay; a += 1) {
      for (let b = a + MIN_SLOTS - 1; b < perDay; b += 1) {
        const personIds = spans[a][b];
        if (personIds.length === 0) continue;
        // 한쪽으로 늘려도 인원이 그대로면 극대 구간이 아니다(더 긴 구간에 합쳐진다).
        if (a > 0 && spans[a - 1][b].length === personIds.length) continue;
        if (b < perDay - 1 && spans[a][b + 1].length === personIds.length) continue;
        candidates.push({
          day,
          startSlot: a,
          endSlot: b + 1,
          startTime: slotTime(dayStart, a, slotMinutes),
          endTime: slotTime(dayStart, b + 1, slotMinutes),
          count: personIds.length,
          total: roster.length,
          personIds,
        });
      }
    }
  }

  candidates.sort(
    (x, y) =>
      y.count - x.count ||
      y.endSlot - y.startSlot - (x.endSlot - x.startSlot) ||
      (x.day < y.day ? -1 : x.day > y.day ? 1 : 0) ||
      x.startSlot - y.startSlot,
  );

  return { total: roster.length, cells, recommendations: candidates.slice(0, MAX_RECOMMENDATIONS) };
}
