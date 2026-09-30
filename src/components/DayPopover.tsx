"use client";

import Link from "next/link";
import type { Ref } from "react";
import { dayLabel, formatTimeRange, remindLabel } from "@/lib/calendar/view";
import type { EventRecord } from "@/lib/events/store";
import { nameOf, type Person } from "@/lib/people";

type Props = {
  ref?: Ref<HTMLDivElement>;
  date: string;
  events: EventRecord[];
  people: Person[];
  authed: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  /** 일정 제목을 눌렀을 때: 수정 화면을 연다(삭제는 그 화면 안에 있다). */
  onOpenEvent: (event: EventRecord) => void;
  onEndEditing: () => void;
};

/**
 * 달력에서 날짜를 눌렀을 때 그 날짜 옆에 뜨는 작은 창. 그 날의 일정을 보여 준다.
 * 자리(left/top)는 부모가 창을 그린 직후 날짜 칸 옆으로 정하므로, 그 전에는 보이지 않게 둔다.
 */
export function DayPopover({ ref, date, events, people, authed, busy, error, onClose, onOpenEvent, onEndEditing }: Props) {
  return (
    <div ref={ref} className="day-popover" role="dialog" aria-label={`${dayLabel(date)} 일정`} tabIndex={-1} style={{ visibility: "hidden" }}>
      <div className="day-popover-head">
        <h2>{dayLabel(date)}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
          ×
        </button>
      </div>

      {events.length === 0 ? (
        <p className="empty">이날은 일정이 없어요.</p>
      ) : (
        <ul className="event-list">
          {events.map((event) => (
            <li key={event.id} className="event-item">
              <button type="button" className="event-open" onClick={() => onOpenEvent(event)} disabled={busy} title="누르면 수정할 수 있어요">
                <span className="event-title">{event.title}</span>
                <span className="event-edit-icon" aria-hidden="true">
                  ✎
                </span>
              </button>
              {event.meetupId !== null && (
                <p className="event-meta">
                  <Link href={`/meetups/${event.meetupId}`}>모임에서 확정된 일정</Link>
                </p>
              )}
              <p className="event-meta">{formatTimeRange(event)}</p>
              {event.memo && <p className="event-memo">{event.memo}</p>}
              {event.attendeeIds.length > 0 && (
                <p className="event-meta">참석: {event.attendeeIds.map((id) => nameOf(people, id)).join(", ")}</p>
              )}
              <p className="event-meta">알림: {remindLabel(event.remindOffsets)}</p>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {authed && (
        <button type="button" className="link-button" onClick={onEndEditing}>
          편집 끝내기
        </button>
      )}
    </div>
  );
}
