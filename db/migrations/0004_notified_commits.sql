-- 문서 변경 알림을 보낸 커밋. 같은 커밋(GitHub webhook 다시 보내기 포함)의 알림을 두 번 보내지 않으려는 기록이다.
-- 알림을 보내기 전에 먼저 이 표에 넣어서 차지하고, 아무에게도 못 보냈으면 지워서 다시 시도할 수 있게 한다.
-- 마이그레이션은 여러 번 실행해도 안전하도록 항상 `if not exists`를 쓴다.

create table if not exists notified_commits (
  sha text primary key,
  notified_at timestamptz not null default now()
);
