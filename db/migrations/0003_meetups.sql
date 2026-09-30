-- 모임(모두의 시간): 모임, 각자 가능한 칸, 모임 알림 발송 기록, 일정과 모임의 연결.
-- 날짜와 시각은 모두 한국시간 기준의 시간대 없는 값(date, time)이다.
-- 마이그레이션은 여러 번 실행해도 안전하도록 항상 `if not exists`를 쓴다.

create table if not exists meetups (
  id integer generated always as identity primary key,
  title text not null,
  status text not null default 'open' check (status in ('open', 'confirmed')),
  dates date[] not null,
  day_start time not null,
  day_end time not null,
  slot_minutes integer not null default 30,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

-- "가능한" 칸만 저장한다. slot 0이 day_start이고 slot_minutes씩 커진다.
create table if not exists availability (
  meetup_id integer not null references meetups (id) on delete cascade,
  person_id text not null,
  day date not null,
  slot smallint not null,
  primary key (meetup_id, person_id, day, slot)
);

create table if not exists sent_notices (
  kind text not null,
  ref_id integer not null,
  sent_at timestamptz not null default now(),
  primary key (kind, ref_id)
);

alter table events add column if not exists meetup_id integer references meetups (id) on delete set null;

create index if not exists events_meetup_id_idx on events (meetup_id);
