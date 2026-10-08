import { isValidEndTime, isValidTime, normalizeEndTime } from "@/lib/events/dates";
import { MAX_TITLE_LENGTH, parseRemindOffsets } from "@/lib/events/validate";
import type { Person } from "@/lib/people";
import {
  DEFAULT_DAY_END,
  DEFAULT_DAY_START,
  SLOT_MINUTES,
  boundaryOf,
  datesInRange,
  minutesOf,
  parseCellKey,
  slotCount,
} from "./slots";

export type MeetupInput = { title: string; dates: string[]; dayStart: string; dayEnd: string };
export type MeetupField = "title" | "dates" | "time";

/** 이미 만들어진 모임의 모양(가능한 시간과 확정을 검사할 때 기준이 된다). */
export type MeetupShape = { dates: string[]; dayStart: string; dayEnd: string; slotMinutes: number };
export type Cell = { day: string; slot: number };
export type AvailabilityMode = "available" | "unavailable";
/** `cells`는 `mode`가 available이면 가능한 칸, unavailable이면 **불가능한** 칸이다. */
export type AvailabilityInput = { personId: string; mode: AvailabilityMode; cells: Cell[] };
export type ConfirmInput = {
  day: string;
  startSlot: number;
  endSlot: number;
  startTime: string;
  endTime: string;
  remindOffsets: number[];
};

type Errors<Field extends string> = Partial<Record<Field, string>>;
export type MeetupFieldErrors = Errors<MeetupField | "personId" | "mode" | "cells" | "day" | "remindOffsets">;
type Result<T> = { ok: true; value: T } | { ok: false; errors: MeetupFieldErrors };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const notObject: MeetupFieldErrors = { title: "요청 내용이 올바르지 않아요." };

/** 비었으면 null, 문자열이면 다듬은 값, 그 밖의 타입이면 undefined(잘못된 값). */
function blankToNull(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * 모임 입력(만들기와 수정)을 검사한다. 하루 범위를 비우면 09:00~22:00이다.
 * 후보 날짜는 오늘과 상관없이 자유롭게 고를 수 있다(지난 날짜도 된다). 시작일부터 끝일까지 최대 14일이고 올바른 날짜여야 한다.
 */
export function validateMeetupInput(raw: unknown): Result<MeetupInput> {
  if (!isRecord(raw)) return { ok: false, errors: notObject };
  const errors: MeetupFieldErrors = {};

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) errors.title = "제목을 입력해 주세요.";
  else if ([...title].length > MAX_TITLE_LENGTH) errors.title = `제목은 ${MAX_TITLE_LENGTH}자 이하여야 해요.`;

  const startDate = typeof raw.startDate === "string" ? raw.startDate : "";
  const endDate = typeof raw.endDate === "string" ? raw.endDate : "";
  const dates = datesInRange(startDate, endDate);
  if (!dates) errors.dates = "후보 날짜는 시작일부터 끝일까지(최대 14일)예요. 날짜를 YYYY-MM-DD로 입력하고, 끝일이 시작일보다 빠르면 안 돼요.";

  const start = blankToNull(raw.dayStart);
  const end = blankToNull(raw.dayEnd);
  const dayStart = start === undefined ? undefined : (start ?? DEFAULT_DAY_START);
  // 하루 끝 00:00은 그날 자정(24:00)이다(시각 입력칸으로는 24:00을 입력할 수 없다).
  const dayEnd = end === undefined ? undefined : normalizeEndTime(end ?? DEFAULT_DAY_END);
  if (dayStart === undefined || dayEnd === undefined || !isValidTime(dayStart) || !isValidEndTime(dayEnd)) {
    errors.time = "하루 시작·끝 시각을 HH:MM으로 입력해 주세요.";
  } else if (minutesOf(dayStart) % SLOT_MINUTES !== 0 || minutesOf(dayEnd) % SLOT_MINUTES !== 0) {
    errors.time = "하루 시작·끝 시각은 30분 단위여야 해요.";
  } else if (slotCount(dayStart, dayEnd) === 0) {
    errors.time = "하루 끝 시각은 시작 시각보다 뒤여야 해요.";
  }

  if (Object.keys(errors).length > 0 || !dates || dayStart === undefined || dayEnd === undefined) return { ok: false, errors };
  return { ok: true, value: { title, dates, dayStart, dayEnd } };
}

/** 가능한 시간 저장 입력을 검사한다. 칸은 "2026-10-07:4" 모양의 키 목록이고, 후보 날짜와 칸 범위 안이어야 한다. */
export function validateAvailabilityInput(raw: unknown, meetup: MeetupShape, people: Person[]): Result<AvailabilityInput> {
  if (!isRecord(raw)) return { ok: false, errors: { personId: "요청 내용이 올바르지 않아요." } };
  const errors: MeetupFieldErrors = {};

  const personId = typeof raw.personId === "string" ? raw.personId : "";
  if (!people.some((person) => person.id === personId)) errors.personId = "명단에 있는 이름을 골라 주세요.";

  const mode = raw.mode === undefined ? "available" : raw.mode;
  if (mode !== "available" && mode !== "unavailable") errors.mode = "가능한 시간인지 불가능한 시간인지 올바르지 않아요.";

  const perDay = slotCount(meetup.dayStart, meetup.dayEnd, meetup.slotMinutes);
  const maxCells = meetup.dates.length * perDay;
  const cells: Cell[] = [];
  if (!Array.isArray(raw.cells)) {
    errors.cells = "가능한 칸 목록이 올바르지 않아요.";
  } else if (raw.cells.length > maxCells) {
    errors.cells = "고를 수 있는 칸 수를 넘었어요.";
  } else {
    const seen = new Set<string>();
    for (const key of raw.cells) {
      const cell = typeof key === "string" ? parseCellKey(key) : null;
      if (!cell || !meetup.dates.includes(cell.day) || cell.slot >= perDay) {
        errors.cells = "후보 날짜나 시간 범위 밖의 칸이 들어 있어요.";
        break;
      }
      if (seen.has(key as string)) continue;
      seen.add(key as string);
      cells.push(cell);
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { personId, mode: mode as AvailabilityMode, cells } };
}

/** 확정 입력을 검사한다. 날짜는 후보 날짜 중에, 시각은 하루 범위 안의 30분 단위여야 하고 끝이 시작보다 뒤여야 한다. */
export function validateConfirmInput(raw: unknown, meetup: MeetupShape): Result<ConfirmInput> {
  if (!isRecord(raw)) return { ok: false, errors: { day: "요청 내용이 올바르지 않아요." } };
  const errors: MeetupFieldErrors = {};

  const day = typeof raw.day === "string" ? raw.day : "";
  if (!meetup.dates.includes(day)) errors.day = "후보 날짜 중에서 골라 주세요.";

  const startTime = typeof raw.startTime === "string" ? raw.startTime : "";
  const endTime = typeof raw.endTime === "string" ? normalizeEndTime(raw.endTime) : "";
  const startSlot = isValidTime(startTime) ? boundaryOf(meetup.dayStart, meetup.dayEnd, startTime, meetup.slotMinutes) : null;
  const endSlot = isValidEndTime(endTime) ? boundaryOf(meetup.dayStart, meetup.dayEnd, endTime, meetup.slotMinutes) : null;
  if (startSlot === null || endSlot === null) {
    errors.time = `시각은 ${meetup.dayStart}~${meetup.dayEnd} 안의 30분 단위여야 해요.`;
  } else if (endSlot <= startSlot) {
    errors.time = "끝 시각은 시작 시각보다 뒤여야 해요.";
  }

  const remindOffsets = parseRemindOffsets(raw.remindOffsets);
  if (remindOffsets === null) errors.remindOffsets = "알림 시점은 당일, 1일 전, 3일 전 중에서 골라 주세요.";

  if (Object.keys(errors).length > 0 || startSlot === null || endSlot === null || remindOffsets === null) return { ok: false, errors };
  return { ok: true, value: { day, startSlot, endSlot, startTime, endTime, remindOffsets } };
}
