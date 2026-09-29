import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./types";

export type Migration = { name: string; sql: string };

/** 세미콜론으로 끝나는 문장 단위로 나눈다. (마이그레이션 SQL에는 함수 본문 같은 세미콜론 포함 구문을 쓰지 않는다.) */
export function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((chunk) =>
      chunk
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}

/** `db/migrations/*.sql`을 이름순으로 읽는다. */
export function loadMigrations(dir: string): Migration[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({ name: file, sql: readFileSync(join(dir, file), "utf8") }));
}

/**
 * 아직 적용하지 않은 마이그레이션을 이름순으로 적용하고, 적용한 이름 목록을 돌려준다.
 * 적용 기록(`schema_migrations`)은 문장을 모두 실행한 뒤에 남기므로, 중간에 실패하면
 * 다음 실행에서 처음부터 다시 시도한다. 그래서 마이그레이션은 항상 다시 실행해도 안전해야 한다.
 */
export async function applyMigrations(db: Db, migrations: Migration[]): Promise<string[]> {
  await db.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const done = new Set(
    (await db.query<{ name: string }>("select name from schema_migrations")).map((row) => row.name),
  );

  const applied: string[] = [];
  for (const migration of migrations) {
    if (done.has(migration.name)) continue;
    for (const statement of splitStatements(migration.sql)) {
      await db.query(statement);
    }
    await db.query("insert into schema_migrations (name) values ($1) on conflict do nothing", [migration.name]);
    applied.push(migration.name);
  }
  return applied;
}
