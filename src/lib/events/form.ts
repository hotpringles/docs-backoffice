import type { EventRecord } from "./store";

/** 일정 폼에 입력 중인 값. 종일이면 시각 칸은 무시된다. */
export type EventFormState = {
  title: string;
  date: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  memo: string;
  attendeeIds: string[];
  remindOffsets: number[];
};

export function emptyForm(date: string): EventFormState {
  return {
    title: "",
    date,
    allDay: true,
    startTime: "09:00",
    endTime: "10:00",
    memo: "",
    attendeeIds: [],
    remindOffsets: [0, 1],
  };
}

export function formFromEvent(event: EventRecord): EventFormState {
  return {
    title: event.title,
    date: event.date,
    allDay: event.startTime === null,
    startTime: event.startTime ?? "09:00",
    endTime: event.endTime ?? "10:00",
    memo: event.memo ?? "",
    attendeeIds: [...event.attendeeIds],
    remindOffsets: [...event.remindOffsets],
  };
}

/** 서버로 보낼 본문. 종일이면 시각은 null로 보낸다. */
export function formToPayload(form: EventFormState): Record<string, unknown> {
  return {
    title: form.title,
    date: form.date,
    startTime: form.allDay ? null : form.startTime,
    endTime: form.allDay ? null : form.endTime,
    memo: form.memo,
    attendeeIds: form.attendeeIds,
    remindOffsets: form.remindOffsets,
  };
}

/** 체크박스용: 없으면 더하고 있으면 뺀 새 배열. */
export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}
