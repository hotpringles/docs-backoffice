import { describe, expect, it } from "vitest";
import { reminderLine, reminderPayload } from "./format";
import type { ReminderItem } from "./types";

const item = (overrides: Partial<ReminderItem> = {}): ReminderItem => ({
  eventId: 1,
  title: "회의",
  date: "2026-10-07",
  startTime: null,
  offsetDays: 0,
  ...overrides,
});

describe("reminderLine", () => {
  it("종일 일정은 '오늘: 제목', 시각이 있으면 '오늘 14:00: 제목'이다", () => {
    expect(reminderLine(item())).toBe("오늘: 회의");
    expect(reminderLine(item({ startTime: "14:00" }))).toBe("오늘 14:00: 회의");
  });

  it("1일 전은 '내일', 3일 전은 '3일 뒤'다", () => {
    expect(reminderLine(item({ offsetDays: 1 }))).toBe("내일: 회의");
    expect(reminderLine(item({ offsetDays: 3, startTime: "09:30" }))).toBe("3일 뒤 09:30: 회의");
  });

  it("제목이 40자를 넘으면 자르고 …을 붙인다(이모지도 한 글자로 센다)", () => {
    expect(reminderLine(item({ title: "가".repeat(40) }))).toBe(`오늘: ${"가".repeat(40)}`);
    expect(reminderLine(item({ title: "가".repeat(41) }))).toBe(`오늘: ${"가".repeat(39)}…`);
    expect(reminderLine(item({ title: "😀".repeat(41) }))).toBe(`오늘: ${"😀".repeat(39)}…`);
  });
});

describe("reminderPayload", () => {
  it("한 건이면 그 날짜의 달력을 연다", () => {
    expect(reminderPayload([item({ startTime: "14:00" })])).toEqual({
      title: "일정 알림",
      body: "오늘 14:00: 회의",
      url: "/calendar?month=2026-10&date=2026-10-07",
      tag: "event-reminders",
    });
  });

  it("여러 건이면 줄로 나누고, 첫 항목의 달을 연다", () => {
    const payload = reminderPayload([
      item({ eventId: 1, title: "회의" }),
      item({ eventId: 2, title: "발표", offsetDays: 1, date: "2026-10-08" }),
      item({ eventId: 3, title: "제출", offsetDays: 3, date: "2026-10-10" }),
    ]);
    expect(payload.body).toBe("오늘: 회의\n내일: 발표\n3일 뒤: 제출");
    expect(payload.url).toBe("/calendar?month=2026-10");
  });

  it("세 줄을 넘으면 '외 N건'으로 줄인다", () => {
    const items = Array.from({ length: 5 }, (_, i) => item({ eventId: i + 1, title: `일정 ${i + 1}` }));
    expect(reminderPayload(items).body).toBe("오늘: 일정 1\n오늘: 일정 2\n오늘: 일정 3\n외 2건");
  });

  it("가장 긴 경우에도 웹 푸시 본문 제한(약 4KB)보다 훨씬 작다", () => {
    const items = Array.from({ length: 10 }, (_, i) => item({ eventId: i + 1, title: "가".repeat(100), startTime: "14:00" }));
    const size = new TextEncoder().encode(JSON.stringify(reminderPayload(items))).length;
    expect(size).toBeLessThan(1000);
  });

  it("보낼 항목이 없으면 오류를 던진다", () => {
    expect(() => reminderPayload([])).toThrow();
  });
});
