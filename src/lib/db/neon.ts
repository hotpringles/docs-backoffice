import { neon } from "@neondatabase/serverless";
import type { Db } from "./types";

/** Neon(HTTP) 연결. 요청마다 한 번의 HTTP 호출로 끝나는 서버리스 방식이다. */
export function createNeonDb(url: string): Db {
  const sql = neon(url);
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await sql.query(text, params)) as T[];
    },
  };
}
