import "server-only";
import { createNeonDb } from "./neon";
import type { Db } from "./types";

let db: Db | undefined;

// 개발 서버가 코드를 다시 불러와도 미리보기 데이터가 사라지지 않도록 globalThis에 둔다.
const globalForDb = globalThis as typeof globalThis & { __memoryDb?: Db };

/** 메모리 DB 코드는 필요할 때만 불러와서, 이 분기를 쓰지 않는 곳(프로덕션)에서는 번들에 들어가지 않게 한다. */
function lazyMemoryDb(): Db {
  const ready = import("./memory").then((module) => module.createMemoryDb());
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await ready).query<T>(text, params);
    },
  };
}

/**
 * `DATABASE_URL`이 설정돼 있으면 Neon 연결을, 없으면 null을 돌려준다. (서버 전용)
 * 로컬 미리보기: 개발 모드에서 `LOCAL_MEMORY_DB=1`이면 Neon 없이 메모리 데이터베이스를 쓴다.
 * `process.env.NODE_ENV` 검사는 프로덕션 빌드에서 상수로 바뀌어 이 분기가 통째로 빠진다.
 */
export function getDbOrNull(env: Record<string, string | undefined> = process.env): Db | null {
  if (process.env.NODE_ENV !== "production" && env.LOCAL_MEMORY_DB === "1") {
    globalForDb.__memoryDb ??= lazyMemoryDb();
    return globalForDb.__memoryDb;
  }
  const url = env.DATABASE_URL?.trim();
  if (!url) return null;
  db ??= createNeonDb(url);
  return db;
}
