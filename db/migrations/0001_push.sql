-- 웹 푸시 구독과 문서 알림 중복 방지 기록.
-- 마이그레이션은 여러 번 실행해도 안전하도록 항상 `if not exists`를 쓴다.

create table if not exists push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table if not exists notified_commits (
  sha text primary key,
  notified_at timestamptz not null default now()
);
