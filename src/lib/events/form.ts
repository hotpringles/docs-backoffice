import type { Person } from "@/lib/people";
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

/**
 * 저장된 일정을 폼에 옮긴다. 명단(`PEOPLE`)에서 나중에 빠진 참석자는 옮기지 않는다.
 * 폼에는 지금 명단의 사람만 체크박스로 나오므로 끌 방법이 없고, 그대로 저장하면 서버가 "명단에 없는 참석자"로 거절해서
 * 그 일정을 다시는 고칠 수 없게 되기 때문이다. (저장하면 빠진 참석자는 일정에서 자연스럽게 사라진다.)
 */
export function formFromEvent(event: EventRecord, people: Person[]): EventFormState {
  return {
    title: event.title,
    date: event.date,
    allDay: event.startTime === null,
    startTime: event.startTime ?? "09:00",
    endTime: event.endTime ?? "10:00",
    memo: event.memo ?? "",
    attendeeIds: event.attendeeIds.filter((id) => people.some((person) => person.id === id)),
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
