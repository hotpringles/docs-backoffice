# PWA와 푸시 알림 구현 계획 (계획 2/4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 문서 뷰어(계획 1)에 Neon 연결과 PWA, 웹 푸시를 더해서, `develop`에서 표시 대상 문서가 바뀌면 알림을 켠 기기(폰 포함)로 알림을 보낸다. 누구나 헤더의 종 아이콘으로 알림을 켜고 끌 수 있다.

**Architecture:** 데이터베이스 접근은 `Db.query(text, params)` 하나의 얇은 인터페이스로 감싼다. 운영에서는 Neon(HTTP), 테스트에서는 메모리에서 도는 진짜 Postgres(PGlite)를 꽂아서 운영 SQL을 그대로 시험한다. 알림 발송은 `web-push`로 하고, webhook은 캐시 무효화를 끝낸 뒤 `after()`로 응답 뒤에 발송해서 GitHub의 10초 제한에 걸리지 않게 한다. 브라우저 쪽은 서비스 워커(`public/sw.js`)가 알림을 띄우고, 구독 로직은 브라우저 API를 주입받는 순수한 모듈로 나눠서 진짜 브라우저 없이 시험한다.

**Tech Stack:** Next.js 16.3.7(App Router), TypeScript, `@neondatabase/serverless` 1.1, `web-push` 3.6, Vitest 5, `@electric-sql/pglite`(테스트), `tsx`(스크립트)

**Spec:** `docs/superpowers/specs/2026-09-30-docs-backoffice-design.md` — 5.3(알림 발송), 5.4, 5.5, 6.3, 7, 8 중 알림에 해당하는 부분. 관련 스펙 `2026-09-30-calendar-and-meetups-design.md`의 알림 기능이 이 계획 위에 올라간다.

## 범위와 후속 계획

이 계획은 **푸시 알림의 기반**만 다룬다: 데이터베이스 연결, 구독(등록과 해제), 문서 갱신 알림, PWA(홈 화면 설치)다. 나머지는 이 계획의 코드가 생긴 뒤 따로 계획을 쓴다.

- 계획 3: 달력과 일정 (월 달력, 일정 CRUD, 편집 코드, 하루 단위 cron 알림). 이 계획의 `lib/db`, `lib/push`가 입력이다.
- 계획 4: 모두의 시간 (모임, 가능한 시간, 겹침 계산, 확정 → 일정, 모임 알림).

**Task 11은 외부 서비스(Neon, Vercel)와 실제 기기가 필요해서 사용자 확인이 필요한 단계**다. Task 1~10은 외부 서비스 없이 끝나고, 그 결과만으로도 알림 설정이 없는 상태에서 문서 화면과 webhook이 그대로 동작한다.

## Global Constraints

스펙의 프로젝트 전체 요구사항이다. 모든 작업이 이를 따른다.

- 데이터베이스는 Neon Postgres(Free: 프로젝트당 0.5GB, 유휴 5분 뒤 자동 중지, 깨어나는 지연은 Task 11에서 실측)이고, 접속 문자열은 환경변수 `DATABASE_URL`이다.
- 테이블은 스펙 5.5와 같다: `push_subscriptions(endpoint PK, p256dh, auth, created_at)`, `notified_commits(sha PK, notified_at)`.
- 알림 구독은 로그인이 없으므로 누구나 할 수 있다.
- 웹 푸시는 VAPID 키(`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`)로 `web-push`를 통해 보낸다.
- iOS의 웹 푸시는 iOS/iPadOS 16.4 이상이고, **홈 화면에 추가한 웹 앱(standalone)에서만** 동작하며, 권한 요청은 사용자 동작(버튼 누름)에 대한 응답이어야 한다.
- webhook은 캐시 무효화(`revalidateTag('tree', { expire: 0 })`)를 알림보다 먼저 하고, GitHub이 10초 안에 응답을 받도록 알림은 `after()`(`next/server`)로 응답 뒤에 보낸다.
- 같은 커밋의 알림은 한 번만 보낸다: 발송 전에 `notified_commits`에 커밋 SHA를 기록한다.
- 표시 대상 문서(`DOCS_PATHS` 아래 `.md`)가 바뀌지 않은 push는 알림을 보내지 않는다.
- 알림에 필요한 환경변수가 하나라도 없으면 알림만 건너뛰고, 문서 화면과 webhook 처리는 그대로 동작한다.
- 화면 문구는 한국어, 코드 식별자는 영어다. 모바일 우선이다.

## 스펙과 달라지는 점 (Task 10에서 스펙에 반영한다)

- **알림 문구는 문서 제목이 아니라 파일 이름을 쓴다.** 제목을 얻으려면 문서마다 GitHub 호출이 더 필요해서 webhook 처리 시간이 늘어난다. 한 문서만 바뀌면 그 문서를, 여러 개면 목록(`/`)을 연다(스펙은 항상 `/`).
- **구독 요청은 형식뿐 아니라 주소(endpoint)도 검증한다.** 스펙은 "형식만 검증"이라고 했지만, 구독 주소는 사용자가 보내는 값이고 서버가 그 주소로 요청을 보내므로 그대로 두면 서버가 아무 주소로나 요청을 보내게 된다(SSRF). 실제 푸시 서비스(FCM, Mozilla, Apple, Windows)의 주소만 허용한다.
- **구독은 최대 100대로 제한한다.** 로그인이 없어서 누구나 구독할 수 있으므로 Neon 무료 용량을 지키려는 상한이다.

## Review Focus

스펙이 직접 말하지 않았지만 실제로 사용자가 마주칠 가능성이 높은 입력이다. 각 항목의 테스트는 해당 작업에 들어 있다.

1. **구독 주소로 서버를 속이는 요청(SSRF).** `http://`, 내부 주소(`localhost`, `169.254.169.254`, `10.x`), `fcm.googleapis.com.evil.example` 같은 흉내 도메인, `https://fcm.googleapis.com@evil.example`, 다른 포트가 든 주소는 저장되면 안 된다. → Task 3 `endpoint.test.ts`, Task 4·7의 거부 테스트
2. **구독 남용.** JSON이 아닌 요청(다른 사이트의 폼), 깨진 JSON, 잘못된 키, 상한(100대) 초과, SQL 주입 문자열이 든 주소는 서버가 죽거나 저장 공간을 잡아먹지 않고 명확한 상태 코드(415/400/429)로 거절해야 한다. → Task 4 `subscriptions.test.ts`, Task 7 `handlers.test.ts`
3. **알림이 두 번 가거나 안 가는 경우와 한 기기의 실패.** 같은 커밋의 webhook 재전송, 문서가 안 바뀐 push, 구독자가 없을 때, 푸시 서비스가 404/410으로 알려 주는 만료된 구독(지워야 함), 한 기기의 실패가 다른 기기의 발송을 막는 경우, 아주 긴 파일 이름(본문 4KB 제한)을 다뤄야 한다. → Task 5 `push.test.ts`
4. **설정 누락과 장애가 문서 화면을 깨뜨리면 안 된다.** `DATABASE_URL`이나 VAPID 값이 없거나 DB가 죽어도 webhook은 200으로 응답하고 캐시는 무효화되어야 하며, 알림 실패는 로그만 남긴다. → Task 6 `service.test.ts`, `route.test.ts`
5. **iOS와 서비스 워커.** push 이벤트의 본문이 없거나 깨져도 반드시 알림을 띄워야 한다(iOS는 알림을 안 띄우면 구독을 취소한다). 알림을 눌렀을 때는 같은 사이트의 경로만 열어야 한다(`https://evil.example`, `//evil.example`, `javascript:` 금지). → Task 8 `sw.test.ts`
6. **브라우저 쪽 구독 흐름.** 권한 팝업을 닫거나 차단했을 때, 서버 저장이 실패했을 때(브라우저 구독을 되돌려서 알림을 받는다고 착각하지 않게), 서버 삭제가 실패했을 때를 다뤄야 한다. → Task 9 `client.test.ts`, `client-state.test.ts`

## 파일 구조

```
db/migrations/0001_push.sql                    ← 푸시 구독과 알림 기록 테이블 (다시 실행해도 안전)
scripts/migrate.ts                             ← Neon에 마이그레이션 적용 (npm run db:migrate)
scripts/send-test-push.ts                      ← 구독한 모든 기기에 시험 알림 (npm run push:test)
scripts/simulate-webhook.sh                    ← (계획 1) 커밋 SHA 인자를 추가한다
public/sw.js                                   ← 알림을 화면에 띄우는 서비스 워커
src/lib/db/types.ts                            ← Db 인터페이스
src/lib/db/neon.ts                             ← Neon(HTTP) 구현
src/lib/db/index.ts                            ← DATABASE_URL로 만든 연결 (서버 전용)
src/lib/db/migrate.ts                          ← 마이그레이션 실행기
src/lib/db/testing.ts                          ← 테스트용 메모리 Postgres(PGlite)
src/lib/push/endpoint.ts                       ← 허용된 푸시 서비스 주소인지 검사
src/lib/push/subscriptions.ts                  ← 구독 입력 검증과 저장소
src/lib/push/payload.ts                        ← 알림 문구
src/lib/push/send.ts                           ← 모든 구독자에게 발송, web-push 어댑터
src/lib/push/notify-docs.ts                    ← 문서 갱신 알림 (중복 방지)
src/lib/push/config.ts                         ← 푸시 환경변수 검사
src/lib/push/service.ts                        ← webhook이 부르는 진입점 (서버 전용)
src/lib/push/handlers.ts                       ← 구독 API 핸들러
src/lib/push/client-state.ts                   ← 브라우저 지원 상태 판별, VAPID 키 변환
src/lib/push/client.ts                         ← 브라우저 쪽 구독·해제 로직 (브라우저 API 주입)
src/lib/pwa/icon.tsx, headers.ts               ← 아이콘 생성, 서비스 워커 응답 헤더
src/app/manifest.ts, icon-192.png/, icon-512.png/, apple-icon.png/   ← 홈 화면 설치용
src/app/api/push/subscriptions/route.ts        ← 구독 등록·해제 API
src/app/api/github-webhook/route.ts            ← (계획 1) 알림 발송을 연결한다
src/components/NotificationBell.tsx            ← 헤더의 종 아이콘과 알림 패널
```

각 파일 옆의 `*.test.ts`가 그 파일의 테스트다(아이콘 라우트는 Task 10에서 진짜 서버로 확인한다).

## 작업 규칙

- 명령은 저장소 루트에서 실행한다. Windows에서는 Git Bash를 쓴다.
- 작업 하나가 끝날 때마다 커밋한다. 커밋하기 전에 그 작업의 테스트가 모두 통과해야 한다.
- 이 계획의 코드는 임시 폴더에서 실제로 실행해 검증한 것이다(전체 테스트 28개 파일 210개를 연속 두 번, 타입 검사, 린트, 프로덕션 빌드, 프로덕션 서버에서 아이콘 크기·manifest·서비스 워커 헤더·구독 API·webhook 뒤 알림 단계, 실제 브라우저에서 서비스 워커 등록과 알림 패널). 진짜 푸시 서비스에 도달하는 발송과 진짜 Neon은 Task 11에서만 확인할 수 있다. 다만 `web-push`가 실제로 만드는 요청(VAPID 인증, TTL, `aes128gcm` 암호화, 410 응답 시 `statusCode`)은 로컬 HTTPS 서버로 받아 확인했다.
- 테스트 개수는 작업마다 `Expected`에 적혀 있다. 시작할 때 저장소는 15개 파일 118개 테스트다.

---

### Task 1: 의존성과 테스트 안정화

**Files:**
- Modify: `package.json` (npm이 고친다), `src/lib/transform/markdown.test.ts`

**Interfaces:**
- Produces: `@neondatabase/serverless`, `web-push`, `@electric-sql/pglite`, `@types/web-push`, `tsx`가 설치된 상태

- [ ] **Step 1: 의존성을 설치한다**

```bash
npm install @neondatabase/serverless web-push
npm install -D @electric-sql/pglite @types/web-push tsx
```

Expected: 오류 없이 끝난다. (확인한 버전: `@neondatabase/serverless` 1.1.0, `web-push` 3.6.7, `@electric-sql/pglite` 0.5.8, `tsx` 4.x. Neon 드라이버는 Node 19 이상이 필요하다.)

- [ ] **Step 2: 계획 1의 "큰 문서" 테스트에 시간 제한을 넉넉히 준다**

이 테스트(약 1MB 문서 변환)는 혼자 돌면 약 4초라서 Vitest 기본 제한(5초) 안에 겨우 든다. 이 계획에서 메모리 Postgres를 쓰는 테스트가 늘면 테스트가 동시에 돌아서 7초 넘게 걸리고 **간헐적으로 실패**한다(실제로 재현했다). 속도가 아니라 "오류 없이 끝나는지"를 보는 테스트이므로 제한을 늘린다.

`src/lib/transform/markdown.test.ts`에서 다음을 찾아서

`````ts
    const { headings } = await renderMarkdown(big, ctx());
    expect(headings).toHaveLength(20_000);
  });
`````

이렇게 바꾼다.

`````ts
    const { headings } = await renderMarkdown(big, ctx());
    expect(headings).toHaveLength(20_000);
    // 속도가 아니라 "오류 없이 끝나는지"를 보는 테스트다. 혼자 돌면 약 4초지만 다른 테스트와 동시에
    // 돌면 7초 넘게 걸려서 기본 제한(5초)에 걸리므로 시간 제한을 넉넉히 둔다.
  }, 30_000);
`````

- [ ] **Step 3: 기본 상태를 확인한다**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: 15개 파일 118개 테스트 통과, 타입 오류와 린트 오류 없음.

- [ ] **Step 4: 커밋한다**

```bash
git add package.json package-lock.json src/lib/transform/markdown.test.ts
git commit -m "chore: add push and database dependencies, give the large-doc test room"
```

---

### Task 2: 데이터베이스 계층과 마이그레이션

**Files:**
- Create: `db/migrations/0001_push.sql`, `src/lib/db/types.ts`, `src/lib/db/migrate.ts`, `src/lib/db/testing.ts`, `src/lib/db/neon.ts`, `src/lib/db/index.ts`, `scripts/migrate.ts`
- Modify: `package.json` (스크립트)
- Test: `src/lib/db/migrate.test.ts`

**Interfaces:**
- Produces:
  - `type Db = { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> }` — 파라미터는 `$1`, `$2` 자리표시자로만 넘긴다.
  - `createNeonDb(url: string): Db` — Neon(HTTP) 구현
  - `getDbOrNull(env?): Db | null` — `DATABASE_URL`이 있으면 연결, 없으면 `null` (서버 전용, `import "server-only"`)
  - `type Migration = { name: string; sql: string }`, `splitStatements(sql): string[]`, `loadMigrations(dir): Migration[]`(파일명순), `applyMigrations(db, migrations): Promise<string[]>`(적용한 이름). 적용 기록은 `schema_migrations` 테이블에 문장을 모두 실행한 **뒤에** 남기므로, 중간에 실패하면 다음 실행에서 처음부터 다시 시도한다. 그래서 마이그레이션은 항상 다시 실행해도 안전해야 한다(`if not exists`).
  - `createTestDb(): Promise<{ db: Db; close(): Promise<void> }>` — 테스트 전용. 메모리 Postgres(PGlite)에 실제 마이그레이션을 적용해서 돌려준다.
  - 테이블 `push_subscriptions`, `notified_commits` (스펙 5.5)

이 작업에서 정한 것: Neon HTTP 드라이버는 여러 문장을 한 번에 실행하는 데 제약이 있을 수 있어서, 마이그레이션은 문장 단위로 나눠 하나씩 실행한다. 트랜잭션이 없는 대신 모든 마이그레이션을 다시 실행해도 안전하게 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/db/migrate.test.ts`**

`````ts
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

  it("푸시 구독과 알림 기록 테이블이 만들어진다", async () => {
    const { db, close } = await createTestDb();
    const tables = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    expect(tables.map((t) => t.table_name)).toEqual(
      expect.arrayContaining(["push_subscriptions", "notified_commits", "schema_migrations"]),
    );
    await close();
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/db`
Expected: FAIL — `./migrate`를 찾을 수 없다는 오류.

- [ ] **Step 3: 마이그레이션 SQL과 데이터베이스 계층을 구현한다**

**`db/migrations/0001_push.sql`**

`````sql
-- 웹 푸시 구독과 문서 알림 중복 방지 기록.
-- 마이그레이션은 여러 번 실행해도 안전하도록 항상 `if not exists`를 쓴다.

create table if not exists push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table if not exists notified_commits (
  sha text primary key,
  notified_at timestamptz not null default now()
);
`````

**`src/lib/db/types.ts`**

`````ts
/**
 * 앱이 데이터베이스에 바라는 최소한의 모양.
 * 운영에서는 Neon(HTTP)으로, 테스트에서는 메모리 Postgres(PGlite)로 채운다.
 * 파라미터는 `$1`, `$2`처럼 자리표시자로만 넘긴다(문자열을 이어 붙여 SQL을 만들지 않는다).
 */
export type Db = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};
`````

**`src/lib/db/migrate.ts`**

`````ts
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
`````

**`src/lib/db/testing.ts`**

`````ts
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
`````

**`src/lib/db/neon.ts`**

`````ts
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
`````

**`src/lib/db/index.ts`**

`````ts
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
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/db`
Expected: PASS (9 tests)

- [ ] **Step 5: 마이그레이션 스크립트와 npm 명령을 만든다**

**`scripts/migrate.ts`**

`````ts
// Neon 데이터베이스에 `db/migrations/*.sql`을 적용한다. 여러 번 실행해도 안전하다.
// 사용법: npm run db:migrate   (DATABASE_URL은 환경변수 또는 .env.local에서 읽는다)
import { applyMigrations, loadMigrations } from "../src/lib/db/migrate";
import { createNeonDb } from "../src/lib/db/neon";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL이 설정되지 않았어요. .env.local에 넣거나 환경변수로 지정해 주세요.");
    process.exit(1);
  }

  const applied = await applyMigrations(createNeonDb(url), loadMigrations("db/migrations"));
  console.log(applied.length > 0 ? `적용한 마이그레이션: ${applied.join(", ")}` : "적용할 새 마이그레이션이 없어요.");
}

main().catch((error) => {
  console.error("마이그레이션에 실패했어요:", error instanceof Error ? error.message : error);
  process.exit(1);
});
`````

`package.json`의 `"lint": "eslint",` 줄 바로 아래에 다음 줄을 더한다. (`--env-file-if-exists`는 `.env.local`이 있으면 읽고 없어도 오류를 내지 않는다.)

```json
    "db:migrate": "tsx --env-file-if-exists=.env.local scripts/migrate.ts",
```

- [ ] **Step 6: 스크립트가 설정이 없을 때 이유를 알려 주는지 확인한다**

```bash
npm run db:migrate
```

Expected: `DATABASE_URL이 설정되지 않았어요. .env.local에 넣거나 환경변수로 지정해 주세요.` 그리고 종료 코드 1. (`.env.local not found` 안내가 함께 나올 수 있다. 진짜 Neon에 적용하는 것은 Task 11이다.)

- [ ] **Step 7: 전체 검사를 돌리고 커밋한다**

```bash
npm test
npm run typecheck
npm run lint
git add db scripts src/lib/db package.json
git commit -m "feat: add database layer, migrations, and in-memory Postgres for tests"
```

Expected: 16개 파일 127개 테스트 통과.

---

### Task 3: 푸시 주소 허용 규칙 (SSRF 방지)

**Files:**
- Create: `src/lib/push/endpoint.ts`
- Test: `src/lib/push/endpoint.test.ts`

**Interfaces:**
- Produces:
  - `MAX_ENDPOINT_LENGTH = 2000`
  - `isAllowedPushEndpoint(raw: unknown): raw is string` — `https`이고, 사용자 정보(`user:pw@`)와 포트가 없고, 호스트가 다음 중 하나일 때만 `true`: `fcm.googleapis.com`(Chrome, Edge, Samsung Internet), `updates.push.services.mozilla.com`(Firefox), `*.push.apple.com`(Safari), `*.notify.windows.com`(Edge WNS). 문자열이 아니거나 비었거나 2000자를 넘으면 `false`.

브라우저가 알려 주는 구독 주소는 사용자가 보내는 값인데 서버가 그 주소로 요청을 보낸다. 그대로 믿으면 서버가 내부 주소나 아무 사이트로나 요청을 보내게 되므로, 실제 푸시 서비스의 주소만 허용한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/push/endpoint.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "./endpoint";

describe("isAllowedPushEndpoint", () => {
  it("실제 푸시 서비스의 주소는 허용한다", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://fcm.googleapis.com/wp/xyz",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
      "https://web.push.apple.com/QAbc123",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(true);
    }
  });

  it("http, 내부 주소, 임의 도메인은 거부한다", () => {
    for (const url of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://example.com/push",
      "https://localhost/push",
      "https://127.0.0.1/push",
      "https://169.254.169.254/latest/meta-data/",
      "https://10.0.0.5/push",
      "https://[::1]/push",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(false);
    }
  });

  it("허용 도메인을 흉내 내는 주소는 거부한다", () => {
    for (const url of [
      "https://fcm.googleapis.com.evil.example/x",
      "https://evilfcm.googleapis.com/x",
      "https://fcm-googleapis.com/x",
      "https://notify.windows.com.evil.example/x",
      "https://x.notify.windows.com.evil.example/x",
      "https://evil.example/push.apple.com",
      "https://push.apple.com.evil.example/x",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(false);
    }
  });

  it("사용자 정보(@)나 다른 포트가 든 주소는 거부한다", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com@evil.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://user:pw@fcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
  });

  it("문자열이 아니거나 비었거나 너무 길거나 URL이 아니면 거부한다", () => {
    expect(isAllowedPushEndpoint(undefined)).toBe(false);
    expect(isAllowedPushEndpoint(null)).toBe(false);
    expect(isAllowedPushEndpoint(42)).toBe(false);
    expect(isAllowedPushEndpoint("")).toBe(false);
    expect(isAllowedPushEndpoint("not a url")).toBe(false);
    expect(isAllowedPushEndpoint(`https://fcm.googleapis.com/${"a".repeat(2000)}`)).toBe(false);
  });

  it("대문자 호스트도 같은 주소로 본다", () => {
    expect(isAllowedPushEndpoint("https://FCM.GOOGLEAPIS.COM/fcm/send/abc")).toBe(true);
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/push/endpoint.test.ts`
Expected: FAIL — `./endpoint`를 찾을 수 없다는 오류.

- [ ] **Step 3: 구현한다**

**`src/lib/push/endpoint.ts`**

`````ts
/**
 * 브라우저가 알려 주는 푸시 주소(endpoint)는 사용자가 보내는 값이다.
 * 그대로 믿으면 서버가 아무 주소로나 요청을 보내게 되므로(SSRF), 실제 푸시 서비스의 주소만 허용한다.
 *
 * - Chrome, Edge(Chromium), Samsung Internet: fcm.googleapis.com
 * - Firefox: updates.push.services.mozilla.com
 * - Safari(iOS, macOS): *.push.apple.com (예: web.push.apple.com)
 * - Edge(WNS): *.notify.windows.com
 */
const EXACT_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com"]);
const HOST_SUFFIXES = [".push.apple.com", ".notify.windows.com"];

export const MAX_ENDPOINT_LENGTH = 2000;

export function isAllowedPushEndpoint(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_ENDPOINT_LENGTH) return false;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port) return false; // 기본 포트(443)만 허용한다.

  const host = url.hostname.toLowerCase();
  return EXACT_HOSTS.has(host) || HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
`````

- [ ] **Step 4: 통과를 확인하고 커밋한다**

Run: `npx vitest run src/lib/push/endpoint.test.ts`
Expected: PASS (6 tests)

```bash
git add src/lib/push/endpoint.ts src/lib/push/endpoint.test.ts
git commit -m "feat: allow only real push service endpoints"
```

---

### Task 4: 구독 입력 검증과 저장소

**Files:**
- Create: `src/lib/push/subscriptions.ts`
- Test: `src/lib/push/subscriptions.test.ts`

**Interfaces:**
- Consumes: Task 2의 `Db`, `createTestDb`, Task 3의 `isAllowedPushEndpoint`
- Produces:
  - `type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string }`
  - `type ParseResult = { ok: true; value: PushSubscriptionInput } | { ok: false; error: string }`
  - `MAX_SUBSCRIPTIONS = 100`
  - `parseSubscription(input: unknown): ParseResult` — 브라우저 `PushSubscription.toJSON()` 모양(`{ endpoint, keys: { p256dh, auth } }`)을 검증한다. `p256dh`는 base64url 80~100자, `auth`는 16~32자다(실제 값은 87자와 22자).
  - `type SaveResult = "created" | "updated" | "limit"`, `saveSubscription(db, sub): Promise<SaveResult>` — 같은 주소가 있으면 키만 갱신(`updated`), 새 구독이면서 이미 100대면 저장하지 않고 `limit`. 한 문장의 SQL로 처리하고 `xmax = 0`으로 삽입과 갱신을 구분한다.
  - `removeSubscription(db, endpoint): Promise<void>`, `listSubscriptions(db): Promise<PushSubscriptionInput[]>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/push/subscriptions.test.ts`**

`````ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/types";
import { createTestDb } from "@/lib/db/testing";
import {
  listSubscriptions,
  MAX_SUBSCRIPTIONS,
  parseSubscription,
  removeSubscription,
  saveSubscription,
  type PushSubscriptionInput,
} from "./subscriptions";

// 실제 브라우저가 만드는 자릿수와 같은 값(p256dh 87자, auth 22자)
const P256DH = "B".repeat(87);
const AUTH = "a".repeat(22);

function sub(n: number, overrides: Partial<PushSubscriptionInput> = {}): PushSubscriptionInput {
  return { endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`, p256dh: P256DH, auth: AUTH, ...overrides };
}

describe("parseSubscription", () => {
  const valid = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: P256DH, auth: AUTH } };

  it("브라우저 PushSubscription JSON 모양을 받아들인다", () => {
    expect(parseSubscription(valid)).toEqual({
      ok: true,
      value: { endpoint: valid.endpoint, p256dh: P256DH, auth: AUTH },
    });
  });

  it("expirationTime 같은 다른 필드는 무시한다", () => {
    expect(parseSubscription({ ...valid, expirationTime: null }).ok).toBe(true);
  });

  it("객체가 아니면 거부한다", () => {
    for (const input of [null, undefined, "x", 1, [], [valid]]) {
      expect(parseSubscription(input).ok, String(input)).toBe(false);
    }
  });

  it("허용되지 않는 주소는 거부한다", () => {
    const result = parseSubscription({ ...valid, endpoint: "https://169.254.169.254/latest" });
    expect(result).toEqual({ ok: false, error: "허용되지 않는 푸시 주소예요." });
  });

  it("키가 없거나 형식이 틀리면 거부한다", () => {
    expect(parseSubscription({ endpoint: valid.endpoint }).ok).toBe(false);
    expect(parseSubscription({ endpoint: valid.endpoint, keys: null }).ok).toBe(false);
    expect(parseSubscription({ ...valid, keys: { p256dh: "short", auth: AUTH } }).ok).toBe(false);
    expect(parseSubscription({ ...valid, keys: { p256dh: P256DH, auth: "짧" } }).ok).toBe(false);
    expect(parseSubscription({ ...valid, keys: { p256dh: `${P256DH}!!`, auth: AUTH } }).ok).toBe(false);
    expect(parseSubscription({ ...valid, keys: { p256dh: 123, auth: AUTH } }).ok).toBe(false);
  });
});

describe("구독 저장소", () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
  });
  afterEach(async () => {
    await close();
  });

  it("새 구독은 created, 같은 주소를 다시 저장하면 updated이고 키만 바뀐다", async () => {
    expect(await saveSubscription(db, sub(1))).toBe("created");
    expect(await saveSubscription(db, sub(1, { auth: "b".repeat(22) }))).toBe("updated");

    const all = await listSubscriptions(db);
    expect(all).toHaveLength(1);
    expect(all[0].auth).toBe("b".repeat(22));
  });

  it("삭제하면 목록에서 사라지고, 없는 주소를 지워도 오류가 없다", async () => {
    await saveSubscription(db, sub(1));
    await saveSubscription(db, sub(2));
    await removeSubscription(db, sub(1).endpoint);
    await removeSubscription(db, "https://fcm.googleapis.com/fcm/send/none");

    expect((await listSubscriptions(db)).map((s) => s.endpoint)).toEqual([sub(2).endpoint]);
  });

  it("상한에 도달하면 새 구독은 limit으로 거부하고, 이미 있는 구독은 계속 갱신할 수 있다", async () => {
    for (let i = 0; i < MAX_SUBSCRIPTIONS; i++) {
      expect(await saveSubscription(db, sub(i))).toBe("created");
    }
    expect(await saveSubscription(db, sub(MAX_SUBSCRIPTIONS))).toBe("limit");
    expect(await listSubscriptions(db)).toHaveLength(MAX_SUBSCRIPTIONS);

    expect(await saveSubscription(db, sub(0, { auth: "c".repeat(22) }))).toBe("updated");
  });

  it("SQL 주입 문자열이 든 주소도 그대로 값으로만 저장된다", async () => {
    const evil = sub(1, { endpoint: "https://fcm.googleapis.com/x'); drop table push_subscriptions; --" });
    expect(await saveSubscription(db, evil)).toBe("created");
    expect(await listSubscriptions(db)).toHaveLength(1);
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/push/subscriptions.test.ts`
Expected: FAIL — `./subscriptions`를 찾을 수 없다는 오류.

- [ ] **Step 3: 구현한다**

**`src/lib/push/subscriptions.ts`**

`````ts
import type { Db } from "@/lib/db/types";
import { isAllowedPushEndpoint } from "./endpoint";

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type ParseResult = { ok: true; value: PushSubscriptionInput } | { ok: false; error: string };

/** 저장할 수 있는 구독 수의 상한. 로그인이 없는 사이트라 누구나 구독할 수 있어서 테이블이 무한히 커지지 않게 막는다. */
export const MAX_SUBSCRIPTIONS = 100;

// P-256 공개키(65바이트)는 base64url로 87자, auth 비밀(16바이트)은 22자다. 여유를 두고 자릿수만 확인한다.
const P256DH_RE = /^[A-Za-z0-9_-]{80,100}$/;
const AUTH_RE = /^[A-Za-z0-9_-]{16,32}$/;

/** 브라우저의 `PushSubscription.toJSON()` 모양(`{ endpoint, keys: { p256dh, auth } }`)을 검증해서 꺼낸다. */
export function parseSubscription(input: unknown): ParseResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "구독 정보가 올바르지 않아요." };
  }
  const { endpoint, keys } = input as { endpoint?: unknown; keys?: unknown };

  if (!isAllowedPushEndpoint(endpoint)) {
    return { ok: false, error: "허용되지 않는 푸시 주소예요." };
  }
  if (typeof keys !== "object" || keys === null) {
    return { ok: false, error: "구독 키가 없어요." };
  }
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown };
  if (typeof p256dh !== "string" || !P256DH_RE.test(p256dh)) {
    return { ok: false, error: "구독 키(p256dh) 형식이 올바르지 않아요." };
  }
  if (typeof auth !== "string" || !AUTH_RE.test(auth)) {
    return { ok: false, error: "구독 키(auth) 형식이 올바르지 않아요." };
  }
  return { ok: true, value: { endpoint, p256dh, auth } };
}

export type SaveResult = "created" | "updated" | "limit";

/**
 * 구독을 저장한다. 같은 주소가 이미 있으면 키만 갱신한다.
 * 새 구독이면서 이미 상한에 도달했다면 저장하지 않고 "limit"을 돌려준다.
 */
export async function saveSubscription(db: Db, sub: PushSubscriptionInput): Promise<SaveResult> {
  const rows = await db.query<{ inserted: boolean }>(
    `insert into push_subscriptions (endpoint, p256dh, auth)
     select $1::text, $2::text, $3::text
     where exists (select 1 from push_subscriptions where endpoint = $1)
        or (select count(*) from push_subscriptions) < $4
     on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth
     returning (xmax = 0) as inserted`,
    [sub.endpoint, sub.p256dh, sub.auth, MAX_SUBSCRIPTIONS],
  );
  if (rows.length === 0) return "limit";
  return rows[0].inserted ? "created" : "updated";
}

export async function removeSubscription(db: Db, endpoint: string): Promise<void> {
  await db.query("delete from push_subscriptions where endpoint = $1", [endpoint]);
}

export async function listSubscriptions(db: Db): Promise<PushSubscriptionInput[]> {
  return db.query<PushSubscriptionInput>(
    "select endpoint, p256dh, auth from push_subscriptions order by created_at, endpoint",
  );
}
`````

- [ ] **Step 4: 통과를 확인하고 커밋한다**

Run: `npx vitest run src/lib/push/subscriptions.test.ts`
Expected: PASS (9 tests)

```bash
git add src/lib/push/subscriptions.ts src/lib/push/subscriptions.test.ts
git commit -m "feat: validate and store push subscriptions with a cap"
```

---

### Task 5: 알림 문구와 발송, 문서 갱신 알림

**Files:**
- Create: `src/lib/push/payload.ts`, `src/lib/push/send.ts`, `src/lib/push/notify-docs.ts`
- Test: `src/lib/push/push.test.ts`, `src/lib/push/send-adapter.test.ts`

**Interfaces:**
- Consumes: Task 2의 `Db`, `createTestDb`, Task 4의 `listSubscriptions`, `removeSubscription`, `saveSubscription`, `PushSubscriptionInput`, 계획 1의 `docUrl`(`lib/github/tree`), `displayName`(`lib/transform/paths`)
- Produces:
  - `type PushPayload = { title: string; body: string; url: string; tag?: string }`
  - `docsChangedPayload(changedDocs: string[]): PushPayload` — 제목 "문서가 업데이트됐어요". 본문은 파일 이름(`displayName`) 3개까지에 나머지는 "외 N건". 이름은 40자에서 자르고(`…`), 한 문서만 바뀌면 그 문서 주소(`docUrl`), 여러 개이거나 주소가 500자를 넘으면 `/`. `tag`는 `docs-updated`.
  - `type Sender = (subscription: PushSubscriptionInput, payload: string) => Promise<void>` — 실패하면 `statusCode`가 든 오류를 던진다.
  - `type SendSummary = { total: number; sent: number; removed: number; failed: number }`
  - `sendToAll(db, sender, payload): Promise<SendSummary>` — 10개씩 묶어서 보낸다. 일부가 실패해도 나머지를 계속 보내고 예외를 던지지 않는다. `404`, `410`이면 그 구독을 지운다(`removed`). 상태 코드가 없는 오류(네트워크 등)는 지우지 않는다(`failed`).
  - `type VapidConfig = { subject: string; publicKey: string; privateKey: string }`, `createWebPushSender(vapid): Sender` — `web-push`로 보낸다. TTL 하루, urgency `normal`, timeout 10초, VAPID 정보는 호출마다 넘긴다(전역 상태 없음).
  - `type NotifyDeps = { db: Db; sender: Sender }`, `type NotifyResult = { status: "skipped-no-docs" } | { status: "skipped-duplicate" } | { status: "sent"; summary: SendSummary }`
  - `notifyDocsChanged(deps, { commitSha: string | null; changedDocs: string[] }): Promise<NotifyResult>` — 바뀐 문서가 없으면 `skipped-no-docs`(커밋도 기록하지 않음). 커밋 SHA가 있으면 `notified_commits`에 먼저 기록하고(`on conflict do nothing returning`), 이미 있으면 `skipped-duplicate`. 그 뒤 `sendToAll`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/push/push.test.ts`**

`````ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/types";
import { createTestDb } from "@/lib/db/testing";
import { notifyDocsChanged } from "./notify-docs";
import { docsChangedPayload } from "./payload";
import { sendToAll, type Sender } from "./send";
import { listSubscriptions, saveSubscription, type PushSubscriptionInput } from "./subscriptions";

const P256DH = "B".repeat(87);
const AUTH = "a".repeat(22);
const sub = (n: number): PushSubscriptionInput => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`,
  p256dh: P256DH,
  auth: AUTH,
});

describe("docsChangedPayload", () => {
  it("한 문서만 바뀌면 그 문서 주소를 열고 파일 이름을 본문에 넣는다", () => {
    expect(docsChangedPayload(["frontend/docs/plan/m3-routing.md"])).toEqual({
      title: "문서가 업데이트됐어요",
      body: "m3-routing",
      url: "/docs/frontend/docs/plan/m3-routing.md",
      tag: "docs-updated",
    });
  });

  it("여러 문서면 세 개까지 이름을 넣고 나머지는 '외 N건'으로 줄이며 목록을 연다", () => {
    const payload = docsChangedPayload(["d/a.md", "d/b.md", "d/c.md", "d/d.md", "d/e.md"]);
    expect(payload.body).toBe("a, b, c 외 2건");
    expect(payload.url).toBe("/");
  });

  it("세 개 이하면 '외'가 붙지 않고, 그림 파일은 .excalidraw.md를 뗀 이름이다", () => {
    expect(docsChangedPayload(["d/a.md", "d/그림.excalidraw.md"]).body).toBe("a, 그림");
  });

  it("아주 긴 파일 이름과 경로도 웹 푸시 본문 제한(약 4KB)을 넘지 않는다", () => {
    const long = `d/${"가".repeat(300)}.md`;
    const payload = docsChangedPayload([long, long, long, long]);
    expect(payload.body.length).toBeLessThanOrEqual(150);
    expect(payload.body).toContain("…");
    expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBeLessThan(1000);

    const single = docsChangedPayload([long]);
    expect(single.url).toBe("/"); // 주소가 너무 길면 문서 목록을 연다.
    expect(new TextEncoder().encode(JSON.stringify(single)).length).toBeLessThan(1000);
  });

  it("공백과 한글이 든 경로도 주소로 인코딩한다", () => {
    expect(docsChangedPayload(["d/Manager's 흐름.md"]).url).toBe("/docs/d/Manager's%20%ED%9D%90%EB%A6%84.md");
  });
});

describe("sendToAll / notifyDocsChanged", () => {
  let db: Db;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await close();
  });

  const payload = docsChangedPayload(["d/a.md"]);

  it("모든 구독자에게 JSON 본문을 보낸다", async () => {
    await saveSubscription(db, sub(1));
    await saveSubscription(db, sub(2));
    const calls: [string, string][] = [];
    const sender: Sender = async (s, body) => {
      calls.push([s.endpoint, body]);
    };

    const summary = await sendToAll(db, sender, payload);

    expect(summary).toEqual({ total: 2, sent: 2, removed: 0, failed: 0 });
    expect(calls.map(([endpoint]) => endpoint).sort()).toEqual([sub(1).endpoint, sub(2).endpoint]);
    expect(JSON.parse(calls[0][1])).toEqual(payload);
  });

  it("404, 410으로 사라진 구독은 지우고, 다른 실패는 세기만 하고 나머지는 계속 보낸다", async () => {
    for (const n of [1, 2, 3, 4]) await saveSubscription(db, sub(n));
    const sender: Sender = async (s) => {
      if (s.endpoint.endsWith("device-1")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (s.endpoint.endsWith("device-2")) throw Object.assign(new Error("not found"), { statusCode: 404 });
      if (s.endpoint.endsWith("device-3")) throw Object.assign(new Error("server error"), { statusCode: 500 });
    };

    const summary = await sendToAll(db, sender, payload);

    expect(summary).toEqual({ total: 4, sent: 1, removed: 2, failed: 1 });
    expect((await listSubscriptions(db)).map((s) => s.endpoint).sort()).toEqual([sub(3).endpoint, sub(4).endpoint]);
  });

  it("상태 코드가 없는 오류(네트워크 실패 등)는 구독을 지우지 않는다", async () => {
    await saveSubscription(db, sub(1));
    const sender: Sender = async () => {
      throw new Error("network down");
    };
    const summary = await sendToAll(db, sender, payload);
    expect(summary).toEqual({ total: 1, sent: 0, removed: 0, failed: 1 });
    expect(await listSubscriptions(db)).toHaveLength(1);
  });

  it("구독자가 없으면 아무것도 보내지 않는다", async () => {
    const sender = vi.fn<Sender>();
    expect(await sendToAll(db, sender, payload)).toEqual({ total: 0, sent: 0, removed: 0, failed: 0 });
    expect(sender).not.toHaveBeenCalled();
  });

  it("구독자가 많아도(25명) 모두에게 보낸다", async () => {
    for (let i = 0; i < 25; i++) await saveSubscription(db, sub(i));
    const sender = vi.fn<Sender>(async () => undefined);
    expect((await sendToAll(db, sender, payload)).sent).toBe(25);
    expect(sender).toHaveBeenCalledTimes(25);
  });

  it("바뀐 문서가 없으면 보내지 않고 커밋도 기록하지 않는다", async () => {
    await saveSubscription(db, sub(1));
    const sender = vi.fn<Sender>();
    expect(await notifyDocsChanged({ db, sender }, { commitSha: "abc", changedDocs: [] })).toEqual({
      status: "skipped-no-docs",
    });
    expect(sender).not.toHaveBeenCalled();
    expect(await db.query("select sha from notified_commits")).toEqual([]);
  });

  it("같은 커밋은 한 번만 보낸다 (webhook 재전송)", async () => {
    await saveSubscription(db, sub(1));
    const sender = vi.fn<Sender>(async () => undefined);
    const input = { commitSha: "abc123", changedDocs: ["d/a.md"] };

    const first = await notifyDocsChanged({ db, sender }, input);
    const second = await notifyDocsChanged({ db, sender }, input);

    expect(first.status).toBe("sent");
    expect(second).toEqual({ status: "skipped-duplicate" });
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it("다른 커밋은 각각 보낸다", async () => {
    await saveSubscription(db, sub(1));
    const sender = vi.fn<Sender>(async () => undefined);
    await notifyDocsChanged({ db, sender }, { commitSha: "one", changedDocs: ["d/a.md"] });
    await notifyDocsChanged({ db, sender }, { commitSha: "two", changedDocs: ["d/a.md"] });
    expect(sender).toHaveBeenCalledTimes(2);
  });

  it("커밋 SHA가 없으면 중복 검사 없이 보낸다", async () => {
    await saveSubscription(db, sub(1));
    const sender = vi.fn<Sender>(async () => undefined);
    await notifyDocsChanged({ db, sender }, { commitSha: null, changedDocs: ["d/a.md"] });
    await notifyDocsChanged({ db, sender }, { commitSha: null, changedDocs: ["d/a.md"] });
    expect(sender).toHaveBeenCalledTimes(2);
  });
});
`````

**`src/lib/push/send-adapter.test.ts`**

`````ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({ default: { sendNotification } }));

const { createWebPushSender } = await import("./send");

const vapid = { subject: "mailto:team@example.com", publicKey: "pub", privateKey: "priv" };
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: "P256DH", auth: "AUTH" };

describe("createWebPushSender", () => {
  beforeEach(() => {
    sendNotification.mockReset().mockResolvedValue({ statusCode: 201 });
  });

  it("구독 모양과 본문, 옵션(VAPID, 하루 TTL)을 web-push에 그대로 넘긴다", async () => {
    await createWebPushSender(vapid)(subscription, '{"title":"t"}');

    expect(sendNotification).toHaveBeenCalledExactlyOnceWith(
      { endpoint: subscription.endpoint, keys: { p256dh: "P256DH", auth: "AUTH" } },
      '{"title":"t"}',
      {
        TTL: 86_400,
        urgency: "normal",
        timeout: 10_000,
        vapidDetails: { subject: vapid.subject, publicKey: "pub", privateKey: "priv" },
      },
    );
  });

  it("web-push가 던진 오류(statusCode 포함)를 그대로 던진다", async () => {
    const error = Object.assign(new Error("gone"), { statusCode: 410 });
    sendNotification.mockRejectedValue(error);
    await expect(createWebPushSender(vapid)(subscription, "{}")).rejects.toBe(error);
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/push/push.test.ts src/lib/push/send-adapter.test.ts`
Expected: FAIL — `./payload` 또는 `./send`를 찾을 수 없다는 오류.

- [ ] **Step 3: 구현한다**

**`src/lib/push/payload.ts`**

`````ts
import { docUrl } from "@/lib/github/tree";
import { displayName } from "@/lib/transform/paths";

/** 서비스 워커(`public/sw.js`)가 알림으로 바꾸는 내용. 웹 푸시 본문 제한(약 4KB)보다 훨씬 작게 유지한다. */
export type PushPayload = {
  title: string;
  body: string;
  /** 알림을 눌렀을 때 열 사이트 안의 경로(`/`로 시작) */
  url: string;
  /** 같은 tag의 알림은 기기에서 하나로 합쳐진다 */
  tag?: string;
};

const MAX_NAMES = 3;
const MAX_NAME_LENGTH = 40;
const MAX_URL_LENGTH = 500;

/** 파일 이름은 저장소 안의 내용이라 얼마든지 길 수 있다. 알림 본문이 커지지 않도록 자른다. */
function shorten(name: string): string {
  return name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH - 1)}…` : name;
}

/**
 * 문서가 바뀌었다는 알림. 제목 대신 파일 이름을 쓴다(문서 제목을 얻으려면 GitHub 호출이 더 필요하고,
 * webhook 처리 시간을 늘리기 때문이다). 한 문서만 바뀌었으면 그 문서를, 여러 개면 목록을 연다.
 */
export function docsChangedPayload(changedDocs: string[]): PushPayload {
  const names = changedDocs.slice(0, MAX_NAMES).map((path) => shorten(displayName(path)));
  const rest = changedDocs.length - names.length;
  const body = rest > 0 ? `${names.join(", ")} 외 ${rest}건` : names.join(", ");

  const singleUrl = changedDocs.length === 1 ? docUrl(changedDocs[0]) : "/";
  return {
    title: "문서가 업데이트됐어요",
    body,
    url: singleUrl.length <= MAX_URL_LENGTH ? singleUrl : "/",
    tag: "docs-updated",
  };
}
`````

**`src/lib/push/send.ts`**

`````ts
import webpush from "web-push";
import type { Db } from "@/lib/db/types";
import type { PushPayload } from "./payload";
import { listSubscriptions, removeSubscription, type PushSubscriptionInput } from "./subscriptions";

/** 구독 하나에게 알림을 보낸다. 실패하면 `statusCode`가 든 오류를 던진다(web-push의 `WebPushError`와 같은 모양). */
export type Sender = (subscription: PushSubscriptionInput, payload: string) => Promise<void>;

export type SendSummary = { total: number; sent: number; removed: number; failed: number };

/** 푸시 서비스가 "이 구독은 더 이상 없다"고 답하는 상태 코드. 이때는 저장소에서 지운다. */
const GONE_STATUS = new Set([404, 410]);
const CONCURRENCY = 10;

/**
 * 모든 구독자에게 보낸다. 일부가 실패해도 나머지는 계속 보내고 예외를 던지지 않는다.
 * 사라진 구독(404, 410)은 저장소에서 지운다.
 */
export async function sendToAll(db: Db, sender: Sender, payload: PushPayload): Promise<SendSummary> {
  const subscriptions = await listSubscriptions(db);
  const body = JSON.stringify(payload);
  const summary: SendSummary = { total: subscriptions.length, sent: 0, removed: 0, failed: 0 };

  for (let i = 0; i < subscriptions.length; i += CONCURRENCY) {
    const chunk = subscriptions.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (subscription) => {
        try {
          await sender(subscription, body);
          summary.sent += 1;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status !== undefined && GONE_STATUS.has(status)) {
            await removeSubscription(db, subscription.endpoint).catch(() => undefined);
            summary.removed += 1;
          } else {
            summary.failed += 1;
            console.error(`푸시 발송 실패 (status ${status ?? "알 수 없음"})`, error);
          }
        }
      }),
    );
  }
  return summary;
}

export type VapidConfig = { subject: string; publicKey: string; privateKey: string };

/** `web-push`로 실제 발송하는 Sender. VAPID 정보는 호출마다 넘겨서 전역 상태를 쓰지 않는다. */
export function createWebPushSender(vapid: VapidConfig): Sender {
  return async (subscription, payload) => {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      payload,
      {
        TTL: 60 * 60 * 24, // 하루 안에 전달되지 않으면 버린다(오래된 문서 알림은 의미가 없다).
        urgency: "normal",
        timeout: 10_000,
        vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      },
    );
  };
}
`````

**`src/lib/push/notify-docs.ts`**

`````ts
import type { Db } from "@/lib/db/types";
import { docsChangedPayload } from "./payload";
import { sendToAll, type Sender, type SendSummary } from "./send";

export type NotifyDeps = { db: Db; sender: Sender };

export type NotifyResult =
  | { status: "skipped-no-docs" }
  | { status: "skipped-duplicate" }
  | { status: "sent"; summary: SendSummary };

/**
 * `develop` push에서 표시 대상 문서가 바뀌었을 때 구독자에게 알린다.
 * - 바뀐 문서가 없으면 보내지 않는다.
 * - 같은 커밋(GitHub webhook 수동 재전송 포함)은 한 번만 보낸다. 보내기 전에 커밋 SHA를 먼저 기록한다.
 */
export async function notifyDocsChanged(
  deps: NotifyDeps,
  input: { commitSha: string | null; changedDocs: string[] },
): Promise<NotifyResult> {
  if (input.changedDocs.length === 0) return { status: "skipped-no-docs" };

  if (input.commitSha) {
    const claimed = await deps.db.query<{ sha: string }>(
      "insert into notified_commits (sha) values ($1) on conflict do nothing returning sha",
      [input.commitSha],
    );
    if (claimed.length === 0) return { status: "skipped-duplicate" };
  }

  const summary = await sendToAll(deps.db, deps.sender, docsChangedPayload(input.changedDocs));
  return { status: "sent", summary };
}
`````

- [ ] **Step 4: 통과를 확인하고 커밋한다**

Run: `npx vitest run src/lib/push`
Expected: PASS (endpoint 6 + subscriptions 9 + push 14 + send-adapter 2 = 31 tests)

```bash
git add src/lib/push
git commit -m "feat: build docs-changed notifications with dedupe and expired-subscription cleanup"
```

---

### Task 6: 푸시 설정, 서비스, webhook 연결

**Files:**
- Create: `src/lib/push/config.ts`, `src/lib/push/service.ts`
- Modify: `src/app/api/github-webhook/route.ts`, `src/app/api/github-webhook/route.test.ts`
- Test: `src/lib/push/config.test.ts`, `src/lib/push/service.test.ts`, `src/app/api/github-webhook/route.test.ts`

**Interfaces:**
- Consumes: Task 2의 `getDbOrNull`, Task 5의 `createWebPushSender`, `notifyDocsChanged`, `VapidConfig`, `NotifyResult`
- Produces:
  - `type PushConfig = { databaseUrl: string; vapid: VapidConfig }`, `type PushConfigResult = { ok: true; config: PushConfig } | { ok: false; missing: string[] }`
  - `loadPushConfig(env?): PushConfigResult` — `DATABASE_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`(`mailto:이메일` 또는 `https://주소`)가 모두 있어야 `ok`. 공백뿐인 값은 없는 것으로 본다.
  - `notifyDocsChangedIfConfigured(input: { commitSha: string | null; changedDocs: string[] }): Promise<ServiceResult>` (서버 전용) — 설정이 없으면 서버 로그에 빠진 값을 남기고 `skipped-not-configured`를 돌려준다. 발송 중 오류가 나도 던지지 않고 `failed`를 돌려준다(응답 뒤에 도는 작업이라 잡아 줄 곳이 없다).
  - webhook 동작: `develop` push에서 캐시를 무효화한 뒤, **표시 대상 문서가 바뀐 경우에만** `after(() => notifyDocsChangedIfConfigured({ commitSha, changedDocs }))`로 알림을 예약하고 응답은 기다리지 않는다. 그 밖의 경로(서명 오류, ping, 다른 브랜치, 잘못된 본문)는 알림을 예약하지 않는다.

- [ ] **Step 1: 설정과 서비스의 실패하는 테스트를 쓴다**

**`src/lib/push/config.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { loadPushConfig } from "./config";

const full = {
  DATABASE_URL: "postgres://user:pw@host/db",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public-key",
  VAPID_PRIVATE_KEY: "private-key",
  VAPID_SUBJECT: "mailto:team@example.com",
};

describe("loadPushConfig", () => {
  it("모든 값이 있으면 설정을 돌려준다", () => {
    expect(loadPushConfig(full)).toEqual({
      ok: true,
      config: {
        databaseUrl: full.DATABASE_URL,
        vapid: { subject: full.VAPID_SUBJECT, publicKey: "public-key", privateKey: "private-key" },
      },
    });
  });

  it("빠진 값을 모두 알려준다", () => {
    const result = loadPushConfig({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toHaveLength(4);
    expect(result.missing.join(" ")).toContain("DATABASE_URL");
    expect(result.missing.join(" ")).toContain("VAPID_PRIVATE_KEY");
  });

  it("공백뿐인 값은 없는 것으로 본다", () => {
    const result = loadPushConfig({ ...full, VAPID_PRIVATE_KEY: "   " });
    expect(result).toEqual({ ok: false, missing: ["VAPID_PRIVATE_KEY"] });
  });

  it("VAPID_SUBJECT는 mailto: 또는 https://여야 한다", () => {
    for (const subject of ["team@example.com", "http://example.com", "mailto:", "ftp://x"]) {
      expect(loadPushConfig({ ...full, VAPID_SUBJECT: subject }).ok, subject).toBe(false);
    }
    expect(loadPushConfig({ ...full, VAPID_SUBJECT: "https://example.com" }).ok).toBe(true);
  });
});
`````

**`src/lib/push/service.test.ts`**

`````ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getDbOrNull = vi.fn();
vi.mock("@/lib/db", () => ({ getDbOrNull }));

const notifyDocsChanged = vi.fn();
vi.mock("./notify-docs", () => ({ notifyDocsChanged }));

const { notifyDocsChangedIfConfigured } = await import("./service");

const input = { commitSha: "abc", changedDocs: ["d/a.md"] };
const fullEnv = {
  DATABASE_URL: "postgres://user:pw@host/db",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub",
  VAPID_PRIVATE_KEY: "priv",
  VAPID_SUBJECT: "mailto:team@example.com",
};

describe("notifyDocsChangedIfConfigured", () => {
  beforeEach(() => {
    getDbOrNull.mockReset();
    notifyDocsChanged.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const key of Object.keys(fullEnv)) vi.stubEnv(key, "");
  });

  it("환경변수가 없으면 DB를 건드리지 않고 건너뛴다", async () => {
    const result = await notifyDocsChangedIfConfigured(input);
    expect(result.status).toBe("skipped-not-configured");
    expect(getDbOrNull).not.toHaveBeenCalled();
    expect(notifyDocsChanged).not.toHaveBeenCalled();
  });

  it("설정이 있으면 알림 로직에 DB와 발송기를 넘긴다", async () => {
    for (const [key, value] of Object.entries(fullEnv)) vi.stubEnv(key, value);
    const db = { query: vi.fn() };
    getDbOrNull.mockReturnValue(db);
    notifyDocsChanged.mockResolvedValue({ status: "sent", summary: { total: 1, sent: 1, removed: 0, failed: 0 } });

    const result = await notifyDocsChangedIfConfigured(input);

    expect(result.status).toBe("sent");
    expect(notifyDocsChanged).toHaveBeenCalledOnce();
    const [deps, passedInput] = notifyDocsChanged.mock.calls[0];
    expect(deps.db).toBe(db);
    expect(typeof deps.sender).toBe("function");
    expect(passedInput).toEqual(input);
  });

  it("알림 로직에서 오류가 나도 던지지 않고 failed로 돌려준다", async () => {
    for (const [key, value] of Object.entries(fullEnv)) vi.stubEnv(key, value);
    getDbOrNull.mockReturnValue({ query: vi.fn() });
    notifyDocsChanged.mockRejectedValue(new Error("db down"));

    await expect(notifyDocsChangedIfConfigured(input)).resolves.toEqual({ status: "failed" });
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/push/config.test.ts src/lib/push/service.test.ts`
Expected: FAIL — `./config` 또는 `./service`를 찾을 수 없다는 오류.

- [ ] **Step 3: 설정과 서비스를 구현한다**

`service.ts`가 `import "server-only"`를 쓰므로 테스트에서는 그 모듈을 비워서 불러온다(테스트 파일 첫머리의 `vi.mock("server-only", ...)`).

**`src/lib/push/config.ts`**

`````ts
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
`````

**`src/lib/push/service.ts`**

`````ts
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
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/push/config.test.ts src/lib/push/service.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: webhook 테스트를 알림 연결에 맞게 바꾼다 (실패해야 한다)**

계획 1의 `route.test.ts`를 아래 내용으로 통째로 바꾼다. 기존 8개 테스트는 그대로 두고, `next/server`의 `after`와 알림 서비스를 가짜로 바꿔 끼우는 부분과 알림 관련 테스트 3개를 더했다.

**`src/app/api/github-webhook/route.test.ts`**

`````ts
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));

// `after`는 응답이 끝난 뒤 실행할 작업을 예약한다. 테스트에서는 예약만 모아 두었다가 직접 실행한다.
const scheduled: Array<() => unknown> = [];
vi.mock("next/server", () => ({ after: (task: () => unknown) => void scheduled.push(task) }));

const notifyDocsChangedIfConfigured = vi.fn();
vi.mock("@/lib/push/service", () => ({ notifyDocsChangedIfConfigured }));

const { POST } = await import("./route");

async function runScheduled(): Promise<void> {
  await Promise.all(scheduled.splice(0).map((task) => task()));
}

const SECRET = "test-secret";
const sign = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

function webhook(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/github-webhook", {
    method: "POST",
    body,
    headers: { "x-github-event": "push", "x-hub-signature-256": sign(body), ...headers },
  });
}

const pushBody = (ref = "refs/heads/develop") =>
  JSON.stringify({ ref, after: "abc", commits: [{ modified: ["frontend/docs/plan/a.md"] }] });

beforeEach(() => {
  revalidateTag.mockClear();
  notifyDocsChangedIfConfigured.mockReset().mockResolvedValue({ status: "sent" });
  scheduled.length = 0;
  vi.stubEnv("GITHUB_REPO", "org/repo");
  vi.stubEnv("GITHUB_BRANCH", "develop");
  vi.stubEnv("DOCS_PATHS", "frontend/docs/plan");
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", SECRET);
});

describe("POST /api/github-webhook", () => {
  it("서명이 맞는 develop push는 트리 캐시를 즉시 만료시킨다", async () => {
    const response = await POST(webhook(pushBody()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: true, changedDocs: 1 });
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith("tree", { expire: 0 });
  });

  it("표시 대상 문서가 바뀐 push는 응답 뒤에 알림을 보낸다(캐시 무효화가 먼저)", async () => {
    const order: string[] = [];
    revalidateTag.mockImplementation(() => order.push("revalidate"));
    notifyDocsChangedIfConfigured.mockImplementation(async () => order.push("notify"));

    const response = await POST(webhook(pushBody()));

    expect(response.status).toBe(200);
    expect(notifyDocsChangedIfConfigured).not.toHaveBeenCalled(); // 응답 시점에는 아직 예약만 됐다.
    await runScheduled();
    expect(notifyDocsChangedIfConfigured).toHaveBeenCalledExactlyOnceWith({
      commitSha: "abc",
      changedDocs: ["frontend/docs/plan/a.md"],
    });
    expect(order).toEqual(["revalidate", "notify"]);
  });

  it("응답은 알림 발송이 끝나기를 기다리지 않는다", async () => {
    let finishSending: () => void = () => undefined;
    notifyDocsChangedIfConfigured.mockReturnValue(new Promise<void>((resolve) => (finishSending = resolve)));

    const response = await POST(webhook(pushBody())); // 발송이 끝나지 않았어도 응답이 온다.
    expect(response.status).toBe(200);

    const running = runScheduled();
    finishSending();
    await running;
    expect(notifyDocsChangedIfConfigured).toHaveBeenCalledOnce();
  });

  it("문서가 아닌 파일만 바뀐 push는 캐시만 무효화하고 알림은 보내지 않는다", async () => {
    const body = JSON.stringify({
      ref: "refs/heads/develop",
      after: "abc",
      commits: [{ modified: ["frontend/src/App.tsx", "frontend/docs/other/x.md"] }],
    });
    expect((await POST(webhook(body))).status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledOnce();
    await runScheduled();
    expect(notifyDocsChangedIfConfigured).not.toHaveBeenCalled();
  });

  it("서명이 틀리거나 없으면 401이고 캐시를 건드리지 않는다", async () => {
    const wrong = await POST(webhook(pushBody(), { "x-hub-signature-256": "sha256=" + "0".repeat(64) }));
    expect(wrong.status).toBe(401);
    const request = new Request("https://example.com/api/github-webhook", {
      method: "POST",
      body: pushBody(),
      headers: { "x-github-event": "push" },
    });
    expect((await POST(request)).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
    await runScheduled();
    expect(notifyDocsChangedIfConfigured).not.toHaveBeenCalled();
  });

  it("ping은 200이고 캐시를 건드리지 않는다", async () => {
    const response = await POST(webhook("{}", { "x-github-event": "ping", "x-hub-signature-256": sign("{}") }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pong: true });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("다른 브랜치의 push는 202로 무시한다", async () => {
    const response = await POST(webhook(pushBody("refs/heads/feature/x")));
    expect(response.status).toBe(202);
    expect(revalidateTag).not.toHaveBeenCalled();
    await runScheduled();
    expect(notifyDocsChangedIfConfigured).not.toHaveBeenCalled();
  });

  it("서명은 맞지만 JSON이 아닌 본문(폼 방식 webhook)은 400으로 안내한다", async () => {
    const body = "payload=%7B%22ref%22%3A%22refs%2Fheads%2Fdevelop%22%7D";
    const response = await POST(webhook(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("application/json");
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("JSON이지만 모양이 이상하면 죽지 않고 무시한다", async () => {
    for (const body of ["null", "[]", '"text"', "42"]) {
      const response = await POST(webhook(body));
      expect(response.status).toBe(202);
    }
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("비밀키가 설정되지 않았으면 500이다(서명이 맞아 보여도 처리하지 않는다)", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "");
    expect((await POST(webhook(pushBody()))).status).toBe(500);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("저장소 설정이 없으면 500이다", async () => {
    vi.stubEnv("GITHUB_REPO", "");
    expect((await POST(webhook(pushBody()))).status).toBe(500);
  });
});
`````

- [ ] **Step 6: 실패를 확인한다**

Run: `npx vitest run src/app/api/github-webhook`
Expected: FAIL — "표시 대상 문서가 바뀐 push는 응답 뒤에 알림을 보낸다"와 "응답은 알림 발송이 끝나기를 기다리지 않는다"가 `notifyDocsChangedIfConfigured`가 호출되지 않아서 실패한다.

- [ ] **Step 7: webhook 라우트를 고친다**

`route.ts`를 아래 내용으로 통째로 바꾼다.

**`src/app/api/github-webhook/route.ts`**

`````ts
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { loadConfig, type AppConfig } from "@/lib/config";
import { TREE_TAG } from "@/lib/github/tags";
import { notifyDocsChangedIfConfigured } from "@/lib/push/service";
import { decideWebhook } from "@/lib/webhook/decide";
import { verifySignature } from "@/lib/webhook/verify";

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

export async function POST(request: Request): Promise<Response> {
  let config: AppConfig;
  try {
    config = loadConfig();
  } catch {
    return json({ error: "서버 설정이 올바르지 않아요." }, 500);
  }
  // 비밀키가 없으면 누구의 요청도 믿을 수 없으므로 처리하지 않는다.
  if (!config.webhookSecret) return json({ error: "webhook 비밀키가 설정되지 않았어요." }, 500);

  // 서명은 원본 본문 기준으로 계산되므로 파싱하기 전에 문자열로 받아 검증한다.
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"), config.webhookSecret)) {
    return json({ error: "서명이 올바르지 않아요." }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "본문이 JSON이 아니에요. webhook의 Content type을 application/json으로 설정하세요." }, 400);
  }

  const decision = decideWebhook(request.headers.get("x-github-event"), payload, config);
  switch (decision.kind) {
    case "pong":
      return json({ pong: true }, 200);
    case "ignore":
      return json({ ignored: decision.reason }, 202);
    case "push":
      // 외부 서비스가 부르는 경로라 updateTag는 쓸 수 없다. { expire: 0 }으로 즉시 만료시킨다.
      revalidateTag(TREE_TAG, { expire: 0 });
      if (decision.changedDocs.length > 0) {
        // GitHub은 10초 안에 응답하지 않으면 실패로 기록하므로, 응답을 먼저 돌려주고 알림은 그 뒤에 보낸다.
        // 캐시 무효화는 이미 끝났으니 알림이 실패해도 화면 반영에는 영향이 없다.
        after(() =>
          notifyDocsChangedIfConfigured({ commitSha: decision.commitSha, changedDocs: decision.changedDocs }),
        );
      }
      return json({ revalidated: true, changedDocs: decision.changedDocs.length }, 200);
  }
}
`````

- [ ] **Step 8: 통과를 확인하고 커밋한다**

Run: `npx vitest run src/app/api/github-webhook`
Expected: PASS (11 tests)

```bash
npm test
npm run typecheck
git add src/lib/push src/app/api/github-webhook
git commit -m "feat: send doc-change notifications after the webhook responds"
```

Expected: 22개 파일 168개 테스트 통과.

---

### Task 7: 구독 API

**Files:**
- Create: `src/lib/push/handlers.ts`, `src/app/api/push/subscriptions/route.ts`
- Test: `src/lib/push/handlers.test.ts`

**Interfaces:**
- Consumes: Task 2의 `Db`, `createTestDb`, `getDbOrNull`, Task 3의 `MAX_ENDPOINT_LENGTH`, Task 4의 `parseSubscription`, `saveSubscription`, `removeSubscription`, `MAX_SUBSCRIPTIONS`, `listSubscriptions`
- Produces:
  - `createSubscriptionHandlers({ getDb: () => Db | null }): { POST(request): Promise<Response>; DELETE(request): Promise<Response> }`
  - `POST /api/push/subscriptions` — 본문은 브라우저의 `PushSubscription.toJSON()`. 응답: 새 구독 `201`, 이미 있는 구독 `200`, JSON이 아닌 Content-Type `415`, 깨진 JSON이나 검증 실패(허용되지 않는 주소, 잘못된 키) `400`(이유 포함), 100대 초과 `429`, DB 미설정 `503`.
  - `DELETE /api/push/subscriptions` — 본문 `{ endpoint }`. 저장소에 없어도 `204`. `endpoint`가 없거나 문자열이 아니거나 2000자를 넘으면 `400`, JSON이 아니면 `415`, DB 미설정 `503`.
  - JSON Content-Type을 요구하는 이유: 다른 사이트의 폼이 몰래 보내는 요청은 `application/json`을 붙일 수 없어서 여기서 걸러진다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/push/handlers.test.ts`**

`````ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/types";
import { createTestDb } from "@/lib/db/testing";
import { createSubscriptionHandlers } from "./handlers";
import { listSubscriptions, MAX_SUBSCRIPTIONS } from "./subscriptions";

const P256DH = "B".repeat(87);
const AUTH = "a".repeat(22);
const validBody = (n = 1) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`,
  keys: { p256dh: P256DH, auth: AUTH },
});

function request(method: "POST" | "DELETE", body: unknown, contentType: string | null = "application/json") {
  return new Request("https://example.com/api/push/subscriptions", {
    method,
    headers: contentType ? { "content-type": contentType } : {},
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("구독 API 핸들러", () => {
  let db: Db;
  let close: () => Promise<void>;
  let handlers: ReturnType<typeof createSubscriptionHandlers>;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    handlers = createSubscriptionHandlers({ getDb: () => db });
  });
  afterEach(async () => {
    await close();
  });

  it("올바른 구독은 201로 저장하고, 같은 구독을 다시 보내면 200이다", async () => {
    expect((await handlers.POST(request("POST", validBody()))).status).toBe(201);
    expect((await handlers.POST(request("POST", validBody()))).status).toBe(200);
    expect(await listSubscriptions(db)).toHaveLength(1);
  });

  it("JSON이 아닌 Content-Type은 415이고 저장하지 않는다", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", null]) {
      const response = await handlers.POST(request("POST", validBody(), type));
      expect(response.status, String(type)).toBe(415);
    }
    expect(await listSubscriptions(db)).toEqual([]);
  });

  it("깨진 JSON은 400이다", async () => {
    expect((await handlers.POST(request("POST", "{not json"))).status).toBe(400);
  });

  it("허용되지 않는 주소나 잘못된 키는 400이고 이유를 알려준다", async () => {
    const ssrf = await handlers.POST(request("POST", { ...validBody(), endpoint: "https://169.254.169.254/x" }));
    expect(ssrf.status).toBe(400);
    expect((await ssrf.json()).error).toContain("푸시 주소");

    const badKeys = await handlers.POST(request("POST", { ...validBody(), keys: { p256dh: "x", auth: "y" } }));
    expect(badKeys.status).toBe(400);
    expect(await listSubscriptions(db)).toEqual([]);
  });

  it("구독 수 상한을 넘으면 429이다", async () => {
    for (let i = 0; i < MAX_SUBSCRIPTIONS; i++) {
      expect((await handlers.POST(request("POST", validBody(i)))).status).toBe(201);
    }
    expect((await handlers.POST(request("POST", validBody(MAX_SUBSCRIPTIONS)))).status).toBe(429);
  });

  it("DB가 설정되지 않았으면 503이다", async () => {
    const noDb = createSubscriptionHandlers({ getDb: () => null });
    expect((await noDb.POST(request("POST", validBody()))).status).toBe(503);
    expect((await noDb.DELETE(request("DELETE", { endpoint: validBody().endpoint }))).status).toBe(503);
  });

  it("해제하면 204이고 저장소에서 사라진다. 없는 주소를 지워도 204다", async () => {
    await handlers.POST(request("POST", validBody()));
    const removed = await handlers.DELETE(request("DELETE", { endpoint: validBody().endpoint }));
    expect(removed.status).toBe(204);
    expect(await listSubscriptions(db)).toEqual([]);

    const again = await handlers.DELETE(request("DELETE", { endpoint: validBody().endpoint }));
    expect(again.status).toBe(204);
  });

  it("해제 요청에 endpoint가 없거나 JSON이 아니면 거부한다", async () => {
    expect((await handlers.DELETE(request("DELETE", {}))).status).toBe(400);
    expect((await handlers.DELETE(request("DELETE", { endpoint: 5 }))).status).toBe(400);
    expect((await handlers.DELETE(request("DELETE", { endpoint: "x" }, "text/plain"))).status).toBe(415);
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/push/handlers.test.ts`
Expected: FAIL — `./handlers`를 찾을 수 없다는 오류.

- [ ] **Step 3: 구현한다**

**`src/lib/push/handlers.ts`**

`````ts
import type { Db } from "@/lib/db/types";
import { MAX_ENDPOINT_LENGTH } from "./endpoint";
import { parseSubscription, removeSubscription, saveSubscription } from "./subscriptions";

type Deps = { getDb: () => Db | null };

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

/** 본문이 JSON이어야 한다. (다른 사이트의 폼이 몰래 보내는 요청은 JSON 헤더를 못 붙이므로 여기서 걸러진다.) */
async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return { ok: false, response: json({ error: "Content-Type은 application/json이어야 해요." }, 415) };
  }
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: json({ error: "본문이 올바른 JSON이 아니에요." }, 400) };
  }
}

/** 알림 구독 등록(POST)과 해제(DELETE). 로그인이 없어서 누구나 부를 수 있다. */
export function createSubscriptionHandlers({ getDb }: Deps) {
  return {
    async POST(request: Request): Promise<Response> {
      const parsed = await readJson(request);
      if (!parsed.ok) return parsed.response;

      const subscription = parseSubscription(parsed.body);
      if (!subscription.ok) return json({ error: subscription.error }, 400);

      const db = getDb();
      if (!db) return json({ error: "알림 저장소가 설정되지 않았어요." }, 503);

      const result = await saveSubscription(db, subscription.value);
      if (result === "limit") return json({ error: "구독할 수 있는 기기 수를 넘었어요." }, 429);
      return json({ ok: true }, result === "created" ? 201 : 200);
    },

    async DELETE(request: Request): Promise<Response> {
      const parsed = await readJson(request);
      if (!parsed.ok) return parsed.response;

      const endpoint = (parsed.body as { endpoint?: unknown } | null)?.endpoint;
      if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LENGTH) {
        return json({ error: "endpoint가 필요해요." }, 400);
      }

      const db = getDb();
      if (!db) return json({ error: "알림 저장소가 설정되지 않았어요." }, 503);

      await removeSubscription(db, endpoint);
      return new Response(null, { status: 204 });
    },
  };
}
`````

**`src/app/api/push/subscriptions/route.ts`**

`````ts
import { getDbOrNull } from "@/lib/db";
import { createSubscriptionHandlers } from "@/lib/push/handlers";

const handlers = createSubscriptionHandlers({ getDb: () => getDbOrNull() });

export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
`````

- [ ] **Step 4: 통과를 확인하고 커밋한다**

Run: `npx vitest run src/lib/push/handlers.test.ts`
Expected: PASS (8 tests)

```bash
npm test
npm run typecheck
git add src/lib/push/handlers.ts src/lib/push/handlers.test.ts src/app/api/push
git commit -m "feat: add push subscription API with content-type and endpoint checks"
```

Expected: 23개 파일 176개 테스트 통과.

---

### Task 8: PWA 껍데기 (서비스 워커, manifest, 아이콘, 헤더)

**Files:**
- Create: `public/sw.js`, `src/app/manifest.ts`, `src/lib/pwa/icon.tsx`, `src/lib/pwa/headers.ts`, `src/app/icon-192.png/route.tsx`, `src/app/icon-512.png/route.tsx`, `src/app/apple-icon.png/route.tsx`
- Modify: `next.config.ts`, `src/app/layout.tsx`
- Test: `src/lib/push/sw.test.ts`, `src/app/manifest.test.ts`, `src/lib/pwa/headers.test.ts`

**Interfaces:**
- Produces:
  - `public/sw.js` — 서비스 워커. `push`: 본문(`{ title, body, url, tag }`)이 없거나 깨져도 **반드시** 알림을 띄운다(기본 제목 "문서 백오피스", 본문 "새 소식이 있어요."). 열 주소는 `/`로 시작하고 `//`로 시작하지 않는 경로만 쓰고, 그 밖은 `/`로 바꾼다. `notificationclick`: 알림을 닫고, 열린 우리 사이트 창이 있으면 그 창을 앞으로 가져와 이동하고, 없으면 새 창을 연다. `install`은 `skipWaiting`, `activate`는 `clients.claim`.
  - `manifest()` — `display: "standalone"`(iOS 푸시 조건), `start_url: "/"`, 192·512 PNG와 maskable 아이콘
  - `iconResponse(size): ImageResponse` — 글자 "D"를 화면의 60%로 가운데에 둔 PNG. 라우트 `/icon-192.png`, `/icon-512.png`, `/apple-icon.png`(180)로 내보낸다.
  - `serviceWorkerHeaders(): HeaderRule[]` — `/sw.js`에 `Cache-Control: no-cache, no-store, must-revalidate`, `Content-Type: application/javascript; charset=utf-8`, `Content-Security-Policy: default-src 'self'; script-src 'self'`. `next.config.ts`의 `headers()`가 이를 내보낸다.
  - 레이아웃 메타데이터: `appleWebApp`(홈 화면 이름), `icons.apple`, `viewport.themeColor`

서비스 워커 테스트는 `node:vm`으로 `public/sw.js`를 실제로 실행하면서 `self`(`addEventListener`, `registration.showNotification`, `clients`)만 흉내 낸다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/push/sw.test.ts`**

`````ts
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (event: Record<string, unknown>) => void;

const ORIGIN = "https://docs.example.com";
const source = readFileSync("public/sw.js", "utf8");

/** 서비스 워커의 전역(`self`)을 흉내 내서 `public/sw.js`를 실제로 실행한다. */
function loadServiceWorker() {
  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn(async () => undefined);
  const openWindow = vi.fn(async () => undefined);
  const claim = vi.fn(async () => undefined);
  const matchAll = vi.fn<() => Promise<unknown[]>>(async () => []);
  const skipWaiting = vi.fn();

  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    registration: { showNotification },
    clients: { openWindow, claim, matchAll },
    location: { origin: ORIGIN },
    skipWaiting,
  };
  vm.runInNewContext(source, { self, URL, Promise, JSON, Object });

  /** 이벤트를 보내고, `waitUntil`에 넘겨진 작업이 끝나기를 기다린다. */
  async function dispatch(type: string, event: Record<string, unknown>) {
    const waits: Promise<unknown>[] = [];
    listeners.get(type)?.({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    return waits.length;
  }
  /** `raw`가 Error면 `event.data.json()`이 깨진 JSON처럼 던지고, undefined면 본문(data)이 없다. */
  const pushEvent = (raw: unknown) => ({
    data:
      raw === undefined
        ? null
        : {
            json: () => {
              if (raw instanceof Error) throw raw;
              return raw;
            },
          },
  });
  return { dispatch, pushEvent, showNotification, openWindow, matchAll, claim, skipWaiting, listeners };
}

let sw: ReturnType<typeof loadServiceWorker>;
beforeEach(() => {
  sw = loadServiceWorker();
});

describe("push 이벤트", () => {
  it("제목, 본문, 열 주소, tag로 알림을 띄운다", async () => {
    await sw.dispatch(
      "push",
      sw.pushEvent({ title: "문서가 업데이트됐어요", body: "m3", url: "/docs/a.md", tag: "docs-updated" }),
    );
    expect(sw.showNotification).toHaveBeenCalledExactlyOnceWith("문서가 업데이트됐어요", {
      body: "m3",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: "/docs/a.md" },
      tag: "docs-updated",
    });
  });

  it("본문이 없거나 깨져도(iOS는 알림을 안 띄우면 구독을 취소한다) 기본 문구로 반드시 띄운다", async () => {
    for (const event of [
      sw.pushEvent(undefined),
      sw.pushEvent(new Error("깨진 JSON")),
      sw.pushEvent("문자열"),
      sw.pushEvent(null),
      sw.pushEvent({}),
      sw.pushEvent({ title: 5, body: {}, url: null }),
    ]) {
      sw.showNotification.mockClear();
      await sw.dispatch("push", event);
      expect(sw.showNotification, JSON.stringify(event)).toHaveBeenCalledOnce();
      expect(sw.showNotification).toHaveBeenCalledWith("문서 백오피스", {
        body: "새 소식이 있어요.",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: "/" },
      });
    }
  });

  it("사이트 밖 주소는 홈으로 바꾼다", async () => {
    for (const url of ["https://evil.example/x", "//evil.example/x", "javascript:alert(1)", "docs/a.md", ""]) {
      sw.showNotification.mockClear();
      await sw.dispatch("push", sw.pushEvent({ title: "t", body: "b", url }));
      const options = sw.showNotification.mock.calls[0] as unknown as [string, { data: { url: string } }];
      expect(options[1].data.url, url).toBe("/");
    }
  });
});

describe("notificationclick 이벤트", () => {
  const click = (url: unknown) => {
    const close = vi.fn();
    return { close, event: { notification: { close, data: url === undefined ? undefined : { url } } } };
  };

  it("알림을 닫고, 열린 창이 없으면 새 창으로 해당 주소를 연다", async () => {
    const { close, event } = click("/docs/a.md");
    await sw.dispatch("notificationclick", event);
    expect(close).toHaveBeenCalledOnce();
    expect(sw.openWindow).toHaveBeenCalledExactlyOnceWith(`${ORIGIN}/docs/a.md`);
  });

  it("이미 열린 우리 사이트 창이 있으면 그 창을 앞으로 가져와서 이동한다", async () => {
    const focus = vi.fn(async () => undefined);
    const navigate = vi.fn(async () => undefined);
    sw.matchAll.mockResolvedValue([
      { url: "https://other.example/", focus: vi.fn(), navigate: vi.fn() },
      { url: `${ORIGIN}/`, focus, navigate },
    ]);

    await sw.dispatch("notificationclick", click("/docs/a.md").event);

    expect(focus).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(`${ORIGIN}/docs/a.md`);
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it("사이트 밖 주소나 주소가 없는 알림은 홈을 연다", async () => {
    for (const url of ["https://evil.example/x", "//evil.example", undefined]) {
      sw.openWindow.mockClear();
      await sw.dispatch("notificationclick", click(url).event);
      expect(sw.openWindow, String(url)).toHaveBeenCalledWith(`${ORIGIN}/`);
    }
  });
});

describe("설치와 활성화", () => {
  it("설치 즉시 활성화하고, 활성화되면 열린 페이지를 바로 제어한다", async () => {
    await sw.dispatch("install", {});
    expect(sw.skipWaiting).toHaveBeenCalledOnce();
    await sw.dispatch("activate", {});
    expect(sw.claim).toHaveBeenCalledOnce();
  });
});
`````

**`src/app/manifest.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("웹 앱 manifest", () => {
  const m = manifest();

  it("iOS 푸시에 필요한 standalone 모드이고 시작 주소는 홈이다", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
  });

  it("192, 512 PNG 아이콘과 maskable 아이콘이 있다", () => {
    const icons = m.icons ?? [];
    expect(icons.find((i) => i.sizes === "192x192")?.src).toBe("/icon-192.png");
    expect(icons.filter((i) => i.sizes === "512x512").map((i) => i.purpose ?? "any")).toEqual(["any", "maskable"]);
    for (const icon of icons) expect(icon.type).toBe("image/png");
  });

  it("이름이 있다", () => {
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
  });
});
`````

**`src/lib/pwa/headers.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import { serviceWorkerHeaders } from "./headers";

describe("서비스 워커 헤더", () => {
  const [rule] = serviceWorkerHeaders();
  const value = (key: string) => rule.headers.find((h) => h.key === key)?.value;

  it("/sw.js에만 적용된다", () => {
    expect(serviceWorkerHeaders()).toHaveLength(1);
    expect(rule.source).toBe("/sw.js");
  });

  it("캐시하지 않고, 자바스크립트로 내려주고, 자기 도메인 스크립트만 허용한다", () => {
    expect(value("Cache-Control")).toContain("no-store");
    expect(value("Content-Type")).toContain("application/javascript");
    expect(value("Content-Security-Policy")).toBe("default-src 'self'; script-src 'self'");
  });

  it("next.config.ts가 이 헤더를 실제로 내보낸다", async () => {
    expect(await nextConfig.headers?.()).toEqual(serviceWorkerHeaders());
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/push/sw.test.ts src/app/manifest.test.ts src/lib/pwa/headers.test.ts`
Expected: FAIL — `public/sw.js`, `./manifest`, `./headers`를 찾을 수 없다는 오류.

- [ ] **Step 3: 서비스 워커와 manifest, 헤더를 구현한다**

**`public/sw.js`**

`````js
// 푸시 알림을 받아 화면에 띄우는 서비스 워커.
// 주의: iOS(Safari)는 푸시를 받고도 알림을 띄우지 않으면 구독을 취소해 버리므로,
// push 이벤트에서는 어떤 경우에도 반드시 알림을 띄운다.

const DEFAULT_TITLE = "문서 백오피스";
const DEFAULT_BODY = "새 소식이 있어요.";
const ICON = "/icon-192.png";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** 사이트 안의 경로(`/`로 시작, `//`로 시작하지 않음)만 열 수 있다. 그 밖의 값은 홈으로 바꾼다. */
function safePath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function readPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

self.addEventListener("push", (event) => {
  const data = readPayload(event);
  const title = typeof data.title === "string" && data.title ? data.title : DEFAULT_TITLE;
  const body = typeof data.body === "string" && data.body ? data.body : DEFAULT_BODY;
  const options = { body, icon: ICON, badge: ICON, data: { url: safePath(data.url) } };
  if (typeof data.tag === "string" && data.tag) options.tag = data.tag;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ("navigate" in open) await open.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
`````

**`src/app/manifest.ts`**

`````ts
import type { MetadataRoute } from "next";

/** 홈 화면에 설치하는 웹 앱 정보. iPhone에서 푸시 알림을 받으려면 이 앱을 홈 화면에 추가해야 한다. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "문서 백오피스",
    short_name: "문서",
    description: "GitHub develop 브랜치의 문서를 읽기 전용으로 보여줍니다.",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone", // iOS의 웹 푸시는 standalone(또는 fullscreen)일 때만 동작한다.
    background_color: "#ffffff",
    theme_color: "#1f2328",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
`````

**`src/lib/pwa/headers.ts`**

`````ts
export type HeaderRule = { source: string; headers: { key: string; value: string }[] };

/**
 * 서비스 워커(`/sw.js`)에 붙이는 응답 헤더.
 * - 캐시를 막아서 새 버전이 바로 반영되게 한다(오래된 서비스 워커가 남으면 알림이 옛 동작으로 뜬다).
 * - 자기 도메인의 스크립트만 실행하도록 CSP를 건다.
 */
export function serviceWorkerHeaders(): HeaderRule[] {
  return [
    {
      source: "/sw.js",
      headers: [
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
      ],
    },
  ];
}
`````

- [ ] **Step 4: `next.config.ts`를 헤더 규칙을 내보내게 바꾼다**

`next.config.ts`를 아래 내용으로 통째로 바꾼다. (`headers.test.ts`의 마지막 테스트가 이 파일을 실제로 불러서 확인한다.)

**`next.config.ts`**

`````ts
import type { NextConfig } from "next";
import { serviceWorkerHeaders } from "./src/lib/pwa/headers";

const nextConfig: NextConfig = {
  async headers() {
    return serviceWorkerHeaders();
  },
};

export default nextConfig;
`````

- [ ] **Step 5: 아이콘을 만든다**

이미지 파일을 저장소에 넣지 않고 코드로 만든다. 이 라우트들은 Vitest에서 다루기 어려운 `next/og`를 쓰므로 Task 10에서 진짜 서버로 PNG 크기를 확인한다.

**`src/lib/pwa/icon.tsx`**

`````tsx
import { ImageResponse } from "next/og";

/**
 * 앱 아이콘(PNG)을 코드로 만든다. 별도 이미지 파일을 저장소에 넣지 않아도 된다.
 * 글자를 화면의 60%로 가운데에 두어서, 안드로이드가 아이콘을 둥글게 잘라도(maskable) 잘리지 않는다.
 */
export function iconResponse(size: number): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1f2328",
          color: "#ffffff",
          fontSize: Math.round(size * 0.6),
          fontWeight: 700,
        }}
      >
        D
      </div>
    ),
    { width: size, height: size },
  );
}
`````

**`src/app/icon-192.png/route.tsx`**

`````tsx
import { iconResponse } from "@/lib/pwa/icon";

export function GET() {
  return iconResponse(192);
}
`````

**`src/app/icon-512.png/route.tsx`**

`````tsx
import { iconResponse } from "@/lib/pwa/icon";

export function GET() {
  return iconResponse(512);
}
`````

**`src/app/apple-icon.png/route.tsx`**

`````tsx
import { iconResponse } from "@/lib/pwa/icon";

// iOS 홈 화면 아이콘은 180x180이다.
export function GET() {
  return iconResponse(180);
}
`````

- [ ] **Step 6: 레이아웃에 홈 화면 설정을 넣는다**

`src/app/layout.tsx`에서 다음을 찾아서

`````tsx
  description: "GitHub develop 브랜치의 문서를 읽기 전용으로 보여줍니다.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };
`````

이렇게 바꾼다.

`````tsx
  description: "GitHub develop 브랜치의 문서를 읽기 전용으로 보여줍니다.",
  // 홈 화면에 추가했을 때의 이름과 아이콘. manifest 링크는 app/manifest.ts에서 자동으로 붙는다.
  appleWebApp: { capable: true, title: "문서", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-icon.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1f2328" };
`````

- [ ] **Step 7: 통과를 확인하고 커밋한다**

Run: `npx vitest run src/lib/push/sw.test.ts src/app/manifest.test.ts src/lib/pwa/headers.test.ts`
Expected: PASS (7 + 3 + 3 = 13 tests)

```bash
npm test
npm run typecheck
npm run lint
git add public/sw.js next.config.ts src/app src/lib/pwa src/lib/push/sw.test.ts
git commit -m "feat: add service worker, web app manifest, generated icons, and worker headers"
```

Expected: 26개 파일 189개 테스트 통과, 타입 오류와 린트 오류 없음.

---

### Task 9: 알림 UI (종 아이콘과 구독 로직)

**Files:**
- Create: `src/lib/push/client-state.ts`, `src/lib/push/client.ts`, `src/components/NotificationBell.tsx`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`
- Test: `src/lib/push/client-state.test.ts`, `src/lib/push/client.test.ts`

**Interfaces:**
- Produces:
  - `type PushEnv = { userAgent; maxTouchPoints; standalone; hasServiceWorker; hasPushManager; hasNotification; permission }`, `type PushSupport = "unsupported" | "ios-needs-install" | "denied" | "ready"`
  - `detectPushSupport(env): PushSupport` — iPhone/iPad(iPadOS 13 이상은 Mac처럼 보이는 user agent에 터치 지원)이면서 standalone이 아니면 **API가 없어도** `ios-needs-install`이 먼저다. 그 다음 필요한 API가 없으면 `unsupported`, 권한이 `denied`면 `denied`, 아니면 `ready`.
  - `urlBase64ToUint8Array(base64): Uint8Array<ArrayBuffer>` — VAPID 공개키(base64url)를 바이트로.
  - `client.ts`(브라우저 API를 `PushClientDeps`로 주입받음): `currentSubscription(deps)`, `subscribe(deps): Promise<SubscribeResult>`, `unsubscribe(deps)`. `subscribe`는 **권한을 가장 먼저** 묻고(사용자 동작에 대한 응답이어야 함), 서비스 워커를 등록해 `userVisibleOnly: true`로 구독한 뒤 서버에 저장한다. 서버가 거절하면(예: 429) 브라우저 구독도 되돌리고 서버가 준 이유를 돌려준다. `unsubscribe`는 브라우저 구독을 먼저 끊고 서버 삭제 실패는 넘어간다(남은 구독은 다음 발송 때 404/410으로 알려져 서버가 지운다).
  - `NotificationBell` — 헤더의 종 아이콘(`🔕`/`🔔`)과 패널. 상태별 안내: 지원 안 함, iPhone 홈 화면 추가 안내, 차단됨, "알림 받기"/"알림 끄기", 서버 오류 문구. `NEXT_PUBLIC_VAPID_PUBLIC_KEY`가 없으면 "알림 설정이 아직 준비되지 않았어요."

`client.ts`는 브라우저 API를 직접 쓰지 않고 주입받아서, 진짜 브라우저 없이 가짜로 흐름을 시험한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/push/client-state.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { detectPushSupport, urlBase64ToUint8Array, type PushEnv } from "./client-state";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36";
const DESKTOP_MAC = IPAD_AS_MAC;

const supported: PushEnv = {
  userAgent: ANDROID,
  maxTouchPoints: 5,
  standalone: false,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: "default",
};
const env = (overrides: Partial<PushEnv>): PushEnv => ({ ...supported, ...overrides });

describe("detectPushSupport", () => {
  it("모든 API가 있고 권한이 아직 결정되지 않았으면 ready", () => {
    expect(detectPushSupport(supported)).toBe("ready");
    expect(detectPushSupport(env({ permission: "granted" }))).toBe("ready");
  });

  it("사용자가 차단했으면 denied", () => {
    expect(detectPushSupport(env({ permission: "denied" }))).toBe("denied");
  });

  it("필요한 API가 하나라도 없으면 unsupported", () => {
    expect(detectPushSupport(env({ hasServiceWorker: false }))).toBe("unsupported");
    expect(detectPushSupport(env({ hasPushManager: false }))).toBe("unsupported");
    expect(detectPushSupport(env({ hasNotification: false }))).toBe("unsupported");
  });

  it("iPhone의 Safari 탭(홈 화면에 추가하지 않음)은 API가 없어도 '홈 화면에 추가' 안내가 먼저다", () => {
    const safariTab = env({
      userAgent: IPHONE,
      hasPushManager: false,
      hasNotification: false,
      permission: "unsupported",
    });
    expect(detectPushSupport(safariTab)).toBe("ios-needs-install");
  });

  it("iPad(Mac처럼 보이는 user agent + 터치)도 iOS로 본다", () => {
    expect(detectPushSupport(env({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 }))).toBe("ios-needs-install");
  });

  it("터치가 없는 진짜 Mac은 iOS가 아니다", () => {
    expect(detectPushSupport(env({ userAgent: DESKTOP_MAC, maxTouchPoints: 0 }))).toBe("ready");
  });

  it("iPhone에서 홈 화면에 추가한 앱(standalone)으로 열면 일반 판별로 넘어간다", () => {
    expect(detectPushSupport(env({ userAgent: IPHONE, standalone: true }))).toBe("ready");
    expect(detectPushSupport(env({ userAgent: IPHONE, standalone: true, permission: "denied" }))).toBe("denied");
  });
});

describe("urlBase64ToUint8Array", () => {
  it("패딩이 없는 base64url을 바이트로 바꾼다", () => {
    // "hello?>" = aGVsbG8/Pg== (표준 base64) → base64url은 aGVsbG8_Pg (패딩 없음, /가 _로)
    expect(Array.from(urlBase64ToUint8Array("aGVsbG8_Pg"))).toEqual([104, 101, 108, 108, 111, 63, 62]);
  });

  it("- 와 _ 를 + 와 / 로 되돌려서 읽는다", () => {
    // 바이트 [251, 255, 190]은 표준 base64로 "+/++", base64url로 "-_--"
    expect(Array.from(urlBase64ToUint8Array("-_--"))).toEqual([251, 255, 190]);
  });

  it("실제 VAPID 공개키(87자)는 65바이트가 되고 첫 바이트는 0x04(비압축 P-256)다", () => {
    const key = "BBpuX8Dc27tDCRJZGNdF_r3i8PXVBddskKblLrI8KR7PPHoCx4aYwvE7jjz97Spr5KJeo_me8wNk1mqf-QrT2sg";
    const bytes = urlBase64ToUint8Array(key);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });

  it("빈 문자열은 빈 바이트", () => {
    expect(urlBase64ToUint8Array("")).toHaveLength(0);
  });
});
`````

**`src/lib/push/client.test.ts`**

`````ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentSubscription,
  subscribe,
  unsubscribe,
  type PushClientDeps,
  type RegistrationLike,
  type SubscriptionLike,
} from "./client";

type SubscribeOptions = Parameters<RegistrationLike["pushManager"]["subscribe"]>[0];

const KEY = "BBpuX8Dc27tDCRJZGNdF_r3i8PXVBddskKblLrI8KR7PPHoCx4aYwvE7jjz97Spr5KJeo_me8wNk1mqf-QrT2sg";
const sub = (): SubscriptionLike & { unsubscribe: ReturnType<typeof vi.fn> } => ({
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "P", auth: "A" } }),
  unsubscribe: vi.fn(async () => true),
});

function setup(overrides: Partial<PushClientDeps> = {}) {
  const calls: string[] = [];
  const fetchRequests: { url: string; init: RequestInit | undefined }[] = [];
  const subscribeOptions: SubscribeOptions[] = [];
  const subscription = sub();
  const pushManager = {
    getSubscription: vi.fn(async () => null as SubscriptionLike | null),
    subscribe: vi.fn(async (options: SubscribeOptions) => {
      calls.push("subscribe");
      subscribeOptions.push(options);
      return subscription;
    }),
  };
  const register = vi.fn(async () => {
    calls.push("register");
  });
  const requestPermission = vi.fn(async (): Promise<NotificationPermission> => {
    calls.push("permission");
    return "granted";
  });
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push("fetch");
    fetchRequests.push({ url: String(input), init });
    return new Response(JSON.stringify({ ok: true }), { status: 201 });
  });
  const deps: PushClientDeps = {
    publicKey: KEY,
    serviceWorker: { register, ready: Promise.resolve({ pushManager }) },
    requestPermission,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    ...overrides,
  };
  return {
    deps,
    calls,
    fetchRequests,
    subscribeOptions,
    subscription,
    pushManager,
    register,
    requestPermission,
    fetchImpl,
  };
}

describe("subscribe", () => {
  it("권한을 가장 먼저 묻고, 서비스 워커를 등록해 구독한 뒤 서버에 저장한다", async () => {
    const { deps, calls, subscribeOptions, register, fetchRequests } = setup();

    expect(await subscribe(deps)).toEqual({ ok: true });

    expect(calls).toEqual(["permission", "register", "subscribe", "fetch"]);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
    expect(subscribeOptions).toHaveLength(1);
    expect(subscribeOptions[0].userVisibleOnly).toBe(true);
    expect(subscribeOptions[0].applicationServerKey).toHaveLength(65);

    const { url, init } = fetchRequests[0];
    expect(url).toBe("/api/push/subscriptions");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(init?.body))).toEqual({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: "P", auth: "A" },
    });
  });

  it("권한이 허용되지 않으면 서비스 워커도 구독도 서버 호출도 하지 않는다", async () => {
    for (const permission of ["denied", "default"] as const) {
      const { deps, calls } = setup({ requestPermission: async () => permission });
      const result = await subscribe(deps);
      expect(result).toMatchObject({ ok: false, reason: "denied" });
      expect(calls, permission).toEqual([]);
    }
  });

  it("서버가 거절하면(예: 429) 브라우저 구독도 되돌리고 서버가 준 이유를 알려준다", async () => {
    const { deps, subscription } = setup({
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: "구독할 수 있는 기기 수를 넘었어요." }), { status: 429 })) as typeof fetch,
    });

    const result = await subscribe(deps);

    expect(result).toEqual({ ok: false, reason: "server", message: "구독할 수 있는 기기 수를 넘었어요." });
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it("서버 응답 본문이 JSON이 아니어도 기본 문구로 되돌린다", async () => {
    const { deps, subscription } = setup({ fetchImpl: (async () => new Response("oops", { status: 500 })) as typeof fetch });
    const result = await subscribe(deps);
    expect(result).toMatchObject({ ok: false, reason: "server", message: "서버에 알림을 등록하지 못했어요." });
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it("네트워크 오류나 구독 실패는 던지지 않고 error로 돌려준다", async () => {
    const network = setup({ fetchImpl: (async () => { throw new Error("offline"); }) as typeof fetch });
    expect(await subscribe(network.deps)).toEqual({ ok: false, reason: "error", message: "offline" });
    expect(network.subscription.unsubscribe).not.toHaveBeenCalled(); // 구독은 살아 있지만 서버에 없다. 다시 누르면 저장된다.

    const broken = setup();
    broken.pushManager.subscribe.mockRejectedValue(new Error("push service error"));
    expect(await subscribe(broken.deps)).toEqual({ ok: false, reason: "error", message: "push service error" });
  });
});

describe("currentSubscription", () => {
  it("서비스 워커를 등록하고 현재 구독을 돌려준다(없으면 null)", async () => {
    const { deps, pushManager, register } = setup();
    expect(await currentSubscription(deps)).toBeNull();
    expect(register).toHaveBeenCalledOnce();

    const existing = sub();
    pushManager.getSubscription.mockResolvedValue(existing);
    expect(await currentSubscription(deps)).toBe(existing);
  });
});

describe("unsubscribe", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("구독이 없으면 서버를 부르지 않고 성공이다", async () => {
    expect(await unsubscribe(ctx.deps)).toEqual({ ok: true });
    expect(ctx.fetchImpl).not.toHaveBeenCalled();
  });

  it("브라우저 구독을 끊고 서버에 삭제를 요청한다", async () => {
    const existing = sub();
    ctx.pushManager.getSubscription.mockResolvedValue(existing);

    expect(await unsubscribe(ctx.deps)).toEqual({ ok: true });

    expect(existing.unsubscribe).toHaveBeenCalledOnce();
    const { url, init } = ctx.fetchRequests[0];
    expect(url).toBe("/api/push/subscriptions");
    expect(init?.method).toBe("DELETE");
    expect(JSON.parse(String(init?.body))).toEqual({ endpoint: existing.endpoint });
  });

  it("서버 삭제가 실패해도 브라우저 구독은 이미 끊었으니 성공으로 본다", async () => {
    const existing = sub();
    ctx.pushManager.getSubscription.mockResolvedValue(existing);
    const deps = { ...ctx.deps, fetchImpl: (async () => { throw new Error("offline"); }) as typeof fetch };
    expect(await unsubscribe(deps)).toEqual({ ok: true });
    expect(existing.unsubscribe).toHaveBeenCalledOnce();
  });

  it("브라우저 구독을 끊지 못하면 실패를 알린다", async () => {
    const existing = sub();
    existing.unsubscribe.mockRejectedValue(new Error("cannot"));
    ctx.pushManager.getSubscription.mockResolvedValue(existing);
    expect(await unsubscribe(ctx.deps)).toEqual({ ok: false, message: "cannot" });
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/push/client-state.test.ts src/lib/push/client.test.ts`
Expected: FAIL — `./client-state` 또는 `./client`를 찾을 수 없다는 오류.

- [ ] **Step 3: 구독 로직을 구현한다**

**`src/lib/push/client-state.ts`**

`````ts
export type PushEnv = {
  userAgent: string;
  maxTouchPoints: number;
  /** 홈 화면에 추가한 앱(standalone)으로 열렸는지 */
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  permission: NotificationPermission | "unsupported";
};

/**
 * - unsupported: 이 브라우저는 웹 푸시를 지원하지 않는다.
 * - ios-needs-install: iPhone/iPad의 Safari 탭에서는 알림을 받을 수 없고, 홈 화면에 추가한 앱에서만 된다.
 * - denied: 사용자가 알림을 차단했다. 사이트에서 다시 물어볼 수 없다.
 * - ready: 구독할 수 있다.
 */
export type PushSupport = "unsupported" | "ios-needs-install" | "denied" | "ready";

function isIos(env: Pick<PushEnv, "userAgent" | "maxTouchPoints">): boolean {
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return true;
  // iPadOS 13 이상은 Mac처럼 보이는 user agent를 보내므로 터치 지원으로 구분한다.
  return /Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1;
}

export function detectPushSupport(env: PushEnv): PushSupport {
  // iOS의 Safari 탭에는 PushManager 자체가 없어서, 지원 여부보다 먼저 "홈 화면에 추가"를 안내해야 한다.
  if (isIos(env) && !env.standalone) return "ios-needs-install";
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return "unsupported";
  if (env.permission === "denied") return "denied";
  return "ready";
}

/** VAPID 공개키(base64url 문자열)를 `pushManager.subscribe`가 받는 바이트로 바꾼다. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
`````

**`src/lib/push/client.ts`**

`````ts
import { urlBase64ToUint8Array } from "./client-state";

/** 브라우저의 PushSubscription 중 우리가 쓰는 부분 */
export type SubscriptionLike = {
  endpoint: string;
  toJSON(): unknown;
  unsubscribe(): Promise<boolean>;
};

export type RegistrationLike = {
  pushManager: {
    getSubscription(): Promise<SubscriptionLike | null>;
    subscribe(options: {
      userVisibleOnly: true;
      applicationServerKey: Uint8Array<ArrayBuffer>;
    }): Promise<SubscriptionLike>;
  };
};

/** 브라우저 API를 주입받아서, 진짜 브라우저 없이도 구독 흐름을 시험할 수 있게 한다. */
export type PushClientDeps = {
  publicKey: string;
  serviceWorker: {
    register(url: string, options: { scope: string; updateViaCache: "none" }): Promise<unknown>;
    ready: Promise<RegistrationLike>;
  };
  requestPermission(): Promise<NotificationPermission>;
  fetchImpl: typeof fetch;
};

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: "denied" | "server" | "error"; message: string };

const API = "/api/push/subscriptions";
const JSON_HEADERS = { "content-type": "application/json" };

async function registration(deps: PushClientDeps): Promise<RegistrationLike> {
  await deps.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return deps.serviceWorker.ready;
}

/** 지금 이 기기에 구독이 있는지. 서비스 워커도 이때 등록한다. */
export async function currentSubscription(deps: PushClientDeps): Promise<SubscriptionLike | null> {
  return (await registration(deps)).pushManager.getSubscription();
}

/**
 * 알림 구독. 사용자가 버튼을 누른 직후에 불러야 한다(권한 요청은 사용자 동작에 대한 응답이어야 하고,
 * 그래서 다른 비동기 작업보다 먼저 권한부터 묻는다).
 * 서버에 저장하지 못하면 브라우저 쪽 구독도 되돌려서, 알림을 받는다고 착각하지 않게 한다.
 */
export async function subscribe(deps: PushClientDeps): Promise<SubscribeResult> {
  try {
    const permission = await deps.requestPermission();
    if (permission !== "granted") {
      return { ok: false, reason: "denied", message: "알림 권한이 허용되지 않았어요." };
    }

    const { pushManager } = await registration(deps);
    const subscription = await pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(deps.publicKey),
    });

    const response = await deps.fetchImpl(API, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!response.ok) {
      await subscription.unsubscribe().catch(() => undefined);
      const detail = (await response.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, reason: "server", message: detail?.error ?? "서버에 알림을 등록하지 못했어요." };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: "error",
      message: error instanceof Error ? error.message : "알림을 켜지 못했어요.",
    };
  }
}

/**
 * 알림 해제. 브라우저 구독을 먼저 끊고, 서버 삭제는 실패해도 넘어간다
 * (남은 구독은 다음 발송 때 푸시 서비스가 404/410으로 알려 줘서 서버가 지운다).
 */
export async function unsubscribe(deps: PushClientDeps): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const subscription = await currentSubscription(deps);
    if (!subscription) return { ok: true };

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await deps
      .fetchImpl(API, { method: "DELETE", headers: JSON_HEADERS, body: JSON.stringify({ endpoint }) })
      .catch(() => undefined);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "알림을 끄지 못했어요." };
  }
}
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/push/client-state.test.ts src/lib/push/client.test.ts`
Expected: PASS (11 + 10 = 21 tests)

- [ ] **Step 5: 종 아이콘 컴포넌트를 만든다**

권한 팝업을 닫아서 권한이 아직 "결정 안 됨"으로 돌아오면 그 이유를 문구로 보여준다(차단하면 패널이 "차단됨" 안내로 바뀐다).

**`src/components/NotificationBell.tsx`**

`````tsx
"use client";

import { useEffect, useId, useState } from "react";
import { currentSubscription, subscribe, unsubscribe, type PushClientDeps, type RegistrationLike } from "@/lib/push/client";
import { detectPushSupport, type PushEnv, type PushSupport } from "@/lib/push/client-state";

// 빌드할 때 값이 코드에 들어간다. 비어 있으면 알림 설정이 준비되지 않은 것이다.
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function readEnv(): PushEnv {
  const hasNotification = "Notification" in window;
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification,
    permission: hasNotification ? Notification.permission : "unsupported",
  };
}

function browserDeps(): PushClientDeps {
  return {
    publicKey: PUBLIC_KEY,
    serviceWorker: {
      register: (url, options) => navigator.serviceWorker.register(url, options),
      ready: navigator.serviceWorker.ready as Promise<RegistrationLike>,
    },
    requestPermission: () => Notification.requestPermission(),
    fetchImpl: (input, init) => fetch(input, init),
  };
}

type State = { support: PushSupport | "loading"; subscribed: boolean; busy: boolean; error: string | null };

export function NotificationBell() {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ support: "loading", subscribed: false, busy: false, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const support = detectPushSupport(readEnv());
      const subscribed = support === "ready" && PUBLIC_KEY ? Boolean(await currentSubscription(browserDeps()).catch(() => null)) : false;
      if (!cancelled) setState((s) => ({ ...s, support, subscribed }));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function turnOn() {
    setState((s) => ({ ...s, busy: true, error: null }));
    const result = await subscribe(browserDeps());
    setState((s) => ({
      ...s,
      busy: false,
      subscribed: result.ok,
      // 권한을 차단하면 패널이 "차단됨" 안내로 바뀌고, 팝업만 닫았다면(아직 결정 안 함) 이유를 문구로 알려준다.
      support: !result.ok && result.reason === "denied" ? detectPushSupport(readEnv()) : s.support,
      error: result.ok ? null : result.message,
    }));
  }

  async function turnOff() {
    setState((s) => ({ ...s, busy: true, error: null }));
    const result = await unsubscribe(browserDeps());
    setState((s) => ({ ...s, busy: false, subscribed: !result.ok, error: result.ok ? null : result.message }));
  }

  return (
    <div className="notify">
      <button
        type="button"
        className="notify-button"
        aria-label="알림 설정"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{state.subscribed ? "🔔" : "🔕"}</span>
      </button>
      {open && (
        <section id={panelId} className="notify-panel" aria-label="알림 설정">
          <Panel state={state} onTurnOn={turnOn} onTurnOff={turnOff} />
        </section>
      )}
    </div>
  );
}

function Panel({ state, onTurnOn, onTurnOff }: { state: State; onTurnOn: () => void; onTurnOff: () => void }) {
  if (state.support === "loading") return <p>확인하는 중…</p>;
  if (state.support === "unsupported") return <p>이 브라우저는 푸시 알림을 지원하지 않아요.</p>;
  if (state.support === "ios-needs-install") {
    return (
      <p>
        iPhone·iPad에서는 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요. Safari의 <strong>공유 버튼 → 홈 화면에
        추가</strong>를 누른 뒤, 홈 화면의 앱으로 다시 열어 주세요.
      </p>
    );
  }
  if (state.support === "denied") {
    return <p>알림이 차단돼 있어요. 브라우저(또는 기기) 설정에서 이 사이트의 알림을 허용한 뒤 다시 열어 주세요.</p>;
  }
  if (!PUBLIC_KEY) return <p>알림 설정이 아직 준비되지 않았어요.</p>;

  return (
    <>
      <p>{state.subscribed ? "이 기기에서 알림을 받고 있어요." : "문서가 업데이트되면 알림을 받을 수 있어요."}</p>
      <button type="button" disabled={state.busy} onClick={state.subscribed ? onTurnOff : onTurnOn}>
        {state.busy ? "처리 중…" : state.subscribed ? "알림 끄기" : "알림 받기"}
      </button>
      {state.error && (
        <p className="notify-error" role="alert">
          {state.error}
        </p>
      )}
    </>
  );
}
`````

- [ ] **Step 6: 헤더에 종 아이콘을 넣는다**

`src/app/layout.tsx`에서 다음을 찾아서

`````tsx
import Link from "next/link";
import "./globals.css";
`````

이렇게 바꾼다.

`````tsx
import Link from "next/link";
import { NotificationBell } from "@/components/NotificationBell";
import "./globals.css";
`````

그리고 다음을 찾아서

`````tsx
            Docs Backoffice
          </Link>
        </header>
`````

이렇게 바꾼다.

`````tsx
            Docs Backoffice
          </Link>
          <NotificationBell />
        </header>
`````

- [ ] **Step 7: 스타일을 더한다**

`src/app/globals.css`에서 다음을 찾아서

`````css
.site-header {
  padding: 0.75rem 16px;
  border-bottom: 1px solid var(--border);
}

.site-title {
  color: var(--fg);
  font-weight: 700;
  text-decoration: none;
}
`````

이렇게 바꾼다.

`````css
.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 16px;
  border-bottom: 1px solid var(--border);
}

.site-title {
  color: var(--fg);
  font-weight: 700;
  text-decoration: none;
}

.notify {
  position: relative;
}

.notify-button {
  padding: 0.25rem 0.6rem;
  border: 0;
  background: transparent;
  font-size: 1.2rem;
  line-height: 1;
}

.notify-panel {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 10;
  width: min(20rem, calc(100vw - 32px));
  padding: 0.75rem 1rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  box-shadow: 0 4px 16px rgb(0 0 0 / 12%);
  font-size: 0.9rem;
  line-height: 1.5;
}

.notify-panel p {
  margin: 0 0 0.6rem;
}

.notify-error {
  color: #cf222e;
}
`````

- [ ] **Step 8: 전체 검사를 돌리고 커밋한다**

```bash
npm test
npm run typecheck
npm run lint
git add src
git commit -m "feat: add notification bell with device-aware subscribe flow"
```

Expected: 28개 파일 210개 테스트 통과, 타입 오류와 린트 오류 없음.

---

### Task 10: 운영 스크립트, 문서, 통합 확인

**Files:**
- Create: `scripts/send-test-push.ts`
- Modify: `scripts/simulate-webhook.sh`, `package.json`, `.env.example`, `README.md`, `docs/superpowers/specs/2026-09-30-docs-backoffice-design.md`

**Interfaces:**
- Produces: `npm run push:test -- "제목" "본문" ["/열-경로"]`(구독한 모든 기기에 시험 알림), `npm run vapid`(VAPID 키 한 쌍), 커밋 SHA를 받는 `scripts/simulate-webhook.sh`

이 작업의 앞부분은 문서와 스크립트, 뒷부분은 **진짜 프로덕션 서버**로 Task 2~9에서 단위 테스트로 다루지 못한 것(아이콘 이미지, manifest, 응답 헤더, 실제 API 응답, `after` 연결)을 확인한다.

- [ ] **Step 1: 시험 알림 스크립트를 만든다**

**`scripts/send-test-push.ts`**

`````ts
// 구독한 모든 기기에 시험 알림을 보낸다. 폰에서 알림이 오는지 확인할 때 쓴다.
// 사용법: npm run push:test -- "제목" "본문" ["/열-경로"]
import { createNeonDb } from "../src/lib/db/neon";
import { loadPushConfig } from "../src/lib/push/config";
import { createWebPushSender, sendToAll } from "../src/lib/push/send";

async function main(): Promise<void> {
  const config = loadPushConfig();
  if (!config.ok) {
    console.error(`푸시 설정이 부족해요: ${config.missing.join(", ")}`);
    process.exit(1);
  }

  const [title = "시험 알림", body = "이 알림이 보이면 푸시가 잘 동작하는 거예요.", url = "/"] = process.argv.slice(2);
  const db = createNeonDb(config.config.databaseUrl);
  const summary = await sendToAll(db, createWebPushSender(config.config.vapid), { title, body, url, tag: "test" });

  console.log(`구독 ${summary.total}개 중 발송 ${summary.sent}, 만료로 삭제 ${summary.removed}, 실패 ${summary.failed}`);
  if (summary.total === 0) console.log("구독한 기기가 없어요. 사이트에서 종 아이콘을 눌러 알림을 켜 주세요.");
}

main().catch((error) => {
  console.error("시험 알림을 보내지 못했어요:", error instanceof Error ? error.message : error);
  process.exit(1);
});
`````

`package.json`의 `"db:migrate"` 줄 바로 아래에 다음 두 줄을 더한다.

```json
    "push:test": "tsx --env-file-if-exists=.env.local scripts/send-test-push.ts",
    "vapid": "web-push generate-vapid-keys",
```

- [ ] **Step 2: webhook 흉내 스크립트가 커밋 SHA를 받게 한다**

같은 SHA를 두 번 보내면 두 번째는 알림이 가지 않는다는 것(중복 방지)을 직접 확인하려는 것이다. `scripts/simulate-webhook.sh`를 아래 내용으로 통째로 바꾼다.

**`scripts/simulate-webhook.sh`**

`````bash
#!/usr/bin/env bash
# GitHub이 보내는 것과 같은 서명이 붙은 push webhook 요청을 흉내 낸다.
#
# 사용법: scripts/simulate-webhook.sh <서버 주소> <비밀키> [ref] [바뀐 문서 경로] [커밋 SHA]
# 예:     scripts/simulate-webhook.sh http://localhost:3112 test-secret
#         scripts/simulate-webhook.sh http://localhost:3112 test-secret refs/heads/feature/x
#         scripts/simulate-webhook.sh http://localhost:3112 test-secret refs/heads/develop frontend/docs/plan/m0-scaffolding.md same-sha
#
# 커밋 SHA를 생략하면 실행할 때마다 새 값을 쓴다(그래서 알림이 매번 간다).
# 같은 SHA로 두 번 보내면 두 번째는 알림이 가지 않는다(GitHub 수동 재전송과 같은 상황).
set -euo pipefail

BASE="${1:?서버 주소를 넣어 주세요. 예: http://localhost:3112}"
SECRET="${2:?webhook 비밀키를 넣어 주세요}"
REF="${3:-refs/heads/develop}"
FILE="${4:-frontend/docs/plan/m0-scaffolding.md}"
SHA="${5:-sim-$(date +%s)-$RANDOM}"

BODY=$(printf '{"ref":"%s","after":"%s","commits":[{"modified":["%s"]}]}' "$REF" "$SHA" "$FILE")
SIGNATURE="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')"

curl -sS -w '\nHTTP %{http_code}\n' -X POST "$BASE/api/github-webhook" \
  -H 'content-type: application/json' \
  -H 'x-github-event: push' \
  -H "x-hub-signature-256: $SIGNATURE" \
  --data-binary "$BODY"
`````

- [ ] **Step 3: 설정 예시를 채운다**

`.env.example` 끝의 `GITHUB_WEBHOOK_SECRET=` 줄 뒤에 다음을 덧붙인다.

`````dotenv

# ---- 푸시 알림 (아래 네 개가 모두 있어야 알림이 동작한다. 없어도 문서 화면과 webhook은 그대로 동작한다.) ----

# Neon Postgres 연결 문자열. Vercel에서 Neon을 연결하면 자동으로 들어간다.
DATABASE_URL=

# 웹 푸시(VAPID) 키. `npm run vapid`로 한 쌍을 만든다. 공개키는 브라우저에 노출돼도 되고, 비공개키는 비밀이다.
# 공개키는 빌드할 때 코드에 들어가므로, 바꾸면 다시 배포해야 하고 기존 구독은 모두 다시 받아야 한다.
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# 푸시 서비스가 문제가 있을 때 연락할 주소. "mailto:이메일" 또는 "https://주소" 형식이어야 한다.
VAPID_SUBJECT=
`````

- [ ] **Step 4: README에 푸시 알림 안내를 넣는다**

`README.md`에서 다음을 찾아서

`````markdown
| `GITHUB_WEBHOOK_SECRET` | webhook 서명 비밀키. 저장소 webhook 설정에 넣은 값과 같아야 한다 |

## 명령

```bash
npm test            # 단위 테스트
npm run typecheck   # 타입 검사
npm run lint        # 린트
npm run build       # 프로덕션 빌드
```
`````

이렇게 바꾼다.

`````markdown
| `GITHUB_WEBHOOK_SECRET` | webhook 서명 비밀키. 저장소 webhook 설정에 넣은 값과 같아야 한다 |
| `DATABASE_URL` | Neon Postgres 연결 문자열 (푸시 알림) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | 웹 푸시 VAPID 키 한 쌍 (푸시 알림) |
| `VAPID_SUBJECT` | `mailto:이메일` 또는 `https://주소` (푸시 알림) |

## 명령

```bash
npm test            # 단위 테스트
npm run typecheck   # 타입 검사
npm run lint        # 린트
npm run build       # 프로덕션 빌드
npm run vapid       # 푸시 알림용 VAPID 키 한 쌍 만들기
npm run db:migrate  # Neon에 마이그레이션 적용 (DATABASE_URL 필요, 여러 번 실행해도 안전)
npm run push:test -- "제목" "본문"   # 구독한 모든 기기에 시험 알림 보내기
```
`````

그리고 다음을 찾아서

`````markdown
## 구조

- `src/lib/transform/`: 문서를 화면용 데이터로 바꾸는 순수 함수 (frontmatter, 위키링크, 링크 다시 쓰기, sanitize, Excalidraw 추출)
- `src/lib/github/`: GitHub API 클라이언트와 파일 트리 도우미
- `src/lib/webhook/`: 서명 검증과 이벤트 판단
- `src/app/`: 문서 목록(`/`), 문서 상세(`/docs/...`), webhook 엔드포인트(`/api/github-webhook`)
`````

이렇게 바꾼다.

`````markdown
## 푸시 알림 설정

`develop`에서 표시 대상 문서가 바뀌면 구독한 기기에 알림을 보냅니다. 로그인이 없어서 누구나 종 아이콘으로 구독할 수 있습니다(구독은 최대 100대).

1. Neon Postgres를 만들고 연결 문자열을 `DATABASE_URL`에 넣습니다. (Vercel에서는 Marketplace의 Neon을 프로젝트에 연결하면 환경변수가 자동으로 들어갑니다.)
2. `npm run vapid`로 키 한 쌍을 만들어 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`에 넣고, `VAPID_SUBJECT`(예: `mailto:me@example.com`)도 채웁니다.
3. `npm run db:migrate`로 테이블을 만듭니다.
4. 사이트를 열고 헤더의 종 아이콘 → "알림 받기"를 누릅니다. `npm run push:test`로 알림이 오는지 확인합니다.

- **iPhone·iPad**는 Safari의 공유 버튼 → **홈 화면에 추가**로 설치한 앱에서만 알림을 받을 수 있습니다(iOS 16.4 이상).
- **개발 중에는** 서비스 워커와 푸시가 `http://localhost`에서도 동작합니다. 폰에서 확인하려면 HTTPS 주소(배포)가 필요합니다.
- 알림에 필요한 환경변수가 하나라도 없으면 알림만 건너뛰고, 문서 화면과 webhook 처리는 그대로 동작합니다(서버 로그에 무엇이 빠졌는지 남습니다).
- 문서가 바뀐 push는 GitHub이 같은 이벤트를 다시 보내도(수동 재전송) 알림이 한 번만 갑니다.
- 알림 문구는 문서 제목 대신 **파일 이름**을 씁니다(제목을 얻으려면 GitHub 호출이 더 필요해서 webhook 처리가 느려집니다).

## 구조

- `src/lib/transform/`: 문서를 화면용 데이터로 바꾸는 순수 함수 (frontmatter, 위키링크, 링크 다시 쓰기, sanitize, Excalidraw 추출)
- `src/lib/github/`: GitHub API 클라이언트와 파일 트리 도우미
- `src/lib/webhook/`: 서명 검증과 이벤트 판단
- `src/lib/db/`: 데이터베이스 연결(Neon), 마이그레이션 실행기, 테스트용 메모리 Postgres. 마이그레이션 SQL은 `db/migrations/`
- `src/lib/push/`: 구독 검증과 저장, 알림 문구와 발송, 브라우저 쪽 구독 로직
- `public/sw.js`: 알림을 화면에 띄우는 서비스 워커
- `src/app/`: 문서 목록(`/`), 문서 상세(`/docs/...`), webhook(`/api/github-webhook`), 구독 API(`/api/push/subscriptions`), 앱 설명(`/manifest.webmanifest`)과 아이콘
`````

- [ ] **Step 5: 스펙에 달라진 점을 반영한다**

`docs/superpowers/specs/2026-09-30-docs-backoffice-design.md`에서 세 곳을 고친다.

(1) 5.3의 4번 끝을 찾아서

`````text
응답을 먼저 돌려주고 발송은 뒤에서 처리한다. (Vercel에서의 구체적 방식은 구현 계획 단계에서 공식 문서로 확인)
`````

이렇게 바꾼다.

`````text
`after`(`next/server`, Next.js 15.1부터 정식)로 응답 뒤에 발송한다. Vercel에서는 `waitUntil`로 구현되어 응답이 끝난 뒤에도 함수의 최대 실행 시간까지 작업이 이어진다.
`````

(2) 5.4의 문구 항목을 찾아서

`````text
- 문서 갱신 알림 문구는 "문서가 업데이트됐어요"에 바뀐 문서 제목 몇 개를 붙인다. push 페이로드의 커밋 목록이 잘리면 제목 없이 문구만 보낸다. 열 주소는 `/`.
`````

이렇게 바꾼다.

`````text
- 문서 갱신 알림 문구는 "문서가 업데이트됐어요"에 바뀐 문서의 **파일 이름** 세 개까지를 붙이고 나머지는 "외 N건"으로 줄인다(제목을 얻으려면 문서마다 GitHub 호출이 더 필요해서 webhook 처리가 느려진다). 파일 이름은 40자, 주소는 500자로 제한한다. 한 문서만 바뀌었으면 그 문서를, 여러 개면 `/`를 연다.
`````

(3) 5.5의 구독 항목을 찾아서

`````text
- 알림 구독은 로그인이 없으므로 누구나 할 수 있다. 문서가 공개 저장소 내용이므로 수용하고, 구독 요청은 형식만 검증한다.
`````

이렇게 바꾼다.

`````text
- 알림 구독은 로그인이 없으므로 누구나 할 수 있다. 문서가 공개 저장소 내용이므로 수용하되, 구독 주소(endpoint)는 실제 푸시 서비스(FCM, Mozilla, Apple, Windows)의 주소만 허용하고(서버가 그 주소로 요청을 보내므로 아무 주소나 받으면 SSRF가 된다), 키 형식을 검증하고, 구독은 최대 100대로 제한한다.
`````

그리고 10번 "구현 전 확인 항목"의 5번을 찾아서

`````text
5. Vercel에서 응답 후 알림을 발송하는 방식.
`````

이렇게 바꾼다.

`````text
5. (확인 완료) Vercel에서 응답 후 알림을 발송하는 방식은 `after`(Next.js 15.1부터 정식)를 쓴다. Vercel에서는 `waitUntil`로 구현되어 응답 뒤에도 최대 실행 시간까지 이어진다.
`````

- [ ] **Step 6: 진짜 프로덕션 서버로 아이콘, manifest, 헤더, API를 확인한다**

`DATABASE_URL` 등 알림 환경변수는 일부러 넣지 않는다(설정이 없을 때의 동작을 확인하려는 것이다). 공개키만 빌드에 넣는다.

```bash
export GITHUB_REPO=kakaotechcampus-4/ktc4-kyungpook-3 GITHUB_BRANCH=develop DOCS_PATHS=frontend/docs/plan GITHUB_WEBHOOK_SECRET=test-secret
export NEXT_PUBLIC_VAPID_PUBLIC_KEY=BBpuX8Dc27tDCRJZGNdF_r3i8PXVBddskKblLrI8KR7PPHoCx4aYwvE7jjz97Spr5KJeo_me8wNk1mqf-QrT2sg
npm run build
npm run start -- -p 3114
```

Expected: 빌드 결과에 `/api/push/subscriptions`, `/apple-icon.png`, `/icon-192.png`, `/icon-512.png`, `/manifest.webmanifest`가 추가로 나온다. 서버는 다른 터미널에서 다음을 확인하는 동안 계속 둔다.

```bash
B=http://localhost:3114

# 아이콘: PNG이고 크기가 맞는지 (PNG 헤더의 가로·세로)
for f in icon-192.png icon-512.png apple-icon.png; do
  node -e "fetch('$B/$f').then(async r => { const b = new DataView(await r.arrayBuffer()); console.log('$f', r.status, r.headers.get('content-type'), b.getUint32(16) + 'x' + b.getUint32(20)); })"
done

# manifest, 홈 화면 앱 태그, 서비스 워커 헤더
curl -s "$B/manifest.webmanifest"
curl -s "$B/" | grep -oE '<link rel="manifest"[^>]*>|<meta name="mobile-web-app-capable"[^>]*>|<link rel="apple-touch-icon"[^>]*>'
curl -sI "$B/sw.js" | grep -iE "^HTTP|content-type|cache-control|content-security-policy"

# 구독 API (DB가 없는 상태)
SUB='{"endpoint":"https://fcm.googleapis.com/fcm/send/abc","keys":{"p256dh":"'$(printf 'B%.0s' {1..87})'","auth":"'$(printf 'a%.0s' {1..22})'"}}'
curl -s -w " -> %{http_code}\n" -X POST "$B/api/push/subscriptions" -H "content-type: application/json" -d "$SUB"
curl -s -w " -> %{http_code}\n" -X POST "$B/api/push/subscriptions" -H "content-type: application/json" -d '{"endpoint":"https://169.254.169.254/x","keys":{}}'
curl -s -w " -> %{http_code}\n" -X POST "$B/api/push/subscriptions" -H "content-type: text/plain" -d "$SUB"
curl -s -w " -> %{http_code}\n" -X DELETE "$B/api/push/subscriptions" -H "content-type: application/json" -d '{"endpoint":"https://fcm.googleapis.com/fcm/send/abc"}'
```

Expected:
- 아이콘 세 개가 `200 image/png`이고 크기가 `192x192`, `512x512`, `180x180`이다.
- manifest에 `"display":"standalone"`, `"start_url":"/"`, 아이콘 3개가 있다. 홈 HTML에 `rel="manifest"`, `mobile-web-app-capable`, `apple-touch-icon`이 있다.
- `/sw.js` 응답이 `200`, `application/javascript; charset=utf-8`, `no-cache, no-store, must-revalidate`, `default-src 'self'; script-src 'self'`이다.
- 구독 API: 올바른 요청은 **503**(알림 저장소가 설정되지 않았어요), 내부 주소는 **400**(허용되지 않는 푸시 주소예요), `text/plain`은 **415**, 삭제도 **503**이다.

- [ ] **Step 7: webhook 뒤에 알림 단계가 도는지 확인한다**

```bash
scripts/simulate-webhook.sh http://localhost:3114 test-secret
scripts/simulate-webhook.sh http://localhost:3114 test-secret refs/heads/feature/x
```

Expected: 첫 요청은 `{"revalidated":true,"changedDocs":1}` `HTTP 200`이고, **서버 콘솔(로그)** 에 `푸시 알림 설정이 없어서 알림을 건너뛰어요: DATABASE_URL, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: 또는 https://로 시작)`가 남는다(응답 뒤에 `after`가 실행됐다는 뜻이다). 두 번째 요청은 `{"ignored":"다른 브랜치예요"}` `HTTP 202`이고 알림 관련 로그는 없다.

- [ ] **Step 8: 브라우저에서 종 아이콘과 서비스 워커를 확인한다**

`http://localhost:3114`를 열어서 다음을 확인한다.

- [ ] 헤더 오른쪽에 종 아이콘(🔕)이 보이고, 누르면 "문서가 업데이트되면 알림을 받을 수 있어요."와 **알림 받기** 버튼이 있는 패널이 열린다. Esc를 누르면 닫힌다.
- [ ] 개발자 도구 → Application → Service Workers에 `/sw.js`가 **activated**로 보이고 범위(scope)가 `/`이다. (콘솔에서 `navigator.serviceWorker.getRegistration('/').then(r => r.active.state)`가 `"activated"`)
- [ ] 개발자 도구 콘솔에 오류가 없다.
- [ ] **알림 받기**를 누르면 브라우저의 알림 권한 팝업이 뜬다. (지금은 DB가 없어서 허용해도 서버가 저장하지 못하고 오류 문구가 나온다. 진짜 저장은 Task 11에서 확인한다.)

확인이 끝나면 서버를 끈다(`Ctrl+C`).

- [ ] **Step 9: 전체 검사를 돌리고 커밋한다**

```bash
npm test
npm run typecheck
npm run lint
git add scripts package.json .env.example README.md docs
git commit -m "docs: add push scripts, setup guide, and reflect notification decisions in the spec"
```

Expected: 28개 파일 210개 테스트 통과, 타입 오류와 린트 오류 없음.

---

### Task 11: 실제 Neon과 기기에서 확인 (사용자 확인 필요)

**Files:**
- Modify: `README.md` (운영 메모)

**Interfaces:**
- Consumes: 앞 작업의 전체 결과
- Produces: 진짜 데이터베이스와 진짜 푸시 서비스로 확인된 동작, 폰에서의 확인 결과

앞의 작업들은 메모리 Postgres와 가짜 발송기로 검증했다. 이 작업은 **진짜 Neon과 진짜 브라우저·폰의 푸시**로 성공 기준(스펙 1의 4번, 그리고 스펙 10의 4번 "Neon 깨어남 지연")을 확인한다. **외부 서비스에 무언가 만드는 단계라서 실행하기 전에 사용자에게 확인한다.**

- [ ] **Step 1: Neon 데이터베이스를 만든다 (사용자 확인 후)**

Neon 콘솔(https://console.neon.tech)에서 무료 프로젝트를 만들고, 연결 문자열(pooled)을 복사한다. Vercel에서 하려면 프로젝트의 Storage(Marketplace)에서 Neon을 연결하면 `DATABASE_URL`이 환경변수로 들어간다. 로컬 확인용으로 `.env.local`(git에 올라가지 않는다)에 넣는다.

```
DATABASE_URL=postgresql://...
```

- [ ] **Step 2: VAPID 키를 만들어 넣는다**

```bash
npm run vapid
```

출력된 공개키와 비공개키를 `.env.local`에 넣고, `VAPID_SUBJECT`도 채운다.

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<공개키>
VAPID_PRIVATE_KEY=<비공개키>
VAPID_SUBJECT=mailto:<내 이메일>
GITHUB_REPO=kakaotechcampus-4/ktc4-kyungpook-3
DOCS_PATHS=frontend/docs/plan
GITHUB_WEBHOOK_SECRET=<아무 긴 문자열>
```

- [ ] **Step 3: 마이그레이션을 적용한다**

```bash
npm run db:migrate
npm run db:migrate
```

Expected: 첫 실행은 `적용한 마이그레이션: 0001_push.sql`, 두 번째는 `적용할 새 마이그레이션이 없어요.`

- [ ] **Step 4: Neon이 깨어나는 지연을 잰다 (스펙 10의 4번)**

Neon 무료 플랜은 유휴 5분 뒤 자동 중지된다. **6분 이상 아무 요청도 보내지 않은 뒤에** 실행해서 첫 요청과 그 뒤 요청의 시간을 비교한다.

```bash
npx tsx --env-file=.env.local -e "import('./src/lib/db/neon').then(async ({ createNeonDb }) => { const db = createNeonDb(process.env.DATABASE_URL); for (let i = 0; i < 3; i++) { const t = Date.now(); await db.query('select 1'); console.log(i === 0 ? '첫 요청' : '이어서', Date.now() - t, 'ms'); } })"
```

첫 요청의 시간이 webhook의 10초 응답 제한에 문제가 되는지 본다(알림은 `after`로 응답 뒤에 처리되므로 응답 시간에는 영향이 없다). 결과를 기록해 둔다.

- [ ] **Step 5: 데스크톱 브라우저에서 구독한다**

```bash
npm run dev
```

Chrome에서 `http://localhost:3000`을 열고 종 아이콘 → **알림 받기** → 브라우저 팝업에서 **허용**한다.

- [ ] 패널이 "이 기기에서 알림을 받고 있어요."와 **알림 끄기**로 바뀌고 아이콘이 🔔가 된다.
- [ ] Neon에 저장됐다: `npx tsx --env-file=.env.local -e "import('./src/lib/db/neon').then(async ({ createNeonDb }) => console.log(await createNeonDb(process.env.DATABASE_URL).query('select endpoint, created_at from push_subscriptions')))"`에 주소가 `https://fcm.googleapis.com/...`로 나온다.

- [ ] **Step 6: 시험 알림을 보낸다**

```bash
npm run push:test -- "시험 알림" "이 알림이 보이면 푸시가 잘 동작하는 거예요."
```

Expected: `구독 1개 중 발송 1, 만료로 삭제 0, 실패 0`이 나오고, 운영체제 알림이 뜬다. 알림을 누르면 사이트가 열리거나 이미 열린 창이 앞으로 온다.

- [ ] **Step 7: 문서 갱신 알림과 중복 방지를 확인한다**

`npm run dev`가 떠 있는 상태에서 (`.env.local`의 `GITHUB_WEBHOOK_SECRET`과 같은 값으로) 실행한다.

```bash
scripts/simulate-webhook.sh http://localhost:3000 <비밀키> refs/heads/develop frontend/docs/plan/m0-scaffolding.md same-sha
scripts/simulate-webhook.sh http://localhost:3000 <비밀키> refs/heads/develop frontend/docs/plan/m0-scaffolding.md same-sha
```

Expected: 첫 요청 뒤 알림 "문서가 업데이트됐어요 / m0-scaffolding"이 **한 번** 뜨고, 눌러서 그 문서 화면이 열린다. **같은 SHA의 두 번째 요청은 알림이 뜨지 않는다.** Neon의 `notified_commits`에 `same-sha`가 한 줄 있다. 다른 SHA(생략하면 매번 새 값)로 보내면 다시 알림이 뜬다.

- [ ] **Step 8: 알림 끄기와 만료 정리를 확인한다**

- [ ] 종 아이콘 → **알림 끄기** 뒤 `push_subscriptions`의 줄이 사라진다.
- [ ] (선택) 브라우저 사이트 설정에서 알림 권한을 회수한 뒤 `npm run push:test`를 실행하면 `만료로 삭제 1`이 나오고 줄이 지워진다.

- [ ] **Step 9: 폰에서 확인한다 (Vercel 배포 후, 사용자 확인)**

폰 푸시는 HTTPS 주소가 필요하다. Vercel에 배포하고(환경변수는 `.env.local`의 값 전부: `GITHUB_REPO`, `GITHUB_BRANCH`, `DOCS_PATHS`, `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`), 배포된 주소로 확인한다. 공개키는 빌드에 들어가므로 환경변수를 넣은 **뒤에** 배포해야 한다.

- [ ] **Android(Chrome):** 종 아이콘 → 알림 받기 → 허용. `npm run push:test`로 알림이 온다.
- [ ] **iPhone(iOS 16.4 이상):** Safari에서 열면 종 아이콘 패널이 "홈 화면에 추가" 안내를 보여준다. 공유 → 홈 화면에 추가 후 **홈 화면의 앱으로 열어서** 종 아이콘 → 알림 받기 → 허용. `npm run push:test`로 알림이 온다.
- [ ] 앱이 닫혀 있고 화면이 꺼져 있어도 알림이 온다.

- [ ] **Step 10: 결과를 README에 기록하고 커밋한다**

`README.md`의 "운영 메모" 절 끝에 다음을 적는다: Neon이 깨어날 때 걸린 시간(첫 요청과 이어진 요청), 확인한 기기와 브라우저(Chrome 데스크톱, Android, iPhone), 알림이 도착하기까지 걸린 대략의 시간, 확인한 배포 주소.

```bash
git add README.md
git commit -m "docs: record push notification verification on real Neon and devices"
```

---

## 자체 점검 (계획 작성자용)

**스펙 대응 (계획 2 범위)**

| 스펙 | 작업 |
|---|---|
| 5.3 webhook: 알림은 응답 뒤(`after`), 커밋 SHA로 중복 방지, 무효화가 먼저 | Task 5, 6 |
| 5.4 알림 발송(`web-push`, 만료 구독 삭제, 문구) | Task 5 |
| 5.5 Neon 테이블(`push_subscriptions`, `notified_commits`), 깨어남 지연 | Task 2, 4, 11 |
| 6.3 알림 설정 화면(종 아이콘, iOS 안내, 권한) | Task 8, 9 |
| 7 오류 처리(알림 실패는 로그만, DB 장애가 문서 화면에 영향 없음) | Task 6 |
| 8 테스트(webhook, 알림, 구독) | Task 2~9 |
| 성공 기준 4(Android·iPhone 알림 수신) | Task 11 |

계획 3(달력·일정·편집 코드·cron)과 계획 4(모두의 시간)는 이 계획의 범위 밖이다.

**스펙과 달라진 점** (Task 10에서 스펙에 반영한다): 알림 문구는 파일 이름을 쓰고 한 문서면 그 문서를 연다. 구독 주소는 실제 푸시 서비스 주소만 허용하고 구독은 100대로 제한한다.

**미리 확인해 둔 것 (그대로 옮기면 같은 결과가 나와야 한다):** 로컬 프로덕션 서버에서 아이콘 크기(192·512·180), manifest, `/sw.js` 헤더, `mobile-web-app-capable` 태그, 구독 API 응답(503/400/415), webhook 뒤 `after` 알림 단계, 실제 브라우저에서 서비스 워커 등록(`activated`, 범위 `/`)과 알림 패널.
