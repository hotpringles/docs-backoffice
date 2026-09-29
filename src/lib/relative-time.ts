/** "방금 전", "5분 전", "3시간 전", "2일 전", 30일이 넘으면 날짜(UTC 기준 YYYY-MM-DD) */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;

  const seconds = Math.round((now.getTime() - then) / 1000);
  if (seconds < 45) return "방금 전"; // 시계가 어긋나 미래로 보이는 경우도 여기에 든다.
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(then).toISOString().slice(0, 10);
}
