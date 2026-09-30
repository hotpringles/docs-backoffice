import type { Person } from "@/lib/people";
import { compareTimes, isInSupportedRange, isValidDate, isValidTime } from "./dates";

export type EventInput = {
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  memo: string | null;
  attendeeIds: string[];
  remindOffsets: number[];
};

export type EventField = "title" | "date" | "time" | "memo" | "attendeeIds" | "remindOffsets";
export type FieldErrors = Partial<Record<EventField, string>>;
export type ValidationResult = { ok: true; value: EventInput } | { ok: false; errors: FieldErrors };

/** 일정 알림 시점: 당일(0), 1일 전, 3일 전 */
export const REMIND_OPTIONS = [0, 1, 3] as const;
export const DEFAULT_REMIND_OFFSETS: readonly number[] = [0, 1];
export const MAX_TITLE_LENGTH = 100;
export const MAX_MEMO_LENGTH = 500;

/** 이모지도 한 글자로 센다. */
const length = (text: string) => [...text].length;

/** 비었으면 null, 문자열이면 다듬은 값, 그 밖의 타입이면 undefined(잘못된 값). */
function blankToNull(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const isRemindOption = (value: unknown): value is number => (REMIND_OPTIONS as readonly unknown[]).includes(value);

/**
 * 알림 시점 목록. 값이 없으면 기본(당일, 1일 전), 허용되지 않은 값이 하나라도 있으면 null.
 * 중복을 없애고 오름차순으로 정렬한다. 일정과 모임 확정이 함께 쓴다.
 */
export function parseRemindOffsets(value: unknown): number[] | null {
  if (value === undefined) return [...DEFAULT_REMIND_OFFSETS];
  if (!Array.isArray(value) || !value.every(isRemindOption)) return null;
  return [...new Set(value)].sort((a, b) => a - b);
}

/** 사용자가 보낸 일정 내용을 검사하고 다듬는다. 틀린 필드는 한꺼번에 알려준다. */
export function validateEventInput(raw: unknown, people: Person[]): ValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: { title: "요청 내용이 올바르지 않아요." } };
  }
  const body = raw as Record<string, unknown>;
  const errors: FieldErrors = {};

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) errors.title = "제목을 입력해 주세요.";
  else if (length(title) > MAX_TITLE_LENGTH) errors.title = `제목은 ${MAX_TITLE_LENGTH}자 이하여야 해요.`;

  const date = typeof body.date === "string" ? body.date : "";
  if (!isValidDate(date)) errors.date = "날짜를 YYYY-MM-DD 형식으로 입력해 주세요.";
  else if (!isInSupportedRange(date)) errors.date = "2000년부터 2100년 사이의 날짜만 쓸 수 있어요.";

  let startTime: string | null = null;
  let endTime: string | null = null;
  const start = blankToNull(body.startTime);
  const end = blankToNull(body.endTime);
  if (start === undefined || end === undefined) {
    errors.time = "시각이 올바르지 않아요.";
  } else if (start === null && end === null) {
    // 종일 일정
  } else if (start === null || end === null) {
    errors.time = "시작과 종료 시각을 함께 입력해 주세요.";
  } else if (!isValidTime(start) || !isValidTime(end)) {
    errors.time = "시각은 00:00부터 23:59 사이의 HH:MM 형식이어야 해요.";
  } else if (compareTimes(end, start) <= 0) {
    errors.time = "종료 시각은 시작 시각보다 뒤여야 해요.";
  } else {
    startTime = start;
    endTime = end;
  }

  let memo: string | null = null;
  if (body.memo !== undefined && body.memo !== null) {
    if (typeof body.memo !== "string") {
      errors.memo = "메모가 올바르지 않아요.";
    } else {
      const trimmed = body.memo.trim();
      if (length(trimmed) > MAX_MEMO_LENGTH) errors.memo = `메모는 ${MAX_MEMO_LENGTH}자 이하여야 해요.`;
      else memo = trimmed || null;
    }
  }

  let attendeeIds: string[] = [];
  if (body.attendeeIds !== undefined) {
    if (!Array.isArray(body.attendeeIds) || body.attendeeIds.some((id) => typeof id !== "string")) {
      errors.attendeeIds = "참석자가 올바르지 않아요.";
    } else {
      const chosen = new Set(body.attendeeIds as string[]);
      if ([...chosen].some((id) => !people.some((person) => person.id === id))) {
        errors.attendeeIds = "명단에 없는 참석자예요.";
      } else {
        attendeeIds = people.filter((person) => chosen.has(person.id)).map((person) => person.id);
      }
    }
  }

  const parsedOffsets = parseRemindOffsets(body.remindOffsets);
  if (parsedOffsets === null) errors.remindOffsets = "알림 시점은 당일, 1일 전, 3일 전 중에서 골라 주세요.";
  const remindOffsets = parsedOffsets ?? [...DEFAULT_REMIND_OFFSETS];

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { title, date, startTime, endTime, memo, attendeeIds, remindOffsets } };
}
