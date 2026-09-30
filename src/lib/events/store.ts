import type { Db } from "@/lib/db/types";
import type { EventInput } from "./validate";

export type EventRecord = EventInput & { id: number };

type EventRow = {
  id: number;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  memo: string | null;
  attendee_ids: string[];
  remind_offsets: number[];
};

// 드라이버마다 date, time을 다른 타입(Date 등)으로 읽으므로, SQL에서 문자열로 바꿔서 받는다.
const SELECT_EVENT = `
  select id, title,
         to_char(event_date, 'YYYY-MM-DD') as date,
         to_char(start_time, 'HH24:MI') as start_time,
         to_char(end_time, 'HH24:MI') as end_time,
         memo, attendee_ids, remind_offsets
  from events`;

function toRecord(row: EventRow): EventRecord {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    memo: row.memo,
    attendeeIds: row.attendee_ids,
    remindOffsets: row.remind_offsets,
  };
}

export async function createEvent(db: Db, input: EventInput): Promise<number> {
  const rows = await db.query<{ id: number }>(
    `insert into events (title, event_date, start_time, end_time, memo, attendee_ids, remind_offsets)
     values ($1, $2::date, $3::time, $4::time, $5, $6::text[], $7::integer[])
     returning id`,
    [input.title, input.date, input.startTime, input.endTime, input.memo, input.attendeeIds, input.remindOffsets],
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
          set title = $2, event_date = $3::date, start_time = $4::time, end_time = $5::time, memo = $6,
              attendee_ids = $7::text[], remind_offsets = $8::integer[], updated_at = now()
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
    [id, input.title, input.date, input.startTime, input.endTime, input.memo, input.attendeeIds, input.remindOffsets],
  );
  return rows.length > 0;
}

/** 일정을 지운다(알림 기록은 함께 지워진다). 없는 일정이면 false. */
export async function deleteEvent(db: Db, id: number): Promise<boolean> {
  const rows = await db.query<{ id: number }>("delete from events where id = $1 returning id", [id]);
  return rows.length > 0;
}

export async function getEvent(db: Db, id: number): Promise<EventRecord | null> {
  const rows = await db.query<EventRow>(`${SELECT_EVENT} where id = $1`, [id]);
  return rows[0] ? toRecord(rows[0]) : null;
}

/** 두 날짜 사이(양 끝 포함)의 일정. 날짜 → 종일이 먼저 → 시작 시각 → 번호 순. */
export async function listEventsInRange(db: Db, from: string, to: string): Promise<EventRecord[]> {
  const rows = await db.query<EventRow>(
    `${SELECT_EVENT} where event_date between $1::date and $2::date order by event_date, start_time nulls first, id`,
    [from, to],
  );
  return rows.map(toRecord);
}
