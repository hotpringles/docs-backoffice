import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { END_OF_DAY, isValidEndTime, normalizeEndTime } from "./dates";
import { emptyForm, formFromEvent, formToPayload } from "./form";
import { createEvent, getEvent } from "./store";
import { validateEventInput } from "./validate";

const people = [{ id: "p1", name: "민수" }];
const base = { title: "야간 모임", date: "2026-10-07" };
const ok = (raw: Record<string, unknown>) => {
  const result = validateEventInput(raw, people);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
};
const errorsOf = (raw: Record<string, unknown>) => {
  const result = validateEventInput(raw, people);
  return result.ok ? null : result.errors;
};

describe("끝 시각 자정(24:00) 도우미", () => {
  it("normalizeEndTime: 끝 시각 00:00은 그날 자정(24:00)이다. 나머지는 그대로", () => {
    expect(normalizeEndTime("00:00")).toBe(END_OF_DAY);
    expect(normalizeEndTime("23:30")).toBe("23:30");
    expect(normalizeEndTime("24:00")).toBe("24:00");
    expect(normalizeEndTime("")).toBe("");
  });

  it("isValidEndTime: 00:00~23:59와 24:00만 올바른 끝 시각이다", () => {
    for (const value of ["00:00", "09:30", "23:59", "24:00"]) expect(isValidEndTime(value), value).toBe(true);
    for (const value of ["24:01", "25:00", "9:00", "", "24:00:00", "abc"]) expect(isValidEndTime(value), value).toBe(false);
  });
});

describe("일정의 끝 시각 자정", () => {
  it("끝 시각을 00:00으로 정하면 그날 자정(24:00)까지로 저장된다", () => {
    expect(ok({ ...base, startTime: "22:00", endTime: "00:00" })).toMatchObject({ startTime: "22:00", endTime: "24:00" });
  });

  it("24:00을 직접 보내도 받는다", () => {
    expect(ok({ ...base, startTime: "22:00", endTime: "24:00" })).toMatchObject({ endTime: "24:00" });
  });

  it("00:00~00:00은 하루 전체(00:00~24:00)다", () => {
    expect(ok({ ...base, startTime: "00:00", endTime: "00:00" })).toMatchObject({ startTime: "00:00", endTime: "24:00" });
  });

  it("시작 시각은 24:00이 될 수 없고, 끝이 시작보다 빠르면 여전히 오류다", () => {
    expect(errorsOf({ ...base, startTime: "24:00", endTime: "24:00" })?.time).toBeTruthy();
    expect(errorsOf({ ...base, startTime: "10:00", endTime: "09:00" })?.time).toBeTruthy();
    expect(errorsOf({ ...base, startTime: "10:00", endTime: "24:01" })?.time).toBeTruthy();
  });

  it("폼: 저장된 24:00은 시각 입력칸에 00:00으로 채우고, 그대로 저장하면 24:00으로 돌아온다", () => {
    const record = { id: 1, meetupId: null, title: "야간", date: "2026-10-07", endDate: null, startTime: "22:00", endTime: "24:00", memo: null, attendeeIds: [], remindOffsets: [] };
    const form = formFromEvent(record, []);
    expect(form.endTime).toBe("00:00");
    expect(formToPayload(form)).toMatchObject({ startTime: "22:00", endTime: "00:00" });
    expect(ok({ ...formToPayload(form) })).toMatchObject({ endTime: "24:00" });
    expect(emptyForm("2026-10-07").endTime).toBe("10:00");
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

    it("24:00으로 저장한 끝 시각을 그대로 읽는다", async () => {
      const id = await createEvent(db, ok({ ...base, startTime: "22:00", endTime: "00:00" }));
      expect(await getEvent(db, id)).toMatchObject({ startTime: "22:00", endTime: "24:00" });
    });
  });
});
