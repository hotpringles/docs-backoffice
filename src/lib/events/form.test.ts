import { describe, expect, it } from "vitest";
import { emptyForm, formFromEvent, formToPayload, toggleValue } from "./form";
import type { EventRecord } from "./store";

describe("emptyForm", () => {
  it("선택한 날짜, 종일, 알림은 당일과 1일 전이 기본이다", () => {
    expect(emptyForm("2026-10-07")).toEqual({
      title: "",
      date: "2026-10-07",
      allDay: true,
      startTime: "09:00",
      endTime: "10:00",
      memo: "",
      attendeeIds: [],
      remindOffsets: [0, 1],
    });
  });
});

describe("formFromEvent / formToPayload", () => {
  const timed: EventRecord = {
    id: 5,
    title: "스터디",
    date: "2026-10-07",
    startTime: "14:00",
    endTime: "16:30",
    memo: "3층",
    attendeeIds: ["p1", "p3"],
    remindOffsets: [0, 3],
  };

  it("시각이 있는 일정은 종일을 끄고 시각을 채운다", () => {
    const form = formFromEvent(timed);
    expect(form).toEqual({
      title: "스터디",
      date: "2026-10-07",
      allDay: false,
      startTime: "14:00",
      endTime: "16:30",
      memo: "3층",
      attendeeIds: ["p1", "p3"],
      remindOffsets: [0, 3],
    });
    expect(formToPayload(form)).toEqual({
      title: "스터디",
      date: "2026-10-07",
      startTime: "14:00",
      endTime: "16:30",
      memo: "3층",
      attendeeIds: ["p1", "p3"],
      remindOffsets: [0, 3],
    });
  });

  it("종일 일정은 시각을 보내지 않는다(입력칸에 남은 값과 상관없이)", () => {
    const form = formFromEvent({ ...timed, startTime: null, endTime: null, memo: null });
    expect(form.allDay).toBe(true);
    expect(form.memo).toBe("");
    expect(formToPayload(form)).toMatchObject({ startTime: null, endTime: null, memo: "" });
  });

  it("종일을 켜면 입력칸의 시각을 무시한다", () => {
    const payload = formToPayload({ ...emptyForm("2026-10-07"), allDay: true, startTime: "13:00", endTime: "14:00" });
    expect(payload).toMatchObject({ startTime: null, endTime: null });
  });

  it("폼을 고치는 도중 원본 배열이 바뀌지 않는다", () => {
    const form = formFromEvent(timed);
    form.attendeeIds.push("p2");
    expect(timed.attendeeIds).toEqual(["p1", "p3"]);
  });
});

describe("toggleValue", () => {
  it("없으면 더하고 있으면 뺀다(원본은 그대로)", () => {
    const list = [0, 1];
    expect(toggleValue(list, 3)).toEqual([0, 1, 3]);
    expect(toggleValue(list, 1)).toEqual([0]);
    expect(list).toEqual([0, 1]);
  });
});
