import type { Db } from "@/lib/db/types";
import type { ReminderItem } from "./types";

type ClaimRow = { event_id: number; title: string; date: string; start_time: string | null; offset_days: number };

/**
 * 오늘 보낼 알림을 `sent_reminders`에 넣어 "차지"하고, **실제로 새로 넣은 것만** 돌려준다.
 * (일정 날짜 − 알림 시점 = 오늘인 항목.) 같은 실행이 두 번 돌거나 cron이 중복 전달돼도
 * 이미 차지한 항목은 `on conflict do nothing`으로 걸러져서 알림이 두 번 가지 않는다.
 * 한 문장이라 차지와 조회가 함께 일어난다.
 */
export async function claimDueReminders(db: Db, today: string): Promise<ReminderItem[]> {
  const rows = await db.query<ClaimRow>(
    `with claimed as (
       insert into sent_reminders (event_id, offset_days, sent_on)
       select e.id, o.days, $1::date
         from events e
         cross join lateral unnest(e.remind_offsets) as o(days)
        where e.event_date - o.days = $1::date
       on conflict do nothing
       returning event_id, offset_days
     )
     select e.id as event_id, e.title,
            to_char(e.event_date, 'YYYY-MM-DD') as date,
            to_char(e.start_time, 'HH24:MI') as start_time,
            c.offset_days
       from claimed c
       join events e on e.id = c.event_id
      order by c.offset_days, e.start_time nulls first, e.id`,
    [today],
  );
  return rows.map((row) => ({
    eventId: row.event_id,
    title: row.title,
    date: row.date,
    startTime: row.start_time,
    offsetDays: row.offset_days,
  }));
}

/** 차지한 항목을 풀어서, 알림을 못 보냈을 때 다시 호출하면 재시도되게 한다. */
export async function releaseReminders(db: Db, items: ReminderItem[]): Promise<void> {
  if (items.length === 0) return;
  await db.query(
    `delete from sent_reminders
      using unnest($1::integer[], $2::integer[]) as r(event_id, offset_days)
      where sent_reminders.event_id = r.event_id and sent_reminders.offset_days = r.offset_days`,
    [items.map((item) => item.eventId), items.map((item) => item.offsetDays)],
  );
}
