-- 모임에서 사람마다 "가능한 시간"을 고를지 "불가능한 시간"을 고를지 기억한다(화면에서 다시 열 때 같은 방식으로 보여 주려는 것).
-- 실제 가능 여부는 항상 availability(가능한 칸)에 저장되므로 겹침 계산과 확정은 방식과 상관없다.
-- 마이그레이션은 여러 번 실행해도 안전하도록 한다.

create table if not exists availability_modes (
  meetup_id integer not null references meetups (id) on delete cascade,
  person_id text not null,
  mode text not null check (mode in ('available', 'unavailable')),
  primary key (meetup_id, person_id)
);
