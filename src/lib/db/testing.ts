import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, loadMigrations } from "./migrate";
import type { Db } from "./types";

/**
 * 테스트 전용: 메모리에서 도는 진짜 Postgres(PGlite)에 실제 마이그레이션을 적용해서 돌려준다.
 * 운영 SQL을 그대로 시험하려는 것이라 가짜(mock)를 쓰지 않는다.
 */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const pg = new PGlite();
  const db: Db = {
    async query<T>(text: string, params: unknown[] = []) {
      return (await pg.query<T>(text, params)).rows;
    },
  };
  await applyMigrations(db, loadMigrations("db/migrations"));
  return { db, close: () => pg.close() };
}
