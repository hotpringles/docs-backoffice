import { describe, expect, it } from "vitest";
import { formatRelative } from "./relative-time";

const now = new Date("2026-09-30T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRelative", () => {
  it("1분 미만은 방금 전", () => {
    expect(formatRelative(ago(10 * SEC), now)).toBe("방금 전");
    expect(formatRelative(ago(44 * SEC), now)).toBe("방금 전");
  });

  it("분, 시간, 일 단위로 말한다", () => {
    expect(formatRelative(ago(90 * SEC), now)).toBe("2분 전");
    expect(formatRelative(ago(10 * MIN), now)).toBe("10분 전");
    expect(formatRelative(ago(59.6 * MIN), now)).toBe("1시간 전");
    expect(formatRelative(ago(5 * HOUR), now)).toBe("5시간 전");
    expect(formatRelative(ago(23.7 * HOUR), now)).toBe("1일 전");
    expect(formatRelative(ago(3 * DAY), now)).toBe("3일 전");
  });

  it("30일이 넘으면 날짜로 보여준다", () => {
    expect(formatRelative("2026-08-01T00:00:00Z", now)).toBe("2026-08-01");
  });

  it("미래 시각이나 잘못된 값도 죽지 않는다", () => {
    expect(formatRelative("2026-09-30T13:00:00Z", now)).toBe("방금 전");
    expect(formatRelative("not-a-date", now)).toBe("not-a-date");
  });
});
