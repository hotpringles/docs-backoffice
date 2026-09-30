import { shortDayLabel } from "@/lib/calendar/view";
import type { Db } from "@/lib/db/types";
import type { PushPayload } from "@/lib/push/payload";
import { nothingDelivered, sendToAll, type PushDeps, type SendSummary } from "@/lib/push/send";
import { shorten } from "@/lib/push/text";

export type NoticeKind = "meetup-opened" | "meetup-confirmed";

/** 알림을 보낼 권리를 차지한다. 처음이면 true, 이미 차지돼 있으면 false. 한 문장이라 동시에 불러도 하나만 true다. */
export async function claimNotice(db: Db, kind: NoticeKind, refId: number): Promise<boolean> {
  const rows = await db.query<{ ref_id: number }>(
    "insert into sent_notices (kind, ref_id) values ($1, $2) on conflict do nothing returning ref_id",
    [kind, refId],
  );
  return rows.length > 0;
}

export async function releaseNotice(db: Db, kind: NoticeKind, refId: number): Promise<void> {
  await db.query("delete from sent_notices where kind = $1 and ref_id = $2", [kind, refId]);
}

/** "새 모임 / {제목} — 가능한 시간을 표시해 주세요". 누르면 그 모임 화면이 열린다. */
export function meetupOpenedPayload(meetup: { id: number; title: string }): PushPayload {
  return {
    title: "새 모임",
    body: `${shorten(meetup.title)} — 가능한 시간을 표시해 주세요`,
    url: `/meetups/${meetup.id}`,
    tag: `meetup-opened-${meetup.id}`,
  };
}

/** "모임 확정 / {제목} 확정: 10/7(수) 14:00–16:00". 누르면 그 날의 달력이 열린다. */
export function meetupConfirmedPayload(
  meetup: { id: number; title: string },
  span: { day: string; startTime: string; endTime: string },
): PushPayload {
  return {
    title: "모임 확정",
    body: `${shorten(meetup.title)} 확정: ${shortDayLabel(span.day)} ${span.startTime}–${span.endTime}`,
    url: `/calendar?month=${span.day.slice(0, 7)}&date=${span.day}`,
    tag: `meetup-confirmed-${meetup.id}`,
  };
}

export type NoticeResult = { status: "skipped-duplicate" } | { status: "sent"; summary: SendSummary; released: boolean };

/**
 * 모임 알림을 모임당 한 번만 보낸다. 먼저 차지하므로 같은 알림을 동시에 요청해도 한 번이다.
 * 아무에게도 보내지 못했다면(발송이 예외로 끝났거나, 구독자가 있는데 전부 실패) 차지를 풀어서 다시 시도할 수 있게 한다.
 * 일부라도 받았거나, 구독자가 없거나, 만료된 구독만 정리했다면 차지를 남긴다(다시 보내면 중복 알림이 간다).
 */
export async function sendNoticeOnce({ db, sender }: PushDeps, kind: NoticeKind, refId: number, payload: PushPayload): Promise<NoticeResult> {
  if (!(await claimNotice(db, kind, refId))) return { status: "skipped-duplicate" };

  let summary: SendSummary;
  try {
    summary = await sendToAll(db, sender, payload);
  } catch (error) {
    await releaseNotice(db, kind, refId).catch(() => undefined);
    throw error;
  }

  if (nothingDelivered(summary)) {
    await releaseNotice(db, kind, refId);
    return { status: "sent", summary, released: true };
  }
  return { status: "sent", summary, released: false };
}
