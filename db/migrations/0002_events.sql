-- 일정, 일정 알림 발송 기록, 편집 코드 실패 기록.
-- 날짜와 시각은 모두 한국시간 기준의 시간대 없는 값(date, time)이다.
-- 마이그레이션은 여러 번 실행해도 안전하도록 항상 `if not exists`를 쓴다.

create table if not exists events (
  id integer generated always as identity primary key,
  title text not null,
  event_date date not null,
  start_time time,
  end_time time,
  memo text,
  attendee_ids text[] not null default '{}',
  remind_offsets integer[] not null default '{0,1}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_event_date_idx on events (event_date);

create table if not exists sent_reminders (
  event_id integer not null references events (id) on delete cascade,
  offset_days integer not null,
  sent_on date not null,
  primary key (event_id, offset_days)
);

create table if not exists auth_attempts (
  ip_hash text primary key,
  failed_count integer not null,
  window_start timestamptz not null
);
