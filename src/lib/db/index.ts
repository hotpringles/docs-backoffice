import "server-only";
import { createNeonDb } from "./neon";
import type { Db } from "./types";

let db: Db | undefined;

/** `DATABASE_URL`이 설정돼 있으면 Neon 연결을, 없으면 null을 돌려준다. (서버 전용) */
export function getDbOrNull(env: Record<string, string | undefined> = process.env): Db | null {
  const url = env.DATABASE_URL?.trim();
  if (!url) return null;
  db ??= createNeonDb(url);
  return db;
}
