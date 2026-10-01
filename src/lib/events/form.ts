import type { Person } from "@/lib/people";
import type { EventRecord } from "./store";

/** 일정 폼에 입력 중인 값. 종일이면 시각 칸은 무시된다. `endDate`가 빈 문자열이면 하루짜리 일정이다. */
export type EventFormState = {
  title: string;
  date: string;
  endDate: string;
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
    endDate: "",
    allDay: true,
    startTime: "09:00",
    endTime: "10:00",
    memo: "",
    attendeeIds: [],
    remindOffsets: [0, 1],
  };
}

/**
 * 저장된 일정을 폼에 옮긴다. 명단(`PEOPLE`)에서 나중에 빠진 참석자는 옮기지 않는다.
 * 폼에는 지금 명단의 사람만 체크박스로 나오므로 끌 방법이 없고, 그대로 저장하면 서버가 "명단에 없는 참석자"로 거절해서
 * 그 일정을 다시는 고칠 수 없게 되기 때문이다. (저장하면 빠진 참석자는 일정에서 자연스럽게 사라진다.)
 */
export function formFromEvent(event: EventRecord, people: Person[]): EventFormState {
  return {
    title: event.title,
    date: event.date,
    endDate: event.endDate ?? "",
    allDay: event.startTime === null,
    startTime: event.startTime ?? "09:00",
    endTime: event.endTime ?? "10:00",
    memo: event.memo ?? "",
    attendeeIds: event.attendeeIds.filter((id) => people.some((person) => person.id === id)),
    remindOffsets: [...event.remindOffsets],
  };
}

/** 서버로 보낼 본문. 종일이거나 기간 일정이면 시각은 null로 보낸다(기간 일정은 종일뿐이다). */
export function formToPayload(form: EventFormState): Record<string, unknown> {
  const timed = !form.allDay && form.endDate === "";
  return {
    title: form.title,
    date: form.date,
    endDate: form.endDate === "" ? null : form.endDate,
    startTime: timed ? form.startTime : null,
    endTime: timed ? form.endTime : null,
    memo: form.memo,
    attendeeIds: form.attendeeIds,
    remindOffsets: form.remindOffsets,
  };
}

/**
 * 폼 값을 고친다. 끝 날짜를 정하면 기간 일정이라 종일이 되고, 시작 날짜를 끝 날짜 이후로 옮기면 끝 날짜를 비운다
 * (그러지 않으면 "끝이 시작보다 빠름" 오류가 나서 저장할 수 없다).
 */
export function patchForm(form: EventFormState, update: Partial<EventFormState>): EventFormState {
  const next = { ...form, ...update };
  if (update.endDate !== undefined && update.endDate !== "") next.allDay = true;
  if (update.date !== undefined && update.endDate === undefined && next.endDate !== "" && next.endDate <= next.date) next.endDate = "";
  return next;
}

/** 체크박스용: 없으면 더하고 있으면 뺀 새 배열. */
export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}
