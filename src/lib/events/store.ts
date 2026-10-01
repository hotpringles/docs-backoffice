import type { Db } from "@/lib/db/types";
import type { EventInput } from "./validate";

/** `meetupId`는 모임을 확정해서 만들어진 일정일 때만 값이 있다. */
export type EventRecord = EventInput & { id: number; meetupId: number | null };

type EventRow = {
  id: number;
  title: string;
  date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  memo: string | null;
  attendee_ids: string[];
  remind_offsets: number[];
  meetup_id: number | null;
};

// 드라이버마다 date, time을 다른 타입(Date 등)으로 읽으므로, SQL에서 문자열로 바꿔서 받는다.
const SELECT_EVENT = `
  select id, title,
         to_char(event_date, 'YYYY-MM-DD') as date,
         to_char(end_date, 'YYYY-MM-DD') as end_date,
         to_char(start_time, 'HH24:MI') as start_time,
         to_char(end_time, 'HH24:MI') as end_time,
         memo, attendee_ids, remind_offsets, meetup_id
  from events`;

function toRecord(row: EventRow): EventRecord {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    endDate: row.end_date,
    startTime: row.start_time,
    endTime: row.end_time,
    memo: row.memo,
    attendeeIds: row.attendee_ids,
    remindOffsets: row.remind_offsets,
    meetupId: row.meetup_id,
  };
}

export async function createEvent(db: Db, input: EventInput): Promise<number> {
  const rows = await db.query<{ id: number }>(
    `insert into events (title, event_date, end_date, start_time, end_time, memo, attendee_ids, remind_offsets)
     values ($1, $2::date, $3::date, $4::time, $5::time, $6, $7::text[], $8::integer[])
     returning id`,
    [input.title, input.date, input.endDate, input.startTime, input.endTime, input.memo, input.attendeeIds, input.remindOffsets],
  );
  return rows[0].id;
}

/**
 * 일정을 고친다. 없는 일정이면 false.
 * 날짜나 알림 시점이 바뀌면 그 일정의 알림 기록(sent_reminders)을 지워서 새 일정대로 다시 알림이 가게 한다.
 * 한 문장(CTE)으로 처리해서, 고치는 것과 기록을 지우는 것이 함께 일어나거나 함께 안 일어난다.
 */
export async function updateEvent(db: Db, id: number, input: EventInput): Promise<boolean> {
  const rows = await db.query<{ id: number }>(
    `with old as (
       select event_date, remind_offsets from events where id = $1
     ),
     upd as (
       update events
          set title = $2, event_date = $3::date, end_date = $4::date, start_time = $5::time, end_time = $6::time, memo = $7,
              attendee_ids = $8::text[], remind_offsets = $9::integer[], updated_at = now()
        where id = $1
        returning event_date, remind_offsets
     ),
     del as (
       delete from sent_reminders
        where event_id = $1
          and exists (
            select 1 from old, upd
             where old.event_date <> upd.event_date or old.remind_offsets <> upd.remind_offsets
          )
     )
     select id from events where id = $1 and exists (select 1 from upd)`,
    [id, input.title, input.date, input.endDate, input.startTime, input.endTime, input.memo, input.attendeeIds, input.remindOffsets],
  );
  return rows.length > 0;
}

/**
 * 일정을 지운다(알림 기록은 함께 지워진다). 없는 일정이면 false.
 * 모임을 확정해서 만든 일정이면, 같은 문장 안에서 그 모임을 다시 '열림'으로 돌린다. 그러지 않으면 달력에 일정이 없는데 모임만
 * '확정됨'으로 남아서, 바꿀 수도 다시 확정할 수도 없는 상태가 된다.
 * 이때 "확정 알림을 보냈다"는 기록(sent_notices)도 함께 지운다: 다시 확정하는 것은 새 확정이라 알림이 다시 가야 한다.
 * (지우지 않으면 모임당 한 번 규칙 때문에 두 번째 확정에는 알림이 가지 않는다.)
 */
export async function deleteEvent(db: Db, id: number): Promise<boolean> {
  const rows = await db.query<{ id: number }>(
    `with d as (delete from events where id = $1 returning id, meetup_id),
          r as (update meetups set status = 'open', confirmed_at = null
                 where status = 'confirmed' and id in (select meetup_id from d where meetup_id is not null)
                 returning id),
          n as (delete from sent_notices where kind = 'meetup-confirmed' and ref_id in (select id from r))
     select id from d`,
    [id],
  );
  return rows.length > 0;
}

export async function getEvent(db: Db, id: number): Promise<EventRecord | null> {
  const rows = await db.query<EventRow>(`${SELECT_EVENT} where id = $1`, [id]);
  return rows[0] ? toRecord(rows[0]) : null;
}

/**
 * 시작 날짜가 두 날짜 사이(양 끝 포함)에 있는 일정. 기간 일정도 시작 날짜 기준이다(달력은 시작 날짜 칸에만 그린다).
 * 날짜 → 종일이 먼저 → 시작 시각 → 번호 순.
 */
export async function listEventsInRange(db: Db, from: string, to: string): Promise<EventRecord[]> {
  const rows = await db.query<EventRow>(
    `${SELECT_EVENT} where event_date between $1::date and $2::date order by event_date, start_time nulls first, id`,
    [from, to],
  );
  return rows.map(toRecord);
}
