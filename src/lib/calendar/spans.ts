import type { EventRecord } from "@/lib/events/store";
import type { DayCell } from "./month";

/** 한 주 안에서 그릴 기간 일정의 한 토막(막대). */
export type SpanBar = {
  event: EventRecord;
  /** 이 주에서 막대가 시작하는 칸(0=일요일 … 6=토요일) */
  startCol: number;
  /** 이 주에서 막대가 차지하는 칸 수(1~7) */
  span: number;
  /** 위에서부터 몇 번째 줄인지(0부터) */
  lane: number;
  /** 이 주보다 앞에서 시작해 왼쪽에서 이어져 들어온다(왼쪽 끝을 둥글게 하지 않는다) */
  continuesLeft: boolean;
  /** 이 주 다음으로 이어진다(오른쪽 끝을 둥글게 하지 않는다) */
  continuesRight: boolean;
};

export type WeekSpans = {
  bars: SpanBar[];
  /** 막대가 쓰는 줄 수(날짜 칸이 그만큼 아래로 비켜 준다) */
  lanes: number;
  /** 줄이 모자라서 막대로 못 그린 기간 일정(칸에 일반 제목으로 보여 준다) */
  overflow: EventRecord[];
};

/** 한 주에 막대로 그릴 줄 수의 기본 상한. 더 많이 겹치면 나머지는 일반 제목으로 보인다. */
export const MAX_SPAN_LANES = 3;

/**
 * 한 주(7칸)에 걸친 기간 일정을 막대로 배치한다. 하루짜리 일정과 이 주와 겹치지 않는 일정은 무시한다.
 * 먼저 시작하는 일정(시작이 같으면 더 긴 일정)부터 비어 있는 가장 위쪽 줄에 놓는다.
 */
export function layoutWeekSpans(week: DayCell[], events: EventRecord[], maxLanes: number = MAX_SPAN_LANES): WeekSpans {
  const first = week[0].date;
  const last = week[week.length - 1].date;
  const indexOf = new Map(week.map((cell, index) => [cell.date, index]));

  // 같은 일정이 여러 날짜에서 한꺼번에 들어올 수 있으니 번호로 한 번만 센다.
  const seen = new Set<number>();
  const ranges = events
    .filter((event) => {
      if (event.endDate === null || event.endDate < first || event.date > last || seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.endDate as string) < (b.endDate as string) ? 1 : (a.endDate as string) > (b.endDate as string) ? -1 : a.id - b.id));

  const occupied: boolean[][] = []; // occupied[lane][col]
  const bars: SpanBar[] = [];
  const overflow: EventRecord[] = [];

  for (const event of ranges) {
    const continuesLeft = event.date < first;
    const continuesRight = (event.endDate as string) > last;
    const startCol = continuesLeft ? 0 : (indexOf.get(event.date) as number);
    const endCol = continuesRight ? week.length - 1 : (indexOf.get(event.endDate as string) as number);

    let lane = 0;
    while (lane < maxLanes && occupied[lane]?.slice(startCol, endCol + 1).some(Boolean)) lane += 1;
    if (lane >= maxLanes) {
      overflow.push(event);
      continue;
    }
    occupied[lane] ??= [];
    for (let col = startCol; col <= endCol; col += 1) occupied[lane][col] = true;
    bars.push({ event, startCol, span: endCol - startCol + 1, lane, continuesLeft, continuesRight });
  }

  return { bars, lanes: occupied.length, overflow };
}
