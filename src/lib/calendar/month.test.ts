import { describe, expect, it } from "vitest";
import { gridRange, monthGrid, monthKey, monthOf, monthTitle, parseMonthParam, shiftMonth } from "./month";

const FALLBACK = { year: 2026, month: 9 };

describe("parseMonthParam", () => {
  it("YYYY-MM을 읽는다", () => {
    expect(parseMonthParam("2026-10", FALLBACK)).toEqual({ year: 2026, month: 10 });
    expect(parseMonthParam("2000-01", FALLBACK)).toEqual({ year: 2000, month: 1 });
  });

  it("이상하거나 범위 밖이면 대체 값을 쓴다", () => {
    for (const raw of ["2026-13", "2026-00", "abc", "2026-1", "1999-12", "2101-01", "", undefined, ["2026-10"]]) {
      expect(parseMonthParam(raw as string | undefined, FALLBACK), String(raw)).toEqual(FALLBACK);
    }
  });
});

describe("monthKey / monthOf / monthTitle / shiftMonth", () => {
  it("표기와 변환", () => {
    expect(monthKey({ year: 2026, month: 3 })).toBe("2026-03");
    expect(monthOf("2026-10-07")).toEqual({ year: 2026, month: 10 });
    expect(monthTitle({ year: 2026, month: 10 })).toBe("2026년 10월");
  });

  it("12월과 1월 사이를 넘나든다", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 10 }, 0)).toEqual({ year: 2026, month: 10 });
    expect(shiftMonth({ year: 2026, month: 10 }, 15)).toEqual({ year: 2028, month: 1 });
  });
});

describe("monthGrid", () => {
  it("2026년 2월은 일요일에 시작해서 4주다", () => {
    const grid = monthGrid({ year: 2026, month: 2 });
    expect(grid).toHaveLength(4);
    expect(grid[0][0]).toEqual({ date: "2026-02-01", day: 1, inMonth: true });
    expect(grid[3][6]).toEqual({ date: "2026-02-28", day: 28, inMonth: true });
    expect(grid.flat().every((cell) => cell.inMonth)).toBe(true);
  });

  it("윤년 2월(2024)은 5주이고 29일이 들어 있다", () => {
    const grid = monthGrid({ year: 2024, month: 2 });
    expect(grid).toHaveLength(5);
    expect(grid[0][0]).toEqual({ date: "2024-01-28", day: 28, inMonth: false });
    expect(grid.flat().find((cell) => cell.date === "2024-02-29")?.inMonth).toBe(true);
    expect(grid[4][6]).toEqual({ date: "2024-03-02", day: 2, inMonth: false });
  });

  it("토요일에 시작하는 31일짜리 달(2025년 3월)은 6주다", () => {
    const grid = monthGrid({ year: 2025, month: 3 });
    expect(grid).toHaveLength(6);
    expect(grid[0][0].date).toBe("2025-02-23");
    expect(grid[5][6].date).toBe("2025-04-05");
  });

  it("2026년 10월은 5주이고 앞뒤를 이웃 달로 채운다", () => {
    const grid = monthGrid({ year: 2026, month: 10 });
    expect(grid).toHaveLength(5);
    expect(grid[0].map((cell) => cell.inMonth)).toEqual([false, false, false, false, true, true, true]);
    expect(grid[0][0].date).toBe("2026-09-27");
    expect(grid[4][6].date).toBe("2026-10-31");
  });

  it("어느 달이든 한 주는 7칸이고 날짜가 하루씩 이어진다", () => {
    for (let month = 1; month <= 12; month += 1) {
      const cells = monthGrid({ year: 2026, month }).flat();
      expect(cells.length % 7).toBe(0);
      for (let i = 1; i < cells.length; i += 1) {
        const prev = new Date(`${cells[i - 1].date}T00:00:00Z`).getTime();
        const next = new Date(`${cells[i].date}T00:00:00Z`).getTime();
        expect(next - prev, `${month}월 ${i}번째 칸`).toBe(86_400_000);
      }
      expect(cells.filter((cell) => cell.inMonth)).toHaveLength(new Date(Date.UTC(2026, month, 0)).getUTCDate());
    }
  });
});

describe("gridRange", () => {
  it("보이는 첫 칸과 마지막 칸의 날짜를 돌려준다", () => {
    expect(gridRange({ year: 2026, month: 10 })).toEqual({ from: "2026-09-27", to: "2026-10-31" });
    expect(gridRange({ year: 2025, month: 3 })).toEqual({ from: "2025-02-23", to: "2025-04-05" });
  });
});
