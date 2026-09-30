import "server-only";
import { getDbOrNull } from "@/lib/db";
import { loadPushConfig } from "./config";
import { createWebPushSender, type PushDepsResult } from "./send";

/** 푸시를 보내는 데 필요한 것(DB와 발송기)을 환경변수로 만든다. 하나라도 없으면 무엇이 없는지 돌려준다. */
export function loadPushDeps(env: Record<string, string | undefined> = process.env): PushDepsResult {
  const config = loadPushConfig(env);
  if (!config.ok) return { ok: false, missing: config.missing };
  const db = getDbOrNull(env);
  if (!db) return { ok: false, missing: ["DATABASE_URL"] };
  return { ok: true, deps: { db, sender: createWebPushSender(config.config.vapid) } };
}
