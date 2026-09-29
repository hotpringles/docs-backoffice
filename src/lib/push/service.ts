import "server-only";
import { getDbOrNull } from "@/lib/db";
import { loadPushConfig } from "./config";
import { notifyDocsChanged, type NotifyResult } from "./notify-docs";
import { createWebPushSender } from "./send";

export type ServiceResult = NotifyResult | { status: "skipped-not-configured"; missing: string[] } | { status: "failed" };

/**
 * webhook에서 부르는 문서 알림. 환경변수(DB, VAPID)가 없으면 조용히 건너뛰고,
 * 발송 중 오류가 나도 던지지 않는다(응답 뒤에 도는 작업이라 잡아 줄 곳이 없다).
 */
export async function notifyDocsChangedIfConfigured(input: {
  commitSha: string | null;
  changedDocs: string[];
}): Promise<ServiceResult> {
  const config = loadPushConfig();
  if (!config.ok) {
    console.warn(`푸시 알림 설정이 없어서 알림을 건너뛰어요: ${config.missing.join(", ")}`);
    return { status: "skipped-not-configured", missing: config.missing };
  }

  try {
    const db = getDbOrNull();
    if (!db) return { status: "skipped-not-configured", missing: ["DATABASE_URL"] };
    return await notifyDocsChanged({ db, sender: createWebPushSender(config.config.vapid) }, input);
  } catch (error) {
    console.error("문서 갱신 알림을 보내지 못했어요", error);
    return { status: "failed" };
  }
}
