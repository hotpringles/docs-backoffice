import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { applyMigrations, loadMigrations, splitStatements } from "./migrate";
import { createTestDb } from "./testing";
import type { Db } from "./types";

async function memoryDb(): Promise<Db> {
  const pg = new PGlite();
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await pg.query<T>(text, params)).rows;
    },
  };
}

describe("splitStatements", () => {
  it("세미콜론 기준으로 문장을 나누고 주석과 빈 조각을 버린다", () => {
    const sql = "-- 설명\ncreate table a (id int);\n\n-- 두 번째\ncreate table b (id int);\n";
    expect(splitStatements(sql)).toEqual(["create table a (id int)", "create table b (id int)"]);
  });

  it("주석만 있거나 빈 문자열이면 문장이 없다", () => {
    expect(splitStatements("-- 주석뿐")).toEqual([]);
    expect(splitStatements("")).toEqual([]);
  });

  it("CRLF 줄바꿈도 처리한다", () => {
    expect(splitStatements("select 1;\r\nselect 2;\r\n")).toEqual(["select 1", "select 2"]);
  });
});

describe("applyMigrations", () => {
  it("적용하지 않은 마이그레이션을 받은 순서대로 적용하고 적용한 이름을 돌려준다", async () => {
    const db = await memoryDb();
    const applied = await applyMigrations(db, [
      { name: "0001_a.sql", sql: "create table a (id int);" },
      { name: "0002_b.sql", sql: "create table b (id int);" },
    ]);
    // 정렬은 loadMigrations가 맡고, applyMigrations는 받은 순서를 그대로 따른다.
    expect(applied).toEqual(["0001_a.sql", "0002_b.sql"]);
    await db.query("insert into a (id) values (1)");
    await db.query("insert into b (id) values (1)");
  });

  it("두 번 실행하면 두 번째는 아무것도 적용하지 않는다", async () => {
    const db = await memoryDb();
    const migrations = [{ name: "0001_a.sql", sql: "create table a (id int);" }];
    expect(await applyMigrations(db, migrations)).toEqual(["0001_a.sql"]);
    expect(await applyMigrations(db, migrations)).toEqual([]);
  });

  it("새 마이그레이션만 추가로 적용한다", async () => {
    const db = await memoryDb();
    await applyMigrations(db, [{ name: "0001_a.sql", sql: "create table a (id int);" }]);
    const applied = await applyMigrations(db, [
      { name: "0001_a.sql", sql: "create table a (id int);" },
      { name: "0002_b.sql", sql: "create table b (id int);" },
    ]);
    expect(applied).toEqual(["0002_b.sql"]);
  });

  it("SQL이 틀리면 오류를 던지고 적용 기록을 남기지 않는다", async () => {
    const db = await memoryDb();
    await expect(
      applyMigrations(db, [{ name: "0001_bad.sql", sql: "create tabel oops (id int);" }]),
    ).rejects.toThrow();
    const rows = await db.query("select name from schema_migrations");
    expect(rows).toEqual([]);
  });
});

describe("실제 마이그레이션 파일", () => {
  it("이름순으로 읽히고, 다시 적용해도 안전하다", async () => {
    const migrations = loadMigrations("db/migrations");
    expect(migrations.map((m) => m.name)).toEqual([...migrations.map((m) => m.name)].sort());
    expect(migrations.length).toBeGreaterThan(0);

    const { db, close } = await createTestDb();
    expect(await applyMigrations(db, migrations)).toEqual([]);
    await close();
  });

  it("푸시 구독 테이블이 만들어진다", async () => {
    const { db, close } = await createTestDb();
    const tables = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    expect(tables.map((t) => t.table_name)).toEqual(
      expect.arrayContaining([
        "push_subscriptions",
        "events",
        "sent_reminders",
        "auth_attempts",
        "meetups",
        "availability",
        "sent_notices",
        "schema_migrations",
      ]),
    );
    await close();
  });
});
