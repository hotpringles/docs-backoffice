import { describe, expect, it } from "vitest";
import {
  addDays,
  compareTimes,
  daysBetween,
  daysInMonth,
  formatDate,
  isInSupportedRange,
  isValidDate,
  isValidTime,
  parseDate,
  todayInSeoul,
  weekday,
} from "./dates";

describe("isValidDate / parseDate", () => {
  it("실제로 있는 날짜만 통과시킨다(윤년 포함)", () => {
    expect(isValidDate("2026-02-28")).toBe(true);
    expect(isValidDate("2024-02-29")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-04-31")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-00-10")).toBe(false);
  });

  it("YYYY-MM-DD가 아닌 모양은 거부한다", () => {
    for (const value of ["2026-1-1", "26-10-07", "2026/10/07", "abcd", "", "2026-10-07 ", "2026-10-07T00:00:00Z"]) {
      expect(isValidDate(value), value).toBe(false);
    }
  });

  it("연·월·일을 숫자로 돌려준다", () => {
    expect(parseDate("2026-10-07")).toEqual({ year: 2026, month: 10, day: 7 });
    expect(parseDate("2026-02-30")).toBeNull();
  });

  it("지원 범위는 2000-01-01부터 2100-12-31까지다", () => {
    expect(isInSupportedRange("2000-01-01")).toBe(true);
    expect(isInSupportedRange("2100-12-31")).toBe(true);
    expect(isInSupportedRange("1999-12-31")).toBe(false);
    expect(isInSupportedRange("2101-01-01")).toBe(false);
  });
});

describe("날짜 계산", () => {
  it("addDays는 월·연·윤일 경계를 넘긴다", () => {
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-10-07", 3)).toBe("2026-10-10");
    expect(addDays("2026-10-07", 0)).toBe("2026-10-07");
  });

  it("daysBetween은 뒤가 크면 양수, 앞이 크면 음수다", () => {
    expect(daysBetween("2026-10-01", "2026-10-07")).toBe(6);
    expect(daysBetween("2026-10-07", "2026-10-01")).toBe(-6);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2026-10-07", "2026-10-07")).toBe(0);
  });

  it("weekday는 일요일이 0이다", () => {
    expect(weekday("2026-02-01")).toBe(0);
    expect(weekday("2026-10-07")).toBe(3);
    expect(weekday("2026-10-31")).toBe(6);
  });

  it("daysInMonth는 윤년 2월을 안다", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("formatDate는 0을 채운다", () => {
    expect(formatDate(2026, 3, 5)).toBe("2026-03-05");
  });

  it("존재하지 않는 날짜로 계산하려 하면 오류를 던진다", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow();
  });
});

describe("todayInSeoul", () => {
  it("한국시간 자정(UTC 15:00)에 날짜가 바뀐다", () => {
    expect(todayInSeoul(new Date("2026-09-30T14:59:59Z"))).toBe("2026-09-30");
    expect(todayInSeoul(new Date("2026-09-30T15:00:00Z"))).toBe("2026-10-01");
  });

  it("연말과 연초도 맞는다", () => {
    expect(todayInSeoul(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
    expect(todayInSeoul(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01");
  });

  it("윤일 경계도 맞는다", () => {
    expect(todayInSeoul(new Date("2024-02-28T15:00:00Z"))).toBe("2024-02-29");
    expect(todayInSeoul(new Date("2024-02-29T15:00:00Z"))).toBe("2024-03-01");
  });
});

describe("시각", () => {
  it("HH:MM만 통과시킨다", () => {
    for (const value of ["00:00", "09:30", "23:59"]) expect(isValidTime(value), value).toBe(true);
    for (const value of ["24:00", "9:00", "12:60", "12:5", "1200", "", "12:00:00"]) expect(isValidTime(value), value).toBe(false);
  });

  it("compareTimes는 이른 쪽이 음수다", () => {
    expect(compareTimes("09:00", "10:00")).toBeLessThan(0);
    expect(compareTimes("10:00", "09:00")).toBeGreaterThan(0);
    expect(compareTimes("10:00", "10:00")).toBe(0);
  });
});
