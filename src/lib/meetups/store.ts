import type { Db } from "@/lib/db/types";
import type { Person } from "@/lib/people";
import { cellKey } from "./slots";
import type { Cell, ConfirmInput, MeetupInput } from "./validate";

export type MeetupStatus = "open" | "confirmed";

export type MeetupRecord = {
  id: number;
  title: string;
  status: MeetupStatus;
  dates: string[];
  dayStart: string;
  dayEnd: string;
  slotMinutes: number;
};

type MeetupRow = {
  id: number;
  title: string;
  status: MeetupStatus;
  dates: string[];
  day_start: string;
  day_end: string;
  slot_minutes: number;
};

// 드라이버마다 date, time을 다른 타입(Date 등)으로 읽으므로 SQL에서 문자열로 바꿔서 받는다.
// date[]는 array(select ...)로 정렬된 문자열 배열이 된다.
const SELECT_MEETUP = `
  select m.id, m.title, m.status,
         array(select to_char(d, 'YYYY-MM-DD') from unnest(m.dates) as d order by d) as dates,
         to_char(m.day_start, 'HH24:MI') as day_start,
         to_char(m.day_end, 'HH24:MI') as day_end,
         m.slot_minutes
  from meetups m`;

function toRecord(row: MeetupRow): MeetupRecord {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    dates: row.dates,
    dayStart: row.day_start,
    dayEnd: row.day_end,
    slotMinutes: row.slot_minutes,
  };
}

export async function createMeetup(db: Db, input: MeetupInput): Promise<number> {
  const rows = await db.query<{ id: number }>(
    `insert into meetups (title, dates, day_start, day_end)
     values ($1, $2::date[], $3::time, $4::time)
     returning id`,
    [input.title, input.dates, input.dayStart, input.dayEnd],
  );
  return rows[0].id;
}

export async function getMeetup(db: Db, id: number): Promise<MeetupRecord | null> {
  const rows = await db.query<MeetupRow>(`${SELECT_MEETUP} where m.id = $1`, [id]);
  return rows[0] ? toRecord(rows[0]) : null;
}

/** 열린 모임이 먼저, 그 안에서는 최근에 만든 것이 먼저다. */
export async function listMeetups(db: Db): Promise<MeetupRecord[]> {
  const rows = await db.query<MeetupRow>(`${SELECT_MEETUP} order by (m.status = 'open') desc, m.created_at desc, m.id desc`);
  return rows.map(toRecord);
}

/** 모임을 지운다(가능한 시간은 함께 지워지고, 확정으로 만든 일정은 남고 모임 연결만 비워진다). 없으면 false. */
export async function deleteMeetup(db: Db, id: number): Promise<boolean> {
  const rows = await db.query<{ id: number }>("delete from meetups where id = $1 returning id", [id]);
  return rows.length > 0;
}

/** 사람 번호 → 가능한 칸 키("2026-10-07:4") 목록. */
export async function listAvailability(db: Db, meetupId: number): Promise<Record<string, string[]>> {
  const rows = await db.query<{ person_id: string; day: string; slot: number }>(
    `select person_id, to_char(day, 'YYYY-MM-DD') as day, slot
       from availability
      where meetup_id = $1
      order by person_id, day, slot`,
    [meetupId],
  );
  const byPerson: Record<string, string[]> = {};
  for (const row of rows) (byPerson[row.person_id] ??= []).push(cellKey(row.day, row.slot));
  return byPerson;
}

/**
 * 그 사람의 가능한 칸을 통째로 바꾼다. **열린 모임일 때만** 저장하고 true, 없거나 확정된 모임이면 아무것도 바꾸지 않고 false.
 * 한 문장(CTE)이라 지우기와 넣기가 함께 일어난다. 새 목록에 없는 칸만 지우고 새 목록은 `on conflict do nothing`으로
 * 넣어서, 같은 행을 한 문장에서 지우고 다시 넣다가 유일 키가 충돌하는 일이 없다.
 */
export async function saveAvailability(db: Db, meetupId: number, personId: string, cells: Cell[]): Promise<boolean> {
  const rows = await db.query<{ id: number }>(
    `with wanted as (
       select w.day, w.slot from unnest($3::date[], $4::smallint[]) as w(day, slot)
     ),
     open_meetup as (
       select id from meetups where id = $1 and status = 'open'
     ),
     del as (
       delete from availability a
        where a.meetup_id = $1 and a.person_id = $2
          and exists (select 1 from open_meetup)
          and not exists (select 1 from wanted w where w.day = a.day and w.slot = a.slot)
     ),
     ins as (
       insert into availability (meetup_id, person_id, day, slot)
       select $1, $2, w.day, w.slot from wanted w, open_meetup
       on conflict do nothing
     )
     select id from open_meetup`,
    [meetupId, personId, cells.map((cell) => cell.day), cells.map((cell) => cell.slot)],
  );
  return rows.length > 0;
}

/**
 * 모임을 확정하고 일정을 만든다. 한 문장(CTE)이라 "모임 상태 변경 + 일정 생성"이 함께 일어나거나 함께 안 일어난다.
 * 이미 확정됐거나 없는 모임이면 아무것도 만들지 않고 null. 동시에 두 번 불러도 하나만 성공한다.
 * 일정의 참석자는 확정 구간(startSlot 이상 endSlot 미만)의 **모든 칸에서** 가능한 사람이고, 명단 순서이며 명단 밖 번호는 뺀다.
 */
export async function confirmMeetup(db: Db, meetupId: number, input: ConfirmInput, people: Person[]): Promise<number | null> {
  const rows = await db.query<{ id: number }>(
    `with m as (
       update meetups set status = 'confirmed', confirmed_at = now()
        where id = $1 and status = 'open'
        returning id, title
     ),
     who as (
       select coalesce(array_agg(p.id order by p.ord), '{}') as ids
         from unnest($7::text[]) with ordinality as p(id, ord)
        where (select count(*) from availability a
                where a.meetup_id = $1 and a.person_id = p.id and a.day = $2::date
                  and a.slot >= $5::integer and a.slot < $6::integer) = $6::integer - $5::integer
     ),
     e as (
       insert into events (title, event_date, start_time, end_time, memo, attendee_ids, remind_offsets, meetup_id)
       select m.title, $2::date, $3::time, $4::time, null, who.ids, $8::integer[], m.id from m, who
       returning id
     )
     select id from e`,
    [
      meetupId,
      input.day,
      input.startTime,
      input.endTime,
      input.startSlot,
      input.endSlot,
      people.map((person) => person.id),
      input.remindOffsets,
    ],
  );
  return rows[0]?.id ?? null;
}

/** 모임을 확정해서 만들어진 일정의 번호. 아직 확정 전이면 null. */
export async function getMeetupEventId(db: Db, meetupId: number): Promise<number | null> {
  const rows = await db.query<{ id: number }>("select id from events where meetup_id = $1 order by id limit 1", [meetupId]);
  return rows[0]?.id ?? null;
}
