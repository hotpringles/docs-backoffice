import type { PushPayload } from "@/lib/push/payload";
import type { PushDepsResult } from "@/lib/push/send";
import { sendNoticeOnce, type NoticeKind } from "./notices";

/**
 * 모임 알림을 보낸다. 푸시 설정(DB, VAPID)이 없으면 건너뛰고 무엇이 없는지 로그만 남긴다.
 * 응답을 돌려준 뒤에 도는 작업이라 잡아 줄 곳이 없으므로, **절대 던지지 않고** 실패는 로그로만 남긴다.
 * (모임을 만들거나 확정한 결과는 알림과 무관하게 이미 저장돼 있다.)
 */
export async function notifyIfConfigured(
  loadDeps: () => PushDepsResult,
  kind: NoticeKind,
  refId: number,
  payload: PushPayload,
): Promise<void> {
  try {
    const deps = loadDeps();
    if (!deps.ok) {
      console.warn(`푸시 알림 설정이 부족해서 모임 알림을 건너뛰어요: ${deps.missing.join(", ")}`);
      return;
    }
    const result = await sendNoticeOnce(deps.deps, kind, refId, payload);
    if (result.status === "sent" && result.released) {
      console.error(`모임 알림을 아무에게도 보내지 못했어요 (${kind} #${refId}). 원인을 고친 뒤 다시 시도할 수 있어요.`);
    }
  } catch (error) {
    console.error(`모임 알림을 보내지 못했어요 (${kind} #${refId})`, error);
  }
}
