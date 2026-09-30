import webpush from "web-push";
import type { Db } from "@/lib/db/types";
import { isAllowedPushEndpoint } from "./endpoint";
import type { PushPayload } from "./payload";
import { listSubscriptions, removeSubscription, type PushSubscriptionInput } from "./subscriptions";

/** 구독 하나에게 알림을 보낸다. 실패하면 `statusCode`가 든 오류를 던진다(web-push의 `WebPushError`와 같은 모양). */
export type Sender = (subscription: PushSubscriptionInput, payload: string) => Promise<void>;

export type SendSummary = { total: number; sent: number; removed: number; failed: number };

/** 알림을 보내는 쪽(일정 알림, 모임 알림)이 함께 쓰는 재료: 데이터베이스와 발송기. */
export type PushDeps = { db: Db; sender: Sender };
export type PushDepsResult = { ok: true; deps: PushDeps } | { ok: false; missing: string[] };

/**
 * 구독자가 있는데 한 명에게도 보내지 못했는지. (VAPID 키 오타처럼 설정 문제일 가능성이 크다.)
 * 만료된 구독(404/410)만 정리한 경우와 구독자가 없는 경우는 실패로 보지 않는다.
 */
export function nothingDelivered(summary: SendSummary): boolean {
  return summary.total > 0 && summary.sent === 0 && summary.failed > 0;
}

/** 푸시 서비스가 "이 구독은 더 이상 없다"고 답하는 상태 코드. 이때는 저장소에서 지운다. */
const GONE_STATUS = new Set([404, 410]);
const CONCURRENCY = 10;

/**
 * 모든 구독자에게 보낸다. 일부가 실패해도 나머지는 계속 보내고 예외를 던지지 않는다.
 * 사라진 구독(404, 410)은 저장소에서 지운다.
 */
export async function sendToAll(db: Db, sender: Sender, payload: PushPayload): Promise<SendSummary> {
  const subscriptions = await listSubscriptions(db);
  const body = JSON.stringify(payload);
  const summary: SendSummary = { total: subscriptions.length, sent: 0, removed: 0, failed: 0 };

  for (let i = 0; i < subscriptions.length; i += CONCURRENCY) {
    const chunk = subscriptions.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (subscription) => {
        try {
          await sender(subscription, body);
          summary.sent += 1;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status !== undefined && GONE_STATUS.has(status)) {
            await removeSubscription(db, subscription.endpoint).catch(() => undefined);
            summary.removed += 1;
          } else {
            summary.failed += 1;
            console.error(`푸시 발송 실패 (status ${status ?? "알 수 없음"})`, error);
          }
        }
      }),
    );
  }
  return summary;
}

export type VapidConfig = { subject: string; publicKey: string; privateKey: string };

/** `web-push`로 실제 발송하는 Sender. VAPID 정보는 호출마다 넘겨서 전역 상태를 쓰지 않는다. */
export function createWebPushSender(vapid: VapidConfig): Sender {
  return async (subscription, payload) => {
    // 저장할 때 이미 검사하지만, 서버가 요청을 보내는 바로 이 자리에서 한 번 더 확인한다(SSRF의 마지막 방어선).
    if (!isAllowedPushEndpoint(subscription.endpoint)) throw new Error("허용되지 않는 푸시 주소예요.");
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      payload,
      {
        TTL: 60 * 60 * 24, // 하루 안에 전달되지 않으면 버린다(오래된 문서 알림은 의미가 없다).
        urgency: "normal",
        timeout: 10_000,
        vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      },
    );
  };
}
