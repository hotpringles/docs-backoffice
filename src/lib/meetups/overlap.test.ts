import { describe, expect, it } from "vitest";
import type { Person } from "@/lib/people";
import { computeOverlap, type OverlapInput } from "./overlap";
import { cellKey } from "./slots";

const people: Person[] = ["p1", "p2", "p3", "p4", "p5"].map((id, index) => ({ id, name: `참가자 ${index + 1}` }));
const D1 = "2026-10-07";
const D2 = "2026-10-08";

// 09:00~13:00, 칸 8개(0=09:00 … 7=12:30)
const base = { dates: [D1, D2], dayStart: "09:00", dayEnd: "13:00", slotMinutes: 30, people };

/** 사람별로 그 날의 칸 번호들을 적으면 칸 키 목록이 된다. */
function marks(spec: Record<string, Array<[string, number[]]>>): OverlapInput["availability"] {
  return Object.fromEntries(
    Object.entries(spec).map(([person, days]) => [person, days.flatMap(([day, slots]) => slots.map((slot) => cellKey(day, slot)))]),
  );
}

const everyone = (day: string, slots: number[]) => Object.fromEntries(people.map((p) => [p.id, [[day, slots]] as Array<[string, number[]]>]));

describe("computeOverlap — 칸별 인원", () => {
  it("칸마다 가능한 사람 수와 번호(명단 순서)를 센다", () => {
    const { cells, total } = computeOverlap({
      ...base,
      availability: marks({ p3: [[D1, [0, 1]]], p1: [[D1, [1]]], p2: [[D2, [7]]] }),
    });
    expect(total).toBe(5);
    expect(cells[cellKey(D1, 0)]).toEqual({ count: 1, personIds: ["p3"] });
    expect(cells[cellKey(D1, 1)]).toEqual({ count: 2, personIds: ["p1", "p3"] });
    expect(cells[cellKey(D1, 2)]).toEqual({ count: 0, personIds: [] });
    expect(cells[cellKey(D2, 7)]).toEqual({ count: 1, personIds: ["p2"] });
  });

  it("모든 날짜의 모든 칸이 들어 있다", () => {
    const { cells } = computeOverlap({ ...base, availability: {} });
    expect(Object.keys(cells)).toHaveLength(2 * 8);
  });

  it("명단에 없는 번호의 칸은 무시한다", () => {
    const { cells } = computeOverlap({ ...base, availability: marks({ p9: [[D1, [0, 1, 2]]], p1: [[D1, [0]]] }) });
    expect(cells[cellKey(D1, 0)]).toEqual({ count: 1, personIds: ["p1"] });
    expect(cells[cellKey(D1, 1)].count).toBe(0);
  });
});

describe("computeOverlap — 추천", () => {
  it("아무도 표시하지 않았으면 추천이 비어 있다", () => {
    expect(computeOverlap({ ...base, availability: {} }).recommendations).toEqual([]);
  });

  it("한 칸(30분)만 겹치면 추천하지 않는다(최소 2칸)", () => {
    expect(computeOverlap({ ...base, availability: marks(everyone(D1, [3])) }).recommendations).toEqual([]);
  });

  it("전원이 가능한 연속 구간을 하나로 합쳐서 추천한다", () => {
    const { recommendations } = computeOverlap({ ...base, availability: marks(everyone(D1, [1, 2, 3, 4])) });
    expect(recommendations).toEqual([
      {
        day: D1,
        startSlot: 1,
        endSlot: 5,
        startTime: "09:30",
        endTime: "11:30",
        count: 5,
        total: 5,
        personIds: ["p1", "p2", "p3", "p4", "p5"],
      },
    ]);
  });

  it("떨어진 두 구간은 따로 추천한다", () => {
    const { recommendations } = computeOverlap({ ...base, availability: marks(everyone(D1, [0, 1, 4, 5])) });
    expect(recommendations.map((r) => [r.startSlot, r.endSlot])).toEqual([
      [0, 2],
      [4, 6],
    ]);
  });

  it("더 늘리면 인원이 줄어드는 경우, 인원이 많은 짧은 구간과 인원이 적은 긴 구간이 모두 후보이고 인원이 많은 쪽이 먼저다", () => {
    const { recommendations } = computeOverlap({
      ...base,
      availability: marks({ p1: [[D1, [2, 3, 4, 5]]], p2: [[D1, [2, 3]]] }),
    });
    expect(recommendations.map((r) => [r.startSlot, r.endSlot, r.count, r.personIds])).toEqual([
      [2, 4, 2, ["p1", "p2"]],
      [2, 6, 1, ["p1"]],
    ]);
  });

  it("전원이 가능한 1시간이 4명이 가능한 4시간보다 먼저다", () => {
    const { recommendations } = computeOverlap({
      ...base,
      availability: {
        ...marks({ p1: [[D1, [0, 1, 2, 3, 4, 5]], [D2, [2, 3]]], p2: [[D1, [0, 1, 2, 3, 4, 5]], [D2, [2, 3]]] }),
        ...marks({ p3: [[D1, [0, 1, 2, 3, 4, 5]], [D2, [2, 3]]], p4: [[D1, [0, 1, 2, 3, 4, 5]], [D2, [2, 3]]] }),
        ...marks({ p5: [[D2, [2, 3]]] }),
      },
    });
    expect(recommendations[0]).toMatchObject({ day: D2, startSlot: 2, endSlot: 4, count: 5 });
    expect(recommendations[1]).toMatchObject({ day: D1, startSlot: 0, endSlot: 6, count: 4 });
  });

  it("인원이 같으면 더 긴 구간이, 길이도 같으면 더 이른 날짜와 시각이 먼저다", () => {
    const { recommendations } = computeOverlap({
      ...base,
      availability: marks({
        p1: [[D2, [0, 1]], [D1, [4, 5]], [D1, [0, 1, 2]]],
      }),
    });
    expect(recommendations.map((r) => [r.day, r.startSlot, r.endSlot])).toEqual([
      [D1, 0, 3],
      [D1, 4, 6],
      [D2, 0, 2],
    ]);
  });

  it("추천은 최대 3개다", () => {
    const { recommendations } = computeOverlap({
      ...base,
      availability: marks({ p1: [[D1, [0, 1, 3, 4, 6, 7]], [D2, [0, 1, 3, 4]]] }),
    });
    expect(recommendations).toHaveLength(3);
  });

  it("구간은 하루를 넘지 않는다", () => {
    const { recommendations } = computeOverlap({
      ...base,
      availability: marks(Object.fromEntries(people.map((p) => [p.id, [[D1, [7]], [D2, [0]]] as Array<[string, number[]]>]))),
    });
    expect(recommendations).toEqual([]);
  });

  it("사람이 한 명뿐이어도 그 사람의 연속 구간을 추천한다", () => {
    const { recommendations } = computeOverlap({ ...base, availability: marks({ p2: [[D1, [4, 5]]] }) });
    expect(recommendations).toEqual([
      { day: D1, startSlot: 4, endSlot: 6, startTime: "11:00", endTime: "12:00", count: 1, total: 5, personIds: ["p2"] },
    ]);
  });

  it("하루 끝 칸까지 이어진 구간의 끝 시각은 하루 끝 시각이다", () => {
    const { recommendations } = computeOverlap({ ...base, availability: marks(everyone(D2, [6, 7])) });
    expect(recommendations[0]).toMatchObject({ startTime: "12:00", endTime: "13:00" });
  });

  it("명단이 5명이 아니어도 총원은 명단 길이이고, 전원이면 count가 total과 같다", () => {
    const three = people.slice(0, 3);
    const { recommendations, total } = computeOverlap({
      ...base,
      people: three,
      availability: marks(Object.fromEntries(three.map((p) => [p.id, [[D1, [2, 3]]] as Array<[string, number[]]>]))),
    });
    expect(total).toBe(3);
    expect(recommendations[0]).toMatchObject({ count: 3, total: 3 });
  });

  it("칸 수가 0인(잘못된) 하루 범위는 빈 결과다", () => {
    expect(computeOverlap({ ...base, dayEnd: "09:00", availability: marks(everyone(D1, [0, 1])) })).toEqual({
      total: 5,
      cells: {},
      recommendations: [],
    });
  });
});
