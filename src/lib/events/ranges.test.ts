import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { emptyForm, formFromEvent, formToPayload, patchForm } from "./form";
import { createEvent, getEvent, listEventsInRange, updateEvent } from "./store";
import { validateEventInput, type EventInput } from "./validate";

const people = [{ id: "p1", name: "민수" }];
const base = { title: "스프린트", date: "2026-09-07" };

function value(raw: Record<string, unknown>): EventInput {
  const result = validateEventInput(raw, people);
  if (!result.ok) throw new Error(`검증 실패: ${JSON.stringify(result.errors)}`);
  return result.value;
}
const errorsOf = (raw: Record<string, unknown>) => {
  const result = validateEventInput(raw, people);
  return result.ok ? null : result.errors;
};

describe("끝 날짜 검증", () => {
  it("끝 날짜를 안 적으면(없음, null, 빈 칸) 하루짜리 일정이다", () => {
    for (const endDate of [undefined, null, "", "   "]) expect(value({ ...base, endDate }).endDate, String(endDate)).toBeNull();
  });

  it("시작 날짜보다 뒤의 끝 날짜는 기간 일정이 된다", () => {
    expect(value({ ...base, endDate: "2026-09-27" }).endDate).toBe("2026-09-27");
    expect(value({ ...base, endDate: "2026-09-08" }).endDate).toBe("2026-09-08");
  });

  it("끝 날짜가 시작 날짜와 같으면 하루짜리로 본다", () => {
    expect(value({ ...base, endDate: "2026-09-07" }).endDate).toBeNull();
  });

  it("끝 날짜가 시작 날짜보다 빠르면 endDate 오류다", () => {
    expect(errorsOf({ ...base, endDate: "2026-09-06" })?.endDate).toContain("시작");
  });

  it("날짜 모양이 이상하거나 없는 날짜, 지원 범위 밖이면 endDate 오류다", () => {
    for (const endDate of ["abc", "2026-02-30", "2026/09/27", 20260927, "2101-01-01"]) {
      expect(errorsOf({ ...base, endDate })?.endDate, String(endDate)).toBeTruthy();
    }
  });

  it("기간은 366일(양 끝 포함)까지다", () => {
    expect(value({ title: "일 년", date: "2026-01-01", endDate: "2027-01-01" }).endDate).toBe("2027-01-01"); // 366일째
    expect(errorsOf({ title: "너무 김", date: "2026-01-01", endDate: "2027-01-02" })?.endDate).toContain("366");
  });

  it("기간 일정은 종일로만 정할 수 있다(시각을 같이 보내면 time 오류)", () => {
    expect(errorsOf({ ...base, endDate: "2026-09-27", startTime: "09:00", endTime: "10:00" })?.time).toContain("기간");
    expect(value({ ...base, endDate: "2026-09-27", startTime: null, endTime: null }).startTime).toBeNull();
  });

  it("하루짜리 일정의 시각은 전과 같이 검사한다", () => {
    expect(value({ ...base, startTime: "09:00", endTime: "10:00" })).toMatchObject({ startTime: "09:00", endTime: "10:00", endDate: null });
    expect(errorsOf({ ...base, startTime: "10:00", endTime: "09:00" })?.time).toBeTruthy();
  });
});

describe("기간 일정 저장", () => {
  let db: Db;
  let close: () => Promise<void>;
  beforeEach(async () => {
    ({ db, close } = await createTestDb());
  });
  afterEach(async () => {
    await close();
  });

  const input = (overrides: Partial<EventInput> = {}): EventInput => ({
    title: "스프린트 1",
    date: "2026-09-07",
    endDate: "2026-09-27",
    startTime: null,
    endTime: null,
    memo: null,
    attendeeIds: [],
    remindOffsets: [],
    ...overrides,
  });

  it("끝 날짜를 저장하고 그대로 돌려준다. 하루짜리는 null이다", async () => {
    const range = await createEvent(db, input());
    const single = await createEvent(db, input({ title: "하루", date: "2026-09-10", endDate: null }));
    expect((await getEvent(db, range))?.endDate).toBe("2026-09-27");
    expect((await getEvent(db, single))?.endDate).toBeNull();
  });

  it("고쳐서 기간을 늘리거나 줄이거나 없앨 수 있다", async () => {
    const id = await createEvent(db, input());
    expect(await updateEvent(db, id, input({ endDate: "2026-10-04" }))).toBe(true);
    expect((await getEvent(db, id))?.endDate).toBe("2026-10-04");
    expect(await updateEvent(db, id, input({ endDate: null }))).toBe(true);
    expect((await getEvent(db, id))?.endDate).toBeNull();
  });

  it("범위 조회는 그 범위와 겹치는 기간 일정을 모두 돌려준다(앞에서 시작해 들어오는 것, 범위를 덮는 것, 안에서 시작하는 것)", async () => {
    const before = await createEvent(db, input({ title: "앞에서 시작", date: "2026-09-01", endDate: "2026-10-03" }));
    const covering = await createEvent(db, input({ title: "범위를 덮음", date: "2026-08-01", endDate: "2026-12-01" }));
    const inside = await createEvent(db, input({ title: "안에서 시작", date: "2026-10-05", endDate: "2026-10-20" }));
    const single = await createEvent(db, input({ title: "하루", date: "2026-10-07", endDate: null }));
    await createEvent(db, input({ title: "범위 전에 끝남", date: "2026-08-01", endDate: "2026-09-30" }));
    await createEvent(db, input({ title: "범위 뒤에 시작", date: "2026-11-01", endDate: "2026-11-10" }));
    await createEvent(db, input({ title: "범위 뒤 하루", date: "2026-11-02", endDate: null }));

    const ids = (await listEventsInRange(db, "2026-10-01", "2026-10-31")).map((event) => event.id);
    expect(ids.sort((a, b) => a - b)).toEqual([before, covering, inside, single].sort((a, b) => a - b));
  });

  it("끝 날짜가 시작 날짜보다 뒤가 아닌 행은 데이터베이스가 거절한다(검증을 거치지 않은 쓰기도 막힌다)", async () => {
    await expect(
      db.query("insert into events (title, event_date, end_date) values ('잘못', '2026-09-07', '2026-09-07')", []),
    ).rejects.toThrow();
    await expect(
      db.query("insert into events (title, event_date, end_date) values ('잘못', '2026-09-07', '2026-09-01')", []),
    ).rejects.toThrow();
  });
});

describe("일정 폼의 끝 날짜", () => {
  const record = {
    id: 1,
    meetupId: null,
    title: "스프린트",
    date: "2026-09-07",
    endDate: "2026-09-27",
    startTime: null,
    endTime: null,
    memo: null,
    attendeeIds: [],
    remindOffsets: [0, 1],
  };

  it("새 폼은 끝 날짜가 비어 있다", () => {
    expect(emptyForm("2026-10-07").endDate).toBe("");
  });

  it("저장된 일정을 폼으로 옮기면 끝 날짜가 들어가고, 하루짜리는 빈 값이다", () => {
    expect(formFromEvent(record, []).endDate).toBe("2026-09-27");
    expect(formFromEvent({ ...record, endDate: null }, []).endDate).toBe("");
  });

  it("서버로 보낼 때 끝 날짜가 있으면 시각은 비운다(기간 일정은 종일뿐). 없으면 endDate는 null이다", () => {
    const form = { ...emptyForm("2026-09-07"), title: "스프린트", allDay: false, startTime: "09:00", endTime: "10:00" };
    expect(formToPayload({ ...form, endDate: "2026-09-27" })).toMatchObject({ endDate: "2026-09-27", startTime: null, endTime: null });
    expect(formToPayload(form)).toMatchObject({ endDate: null, startTime: "09:00", endTime: "10:00" });
  });

  it("끝 날짜를 정하면 종일로 바뀐다", () => {
    const form = { ...emptyForm("2026-09-07"), allDay: false };
    expect(patchForm(form, { endDate: "2026-09-10" })).toMatchObject({ endDate: "2026-09-10", allDay: true });
  });

  it("시작 날짜를 끝 날짜 이후로 옮기면 끝 날짜는 비워서 '끝이 시작보다 빠름' 오류가 나지 않게 한다", () => {
    const form = { ...emptyForm("2026-09-07"), endDate: "2026-09-10" };
    expect(patchForm(form, { date: "2026-09-20" }).endDate).toBe("");
    expect(patchForm(form, { date: "2026-09-10" }).endDate).toBe("");
    expect(patchForm(form, { date: "2026-09-08" }).endDate).toBe("2026-09-10");
  });

  it("다른 칸을 고치는 것은 끝 날짜에 영향이 없다", () => {
    const form = { ...emptyForm("2026-09-07"), endDate: "2026-09-10" };
    expect(patchForm(form, { title: "새 제목" })).toMatchObject({ title: "새 제목", endDate: "2026-09-10" });
  });
});
