import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { slotCount, slotTime } from "./slots";
import { createMeetup, getMeetup } from "./store";
import { validateConfirmInput, validateMeetupInput } from "./validate";

const TODAY = "2026-10-07";
const base = { title: "야간 모임", startDate: "2026-10-07", endDate: "2026-10-08" };
const ok = (raw: Record<string, unknown>) => {
  const result = validateMeetupInput({ ...base, ...raw }, TODAY);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
};
const errorsOf = (raw: Record<string, unknown>) => {
  const result = validateMeetupInput({ ...base, ...raw }, TODAY);
  return result.ok ? null : result.errors;
};

describe("모임의 하루 끝 자정", () => {
  it("하루 끝을 00:00으로 정하면 그날 자정(24:00)까지다", () => {
    expect(ok({ dayStart: "09:00", dayEnd: "00:00" })).toMatchObject({ dayStart: "09:00", dayEnd: "24:00" });
    expect(slotCount("09:00", "24:00")).toBe(30);
    expect(ok({ dayStart: "22:00", dayEnd: "00:00" }).dayEnd).toBe("24:00");
    expect(slotCount("22:00", "24:00")).toBe(4);
  });

  it("24:00을 직접 보내도 받는다", () => {
    expect(ok({ dayStart: "09:00", dayEnd: "24:00" }).dayEnd).toBe("24:00");
  });

  it("00:00~00:00은 하루 전체(48칸)다", () => {
    expect(ok({ dayStart: "00:00", dayEnd: "00:00" })).toMatchObject({ dayStart: "00:00", dayEnd: "24:00" });
    expect(slotCount("00:00", "24:00")).toBe(48);
  });

  it("끝이 시작보다 빠르거나 30분 단위가 아니면 여전히 오류다", () => {
    expect(errorsOf({ dayStart: "13:00", dayEnd: "12:00" })?.time).toBeTruthy();
    expect(errorsOf({ dayStart: "09:00", dayEnd: "24:30" })?.time).toBeTruthy();
    expect(errorsOf({ dayStart: "09:00", dayEnd: "23:45" })?.time).toBeTruthy();
    expect(errorsOf({ dayStart: "24:00", dayEnd: "24:00" })?.time).toBeTruthy();
  });

  it("칸 시각: 마지막 칸의 끝은 24:00으로 보인다", () => {
    expect(slotTime("09:00", 30)).toBe("24:00");
    expect(slotTime("09:00", 29)).toBe("23:30");
  });

  it("확정: 하루가 자정에 끝나면 끝 시각 24:00(또는 00:00)으로 마지막 칸까지 확정할 수 있다", () => {
    const meetup = { dates: ["2026-10-07"], dayStart: "20:00", dayEnd: "24:00", slotMinutes: 30 };
    for (const endTime of ["24:00", "00:00"]) {
      const result = validateConfirmInput({ day: "2026-10-07", startTime: "22:00", endTime, remindOffsets: [0] }, meetup);
      expect(result.ok, endTime).toBe(true);
      if (result.ok) expect(result.value).toMatchObject({ startSlot: 4, endSlot: 8, startTime: "22:00", endTime: "24:00" });
    }
  });

  it("확정: 범위 밖이거나 끝이 시작보다 빠르면 여전히 오류다", () => {
    const meetup = { dates: ["2026-10-07"], dayStart: "20:00", dayEnd: "24:00", slotMinutes: 30 };
    const bad = (startTime: string, endTime: string) => validateConfirmInput({ day: "2026-10-07", startTime, endTime, remindOffsets: [0] }, meetup);
    expect(bad("19:00", "24:00").ok).toBe(false);
    expect(bad("23:00", "22:30").ok).toBe(false);
    expect(bad("22:00", "24:30").ok).toBe(false);
  });

  describe("저장소", () => {
    let db: Db;
    let close: () => Promise<void>;
    beforeEach(async () => {
      ({ db, close } = await createTestDb());
    });
    afterEach(async () => {
      await close();
    });

    it("하루 끝 24:00을 저장하고 그대로 읽는다", async () => {
      const id = await createMeetup(db, ok({ dayStart: "09:00", dayEnd: "00:00" }));
      expect(await getMeetup(db, id)).toMatchObject({ dayStart: "09:00", dayEnd: "24:00" });
    });
  });
});
