import type { PushPayload } from "@/lib/push/payload";
import type { ReminderItem } from "./types";

const MAX_LINES = 3;
const MAX_TITLE_LENGTH = 40;

function offsetLabel(days: number): string {
  if (days === 0) return "오늘";
  if (days === 1) return "내일";
  return `${days}일 뒤`;
}

/** 제목은 사용자가 정한 값이라 얼마든지 길 수 있다. 알림 본문이 커지지 않도록 자른다(이모지도 한 글자로 센다). */
function shorten(title: string): string {
  const chars = [...title];
  return chars.length > MAX_TITLE_LENGTH ? `${chars.slice(0, MAX_TITLE_LENGTH - 1).join("")}…` : title;
}

/** "오늘: 제목", 시각이 있으면 "오늘 14:00: 제목". */
export function reminderLine(item: ReminderItem): string {
  const time = item.startTime ? ` ${item.startTime}` : "";
  return `${offsetLabel(item.offsetDays)}${time}: ${shorten(item.title)}`;
}

/** 오늘 보낼 일정 전체를 알림 하나로 묶는다. 세 줄까지 보여주고 나머지는 "외 N건"이다. */
export function reminderPayload(items: ReminderItem[]): PushPayload {
  if (items.length === 0) throw new Error("알릴 일정이 없어요.");

  const lines = items.slice(0, MAX_LINES).map(reminderLine);
  const rest = items.length - lines.length;
  if (rest > 0) lines.push(`외 ${rest}건`);

  const first = items[0];
  const month = first.date.slice(0, 7);
  return {
    title: "일정 알림",
    body: lines.join("\n"),
    url: items.length === 1 ? `/calendar?month=${month}&date=${first.date}` : `/calendar?month=${month}`,
    tag: "event-reminders",
  };
}
