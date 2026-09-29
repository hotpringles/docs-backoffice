import type { VapidConfig } from "./send";

export type PushConfig = { databaseUrl: string; vapid: VapidConfig };
export type PushConfigResult = { ok: true; config: PushConfig } | { ok: false; missing: string[] };

/** 푸시 알림에 필요한 환경변수. 하나라도 없으면 알림을 보내지 않고, 무엇이 없는지 돌려준다. */
export function loadPushConfig(env: Record<string, string | undefined> = process.env): PushConfigResult {
  const databaseUrl = env.DATABASE_URL?.trim();
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();

  const missing: string[] = [];
  if (!databaseUrl) missing.push("DATABASE_URL");
  if (!publicKey) missing.push("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  if (!privateKey) missing.push("VAPID_PRIVATE_KEY");
  if (!subject || !/^(mailto:.+@.+|https:\/\/.+)$/.test(subject)) {
    missing.push("VAPID_SUBJECT (mailto: 또는 https://로 시작)");
  }
  if (missing.length > 0 || !databaseUrl || !publicKey || !privateKey || !subject) {
    return { ok: false, missing };
  }
  return { ok: true, config: { databaseUrl, vapid: { subject, publicKey, privateKey } } };
}
