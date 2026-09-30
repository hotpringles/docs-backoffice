import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAY_END,
  DEFAULT_DAY_START,
  boundaryOf,
  cellKey,
  datesInRange,
  defaultMeetupDates,
  meetupDateWindow,
  minutesOf,
  parseCellKey,
  slotCount,
  slotTime,
  timeOf,
} from "./slots";

describe("시각과 분", () => {
  it("HH:MM과 분을 서로 바꾼다", () => {
    expect(minutesOf("09:30")).toBe(570);
    expect(minutesOf("00:00")).toBe(0);
    expect(timeOf(570)).toBe("09:30");
    expect(timeOf(0)).toBe("00:00");
    expect(timeOf(23 * 60 + 30)).toBe("23:30");
  });
});

describe("slotCount / slotTime", () => {
  it("기본 하루 범위(09:00~22:00)는 30분 칸 26개다", () => {
    expect(slotCount(DEFAULT_DAY_START, DEFAULT_DAY_END)).toBe(26);
  });

  it("칸 번호를 시각으로 바꾼다(0번은 시작 시각, 칸 수 번은 끝 시각)", () => {
    expect(slotTime("09:00", 0)).toBe("09:00");
    expect(slotTime("09:00", 1)).toBe("09:30");
    expect(slotTime("09:00", 5)).toBe("11:30");
    expect(slotTime("09:00", 26)).toBe("22:00");
  });

  it("끝이 시작보다 앞이거나 같거나 칸 크기로 나누어 떨어지지 않으면 0이다", () => {
    expect(slotCount("10:00", "10:00")).toBe(0);
    expect(slotCount("12:00", "09:00")).toBe(0);
    expect(slotCount("09:00", "09:45")).toBe(0);
  });
});

describe("boundaryOf", () => {
  it("하루 범위 안의 칸 경계는 번호로, 그 밖은 null이다", () => {
    expect(boundaryOf("09:00", "13:00", "09:00")).toBe(0);
    expect(boundaryOf("09:00", "13:00", "11:30")).toBe(5);
    expect(boundaryOf("09:00", "13:00", "13:00")).toBe(8);
    expect(boundaryOf("09:00", "13:00", "08:30")).toBeNull();
    expect(boundaryOf("09:00", "13:00", "13:30")).toBeNull();
    expect(boundaryOf("09:00", "13:00", "10:15")).toBeNull();
  });

  it("하루 범위가 올바르지 않으면 null이다", () => {
    expect(boundaryOf("12:00", "09:00", "10:00")).toBeNull();
  });
});

describe("datesInRange", () => {
  it("시작~끝(양 끝 포함)의 날짜를 하루씩 돌려준다", () => {
    expect(datesInRange("2026-10-07", "2026-10-07")).toEqual(["2026-10-07"]);
    expect(datesInRange("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("14일까지 통과하고 15일부터 거부한다", () => {
    expect(datesInRange("2026-10-01", "2026-10-14")).toHaveLength(14);
    expect(datesInRange("2026-10-01", "2026-10-15")).toBeNull();
  });

  it("끝이 시작보다 빠르거나 날짜가 올바르지 않으면 null이다", () => {
    expect(datesInRange("2026-10-08", "2026-10-07")).toBeNull();
    expect(datesInRange("2026-02-30", "2026-03-02")).toBeNull();
    expect(datesInRange("abc", "2026-10-07")).toBeNull();
    expect(datesInRange("1999-12-30", "1999-12-31")).toBeNull();
  });
});

describe("cellKey / parseCellKey", () => {
  it("칸 키를 만들고 읽는다", () => {
    expect(cellKey("2026-10-07", 4)).toBe("2026-10-07:4");
    expect(parseCellKey("2026-10-07:4")).toEqual({ day: "2026-10-07", slot: 4 });
    expect(parseCellKey("2026-10-07:0")).toEqual({ day: "2026-10-07", slot: 0 });
  });

  it("모양이 틀리면 null이다", () => {
    for (const key of ["", "2026-10-07", "2026-10-07:", "2026-10-07:-1", "2026-10-07:1.5", "2026-10-07:abc", "10-07:4", "2026-10-07:4:5", "2026-10-07:1000"]) {
      expect(parseCellKey(key), key).toBeNull();
    }
  });
});

describe("meetupDateWindow", () => {
  it("후보 날짜를 고를 수 있는 범위는 오늘을 포함해 7일(오늘~6일 뒤)이다", () => {
    expect(meetupDateWindow("2026-10-07")).toEqual({ min: "2026-10-07", max: "2026-10-13" });
  });

  it("달과 해를 넘겨도 맞다", () => {
    expect(meetupDateWindow("2026-12-28")).toEqual({ min: "2026-12-28", max: "2027-01-03" });
    expect(meetupDateWindow("2026-02-25")).toEqual({ min: "2026-02-25", max: "2026-03-03" });
  });
});

describe("defaultMeetupDates", () => {
  it("새 모임 폼의 처음 값: 시작은 오늘, 끝은 고를 수 있는 마지막 날(오늘을 포함한 일주일의 끝)이다", () => {
    expect(defaultMeetupDates("2026-09-30")).toEqual({ startDate: "2026-09-30", endDate: "2026-10-06" });
    expect(defaultMeetupDates("2026-12-28")).toEqual({ startDate: "2026-12-28", endDate: "2027-01-03" });
  });

  it("처음 값은 서버가 받아 주는 범위 안이다(그대로 만들어도 거절되지 않는다)", () => {
    const { startDate, endDate } = defaultMeetupDates("2026-10-07");
    const { min, max } = meetupDateWindow("2026-10-07");
    expect(startDate >= min && endDate <= max).toBe(true);
    expect(datesInRange(startDate, endDate)).toHaveLength(7);
  });
});
