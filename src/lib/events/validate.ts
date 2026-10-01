import type { Person } from "@/lib/people";
import { compareTimes, daysBetween, isInSupportedRange, isValidDate, isValidEndTime, isValidTime, normalizeEndTime } from "./dates";

export type EventInput = {
  title: string;
  /** 시작 날짜. 알림도 이 날짜를 기준으로 간다. */
  date: string;
  /** 끝 날짜. 기간이 있는 일정일 때만 값이 있고(시작 날짜보다 뒤), 하루짜리는 null이다. */
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  memo: string | null;
  attendeeIds: string[];
  remindOffsets: number[];
};

export type EventField = "title" | "date" | "endDate" | "time" | "memo" | "attendeeIds" | "remindOffsets";
export type FieldErrors = Partial<Record<EventField, string>>;
export type ValidationResult = { ok: true; value: EventInput } | { ok: false; errors: FieldErrors };

/** 일정 알림 시점: 당일(0), 1일 전, 3일 전 */
export const REMIND_OPTIONS = [0, 1, 3] as const;
export const DEFAULT_REMIND_OFFSETS: readonly number[] = [0, 1];
export const MAX_TITLE_LENGTH = 100;
export const MAX_MEMO_LENGTH = 500;
/** 기간 일정의 최대 길이(시작·끝 날짜를 포함한 일 수). */
export const MAX_EVENT_DAYS = 366;

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

  // 끝 날짜: 비면 하루짜리, 시작 날짜와 같아도 하루짜리, 시작보다 뒤면 기간 일정이다.
  let endDate: string | null = null;
  const rawEnd = blankToNull(body.endDate);
  if (rawEnd === undefined || (rawEnd !== null && !isValidDate(rawEnd))) {
    errors.endDate = "끝 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.";
  } else if (rawEnd !== null && !isInSupportedRange(rawEnd)) {
    errors.endDate = "2000년부터 2100년 사이의 날짜만 쓸 수 있어요.";
  } else if (rawEnd !== null && !errors.date) {
    if (rawEnd < date) errors.endDate = "끝 날짜는 시작 날짜보다 빠를 수 없어요.";
    else if (rawEnd > date) {
      if (daysBetween(date, rawEnd) + 1 > MAX_EVENT_DAYS) errors.endDate = `기간은 최대 ${MAX_EVENT_DAYS}일까지 정할 수 있어요.`;
      else endDate = rawEnd;
    }
  }

  let startTime: string | null = null;
  let endTime: string | null = null;
  const start = blankToNull(body.startTime);
  const rawEndTime = blankToNull(body.endTime);
  // 끝 시각 00:00은 그날 자정(24:00)이다(시각 입력칸으로는 24:00을 입력할 수 없다).
  const end = typeof rawEndTime === "string" ? normalizeEndTime(rawEndTime) : rawEndTime;
  if (start === undefined || end === undefined) {
    errors.time = "시각이 올바르지 않아요.";
  } else if (start === null && end === null) {
    // 종일 일정
  } else if (endDate !== null) {
    errors.time = "기간이 있는 일정은 종일로만 정할 수 있어요.";
  } else if (start === null || end === null) {
    errors.time = "시작과 종료 시각을 함께 입력해 주세요.";
  } else if (!isValidTime(start) || !isValidEndTime(end)) {
    errors.time = "시각은 HH:MM 형식이어야 해요(끝 시각은 24:00, 자정까지 정할 수 있어요).";
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
  return { ok: true, value: { title, date, endDate, startTime, endTime, memo, attendeeIds, remindOffsets } };
}
