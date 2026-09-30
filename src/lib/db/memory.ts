import { createTestDb } from "./testing";
import type { Db } from "./types";

/**
 * 로컬 미리보기 전용: 서버가 떠 있는 동안만 유지되는 메모리 Postgres.
 * 만들 때 마이그레이션을 적용하고, 준비되는 동안 들어온 쿼리는 기다렸다가 실행한다. 서버를 다시 켜면 데이터가 사라진다.
 */
export function createMemoryDb(): Db {
  const ready = createTestDb();
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await ready).db.query<T>(text, params);
    },
  };
}
