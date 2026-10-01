-- 기간이 있는 일정: 끝 날짜(end_date). 비어 있으면 event_date 하루짜리 일정이다.
-- 알림은 기존처럼 시작 날짜(event_date) 기준으로 간다. 끝 날짜는 반드시 시작 날짜보다 뒤여야 한다.
-- 마이그레이션은 여러 번 실행해도 안전하도록 한다.

alter table events add column if not exists end_date date;

alter table events drop constraint if exists events_end_date_after_start;
alter table events add constraint events_end_date_after_start check (end_date is null or end_date > event_date);
