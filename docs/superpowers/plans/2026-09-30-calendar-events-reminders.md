# 달력, 일정, 편집 코드, 매일 알림 구현 계획 (계획 3/4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사이트 안에 월 달력을 만들어 일정을 보고, 편집 코드를 아는 사람이 일정을 추가·수정·삭제하게 하고, 일정 전날·당일에 하루 한 번 폰으로 알림을 보낸다. Neon 없이도 화면을 볼 수 있게 로컬 미리보기 모드를 둔다.

**Architecture:** 날짜는 시간대 없는 `YYYY-MM-DD` 문자열, 시각은 `HH:MM` 문자열로만 다룬다(한국시간). 데이터베이스는 계획 2의 `Db.query(text, params)`를 그대로 쓰고, 일정 저장·알림 선정·잠금 계산은 한 문장의 SQL(필요하면 CTE)로 처리해서 트랜잭션 없이도 원자적이게 한다. 쓰기는 모두 JSON `POST` 라우트 핸들러(의존성을 주입받는 순수 함수)로 만들고, 편집 권한은 HMAC 서명 쿠키로 확인한다. 화면 계산(월 표, 폼 ↔ 요청 본문, API 호출)은 순수 함수로 빼서 테스트하고, 컴포넌트는 그 위에 얇게 얹는다. 일정 알림은 Vercel Cron이 하루 한 번 부르는 `GET /api/cron/reminders`가 보내며, 보낼 항목을 먼저 `sent_reminders`에 넣어 차지한 뒤 발송한다.

**Tech Stack:** Next.js 16.3.7(App Router), React 19, TypeScript, `@neondatabase/serverless`, `web-push`(계획 2), Vitest 5, `@electric-sql/pglite`(테스트와 로컬 미리보기). **새 패키지는 추가하지 않는다.**

**Spec:** `docs/superpowers/specs/2026-09-30-calendar-and-meetups-design.md`의 1(성공 기준 1·4·5), 3, 5(`events` 중 모임 연결을 뺀 부분), 6.1, 7.3, 7.4(일정 전날·당일), 8, 9와 `2026-09-30-docs-backoffice-design.md`의 5.6, 5.7, 5.8, 6.5, 7. 모임(`meetups`, `availability`, `sent_notices`, 모임 알림, `/meetups`)은 **계획 4**에서 만든다.

## 확인한 공식 문서 (2026-09-30)

- **Vercel Cron** (vercel.com/docs/cron-jobs, `.../manage-cron-jobs`, `.../usage-and-pricing`): Vercel은 **프로덕션 배포 URL에 HTTP GET**을 보낸다. 사용자 에이전트는 `vercel-cron/1.0`이고 `x-vercel-cron-schedule` 헤더가 붙는다. **시간대는 항상 UTC**다. 프로젝트에 `CRON_SECRET` 환경변수를 두면 값이 **`Authorization: Bearer <값>`** 헤더로 자동 전송된다(16자 이상 권장). Hobby는 **하루 한 번만** 가능하고(더 자주 도는 식은 배포 실패), 실행 시각은 지정한 시 안에서 임의(±59분)다. 실패해도 **재시도하지 않고**, 전달이 **드물게 누락되거나 같은 실행이 두 번** 올 수 있으므로 멱등하게 만들라고 한다. 리다이렉트는 따라가지 않는다. `next dev`로는 cron이 돌지 않아 엔드포인트를 직접 부른다. 요일과 일자를 동시에 지정할 수 없다.
- **Vercel 함수 실행 시간** (`.../functions/configuring-functions/duration`, 2026-08-24 갱신): Fluid compute(기본 켜짐)에서 Hobby의 기본·최대가 모두 300초다. Next.js App Router는 라우트 파일에서 `export const maxDuration`으로 바꾼다. 구독 100대를 10개씩 묶어 보내는 최악(약 100초)이 기본값 안이라 따로 지정하지 않는다.
- **Vercel 요청 헤더** (`.../headers/request-headers`): `x-forwarded-for`는 **클라이언트의 공개 IP**이고, Vercel이 덮어써서 외부에서 위조할 수 없다. `x-real-ip`는 같은 값이다.
- **Next.js 16.3.7 (설치된 문서)**: `cookies()`는 **비동기**이고 서버 컴포넌트에서 읽기만 된다(쓰기는 서버 함수나 라우트 핸들러). 페이지의 `searchParams`와 `params`는 Promise다. `GET` 라우트 핸들러는 v15부터 기본이 동적이다. `cookies()`를 쓰면 그 페이지는 동적 렌더링이 된다.
- **Neon HTTP 드라이버 (가짜 fetch로 직접 확인)**: 배열 파라미터는 PG 배열 문자열(`{"p1","p 2"}`, 숫자 배열은 `{"0","1"}`)로 전송되어 `$n::text[]`, `$n::integer[]` 캐스트로 받을 수 있다. 결과는 `text[]`→문자열 배열, `int4[]`→숫자 배열, `int4`·`float8`→숫자로 읽힌다. **`date`, `timestamptz`는 JS `Date`가 될 수 있으므로 SQL에서 `to_char(...)`로 문자열로 바꿔 읽는다.** `bigint`는 문자열이 되므로 `id`는 `integer`로 만든다.

## Global Constraints

- 새 의존성 없음. Next 16.3.7, React 19, 기존 ESLint·TypeScript 설정 그대로 통과해야 한다.
- 시간대는 항상 한국시간이다. "오늘"은 `todayInSeoul(now)`(UTC+9)로 계산한다. 한국은 서머타임이 없다.
- 일정: 제목 1~100자, 날짜(`2000-01-01`~`2100-12-31`의 실제 날짜), 종일 또는 시작·종료 시각 둘 다(종료가 시작보다 뒤), 메모 500자 이하(선택), 참석자는 명단(`PEOPLE`)에 있는 번호만, 알림 시점은 `0`(당일)·`1`(1일 전)·`3`(3일 전) 중 복수 선택이며 **값이 없으면 `[0, 1]`**, 빈 배열은 "알림 없음"이다.
- 명단: 환경변수 `PEOPLE="p1:참가자 1,p2:참가자 2,..."`. 값이 없으면 `p1`~`p5`(`참가자 1`~`참가자 5`)를 쓴다. 번호는 영문 소문자·숫자·`_`·`-` 1~20자, 이름 1~20자, 1~10명, 번호 중복 금지.
- 편집 코드: `EDIT_CODE`(8자 이상, 16자 이상 권장)와 `SESSION_SECRET`(16자 이상). 맞으면 `HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`(7일)에 프로덕션에서는 `Secure`까지 붙은 서명 쿠키 `edit_session`을 준다. 실패 기록은 IP 해시(HMAC)로 `auth_attempts`에 남기고 **10분 안에 5회 실패하면 그 IP를 잠근다**(잠긴 동안은 올바른 코드도 거부). 원래 IP는 저장하지 않는다.
- 모든 쓰기 요청은 **`POST`만**, 본문은 `application/json`(20KB 이하)이어야 한다. 조회와 알림 구독에는 인증이 없다.
- cron: `vercel.json`의 `0 0 * * *`(UTC = 한국시간 09:00~09:59경), 경로 `/api/cron/reminders`, `Authorization: Bearer <CRON_SECRET>` 필수(`CRON_SECRET`이 없으면 503, 틀리면 401).
- 일정 알림 문구: 줄마다 `오늘: 제목`, `내일: 제목`, `3일 뒤: 제목`(시각이 있으면 `오늘 14:00: 제목`), 최대 3줄이고 넘으면 `외 N건`, 제목은 40자까지. 열 주소는 한 건이면 `/calendar?month=YYYY-MM&date=YYYY-MM-DD`, 여러 건이면 첫 항목의 달.
- 일정 알림은 구독한 기기 **전체**에 간다(이름과 기기를 연결하지 않는다).
- 사용자에게 보이는 문구는 한국어, 쉬운 말.

## Review Focus

스펙이 직접 말하지 않았지만 실제 사용에서 마주칠 가능성이 높은 입력이다. 각 항목의 테스트는 해당 작업에 들어 있다.

1. **편집 코드 무차별 대입과 쿠키 위조.** 코드를 5번 틀리면 올바른 코드도 10분간 거부되고(잠금이 풀리면 다시 통과), 다른 IP는 영향이 없어야 한다. 쿠키의 만료 시각을 고치거나 다른 비밀키로 서명한 토큰, 만료된 토큰, 깨진 토큰은 모두 거부한다. 코드가 문자열이 아니거나 아주 길어도 서버가 죽지 않는다. → Task 4 `session.test.ts`, `attempts.test.ts`, Task 5 `handlers.test.ts`
2. **일정 입력 남용과 이상한 값.** 2월 30일, 범위 밖 연도, 시작만 있는 시각, 종료가 시작과 같거나 앞선 시각, 아주 긴 제목·메모(이모지 포함), 명단에 없는 참석자, `2`일 전 같은 허용되지 않은 알림 시점, JSON이 아니거나 20KB가 넘는 본문, 없는 일정 번호·`0`·`abc`·아주 큰 번호는 저장하지 않고 필드별 메시지나 명확한 상태 코드(400/404/413/415)로 거절한다. → Task 2 `validate.test.ts`, Task 6 `handlers.test.ts`
3. **알림이 두 번 가거나 안 가는 경우.** 같은 날 cron이 두 번 실행돼도 알림은 한 번, 날짜나 알림 시점을 고친 일정은 다시 알림, 제목만 고친 일정은 다시 알리지 않음, 발송이 전부 실패하면 기록을 풀어서 다시 호출하면 재시도, 구독자가 없어도 죽지 않음, 한국시간 자정 경계(UTC 15:00)에서 "오늘"이 바뀜, 3일 전·당일이 같은 날 겹치는 일정은 한 통으로 묶임. → Task 3 `store.test.ts`, Task 7 `claim.test.ts`, `run.test.ts`, `format.test.ts`
4. **달력 계산.** 윤년 2월(29일), 4주·5주·6주 달, 이전·다음 달 날짜 채우기, 12월↔1월 이동, `?month=`가 이상하거나 범위 밖이면 이번 달로, `?date=`가 보이는 달력 밖이면 무시. → Task 1 `month.test.ts`, Task 9 `view.test.ts`
5. **설정 누락과 장애가 화면을 깨뜨리지 않음.** `DATABASE_URL`이 없거나 DB가 죽으면 달력에 안내 배너만 나오고(문서 뷰어는 그대로), `PEOPLE`이 잘못되면 쓰기는 503과 이유를 돌려주고 화면은 안내한다. `EDIT_CODE`나 `SESSION_SECRET`이 없으면 편집은 막히고 조회는 된다. cron은 `CRON_SECRET`이 없으면 열려 있지 않고 503이다. → Task 5, 6, 8의 핸들러 테스트, Task 9

## 파일 구조

```
db/migrations/0002_events.sql                  ← events, sent_reminders, auth_attempts (다시 실행해도 안전)
vercel.json                                    ← cron 한 개 (매일 UTC 00:00)
src/lib/http.ts                                ← json 응답, JSON 본문 읽기(415/400/413)
src/lib/people.ts                              ← 명단(PEOPLE) 파싱
src/lib/events/dates.ts                        ← 날짜·시각 문자열 도구, 한국시간 오늘
src/lib/events/validate.ts                     ← 일정 입력 검증 (필드별 오류)
src/lib/events/store.ts                        ← 일정 저장소 (생성·수정·삭제·조회, 수정 시 알림 기록 초기화)
src/lib/events/handlers.ts, instance.ts        ← 일정 쓰기 API 핸들러와 실제 연결
src/lib/events/form.ts, client.ts              ← 화면용 폼 상태 ↔ 요청 본문, API 호출(fetch 주입)
src/lib/calendar/month.ts, view.ts             ← 월 표 계산, 화면 표시용 도우미
src/lib/auth/safe-equal.ts, session.ts         ← 시간이 일정한 비교, 서명 쿠키
src/lib/auth/ip.ts, config.ts, attempts.ts     ← IP 해시, 인증 환경변수, 실패 잠금
src/lib/auth/handlers.ts, instance.ts, server.ts ← 로그인·로그아웃 API, 편집 권한 확인(서버 컴포넌트용)
src/lib/reminders/types.ts, format.ts          ← 알림 항목 타입, 알림 문구
src/lib/reminders/claim.ts, run.ts, handler.ts ← 보낼 항목 차지·해제, 한 번의 실행, cron 요청 처리
src/lib/push/deps.ts                           ← 푸시 발송에 필요한 DB·발송기를 환경변수로 만든다 (서버 전용)
src/lib/db/memory.ts                           ← 로컬 미리보기용 메모리 DB
src/app/api/auth/login/route.ts, logout/route.ts
src/app/api/events/route.ts, [id]/route.ts, [id]/delete/route.ts
src/app/api/cron/reminders/route.ts
src/app/calendar/page.tsx                      ← 월 달력 화면
src/components/CalendarGrid.tsx, EventEditor.tsx
```

---

### Task 1: 날짜 도구와 월 달력 계산

**Files:**
- Create: `src/lib/events/dates.ts`, `src/lib/events/dates.test.ts`, `src/lib/calendar/month.ts`, `src/lib/calendar/month.test.ts`

**Interfaces:**
- Produces:
  - `parseDate(value: string): { year: number; month: number; day: number } | null` (존재하지 않는 날짜는 null), `isValidDate`, `isInSupportedRange(value): boolean`, `formatDate(year, month, day): string`, `addDays(date, days): string`, `daysBetween(from, to): number`, `weekday(date): number`(0=일), `daysInMonth(year, month): number`, `todayInSeoul(now?: Date): string`, `isValidTime(value): boolean`, `compareTimes(a, b): number`, `MIN_DATE`, `MAX_DATE`
  - `type MonthRef = { year: number; month: number }`, `type DayCell = { date: string; day: number; inMonth: boolean }`, `monthOf(date): MonthRef`, `parseMonthParam(raw, fallback): MonthRef`, `monthKey(ref): string`, `shiftMonth(ref, delta): MonthRef`, `monthTitle(ref): string`, `monthGrid(ref): DayCell[][]`(일요일 시작, 4~6주), `gridRange(ref): { from: string; to: string }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/events/dates.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import {
  addDays,
  compareTimes,
  daysBetween,
  daysInMonth,
  formatDate,
  isInSupportedRange,
  isValidDate,
  isValidTime,
  parseDate,
  todayInSeoul,
  weekday,
} from "./dates";

describe("isValidDate / parseDate", () => {
  it("실제로 있는 날짜만 통과시킨다(윤년 포함)", () => {
    expect(isValidDate("2026-02-28")).toBe(true);
    expect(isValidDate("2024-02-29")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("2026-04-31")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-00-10")).toBe(false);
  });

  it("YYYY-MM-DD가 아닌 모양은 거부한다", () => {
    for (const value of ["2026-1-1", "26-10-07", "2026/10/07", "abcd", "", "2026-10-07 ", "2026-10-07T00:00:00Z"]) {
      expect(isValidDate(value), value).toBe(false);
    }
  });

  it("연·월·일을 숫자로 돌려준다", () => {
    expect(parseDate("2026-10-07")).toEqual({ year: 2026, month: 10, day: 7 });
    expect(parseDate("2026-02-30")).toBeNull();
  });

  it("지원 범위는 2000-01-01부터 2100-12-31까지다", () => {
    expect(isInSupportedRange("2000-01-01")).toBe(true);
    expect(isInSupportedRange("2100-12-31")).toBe(true);
    expect(isInSupportedRange("1999-12-31")).toBe(false);
    expect(isInSupportedRange("2101-01-01")).toBe(false);
  });
});

describe("날짜 계산", () => {
  it("addDays는 월·연·윤일 경계를 넘긴다", () => {
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-10-07", 3)).toBe("2026-10-10");
    expect(addDays("2026-10-07", 0)).toBe("2026-10-07");
  });

  it("daysBetween은 뒤가 크면 양수, 앞이 크면 음수다", () => {
    expect(daysBetween("2026-10-01", "2026-10-07")).toBe(6);
    expect(daysBetween("2026-10-07", "2026-10-01")).toBe(-6);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2026-10-07", "2026-10-07")).toBe(0);
  });

  it("weekday는 일요일이 0이다", () => {
    expect(weekday("2026-02-01")).toBe(0);
    expect(weekday("2026-10-07")).toBe(3);
    expect(weekday("2026-10-31")).toBe(6);
  });

  it("daysInMonth는 윤년 2월을 안다", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("formatDate는 0을 채운다", () => {
    expect(formatDate(2026, 3, 5)).toBe("2026-03-05");
  });

  it("존재하지 않는 날짜로 계산하려 하면 오류를 던진다", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow();
  });
});

describe("todayInSeoul", () => {
  it("한국시간 자정(UTC 15:00)에 날짜가 바뀐다", () => {
    expect(todayInSeoul(new Date("2026-09-30T14:59:59Z"))).toBe("2026-09-30");
    expect(todayInSeoul(new Date("2026-09-30T15:00:00Z"))).toBe("2026-10-01");
  });

  it("연말과 연초도 맞는다", () => {
    expect(todayInSeoul(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
    expect(todayInSeoul(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01");
  });

  it("윤일 경계도 맞는다", () => {
    expect(todayInSeoul(new Date("2024-02-28T15:00:00Z"))).toBe("2024-02-29");
    expect(todayInSeoul(new Date("2024-02-29T15:00:00Z"))).toBe("2024-03-01");
  });
});

describe("시각", () => {
  it("HH:MM만 통과시킨다", () => {
    for (const value of ["00:00", "09:30", "23:59"]) expect(isValidTime(value), value).toBe(true);
    for (const value of ["24:00", "9:00", "12:60", "12:5", "1200", "", "12:00:00"]) expect(isValidTime(value), value).toBe(false);
  });

  it("compareTimes는 이른 쪽이 음수다", () => {
    expect(compareTimes("09:00", "10:00")).toBeLessThan(0);
    expect(compareTimes("10:00", "09:00")).toBeGreaterThan(0);
    expect(compareTimes("10:00", "10:00")).toBe(0);
  });
});
`````

**`src/lib/calendar/month.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { gridRange, monthGrid, monthKey, monthOf, monthTitle, parseMonthParam, shiftMonth } from "./month";

const FALLBACK = { year: 2026, month: 9 };

describe("parseMonthParam", () => {
  it("YYYY-MM을 읽는다", () => {
    expect(parseMonthParam("2026-10", FALLBACK)).toEqual({ year: 2026, month: 10 });
    expect(parseMonthParam("2000-01", FALLBACK)).toEqual({ year: 2000, month: 1 });
  });

  it("이상하거나 범위 밖이면 대체 값을 쓴다", () => {
    for (const raw of ["2026-13", "2026-00", "abc", "2026-1", "1999-12", "2101-01", "", undefined, ["2026-10"]]) {
      expect(parseMonthParam(raw as string | undefined, FALLBACK), String(raw)).toEqual(FALLBACK);
    }
  });
});

describe("monthKey / monthOf / monthTitle / shiftMonth", () => {
  it("표기와 변환", () => {
    expect(monthKey({ year: 2026, month: 3 })).toBe("2026-03");
    expect(monthOf("2026-10-07")).toEqual({ year: 2026, month: 10 });
    expect(monthTitle({ year: 2026, month: 10 })).toBe("2026년 10월");
  });

  it("12월과 1월 사이를 넘나든다", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 10 }, 0)).toEqual({ year: 2026, month: 10 });
    expect(shiftMonth({ year: 2026, month: 10 }, 15)).toEqual({ year: 2028, month: 1 });
  });
});

describe("monthGrid", () => {
  it("2026년 2월은 일요일에 시작해서 4주다", () => {
    const grid = monthGrid({ year: 2026, month: 2 });
    expect(grid).toHaveLength(4);
    expect(grid[0][0]).toEqual({ date: "2026-02-01", day: 1, inMonth: true });
    expect(grid[3][6]).toEqual({ date: "2026-02-28", day: 28, inMonth: true });
    expect(grid.flat().every((cell) => cell.inMonth)).toBe(true);
  });

  it("윤년 2월(2024)은 5주이고 29일이 들어 있다", () => {
    const grid = monthGrid({ year: 2024, month: 2 });
    expect(grid).toHaveLength(5);
    expect(grid[0][0]).toEqual({ date: "2024-01-28", day: 28, inMonth: false });
    expect(grid.flat().find((cell) => cell.date === "2024-02-29")?.inMonth).toBe(true);
    expect(grid[4][6]).toEqual({ date: "2024-03-02", day: 2, inMonth: false });
  });

  it("토요일에 시작하는 31일짜리 달(2025년 3월)은 6주다", () => {
    const grid = monthGrid({ year: 2025, month: 3 });
    expect(grid).toHaveLength(6);
    expect(grid[0][0].date).toBe("2025-02-23");
    expect(grid[5][6].date).toBe("2025-04-05");
  });

  it("2026년 10월은 5주이고 앞뒤를 이웃 달로 채운다", () => {
    const grid = monthGrid({ year: 2026, month: 10 });
    expect(grid).toHaveLength(5);
    expect(grid[0].map((cell) => cell.inMonth)).toEqual([false, false, false, false, true, true, true]);
    expect(grid[0][0].date).toBe("2026-09-27");
    expect(grid[4][6].date).toBe("2026-10-31");
  });

  it("어느 달이든 한 주는 7칸이고 날짜가 하루씩 이어진다", () => {
    for (let month = 1; month <= 12; month += 1) {
      const cells = monthGrid({ year: 2026, month }).flat();
      expect(cells.length % 7).toBe(0);
      for (let i = 1; i < cells.length; i += 1) {
        const prev = new Date(`${cells[i - 1].date}T00:00:00Z`).getTime();
        const next = new Date(`${cells[i].date}T00:00:00Z`).getTime();
        expect(next - prev, `${month}월 ${i}번째 칸`).toBe(86_400_000);
      }
      expect(cells.filter((cell) => cell.inMonth)).toHaveLength(new Date(Date.UTC(2026, month, 0)).getUTCDate());
    }
  });
});

describe("gridRange", () => {
  it("보이는 첫 칸과 마지막 칸의 날짜를 돌려준다", () => {
    expect(gridRange({ year: 2026, month: 10 })).toEqual({ from: "2026-09-27", to: "2026-10-31" });
    expect(gridRange({ year: 2025, month: 3 })).toEqual({ from: "2025-02-23", to: "2025-04-05" });
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/events/dates.test.ts src/lib/calendar/month.test.ts`
Expected: FAIL — `./dates`, `./month` 모듈을 찾을 수 없다는 오류(두 파일 모두).

- [ ] **Step 3: 구현한다**

**`src/lib/events/dates.ts`**

`````ts
/**
 * 날짜는 시간대 없는 "YYYY-MM-DD" 문자열, 시각은 "HH:MM" 문자열로만 다룬다.
 * 계산은 UTC 자정을 기준으로 해서 실행하는 컴퓨터의 시간대나 서머타임에 영향을 받지 않게 한다.
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 86_400_000;
/** 한국은 UTC+9이고 서머타임이 없다. */
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

export const MIN_DATE = "2000-01-01";
export const MAX_DATE = "2100-12-31";

export function parseDate(value: string): { year: number; month: number; day: number } | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  // 2월 30일처럼 없는 날짜는 Date가 다음 달로 넘겨 버리므로, 되돌려 봐서 같은지 확인한다.
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function isValidDate(value: string): boolean {
  return parseDate(value) !== null;
}

/** 고정 폭 형식이라 문자열 비교가 곧 날짜 비교다. */
export function isInSupportedRange(value: string): boolean {
  return value >= MIN_DATE && value <= MAX_DATE;
}

export function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toUtcMs(value: string): number {
  const parts = parseDate(value);
  if (!parts) throw new Error(`올바르지 않은 날짜예요: ${value}`);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

export function addDays(value: string, days: number): string {
  const moved = new Date(toUtcMs(value) + days * DAY_MS);
  return formatDate(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** 0=일요일 … 6=토요일 */
export function weekday(value: string): number {
  return new Date(toUtcMs(value)).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 한국시간 기준 오늘 날짜. */
export function todayInSeoul(now: Date = new Date()): string {
  const seoul = new Date(now.getTime() + SEOUL_OFFSET_MS);
  return formatDate(seoul.getUTCFullYear(), seoul.getUTCMonth() + 1, seoul.getUTCDate());
}

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** "HH:MM"은 고정 폭이라 문자열 순서가 시각 순서다. */
export function compareTimes(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
`````

**`src/lib/calendar/month.ts`**

`````ts
import { daysInMonth, formatDate, weekday } from "@/lib/events/dates";

export type MonthRef = { year: number; month: number };
export type DayCell = { date: string; day: number; inMonth: boolean };

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

/** "YYYY-MM-DD"가 속한 달. */
export function monthOf(date: string): MonthRef {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

/** `?month=YYYY-MM`을 읽는다. 이상하거나 2000~2100년 밖이면 대체 값을 쓴다. */
export function parseMonthParam(raw: string | string[] | undefined, fallback: MonthRef): MonthRef {
  if (typeof raw !== "string") return fallback;
  const match = MONTH_PATTERN.exec(raw);
  if (!match) return fallback;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return fallback;
  return { year, month };
}

export function monthKey({ year, month }: MonthRef): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function shiftMonth({ year, month }: MonthRef, delta: number): MonthRef {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function monthTitle({ year, month }: MonthRef): string {
  return `${year}년 ${month}월`;
}

/** 일요일에 시작하는 월 달력. 앞뒤 빈칸은 이웃 달의 날짜로 채우고, 필요한 만큼의 주(4~6주)만 돌려준다. */
export function monthGrid(ref: MonthRef): DayCell[][] {
  const lead = weekday(formatDate(ref.year, ref.month, 1));
  const total = daysInMonth(ref.year, ref.month);
  const weeks = Math.ceil((lead + total) / 7);
  const prev = shiftMonth(ref, -1);
  const next = shiftMonth(ref, 1);
  const prevDays = daysInMonth(prev.year, prev.month);

  const cells: DayCell[] = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const dayNumber = i - lead + 1;
    if (dayNumber < 1) {
      const day = prevDays + dayNumber;
      cells.push({ date: formatDate(prev.year, prev.month, day), day, inMonth: false });
    } else if (dayNumber > total) {
      const day = dayNumber - total;
      cells.push({ date: formatDate(next.year, next.month, day), day, inMonth: false });
    } else {
      cells.push({ date: formatDate(ref.year, ref.month, dayNumber), day: dayNumber, inMonth: true });
    }
  }
  return Array.from({ length: weeks }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

/** 화면에 보이는 첫 칸과 마지막 칸의 날짜(이 범위의 일정을 불러오면 된다). */
export function gridRange(ref: MonthRef): { from: string; to: string } {
  const grid = monthGrid(ref);
  return { from: grid[0][0].date, to: grid[grid.length - 1][6].date };
}
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/events/dates.test.ts src/lib/calendar/month.test.ts`
Expected: PASS — 두 파일 모두 통과.

- [ ] **Step 5: 커밋한다**

```bash
git add src/lib/events/dates.ts src/lib/events/dates.test.ts src/lib/calendar/month.ts src/lib/calendar/month.test.ts
git commit -m "feat: add date helpers with Seoul today and the month grid calculation"
```

---

### Task 2: 명단(PEOPLE)과 일정 입력 검증

**Files:**
- Create: `src/lib/people.ts`, `src/lib/people.test.ts`, `src/lib/events/validate.ts`, `src/lib/events/validate.test.ts`

**Interfaces:**
- Consumes: Task 1의 `isInSupportedRange`, `isValidDate`, `isValidTime`, `compareTimes`
- Produces:
  - `type Person = { id: string; name: string }`, `type PeopleResult = { ok: true; people: Person[] } | { ok: false; error: string }`, `parsePeople(raw: string | undefined): PeopleResult`, `loadPeople(env?): PeopleResult`, `nameOf(people, id): string`, `DEFAULT_PEOPLE`
  - `type EventInput = { title; date; startTime: string | null; endTime: string | null; memo: string | null; attendeeIds: string[]; remindOffsets: number[] }`, `type FieldErrors`, `type ValidationResult`, `validateEventInput(raw: unknown, people: Person[]): ValidationResult`, `REMIND_OPTIONS = [0, 1, 3]`, `DEFAULT_REMIND_OFFSETS = [0, 1]`, `MAX_TITLE_LENGTH = 100`, `MAX_MEMO_LENGTH = 500`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/people.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { DEFAULT_PEOPLE, loadPeople, nameOf, parsePeople, type Person } from "./people";

function ok(raw: string | undefined): Person[] {
  const result = parsePeople(raw);
  if (!result.ok) throw new Error(`성공해야 하는데 실패했어요: ${result.error}`);
  return result.people;
}

describe("parsePeople", () => {
  it("값이 없거나 비어 있으면 참가자 1~5를 쓴다", () => {
    for (const raw of [undefined, "", "   "]) {
      expect(ok(raw), String(raw)).toEqual([
        { id: "p1", name: "참가자 1" },
        { id: "p2", name: "참가자 2" },
        { id: "p3", name: "참가자 3" },
        { id: "p4", name: "참가자 4" },
        { id: "p5", name: "참가자 5" },
      ]);
    }
    expect(DEFAULT_PEOPLE.split(",")).toHaveLength(5);
  });

  it("번호:이름을 쉼표로 이어 쓴 값을 읽고 공백을 다듬는다", () => {
    expect(ok(" p1 : 민수 , p2:지은 ")).toEqual([
      { id: "p1", name: "민수" },
      { id: "p2", name: "지은" },
    ]);
  });

  it("이름에 콜론이 들어 있어도 첫 콜론까지만 번호로 본다", () => {
    expect(ok("p1:a:b")).toEqual([{ id: "p1", name: "a:b" }]);
  });

  it("번호가 겹치면 거부한다", () => {
    const result = parsePeople("p1:가,p1:나");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("p1");
  });

  it("형식이 틀리면 이유와 함께 거부한다", () => {
    for (const raw of ["p1", "p1:", ":이름", "p1:가,", "P1:가", "p 1:가", "p1:가,,p2:나", `p1:${"가".repeat(21)}`, `${"a".repeat(21)}:가`]) {
      const result = parsePeople(raw);
      expect(result.ok, raw).toBe(false);
      if (!result.ok) expect(result.error.length, raw).toBeGreaterThan(0);
    }
  });

  it("11명 이상은 거부하고 10명까지는 통과한다", () => {
    const list = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}:사람 ${i + 1}`).join(",");
    expect(parsePeople(list(10)).ok).toBe(true);
    expect(parsePeople(list(11)).ok).toBe(false);
  });
});

describe("loadPeople / nameOf", () => {
  it("환경변수 PEOPLE을 읽는다", () => {
    const result = loadPeople({ PEOPLE: "a:에이" });
    expect(result).toEqual({ ok: true, people: [{ id: "a", name: "에이" }] });
  });

  it("번호로 이름을 찾고, 없으면 번호를 그대로 돌려준다", () => {
    const people = ok("p1:민수");
    expect(nameOf(people, "p1")).toBe("민수");
    expect(nameOf(people, "p9")).toBe("p9");
  });
});
`````

**`src/lib/events/validate.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import type { Person } from "@/lib/people";
import { validateEventInput, type EventInput, type FieldErrors } from "./validate";

const people: Person[] = [
  { id: "p1", name: "참가자 1" },
  { id: "p2", name: "참가자 2" },
  { id: "p3", name: "참가자 3" },
];

function valid(raw: unknown): EventInput {
  const result = validateEventInput(raw, people);
  if (!result.ok) throw new Error(`통과해야 하는데 실패했어요: ${JSON.stringify(result.errors)}`);
  return result.value;
}

function errors(raw: unknown): FieldErrors {
  const result = validateEventInput(raw, people);
  if (result.ok) throw new Error("실패해야 하는데 통과했어요");
  return result.errors;
}

describe("validateEventInput — 통과하는 입력", () => {
  it("제목과 날짜만 있으면 종일 일정이고 알림은 당일과 1일 전이 기본이다", () => {
    expect(valid({ title: "  회의 ", date: "2026-10-07" })).toEqual({
      title: "회의",
      date: "2026-10-07",
      startTime: null,
      endTime: null,
      memo: null,
      attendeeIds: [],
      remindOffsets: [0, 1],
    });
  });

  it("시작·종료 시각과 메모, 참석자, 알림 시점을 모두 받는다", () => {
    expect(
      valid({
        title: "스터디",
        date: "2026-10-07",
        startTime: "14:00",
        endTime: "16:30",
        memo: " 3층 ",
        attendeeIds: ["p3", "p1"],
        remindOffsets: [3, 0],
      }),
    ).toEqual({
      title: "스터디",
      date: "2026-10-07",
      startTime: "14:00",
      endTime: "16:30",
      memo: "3층",
      attendeeIds: ["p1", "p3"],
      remindOffsets: [0, 3],
    });
  });

  it("시각이 빈 문자열이거나 null이면 종일이다", () => {
    for (const times of [{ startTime: "", endTime: "" }, { startTime: null, endTime: null }, { startTime: "  ", endTime: undefined }]) {
      const value = valid({ title: "a", date: "2026-10-07", ...times });
      expect([value.startTime, value.endTime]).toEqual([null, null]);
    }
  });

  it("알림 시점은 중복을 없애고 정렬하며, 빈 배열은 알림 없음이다", () => {
    expect(valid({ title: "a", date: "2026-10-07", remindOffsets: [3, 0, 3] }).remindOffsets).toEqual([0, 3]);
    expect(valid({ title: "a", date: "2026-10-07", remindOffsets: [] }).remindOffsets).toEqual([]);
  });

  it("참석자는 중복을 없애고 명단 순서로 정렬한다", () => {
    expect(valid({ title: "a", date: "2026-10-07", attendeeIds: ["p2", "p2", "p1"] }).attendeeIds).toEqual(["p1", "p2"]);
  });

  it("경계 길이(제목 100자, 메모 500자)는 통과한다", () => {
    const value = valid({ title: "가".repeat(100), date: "2026-10-07", memo: "나".repeat(500) });
    expect(value.title).toHaveLength(100);
    expect(value.memo).toHaveLength(500);
  });

  it("메모가 빈 문자열이면 null이다", () => {
    expect(valid({ title: "a", date: "2026-10-07", memo: "   " }).memo).toBeNull();
  });
});

describe("validateEventInput — 제목", () => {
  it("비었거나 공백뿐이거나 문자열이 아니면 거부한다", () => {
    for (const title of ["", "   ", undefined, null, 5, {}]) {
      expect(errors({ title, date: "2026-10-07" }).title, String(title)).toBeTruthy();
    }
  });

  it("101자부터 거부하고, 이모지는 한 글자로 센다", () => {
    expect(errors({ title: "가".repeat(101), date: "2026-10-07" }).title).toContain("100");
    expect(validateEventInput({ title: "😀".repeat(100), date: "2026-10-07" }, people).ok).toBe(true);
    expect(errors({ title: "😀".repeat(101), date: "2026-10-07" }).title).toBeTruthy();
  });
});

describe("validateEventInput — 날짜", () => {
  it("없는 날짜, 다른 모양, 범위 밖은 거부한다", () => {
    for (const date of ["2026-02-30", "2026-13-01", "2026/10/07", "2026-1-1", "", undefined, 20261007, "1999-12-31", "2101-01-01"]) {
      expect(errors({ title: "a", date }).date, String(date)).toBeTruthy();
    }
  });

  it("윤일은 윤년에만 통과한다", () => {
    expect(validateEventInput({ title: "a", date: "2024-02-29" }, people).ok).toBe(true);
    expect(errors({ title: "a", date: "2026-02-29" }).date).toBeTruthy();
  });
});

describe("validateEventInput — 시각", () => {
  it("시작만 있거나 종료만 있으면 거부한다", () => {
    expect(errors({ title: "a", date: "2026-10-07", startTime: "14:00" }).time).toContain("함께");
    expect(errors({ title: "a", date: "2026-10-07", endTime: "14:00" }).time).toContain("함께");
  });

  it("종료가 시작과 같거나 앞서면 거부한다", () => {
    for (const [startTime, endTime] of [["14:00", "14:00"], ["14:00", "13:59"], ["23:59", "00:00"]]) {
      expect(errors({ title: "a", date: "2026-10-07", startTime, endTime }).time, `${startTime}~${endTime}`).toContain("뒤");
    }
  });

  it("HH:MM이 아니면 거부한다", () => {
    for (const [startTime, endTime] of [["9:00", "10:00"], ["09:00", "24:00"], ["09:00", "10:60"], ["abc", "10:00"], [900, 1000]]) {
      expect(errors({ title: "a", date: "2026-10-07", startTime, endTime }).time, `${startTime}~${endTime}`).toBeTruthy();
    }
  });

  it("자정 직전까지의 일정도 통과한다", () => {
    const value = valid({ title: "a", date: "2026-10-07", startTime: "00:00", endTime: "23:59" });
    expect([value.startTime, value.endTime]).toEqual(["00:00", "23:59"]);
  });
});

describe("validateEventInput — 메모, 참석자, 알림 시점", () => {
  it("메모는 501자부터 거부하고 문자열이 아니면 거부한다", () => {
    expect(errors({ title: "a", date: "2026-10-07", memo: "가".repeat(501) }).memo).toContain("500");
    expect(errors({ title: "a", date: "2026-10-07", memo: 5 }).memo).toBeTruthy();
  });

  it("명단에 없는 참석자나 배열이 아닌 값은 거부한다", () => {
    expect(errors({ title: "a", date: "2026-10-07", attendeeIds: ["p9"] }).attendeeIds).toContain("명단");
    expect(errors({ title: "a", date: "2026-10-07", attendeeIds: "p1" }).attendeeIds).toBeTruthy();
    expect(errors({ title: "a", date: "2026-10-07", attendeeIds: [1] }).attendeeIds).toBeTruthy();
  });

  it("허용되지 않은 알림 시점은 거부한다", () => {
    for (const remindOffsets of [[2], [-1], ["0"], "0", null, [0, 7], [1.5]]) {
      expect(errors({ title: "a", date: "2026-10-07", remindOffsets }).remindOffsets, JSON.stringify(remindOffsets)).toBeTruthy();
    }
  });
});

describe("validateEventInput — 여러 오류와 이상한 본문", () => {
  it("틀린 필드를 한꺼번에 알려준다", () => {
    const result = errors({ title: "", date: "2026-02-30", memo: "가".repeat(501), attendeeIds: ["p9"] });
    expect(Object.keys(result).sort()).toEqual(["attendeeIds", "date", "memo", "title"]);
  });

  it("객체가 아닌 본문은 거부한다", () => {
    for (const raw of [null, undefined, [], "text", 5, true]) {
      const result = validateEventInput(raw, people);
      expect(result.ok, String(raw)).toBe(false);
    }
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/people.test.ts src/lib/events/validate.test.ts`
Expected: FAIL — `./people`, `./validate` 모듈을 찾을 수 없다는 오류.

- [ ] **Step 3: 구현한다**

**`src/lib/people.ts`**

`````ts
/**
 * 고정된 참가자 명단. 환경변수 `PEOPLE="p1:참가자 1,p2:참가자 2,..."`로 정하고,
 * 저장하는 데이터에는 번호(`p1`)만 남겨서 이름을 나중에 바꿔도 기록이 유지되게 한다.
 */
export type Person = { id: string; name: string };
export type PeopleResult = { ok: true; people: Person[] } | { ok: false; error: string };

export const DEFAULT_PEOPLE = "p1:참가자 1,p2:참가자 2,p3:참가자 3,p4:참가자 4,p5:참가자 5";

const ID_PATTERN = /^[a-z0-9_-]{1,20}$/;
const MAX_NAME_LENGTH = 20;
const MAX_PEOPLE = 10;

export function parsePeople(raw: string | undefined): PeopleResult {
  const text = raw?.trim() ? raw.trim() : DEFAULT_PEOPLE;
  const people: Person[] = [];

  for (const part of text.split(",")) {
    const entry = part.trim();
    const colon = entry.indexOf(":");
    if (colon <= 0) {
      return { ok: false, error: `PEOPLE 형식이 올바르지 않아요: "${entry}" (번호:이름 형태여야 해요)` };
    }
    const id = entry.slice(0, colon).trim();
    const name = entry.slice(colon + 1).trim();
    if (!ID_PATTERN.test(id)) {
      return { ok: false, error: `PEOPLE의 번호 "${id}"는 영문 소문자, 숫자, _, -만 1~20자로 써야 해요.` };
    }
    if (!name || [...name].length > MAX_NAME_LENGTH) {
      return { ok: false, error: `PEOPLE의 "${id}" 이름은 1~${MAX_NAME_LENGTH}자여야 해요.` };
    }
    if (people.some((person) => person.id === id)) {
      return { ok: false, error: `PEOPLE에 같은 번호 "${id}"가 두 번 있어요.` };
    }
    people.push({ id, name });
  }

  if (people.length > MAX_PEOPLE) {
    return { ok: false, error: `PEOPLE은 ${MAX_PEOPLE}명까지만 쓸 수 있어요.` };
  }
  return { ok: true, people };
}

export function loadPeople(env: Record<string, string | undefined> = process.env): PeopleResult {
  return parsePeople(env.PEOPLE);
}

/** 번호로 이름을 찾는다. 명단에서 빠진 번호는 번호 그대로 보여준다. */
export function nameOf(people: Person[], id: string): string {
  return people.find((person) => person.id === id)?.name ?? id;
}
`````

**`src/lib/events/validate.ts`**

`````ts
import type { Person } from "@/lib/people";
import { compareTimes, isInSupportedRange, isValidDate, isValidTime } from "./dates";

export type EventInput = {
  title: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  memo: string | null;
  attendeeIds: string[];
  remindOffsets: number[];
};

export type EventField = "title" | "date" | "time" | "memo" | "attendeeIds" | "remindOffsets";
export type FieldErrors = Partial<Record<EventField, string>>;
export type ValidationResult = { ok: true; value: EventInput } | { ok: false; errors: FieldErrors };

/** 일정 알림 시점: 당일(0), 1일 전, 3일 전 */
export const REMIND_OPTIONS = [0, 1, 3] as const;
export const DEFAULT_REMIND_OFFSETS: readonly number[] = [0, 1];
export const MAX_TITLE_LENGTH = 100;
export const MAX_MEMO_LENGTH = 500;

/** 이모지도 한 글자로 센다. */
const length = (text: string) => [...text].length;

/** 비었으면 null, 문자열이면 다듬은 값, 그 밖의 타입이면 undefined(잘못된 값). */
function blankToNull(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const isRemindOption = (value: unknown): value is number => (REMIND_OPTIONS as readonly unknown[]).includes(value);

/** 사용자가 보낸 일정 내용을 검사하고 다듬는다. 틀린 필드는 한꺼번에 알려준다. */
export function validateEventInput(raw: unknown, people: Person[]): ValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: { title: "요청 내용이 올바르지 않아요." } };
  }
  const body = raw as Record<string, unknown>;
  const errors: FieldErrors = {};

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) errors.title = "제목을 입력해 주세요.";
  else if (length(title) > MAX_TITLE_LENGTH) errors.title = `제목은 ${MAX_TITLE_LENGTH}자 이하여야 해요.`;

  const date = typeof body.date === "string" ? body.date : "";
  if (!isValidDate(date)) errors.date = "날짜를 YYYY-MM-DD 형식으로 입력해 주세요.";
  else if (!isInSupportedRange(date)) errors.date = "2000년부터 2100년 사이의 날짜만 쓸 수 있어요.";

  let startTime: string | null = null;
  let endTime: string | null = null;
  const start = blankToNull(body.startTime);
  const end = blankToNull(body.endTime);
  if (start === undefined || end === undefined) {
    errors.time = "시각이 올바르지 않아요.";
  } else if (start === null && end === null) {
    // 종일 일정
  } else if (start === null || end === null) {
    errors.time = "시작과 종료 시각을 함께 입력해 주세요.";
  } else if (!isValidTime(start) || !isValidTime(end)) {
    errors.time = "시각은 00:00부터 23:59 사이의 HH:MM 형식이어야 해요.";
  } else if (compareTimes(end, start) <= 0) {
    errors.time = "종료 시각은 시작 시각보다 뒤여야 해요.";
  } else {
    startTime = start;
    endTime = end;
  }

  let memo: string | null = null;
  if (body.memo !== undefined && body.memo !== null) {
    if (typeof body.memo !== "string") {
      errors.memo = "메모가 올바르지 않아요.";
    } else {
      const trimmed = body.memo.trim();
      if (length(trimmed) > MAX_MEMO_LENGTH) errors.memo = `메모는 ${MAX_MEMO_LENGTH}자 이하여야 해요.`;
      else memo = trimmed || null;
    }
  }

  let attendeeIds: string[] = [];
  if (body.attendeeIds !== undefined) {
    if (!Array.isArray(body.attendeeIds) || body.attendeeIds.some((id) => typeof id !== "string")) {
      errors.attendeeIds = "참석자가 올바르지 않아요.";
    } else {
      const chosen = new Set(body.attendeeIds as string[]);
      if ([...chosen].some((id) => !people.some((person) => person.id === id))) {
        errors.attendeeIds = "명단에 없는 참석자예요.";
      } else {
        attendeeIds = people.filter((person) => chosen.has(person.id)).map((person) => person.id);
      }
    }
  }

  let remindOffsets: number[] = [...DEFAULT_REMIND_OFFSETS];
  if (body.remindOffsets !== undefined) {
    const list = body.remindOffsets;
    if (!Array.isArray(list) || !list.every(isRemindOption)) {
      errors.remindOffsets = "알림 시점은 당일, 1일 전, 3일 전 중에서 골라 주세요.";
    } else {
      remindOffsets = [...new Set(list)].sort((a, b) => a - b);
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { title, date, startTime, endTime, memo, attendeeIds, remindOffsets } };
}
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/people.test.ts src/lib/events/validate.test.ts`
Expected: PASS — 두 파일 모두 통과.

- [ ] **Step 5: 커밋한다**

```bash
git add src/lib/people.ts src/lib/people.test.ts src/lib/events/validate.ts src/lib/events/validate.test.ts
git commit -m "feat: add the fixed people list and event input validation"
```

---

### Task 3: 데이터베이스 표와 일정 저장소

**Files:**
- Create: `db/migrations/0002_events.sql`, `src/lib/events/store.ts`, `src/lib/events/store.test.ts`
- Modify: `src/lib/db/migrate.test.ts` (새 표 확인)

**Interfaces:**
- Consumes: 계획 2의 `Db`, `createTestDb`, Task 2의 `EventInput`
- Produces:
  - 표 `events(id integer identity PK, title, event_date date, start_time time null, end_time time null, memo null, attendee_ids text[] default '{}', remind_offsets integer[] default '{0,1}', created_at, updated_at)`, `sent_reminders(event_id FK on delete cascade, offset_days, sent_on date, PK (event_id, offset_days))`, `auth_attempts(ip_hash PK, failed_count, window_start timestamptz)`
  - `type EventRecord = EventInput & { id: number }`, `createEvent(db, input): Promise<number>`, `updateEvent(db, id, input): Promise<boolean>`(없는 일정이면 false), `deleteEvent(db, id): Promise<boolean>`, `getEvent(db, id): Promise<EventRecord | null>`, `listEventsInRange(db, from, to): Promise<EventRecord[]>`(양 끝 포함, 날짜 → 시각 순, 종일이 먼저)
  - 일정의 날짜나 알림 시점이 바뀌면 그 일정의 `sent_reminders` 행이 지워진다(다시 알림이 가도록). 다른 필드만 바뀌면 남는다.

모임 연결(`meetup_id`)은 계획 4가 자기 마이그레이션에서 `events`에 더한다. 이 계획의 `events`에는 없다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/events/store.test.ts`**

`````ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { createEvent, deleteEvent, getEvent, listEventsInRange, updateEvent } from "./store";
import type { EventInput } from "./validate";

const base: EventInput = {
  title: "회의",
  date: "2026-10-07",
  startTime: null,
  endTime: null,
  memo: null,
  attendeeIds: [],
  remindOffsets: [0, 1],
};

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(async () => {
  await close();
});

async function markSent(id: number, offset: number): Promise<void> {
  await db.query("insert into sent_reminders (event_id, offset_days, sent_on) values ($1, $2, '2026-10-07')", [id, offset]);
}
async function sentCount(id: number): Promise<number> {
  return (await db.query<{ n: number }>("select count(*)::int as n from sent_reminders where event_id = $1", [id]))[0].n;
}

describe("createEvent / getEvent", () => {
  it("만든 일정을 그대로 읽는다", async () => {
    const input: EventInput = {
      title: "스터디",
      date: "2026-10-07",
      startTime: "14:00",
      endTime: "16:30",
      memo: "3층 회의실",
      attendeeIds: ["p1", "p2"],
      remindOffsets: [0, 3],
    };
    const id = await createEvent(db, input);
    expect(await getEvent(db, id)).toEqual({ id, ...input });
  });

  it("종일 일정과 빈 메모, 빈 목록은 null과 빈 배열로 읽는다", async () => {
    const id = await createEvent(db, { ...base, remindOffsets: [] });
    expect(await getEvent(db, id)).toEqual({ id, ...base, remindOffsets: [] });
  });

  it("번호가 계속 늘어나고, 참석자 값에 공백·따옴표·쉼표가 있어도 그대로 저장된다", async () => {
    const tricky = ["p 1", 'a"b', "c'd", "e,f", "{x}"];
    const first = await createEvent(db, { ...base, attendeeIds: tricky });
    const second = await createEvent(db, base);
    expect(second).toBeGreaterThan(first);
    expect((await getEvent(db, first))?.attendeeIds).toEqual(tricky);
  });

  it("없는 일정은 null이다", async () => {
    expect(await getEvent(db, 999)).toBeNull();
  });
});

describe("listEventsInRange", () => {
  it("범위 안의 일정만, 날짜 → 종일 먼저 → 시각 순으로 돌려준다(양 끝 포함)", async () => {
    const at = (date: string, startTime: string | null, title: string): EventInput => ({
      ...base,
      title,
      date,
      startTime,
      endTime: startTime ? "23:00" : null,
    });
    await createEvent(db, at("2026-10-07", "14:00", "오후"));
    await createEvent(db, at("2026-10-07", null, "종일"));
    await createEvent(db, at("2026-10-07", "09:00", "오전"));
    await createEvent(db, at("2026-10-06", null, "전날"));
    await createEvent(db, at("2026-10-08", "08:00", "다음날"));
    await createEvent(db, at("2026-10-05", null, "범위 밖 앞"));
    await createEvent(db, at("2026-10-09", null, "범위 밖 뒤"));

    const events = await listEventsInRange(db, "2026-10-06", "2026-10-08");
    expect(events.map((e) => e.title)).toEqual(["전날", "종일", "오전", "오후", "다음날"]);
  });

  it("일정이 없는 범위는 빈 배열이다", async () => {
    expect(await listEventsInRange(db, "2026-01-01", "2026-01-31")).toEqual([]);
  });
});

describe("updateEvent", () => {
  it("내용을 바꾸고 true를 돌려준다. 없는 일정이면 false다", async () => {
    const id = await createEvent(db, base);
    const changed: EventInput = { ...base, title: "바뀐 제목", startTime: "10:00", endTime: "11:00", memo: "메모", attendeeIds: ["p2"] };
    expect(await updateEvent(db, id, changed)).toBe(true);
    expect(await getEvent(db, id)).toEqual({ id, ...changed });
    expect(await updateEvent(db, 999, changed)).toBe(false);
  });

  it("날짜를 바꾸면 그 일정의 알림 기록이 지워진다(다른 일정은 그대로)", async () => {
    const id = await createEvent(db, base);
    const other = await createEvent(db, base);
    await markSent(id, 0);
    await markSent(id, 1);
    await markSent(other, 0);

    await updateEvent(db, id, { ...base, date: "2026-10-08" });

    expect(await sentCount(id)).toBe(0);
    expect(await sentCount(other)).toBe(1);
  });

  it("알림 시점을 바꾸면 알림 기록이 지워진다", async () => {
    const id = await createEvent(db, base);
    await markSent(id, 0);
    await updateEvent(db, id, { ...base, remindOffsets: [0, 3] });
    expect(await sentCount(id)).toBe(0);
  });

  it("제목, 메모, 시각, 참석자만 바꾸면 알림 기록이 남는다", async () => {
    const id = await createEvent(db, base);
    await markSent(id, 0);
    await markSent(id, 1);

    await updateEvent(db, id, { ...base, title: "제목만 바뀜", memo: "메모", startTime: "10:00", endTime: "11:00", attendeeIds: ["p1"] });

    expect(await sentCount(id)).toBe(2);
  });

  it("같은 값으로 저장해도 알림 기록이 남는다", async () => {
    const id = await createEvent(db, base);
    await markSent(id, 0);
    await updateEvent(db, id, base);
    expect(await sentCount(id)).toBe(1);
  });
});

describe("deleteEvent", () => {
  it("일정과 알림 기록을 함께 지우고 true를 돌려준다. 없으면 false다", async () => {
    const id = await createEvent(db, base);
    await markSent(id, 0);

    expect(await deleteEvent(db, id)).toBe(true);
    expect(await getEvent(db, id)).toBeNull();
    expect(await sentCount(id)).toBe(0);
    expect(await deleteEvent(db, id)).toBe(false);
  });
});
`````

`src/lib/db/migrate.test.ts`의 표 확인을 찾아서

`````ts
    expect(tables.map((t) => t.table_name)).toEqual(expect.arrayContaining(["push_subscriptions", "schema_migrations"]));
`````

이렇게 바꾼다.

`````ts
    expect(tables.map((t) => t.table_name)).toEqual(
      expect.arrayContaining(["push_subscriptions", "events", "sent_reminders", "auth_attempts", "schema_migrations"]),
    );
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/events/store.test.ts src/lib/db/migrate.test.ts`
Expected: FAIL — `./store` 모듈을 찾을 수 없고, 마이그레이션 테스트는 `events` 표가 없어 실패한다.

- [ ] **Step 3: 마이그레이션과 저장소를 만든다**

**`db/migrations/0002_events.sql`**

`````sql
-- 일정, 일정 알림 발송 기록, 편집 코드 실패 기록.
-- 날짜와 시각은 모두 한국시간 기준의 시간대 없는 값(date, time)이다.
-- 마이그레이션은 여러 번 실행해도 안전하도록 항상 `if not exists`를 쓴다.

create table if not exists events (
  id integer generated always as identity primary key,
  title text not null,
  event_date date not null,
  start_time time,
  end_time time,
  memo text,
  attendee_ids text[] not null default '{}',
  remind_offsets integer[] not null default '{0,1}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_event_date_idx on events (event_date);

create table if not exists sent_reminders (
  event_id integer not null references events (id) on delete cascade,
  offset_days integer not null,
  sent_on date not null,
  primary key (event_id, offset_days)
);

create table if not exists auth_attempts (
  ip_hash text primary key,
  failed_count integer not null,
  window_start timestamptz not null
);
`````

**`src/lib/events/store.ts`**

`````ts
import type { Db } from "@/lib/db/types";
import type { EventInput } from "./validate";

export type EventRecord = EventInput & { id: number };

type EventRow = {
  id: number;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  memo: string | null;
  attendee_ids: string[];
  remind_offsets: number[];
};

// 드라이버마다 date, time을 다른 타입(Date 등)으로 읽으므로, SQL에서 문자열로 바꿔서 받는다.
const SELECT_EVENT = `
  select id, title,
         to_char(event_date, 'YYYY-MM-DD') as date,
         to_char(start_time, 'HH24:MI') as start_time,
         to_char(end_time, 'HH24:MI') as end_time,
         memo, attendee_ids, remind_offsets
  from events`;

function toRecord(row: EventRow): EventRecord {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    memo: row.memo,
    attendeeIds: row.attendee_ids,
    remindOffsets: row.remind_offsets,
  };
}

export async function createEvent(db: Db, input: EventInput): Promise<number> {
  const rows = await db.query<{ id: number }>(
    `insert into events (title, event_date, start_time, end_time, memo, attendee_ids, remind_offsets)
     values ($1, $2::date, $3::time, $4::time, $5, $6::text[], $7::integer[])
     returning id`,
    [input.title, input.date, input.startTime, input.endTime, input.memo, input.attendeeIds, input.remindOffsets],
  );
  return rows[0].id;
}

/**
 * 일정을 고친다. 없는 일정이면 false.
 * 날짜나 알림 시점이 바뀌면 그 일정의 알림 기록(sent_reminders)을 지워서 새 일정대로 다시 알림이 가게 한다.
 * 한 문장(CTE)으로 처리해서, 고치는 것과 기록을 지우는 것이 함께 일어나거나 함께 안 일어난다.
 */
export async function updateEvent(db: Db, id: number, input: EventInput): Promise<boolean> {
  const rows = await db.query<{ id: number }>(
    `with old as (
       select event_date, remind_offsets from events where id = $1
     ),
     upd as (
       update events
          set title = $2, event_date = $3::date, start_time = $4::time, end_time = $5::time, memo = $6,
              attendee_ids = $7::text[], remind_offsets = $8::integer[], updated_at = now()
        where id = $1
        returning event_date, remind_offsets
     ),
     del as (
       delete from sent_reminders
        where event_id = $1
          and exists (
            select 1 from old, upd
             where old.event_date <> upd.event_date or old.remind_offsets <> upd.remind_offsets
          )
     )
     select id from events where id = $1 and exists (select 1 from upd)`,
    [id, input.title, input.date, input.startTime, input.endTime, input.memo, input.attendeeIds, input.remindOffsets],
  );
  return rows.length > 0;
}

/** 일정을 지운다(알림 기록은 함께 지워진다). 없는 일정이면 false. */
export async function deleteEvent(db: Db, id: number): Promise<boolean> {
  const rows = await db.query<{ id: number }>("delete from events where id = $1 returning id", [id]);
  return rows.length > 0;
}

export async function getEvent(db: Db, id: number): Promise<EventRecord | null> {
  const rows = await db.query<EventRow>(`${SELECT_EVENT} where id = $1`, [id]);
  return rows[0] ? toRecord(rows[0]) : null;
}

/** 두 날짜 사이(양 끝 포함)의 일정. 날짜 → 종일이 먼저 → 시작 시각 → 번호 순. */
export async function listEventsInRange(db: Db, from: string, to: string): Promise<EventRecord[]> {
  const rows = await db.query<EventRow>(
    `${SELECT_EVENT} where event_date between $1::date and $2::date order by event_date, start_time nulls first, id`,
    [from, to],
  );
  return rows.map(toRecord);
}
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/events src/lib/db`
Expected: PASS — 저장소 테스트와 마이그레이션 테스트(다시 실행해도 안전한지 포함) 모두 통과.

- [ ] **Step 5: 전체를 확인하고 커밋한다**

```bash
npm test
npm run typecheck
git add db src/lib/events/store.ts src/lib/events/store.test.ts src/lib/db/migrate.test.ts
git commit -m "feat: add events, reminder records and lockout tables with the event store"
```

Expected: 전체 테스트 통과, 타입 오류 없음.

---

### Task 4: 편집 인증의 기초 (서명 쿠키, IP 해시, 실패 잠금)

**Files:**
- Create: `src/lib/auth/safe-equal.ts`, `src/lib/auth/session.ts`, `src/lib/auth/session.test.ts`, `src/lib/auth/ip.ts`, `src/lib/auth/ip.test.ts`, `src/lib/auth/config.ts`, `src/lib/auth/config.test.ts`, `src/lib/auth/attempts.ts`, `src/lib/auth/attempts.test.ts`

**Interfaces:**
- Consumes: Task 3의 `auth_attempts` 표, 계획 2의 `Db`, `createTestDb`
- Produces:
  - `safeEqual(a: string, b: string): boolean` (시간이 일정한 문자열 비교)
  - `SESSION_COOKIE = "edit_session"`, `SESSION_TTL_SECONDS = 604800`, `createSessionToken(secret, nowMs, ttlSeconds?): string`, `verifySessionToken(token, secret, nowMs): boolean`, `sessionCookie(token, secure): string`(Set-Cookie 값), `clearSessionCookie(secure): string`, `readCookie(header, name): string | undefined`
  - `clientIp(headers: Headers): string`, `hashIp(ip, secret): string`
  - `loadAuthConfig(env?): { ok: true; config: { editCode; sessionSecret } } | { ok: false; missing: string[] }`
  - `MAX_FAILURES = 5`, `WINDOW_MINUTES = 10`, `type LockState = { locked: false } | { locked: true; retryAfterMinutes: number }`, `checkLock(db, ipHash, now): Promise<LockState>`, `recordFailure(db, ipHash, now): Promise<LockState>`(이번 실패까지 셈한 상태), `clearFailures(db, ipHash): Promise<void>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/auth/session.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  clearSessionCookie,
  createSessionToken,
  readCookie,
  sessionCookie,
  verifySessionToken,
} from "./session";

const SECRET = "s".repeat(32);
const NOW = 1_800_000_000_000;

describe("세션 토큰", () => {
  it("만든 토큰은 만료 전에 통과한다", () => {
    const token = createSessionToken(SECRET, NOW);
    expect(verifySessionToken(token, SECRET, NOW)).toBe(true);
    expect(verifySessionToken(token, SECRET, NOW + (SESSION_TTL_SECONDS - 1) * 1000)).toBe(true);
  });

  it("만료 시각부터는 거부한다", () => {
    const token = createSessionToken(SECRET, NOW);
    const expiresMs = (Math.floor(NOW / 1000) + SESSION_TTL_SECONDS) * 1000;
    expect(verifySessionToken(token, SECRET, expiresMs - 1)).toBe(true);
    expect(verifySessionToken(token, SECRET, expiresMs)).toBe(false);
    expect(verifySessionToken(token, SECRET, expiresMs + 86_400_000)).toBe(false);
  });

  it("만료 시각을 고치거나 서명을 바꾸면 거부한다", () => {
    const token = createSessionToken(SECRET, NOW);
    const [payload, signature] = token.split(".");
    expect(verifySessionToken(`${Number(payload) + 1_000_000}.${signature}`, SECRET, NOW)).toBe(false);
    expect(verifySessionToken(`${payload}.${signature.replace(/.$/, signature.endsWith("0") ? "1" : "0")}`, SECRET, NOW)).toBe(false);
    expect(verifySessionToken(`${payload}.`, SECRET, NOW)).toBe(false);
  });

  it("다른 비밀키로 서명한 토큰은 거부한다", () => {
    const token = createSessionToken("x".repeat(32), NOW);
    expect(verifySessionToken(token, SECRET, NOW)).toBe(false);
  });

  it("모양이 이상한 토큰은 죽지 않고 거부한다", () => {
    for (const token of [undefined, null, "", "abc", ".", "1.2.3", "9999999999999.abc", "-1.abc", "1e9.abc", "abc.def", "  "]) {
      expect(verifySessionToken(token, SECRET, NOW), String(token)).toBe(false);
    }
  });
});

describe("쿠키 문자열", () => {
  it("Set-Cookie 값에 보안 속성이 붙는다", () => {
    const cookie = sessionCookie("tok.en", true);
    expect(cookie).toContain(`${SESSION_COOKIE}=tok.en`);
    for (const part of ["Path=/", "Max-Age=604800", "HttpOnly", "SameSite=Lax", "Secure"]) expect(cookie).toContain(part);
  });

  it("secure가 꺼져 있으면 Secure를 붙이지 않는다(로컬 개발용)", () => {
    expect(sessionCookie("t", false)).not.toContain("Secure");
    expect(clearSessionCookie(false)).not.toContain("Secure");
  });

  it("지우는 쿠키는 값이 비고 Max-Age가 0이다", () => {
    const cookie = clearSessionCookie(true);
    expect(cookie).toContain(`${SESSION_COOKIE}=;`);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
  });

  it("요청의 Cookie 헤더에서 이름으로 값을 찾는다", () => {
    expect(readCookie("a=1; edit_session=abc.def; b=2", "edit_session")).toBe("abc.def");
    expect(readCookie("edit_session=abc", "edit_session")).toBe("abc");
    expect(readCookie("xedit_session=abc", "edit_session")).toBeUndefined();
    expect(readCookie("a=1", "edit_session")).toBeUndefined();
    expect(readCookie("", "edit_session")).toBeUndefined();
    expect(readCookie(null, "edit_session")).toBeUndefined();
    expect(readCookie("edit_session=a=b", "edit_session")).toBe("a=b");
  });
});
`````

**`src/lib/auth/ip.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { clientIp, hashIp } from "./ip";

describe("clientIp", () => {
  it("x-forwarded-for의 첫 값을 쓴다", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientIp(new Headers({ "x-forwarded-for": " 203.0.113.5 " }))).toBe("203.0.113.5");
  });

  it("없으면 x-real-ip, 그것도 없으면 unknown이다", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(new Headers())).toBe("unknown");
    expect(clientIp(new Headers({ "x-forwarded-for": "" }))).toBe("unknown");
  });

  it("아주 긴 값은 잘라서 쓴다", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "a".repeat(500) })).length).toBeLessThanOrEqual(100);
  });
});

describe("hashIp", () => {
  it("같은 입력은 같은 값이고, 비밀키가 다르면 다른 값이며, 원래 IP는 드러나지 않는다", () => {
    const one = hashIp("203.0.113.5", "secret-a".repeat(3));
    expect(hashIp("203.0.113.5", "secret-a".repeat(3))).toBe(one);
    expect(hashIp("203.0.113.5", "secret-b".repeat(3))).not.toBe(one);
    expect(hashIp("203.0.113.6", "secret-a".repeat(3))).not.toBe(one);
    expect(one).toMatch(/^[0-9a-f]{32}$/);
    expect(one).not.toContain("203");
  });
});
`````

**`src/lib/auth/config.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { loadAuthConfig } from "./config";

describe("loadAuthConfig", () => {
  it("둘 다 없으면 무엇이 없는지 알려준다", () => {
    const result = loadAuthConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["EDIT_CODE (8자 이상)", "SESSION_SECRET (16자 이상)"]);
  });

  it("너무 짧은 값은 없는 것으로 본다", () => {
    const result = loadAuthConfig({ EDIT_CODE: "short", SESSION_SECRET: "too-short" });
    expect(result.ok).toBe(false);
  });

  it("충분히 길면 공백을 다듬어서 돌려준다", () => {
    expect(loadAuthConfig({ EDIT_CODE: "  code-12345678 ", SESSION_SECRET: "s".repeat(16) })).toEqual({
      ok: true,
      config: { editCode: "code-12345678", sessionSecret: "s".repeat(16) },
    });
  });
});
`````

**`src/lib/auth/attempts.test.ts`**

`````ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { MAX_FAILURES, checkLock, clearFailures, recordFailure } from "./attempts";

const T0 = new Date("2026-10-07T03:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(async () => {
  await close();
});

describe("실패 잠금", () => {
  it("기록이 없으면 잠겨 있지 않다", async () => {
    expect(await checkLock(db, "ip-a", T0)).toEqual({ locked: false });
  });

  it("4번까지는 잠기지 않고, 5번째 실패에 잠긴다(남은 시간은 첫 실패로부터 10분)", async () => {
    for (let i = 0; i < MAX_FAILURES - 1; i += 1) {
      expect(await recordFailure(db, "ip-a", at(i)), `${i + 1}번째`).toEqual({ locked: false });
    }
    expect(await recordFailure(db, "ip-a", at(4))).toEqual({ locked: true, retryAfterMinutes: 6 });
  });

  it("잠금은 시간이 지날수록 남은 분이 줄고, 10분이 지나면 풀린다", async () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) await recordFailure(db, "ip-a", T0);

    expect(await checkLock(db, "ip-a", T0)).toEqual({ locked: true, retryAfterMinutes: 10 });
    expect(await checkLock(db, "ip-a", at(3))).toEqual({ locked: true, retryAfterMinutes: 7 });
    expect(await checkLock(db, "ip-a", new Date(T0.getTime() + 9.5 * 60_000))).toEqual({ locked: true, retryAfterMinutes: 1 });
    expect(await checkLock(db, "ip-a", at(10))).toEqual({ locked: false });
  });

  it("10분이 지난 뒤의 실패는 새로 센다", async () => {
    for (let i = 0; i < MAX_FAILURES - 1; i += 1) await recordFailure(db, "ip-a", T0);
    expect(await recordFailure(db, "ip-a", at(11))).toEqual({ locked: false });

    // 새 창에서 4번 더 실패하면(합쳐서 5번째) 그때 잠긴다.
    for (let i = 0; i < MAX_FAILURES - 2; i += 1) expect((await recordFailure(db, "ip-a", at(12))).locked).toBe(false);
    expect((await recordFailure(db, "ip-a", at(12))).locked).toBe(true);
  });

  it("성공하면 기록을 지운다", async () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) await recordFailure(db, "ip-a", T0);
    await clearFailures(db, "ip-a");
    expect(await checkLock(db, "ip-a", T0)).toEqual({ locked: false });
    expect(await recordFailure(db, "ip-a", T0)).toEqual({ locked: false });
  });

  it("IP마다 따로 센다", async () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) await recordFailure(db, "ip-a", T0);
    expect((await checkLock(db, "ip-a", T0)).locked).toBe(true);
    expect(await checkLock(db, "ip-b", T0)).toEqual({ locked: false });
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/auth`
Expected: FAIL — `./session`, `./ip`, `./config`, `./attempts` 모듈을 찾을 수 없다는 오류(네 파일 모두).

- [ ] **Step 3: 구현한다**

**`src/lib/auth/safe-equal.ts`**

`````ts
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * 두 문자열이 같은지 비교한다. 길이가 달라도 걸리는 시간으로 정보를 흘리지 않도록,
 * 둘 다 SHA-256으로 같은 길이로 만든 뒤 시간이 일정한 방식으로 비교한다.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}
`````

**`src/lib/auth/session.ts`**

`````ts
import { createHmac } from "node:crypto";
import { safeEqual } from "./safe-equal";

export const SESSION_COOKIE = "edit_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** 토큰은 "<만료 시각(초)>.<서명>" 모양이다. 서버에 세션을 저장하지 않고, 서명과 만료 시각만 확인한다. */
export function createSessionToken(secret: string, nowMs: number, ttlSeconds = SESSION_TTL_SECONDS): string {
  const payload = String(Math.floor(nowMs / 1000) + ttlSeconds);
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string | undefined | null, secret: string, nowMs: number): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  if (!/^\d{1,12}$/.test(payload) || !signature) return false;
  if (!safeEqual(signature, sign(payload, secret))) return false;
  return Number(payload) * 1000 > nowMs;
}

function cookieAttributes(maxAge: number, secure: boolean): string[] {
  return ["Path=/", `Max-Age=${maxAge}`, "HttpOnly", "SameSite=Lax", ...(secure ? ["Secure"] : [])];
}

/** `Set-Cookie` 헤더 값. `secure`는 프로덕션(HTTPS)에서만 켠다. */
export function sessionCookie(token: string, secure: boolean): string {
  return [`${SESSION_COOKIE}=${token}`, ...cookieAttributes(SESSION_TTL_SECONDS, secure)].join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  return [`${SESSION_COOKIE}=`, ...cookieAttributes(0, secure)].join("; ");
}

/** 요청의 `Cookie` 헤더에서 이름으로 값을 찾는다. */
export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const equals = trimmed.indexOf("=");
    if (equals > 0 && trimmed.slice(0, equals) === name) return trimmed.slice(equals + 1);
  }
  return undefined;
}
`````

**`src/lib/auth/ip.ts`**

`````ts
import { createHmac } from "node:crypto";

const MAX_IP_LENGTH = 100;

/**
 * 요청한 사람의 IP. Vercel은 `x-forwarded-for`에 클라이언트의 공개 IP를 넣고, 밖에서 위조하지 못하게 덮어쓴다.
 * 로컬처럼 헤더가 없으면 모두 "unknown" 하나로 센다.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim() || "unknown";
  return ip.slice(0, MAX_IP_LENGTH);
}

/** IP를 그대로 저장하지 않고, 비밀키로 해시한 값만 저장한다. */
export function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32);
}
`````

**`src/lib/auth/config.ts`**

`````ts
export type AuthConfig = { editCode: string; sessionSecret: string };
export type AuthConfigResult = { ok: true; config: AuthConfig } | { ok: false; missing: string[] };

/** 편집 인증에 필요한 환경변수. 없거나 너무 짧으면 편집을 막고(조회는 된다), 무엇이 문제인지 알려준다. */
export function loadAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfigResult {
  const editCode = env.EDIT_CODE?.trim();
  const sessionSecret = env.SESSION_SECRET?.trim();

  const missing: string[] = [];
  if (!editCode || editCode.length < 8) missing.push("EDIT_CODE (8자 이상)");
  if (!sessionSecret || sessionSecret.length < 16) missing.push("SESSION_SECRET (16자 이상)");
  if (missing.length > 0 || !editCode || !sessionSecret) return { ok: false, missing };
  return { ok: true, config: { editCode, sessionSecret } };
}
`````

**`src/lib/auth/attempts.ts`**

`````ts
import type { Db } from "@/lib/db/types";

/** 10분 안에 5번 틀리면 그 IP를 10분(첫 실패 시각 기준) 동안 잠근다. */
export const MAX_FAILURES = 5;
export const WINDOW_MINUTES = 10;
const WINDOW_MS = WINDOW_MINUTES * 60_000;

export type LockState = { locked: false } | { locked: true; retryAfterMinutes: number };

type AttemptRow = { failed_count: number; window_ms: number };

// timestamptz도 드라이버마다 읽는 타입이 달라서, 에포크 밀리초 숫자로 바꿔서 받는다.
const WINDOW_MS_SQL = "floor(extract(epoch from window_start) * 1000)::float8 as window_ms";

function stateOf(row: AttemptRow | undefined, now: Date): LockState {
  if (!row || row.failed_count < MAX_FAILURES) return { locked: false };
  const remaining = row.window_ms + WINDOW_MS - now.getTime();
  if (remaining <= 0) return { locked: false };
  return { locked: true, retryAfterMinutes: Math.ceil(remaining / 60_000) };
}

export async function checkLock(db: Db, ipHash: string, now: Date): Promise<LockState> {
  const rows = await db.query<AttemptRow>(
    `select failed_count, ${WINDOW_MS_SQL} from auth_attempts where ip_hash = $1`,
    [ipHash],
  );
  return stateOf(rows[0], now);
}

/** 실패를 하나 기록하고, 이번 실패까지 센 잠금 상태를 돌려준다. 한 문장이라 동시에 들어와도 하나도 빠지지 않는다. */
export async function recordFailure(db: Db, ipHash: string, now: Date): Promise<LockState> {
  const rows = await db.query<AttemptRow>(
    `insert into auth_attempts (ip_hash, failed_count, window_start)
     values ($1, 1, $2::timestamptz)
     on conflict (ip_hash) do update set
       failed_count = case
         when auth_attempts.window_start <= $2::timestamptz - make_interval(mins => $3::integer) then 1
         else auth_attempts.failed_count + 1 end,
       window_start = case
         when auth_attempts.window_start <= $2::timestamptz - make_interval(mins => $3::integer) then $2::timestamptz
         else auth_attempts.window_start end
     returning failed_count, ${WINDOW_MS_SQL}`,
    [ipHash, now.toISOString(), WINDOW_MINUTES],
  );
  return stateOf(rows[0], now);
}

export async function clearFailures(db: Db, ipHash: string): Promise<void> {
  await db.query("delete from auth_attempts where ip_hash = $1", [ipHash]);
}
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/auth`
Expected: PASS — 네 파일 모두 통과.

- [ ] **Step 5: 커밋한다**

```bash
git add src/lib/auth
git commit -m "feat: add signed session cookies, IP hashing and failure lockout"
```

---

### Task 5: 로그인·로그아웃 API와 편집 권한 확인

**Files:**
- Create: `src/lib/http.ts`, `src/lib/http.test.ts`, `src/lib/auth/handlers.ts`, `src/lib/auth/handlers.test.ts`, `src/lib/auth/instance.ts`, `src/lib/auth/server.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`

**Interfaces:**
- Consumes: Task 4의 모든 것, 계획 2의 `Db`, `getDbOrNull`
- Produces:
  - `json(body, status?, headers?): Response`, `readJsonBody(request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }>` (415 / 400 / 413, 본문 20KB 이하)
  - `createAuthHandlers({ getDb, env, now, secureCookies })` → `{ login(request), logout(request) }`
    - `login`: JSON `{ code }`. 성공 200 `{ ok: true }` + `Set-Cookie`, 틀리면 401 `{ error }`, 잠기면 429 `{ error, retryAfterMinutes }` + `Retry-After`(초), 설정 없음·DB 없음·DB 오류는 503
    - `logout`: 200과 지우는 `Set-Cookie`
  - `requireEditSession(request, env, now): { ok: true } | { ok: false; response: Response }` — 쿠키가 없거나 틀리면 401, 인증 환경변수가 없으면 503
  - `hasEditSession(): Promise<boolean>` (서버 컴포넌트에서 쿠키를 읽어 확인, `server-only`)
  - 라우트: `POST /api/auth/login`, `POST /api/auth/logout`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/http.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { json, readJsonBody } from "./http";

const post = (body: BodyInit | null, contentType?: string) =>
  new Request("http://localhost/x", { method: "POST", body, headers: contentType ? { "content-type": contentType } : {} });

describe("json", () => {
  it("상태 코드와 헤더를 붙여 JSON으로 응답한다", async () => {
    const response = json({ a: 1 }, 201, { "x-test": "1" });
    expect(response.status).toBe(201);
    expect(response.headers.get("x-test")).toBe("1");
    expect(await response.json()).toEqual({ a: 1 });
  });
});

describe("readJsonBody", () => {
  it("application/json이면 본문을 읽는다(대소문자와 charset은 무시)", async () => {
    for (const type of ["application/json", "Application/JSON", "application/json; charset=utf-8"]) {
      expect(await readJsonBody(post('{"a":1}', type)), type).toEqual({ ok: true, body: { a: 1 } });
    }
  });

  it("다른 Content-Type이면 415다(다른 사이트의 폼 전송 등)", async () => {
    for (const type of [undefined, "text/plain", "application/x-www-form-urlencoded", "application/json-patch+json", "multipart/form-data"]) {
      const result = await readJsonBody(post('{"a":1}', type));
      expect(result.ok, String(type)).toBe(false);
      if (!result.ok) expect(result.response.status, String(type)).toBe(415);
    }
  });

  it("깨진 JSON은 400이다", async () => {
    const result = await readJsonBody(post("{oops", "application/json"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it("20KB가 넘는 본문은 413이다", async () => {
    const big = JSON.stringify({ memo: "가".repeat(20_001) });
    const result = await readJsonBody(post(big, "application/json"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("JSON 값이 배열이나 null이어도 그대로 돌려준다(검사는 받는 쪽이 한다)", async () => {
    expect(await readJsonBody(post("null", "application/json"))).toEqual({ ok: true, body: null });
    expect(await readJsonBody(post("[1]", "application/json"))).toEqual({ ok: true, body: [1] });
  });
});
`````

**`src/lib/auth/handlers.test.ts`**

`````ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { createAuthHandlers, requireEditSession, type AuthDeps } from "./handlers";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken, readCookie, verifySessionToken } from "./session";

const CODE = "correct-horse-battery";
const SECRET = "s".repeat(32);
const ENV = { EDIT_CODE: CODE, SESSION_SECRET: SECRET };

let db: Db;
let close: () => Promise<void>;
let clock: Date;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  clock = new Date("2026-10-07T03:00:00Z");
});
afterEach(async () => {
  await close();
});

const deps = (overrides: Partial<AuthDeps> = {}): AuthDeps => ({
  getDb: () => db,
  env: () => ENV,
  now: () => clock,
  secureCookies: false,
  ...overrides,
});

function loginRequest(code: unknown, ip = "1.2.3.4", contentType = "application/json"): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": contentType, "x-forwarded-for": ip },
    body: JSON.stringify({ code }),
  });
}

describe("login", () => {
  it("올바른 코드면 200과 서명 쿠키를 준다", async () => {
    const response = await createAuthHandlers(deps()).login(loginRequest(CODE));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    const token = readCookie(cookie.split(";")[0], SESSION_COOKIE);
    expect(verifySessionToken(token, SECRET, clock.getTime())).toBe(true);
  });

  it("프로덕션 설정이면 Secure가 붙는다", async () => {
    const response = await createAuthHandlers(deps({ secureCookies: true })).login(loginRequest(CODE));
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("틀린 코드는 401이고 쿠키를 주지 않는다", async () => {
    const response = await createAuthHandlers(deps()).login(loginRequest("wrong"));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toContain("코드가 맞지 않아요");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("5번 틀리면 잠기고, 잠긴 동안은 올바른 코드도 거부하며, 10분 뒤 풀린다", async () => {
    const handlers = createAuthHandlers(deps());
    for (let i = 0; i < 4; i += 1) expect((await handlers.login(loginRequest("wrong"))).status, `${i + 1}번째`).toBe(401);

    const fifth = await handlers.login(loginRequest("wrong"));
    expect(fifth.status).toBe(429);
    expect(await fifth.json()).toMatchObject({ retryAfterMinutes: 10 });
    expect(fifth.headers.get("retry-after")).toBe("600");

    const whileLocked = await handlers.login(loginRequest(CODE));
    expect(whileLocked.status).toBe(429);
    expect(whileLocked.headers.get("set-cookie")).toBeNull();

    clock = new Date(clock.getTime() + 10 * 60_000);
    expect((await handlers.login(loginRequest(CODE))).status).toBe(200);
  });

  it("다른 IP는 잠기지 않는다", async () => {
    const handlers = createAuthHandlers(deps());
    for (let i = 0; i < 5; i += 1) await handlers.login(loginRequest("wrong", "9.9.9.9"));
    expect((await handlers.login(loginRequest(CODE, "9.9.9.9"))).status).toBe(429);
    expect((await handlers.login(loginRequest(CODE, "1.1.1.1"))).status).toBe(200);
  });

  it("성공하면 실패 횟수를 지운다", async () => {
    const handlers = createAuthHandlers(deps());
    for (let i = 0; i < 4; i += 1) await handlers.login(loginRequest("wrong"));
    expect((await handlers.login(loginRequest(CODE))).status).toBe(200);
    for (let i = 0; i < 4; i += 1) expect((await handlers.login(loginRequest("wrong"))).status).toBe(401);
  });

  it("문자열이 아니거나 아주 긴 코드도 죽지 않고 틀린 코드로 센다", async () => {
    const handlers = createAuthHandlers(deps());
    for (const code of [undefined, null, 123, {}, [], "x".repeat(10_000)]) {
      const response = await handlers.login(loginRequest(code));
      expect(response.status, JSON.stringify(code)?.slice(0, 20)).toBe(401);
    }
  });

  it("JSON이 아니면 415, 깨진 JSON이면 400이다", async () => {
    const handlers = createAuthHandlers(deps());
    expect((await handlers.login(loginRequest(CODE, "1.2.3.4", "text/plain"))).status).toBe(415);
    const broken = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{oops",
    });
    expect((await handlers.login(broken)).status).toBe(400);
  });

  it("편집 코드나 비밀키가 설정되지 않았으면 503이다", async () => {
    const response = await createAuthHandlers(deps({ env: () => ({}) })).login(loginRequest(CODE));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("설정");
  });

  it("데이터베이스가 없거나 오류가 나면 503이다", async () => {
    expect((await createAuthHandlers(deps({ getDb: () => null })).login(loginRequest(CODE))).status).toBe(503);

    const broken: Db = {
      query: async () => {
        throw new Error("neon down");
      },
    };
    const response = await createAuthHandlers(deps({ getDb: () => broken })).login(loginRequest(CODE));
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("logout", () => {
  it("쿠키를 지운다", async () => {
    const response = await createAuthHandlers(deps()).logout();
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("requireEditSession", () => {
  const withCookie = (cookie?: string) =>
    new Request("http://localhost/api/events", { method: "POST", headers: cookie ? { cookie } : {} });

  it("올바른 쿠키면 통과한다(다른 쿠키가 섞여 있어도)", () => {
    const token = createSessionToken(SECRET, clock.getTime());
    expect(requireEditSession(withCookie(`a=1; ${SESSION_COOKIE}=${token}; b=2`), ENV, clock)).toEqual({ ok: true });
  });

  it("쿠키가 없거나 위조·만료·다른 비밀키면 401이다", async () => {
    const token = createSessionToken(SECRET, clock.getTime());
    const [payload, signature] = token.split(".");
    const cases = [
      undefined,
      `${SESSION_COOKIE}=garbage`,
      `${SESSION_COOKIE}=${Number(payload) + 99}.${signature}`,
      `${SESSION_COOKIE}=${createSessionToken("x".repeat(32), clock.getTime())}`,
    ];
    for (const cookie of cases) {
      const result = requireEditSession(withCookie(cookie), ENV, clock);
      expect(result.ok, String(cookie)).toBe(false);
      if (!result.ok) expect(result.response.status, String(cookie)).toBe(401);
    }

    const later = new Date(clock.getTime() + (SESSION_TTL_SECONDS + 1) * 1000);
    const expired = requireEditSession(withCookie(`${SESSION_COOKIE}=${token}`), ENV, later);
    expect(expired.ok).toBe(false);
  });

  it("인증 환경변수가 없으면 503이다", () => {
    const result = requireEditSession(withCookie(), {}, clock);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/http.test.ts src/lib/auth/handlers.test.ts`
Expected: FAIL — `./http`, `./handlers` 모듈을 찾을 수 없다는 오류.

- [ ] **Step 3: 구현한다**

**`src/lib/http.ts`**

`````ts
/** JSON 응답. */
export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

const MAX_BODY_LENGTH = 20_000;

/**
 * 쓰기 요청의 본문을 읽는다. Content-Type이 정확히 application/json이어야 한다
 * (다른 사이트의 폼이 몰래 보내는 요청은 이 헤더를 붙일 수 없어서 여기서 걸러진다). 본문은 20KB까지.
 */
export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/json") {
    return { ok: false, response: json({ error: "Content-Type은 application/json이어야 해요." }, 415) };
  }
  const text = await request.text();
  if (text.length > MAX_BODY_LENGTH) {
    return { ok: false, response: json({ error: "요청이 너무 커요." }, 413) };
  }
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: json({ error: "본문이 올바른 JSON이 아니에요." }, 400) };
  }
}
`````

**`src/lib/auth/handlers.ts`**

`````ts
import type { Db } from "@/lib/db/types";
import { json, readJsonBody } from "@/lib/http";
import { checkLock, clearFailures, recordFailure } from "./attempts";
import { loadAuthConfig } from "./config";
import { clientIp, hashIp } from "./ip";
import { safeEqual } from "./safe-equal";
import { SESSION_COOKIE, clearSessionCookie, createSessionToken, readCookie, sessionCookie, verifySessionToken } from "./session";

type Env = Record<string, string | undefined>;

export type AuthDeps = {
  getDb: () => Db | null;
  env: () => Env;
  now: () => Date;
  /** 프로덕션(HTTPS)에서만 true. 로컬 http에서는 Secure 쿠키가 저장되지 않는다. */
  secureCookies: boolean;
};

const MAX_CODE_LENGTH = 200;

function locked(minutes: number): Response {
  return json(
    { error: `시도가 너무 많아요. ${minutes}분 뒤에 다시 시도해 주세요.`, retryAfterMinutes: minutes },
    429,
    { "retry-after": String(minutes * 60) },
  );
}

/**
 * 쓰기 요청이 편집 권한(서명 쿠키)을 가졌는지 확인한다.
 * 쿠키가 없거나 틀리면 401, 인증 환경변수가 없으면 503.
 */
export function requireEditSession(
  request: Request,
  env: Env,
  now: Date,
): { ok: true } | { ok: false; response: Response } {
  const auth = loadAuthConfig(env);
  if (!auth.ok) return { ok: false, response: json({ error: "편집 코드가 설정되지 않았어요." }, 503) };

  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!verifySessionToken(token, auth.config.sessionSecret, now.getTime())) {
    return { ok: false, response: json({ error: "편집 코드를 먼저 입력해 주세요." }, 401) };
  }
  return { ok: true };
}

export function createAuthHandlers(deps: AuthDeps) {
  return {
    /** 편집 코드를 확인하고 맞으면 서명 쿠키를 준다. 틀리면 IP별로 세고, 5번 틀리면 10분 잠근다. */
    async login(request: Request): Promise<Response> {
      const parsed = await readJsonBody(request);
      if (!parsed.ok) return parsed.response;

      const auth = loadAuthConfig(deps.env());
      if (!auth.ok) return json({ error: "편집 코드가 설정되지 않았어요." }, 503);
      const db = deps.getDb();
      if (!db) return json({ error: "데이터베이스가 설정되지 않았어요." }, 503);

      const now = deps.now();
      const ipHash = hashIp(clientIp(request.headers), auth.config.sessionSecret);
      const code = (parsed.body as { code?: unknown } | null)?.code;

      try {
        const before = await checkLock(db, ipHash, now);
        if (before.locked) return locked(before.retryAfterMinutes);

        const correct = typeof code === "string" && code.length <= MAX_CODE_LENGTH && safeEqual(code, auth.config.editCode);
        if (!correct) {
          const after = await recordFailure(db, ipHash, now);
          return after.locked ? locked(after.retryAfterMinutes) : json({ error: "코드가 맞지 않아요." }, 401);
        }
        await clearFailures(db, ipHash);
      } catch (error) {
        console.error("편집 코드를 확인하다 데이터베이스 오류가 났어요", error);
        return json({ error: "데이터베이스에 연결하지 못했어요." }, 503);
      }

      const token = createSessionToken(auth.config.sessionSecret, now.getTime());
      return json({ ok: true }, 200, { "set-cookie": sessionCookie(token, deps.secureCookies) });
    },

    async logout(): Promise<Response> {
      return json({ ok: true }, 200, { "set-cookie": clearSessionCookie(deps.secureCookies) });
    },
  };
}
`````

**`src/lib/auth/instance.ts`**

`````ts
import "server-only";
import { getDbOrNull } from "@/lib/db";
import { createAuthHandlers } from "./handlers";

/** 실제 환경(환경변수, Neon, 현재 시각)에 연결한 로그인·로그아웃 핸들러. */
export const authHandlers = createAuthHandlers({
  getDb: () => getDbOrNull(),
  env: () => process.env,
  now: () => new Date(),
  secureCookies: process.env.NODE_ENV === "production",
});
`````

**`src/lib/auth/server.ts`**

`````ts
import "server-only";
import { cookies } from "next/headers";
import { loadAuthConfig } from "./config";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/** 서버 컴포넌트에서 지금 요청이 편집 권한을 가졌는지 확인한다. 인증 설정이 없으면 false. */
export async function hasEditSession(now: Date = new Date(), env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const auth = loadAuthConfig(env);
  if (!auth.ok) return false;
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value, auth.config.sessionSecret, now.getTime());
}
`````

**`src/app/api/auth/login/route.ts`**

`````ts
import { authHandlers } from "@/lib/auth/instance";

export const POST = authHandlers.login;
`````

**`src/app/api/auth/logout/route.ts`**

`````ts
import { authHandlers } from "@/lib/auth/instance";

export const POST = authHandlers.logout;
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/http.test.ts src/lib/auth`
Expected: PASS — 모두 통과.

- [ ] **Step 5: 전체를 확인하고 커밋한다**

```bash
npm test
npm run typecheck
npm run lint
git add src/lib/http.ts src/lib/http.test.ts src/lib/auth src/app/api/auth
git commit -m "feat: add edit-code login and logout with lockout and signed cookies"
```

Expected: 전체 테스트 통과, 타입 오류와 린트 오류 없음.

---

### Task 6: 일정 쓰기 API (등록·수정·삭제)

**Files:**
- Create: `src/lib/events/handlers.ts`, `src/lib/events/handlers.test.ts`, `src/lib/events/instance.ts`, `src/app/api/events/route.ts`, `src/app/api/events/[id]/route.ts`, `src/app/api/events/[id]/delete/route.ts`

**Interfaces:**
- Consumes: Task 2의 `validateEventInput`, `loadPeople`, Task 3의 `createEvent`, `updateEvent`, `deleteEvent`, Task 5의 `requireEditSession`, `readJsonBody`, `json`
- Produces:
  - `createEventHandlers({ getDb, env, now })` → `{ create(request), update(request, rawId), remove(request, rawId) }`. 처리 순서는 **편집 권한(401/503) → JSON 본문(415/400/413) → 명단(503) → DB(503) → 검증(400 `{ error, errors }`) → 저장**이다.
    - `create`: 201 `{ id }`
    - `update`: 200 `{ ok: true }`, 없는 일정이거나 번호 모양이 틀리면 404
    - `remove`: 200 `{ ok: true }`, 없으면 404. 본문은 `{}`(JSON)여야 한다.
  - 라우트(모두 POST만): `POST /api/events`, `POST /api/events/[id]`, `POST /api/events/[id]/delete`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/events/handlers.test.ts`**

`````ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth/session";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { createEventHandlers, type EventDeps } from "./handlers";
import { createEvent, getEvent, listEventsInRange } from "./store";
import type { EventInput } from "./validate";

const SECRET = "s".repeat(32);
const ENV = { EDIT_CODE: "correct-horse-battery", SESSION_SECRET: SECRET, PEOPLE: "p1:민수,p2:지은,p3:하나" };
const NOW = new Date("2026-10-07T03:00:00Z");
const COOKIE = `${SESSION_COOKIE}=${createSessionToken(SECRET, NOW.getTime())}`;

const stored: EventInput = {
  title: "원래 일정",
  date: "2026-10-07",
  startTime: null,
  endTime: null,
  memo: null,
  attendeeIds: [],
  remindOffsets: [0, 1],
};

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(async () => {
  await close();
});

const deps = (overrides: Partial<EventDeps> = {}): EventDeps => ({ getDb: () => db, env: () => ENV, now: () => NOW, ...overrides });

function post(body: unknown, headers: Record<string, string> = { cookie: COOKIE }, contentType = "application/json"): Request {
  return new Request("http://localhost/api/events", {
    method: "POST",
    headers: { "content-type": contentType, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const all = () => listEventsInRange(db, "2000-01-01", "2100-12-31");

describe("create", () => {
  it("편집 권한이 있으면 저장하고 201과 번호를 준다", async () => {
    const response = await createEventHandlers(deps()).create(
      post({ title: " 스터디 ", date: "2026-10-08", startTime: "14:00", endTime: "16:00", attendeeIds: ["p2", "p1"], remindOffsets: [0] }),
    );
    expect(response.status).toBe(201);
    const { id } = await response.json();
    expect(await getEvent(db, id)).toEqual({
      id,
      title: "스터디",
      date: "2026-10-08",
      startTime: "14:00",
      endTime: "16:00",
      memo: null,
      attendeeIds: ["p1", "p2"],
      remindOffsets: [0],
    });
  });

  it("편집 권한이 없으면 401이고 아무것도 저장하지 않는다(본문이 이상해도 인증이 먼저다)", async () => {
    const handlers = createEventHandlers(deps());
    expect((await handlers.create(post({ title: "a", date: "2026-10-08" }, {}))).status).toBe(401);
    expect((await handlers.create(post("{oops", { cookie: `${SESSION_COOKIE}=garbage` }))).status).toBe(401);
    expect(await all()).toEqual([]);
  });

  it("만료된 쿠키는 401이다", async () => {
    const later = new Date(NOW.getTime() + 8 * 24 * 3600 * 1000);
    const response = await createEventHandlers(deps({ now: () => later })).create(post({ title: "a", date: "2026-10-08" }));
    expect(response.status).toBe(401);
  });

  it("검증에 실패하면 400과 필드별 메시지를 주고 저장하지 않는다", async () => {
    const response = await createEventHandlers(deps()).create(post({ title: "", date: "2026-02-30", attendeeIds: ["p9"], remindOffsets: [2] }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(Object.keys(body.errors).sort()).toEqual(["attendeeIds", "date", "remindOffsets", "title"]);
    expect(await all()).toEqual([]);
  });

  it("JSON이 아니면 415, 깨진 JSON이면 400, 20KB가 넘으면 413이다", async () => {
    const handlers = createEventHandlers(deps());
    expect((await handlers.create(post({ title: "a", date: "2026-10-08" }, { cookie: COOKIE }, "text/plain"))).status).toBe(415);
    expect((await handlers.create(post("{oops"))).status).toBe(400);
    expect((await handlers.create(post({ title: "a", date: "2026-10-08", memo: "가".repeat(20_001) }))).status).toBe(413);
    expect(await all()).toEqual([]);
  });

  it("인증 환경변수가 없으면 503, 명단(PEOPLE) 설정이 틀리면 이유와 함께 503이다", async () => {
    expect((await createEventHandlers(deps({ env: () => ({ PEOPLE: ENV.PEOPLE }) })).create(post({ title: "a", date: "2026-10-08" }))).status).toBe(503);

    const response = await createEventHandlers(deps({ env: () => ({ ...ENV, PEOPLE: "p1" }) })).create(post({ title: "a", date: "2026-10-08" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("PEOPLE");
  });

  it("데이터베이스가 없거나 오류가 나면 503이다", async () => {
    expect((await createEventHandlers(deps({ getDb: () => null })).create(post({ title: "a", date: "2026-10-08" }))).status).toBe(503);

    const broken: Db = {
      query: async () => {
        throw new Error("neon down");
      },
    };
    expect((await createEventHandlers(deps({ getDb: () => broken })).create(post({ title: "a", date: "2026-10-08" }))).status).toBe(503);
  });
});

describe("update", () => {
  it("일정을 고치고 200을 준다", async () => {
    const id = await createEvent(db, stored);
    const response = await createEventHandlers(deps()).update(post({ title: "바뀐 일정", date: "2026-10-09", memo: "메모" }), String(id));
    expect(response.status).toBe(200);
    expect(await getEvent(db, id)).toMatchObject({ title: "바뀐 일정", date: "2026-10-09", memo: "메모" });
  });

  it("날짜를 바꾸면 알림 기록을 지우고, 제목만 바꾸면 남긴다", async () => {
    const id = await createEvent(db, stored);
    await db.query("insert into sent_reminders (event_id, offset_days, sent_on) values ($1, 0, '2026-10-07')", [id]);
    const count = async () => (await db.query<{ n: number }>("select count(*)::int as n from sent_reminders"))[0].n;
    const handlers = createEventHandlers(deps());

    await handlers.update(post({ title: "제목만", date: "2026-10-07" }), String(id));
    expect(await count()).toBe(1);
    await handlers.update(post({ title: "제목만", date: "2026-10-08" }), String(id));
    expect(await count()).toBe(0);
  });

  it("없는 일정이거나 번호 모양이 이상하면 404다", async () => {
    const handlers = createEventHandlers(deps());
    for (const id of ["999", "abc", "0", "-1", "1.5", "01", "9999999999", "1;drop", ""]) {
      expect((await handlers.update(post({ title: "a", date: "2026-10-08" }), id)).status, id).toBe(404);
    }
  });

  it("편집 권한이 없으면 401이고 검증이 틀리면 400이다", async () => {
    const id = await createEvent(db, stored);
    const handlers = createEventHandlers(deps());
    expect((await handlers.update(post({ title: "x", date: "2026-10-08" }, {}), String(id))).status).toBe(401);
    expect((await handlers.update(post({ title: "", date: "2026-10-08" }), String(id))).status).toBe(400);
    expect((await getEvent(db, id))?.title).toBe("원래 일정");
  });
});

describe("remove", () => {
  it("일정을 지우고 200을 준다. 다시 지우면 404다", async () => {
    const id = await createEvent(db, stored);
    const handlers = createEventHandlers(deps());
    expect((await handlers.remove(post({}), String(id))).status).toBe(200);
    expect(await getEvent(db, id)).toBeNull();
    expect((await handlers.remove(post({}), String(id))).status).toBe(404);
  });

  it("편집 권한이 없으면 401이고 일정은 그대로다", async () => {
    const id = await createEvent(db, stored);
    expect((await createEventHandlers(deps()).remove(post({}, {}), String(id))).status).toBe(401);
    expect(await getEvent(db, id)).not.toBeNull();
  });

  it("JSON이 아닌 요청(다른 사이트의 폼 등)은 415다", async () => {
    const id = await createEvent(db, stored);
    const response = await createEventHandlers(deps()).remove(post("a=1", { cookie: COOKIE }, "application/x-www-form-urlencoded"), String(id));
    expect(response.status).toBe(415);
    expect(await getEvent(db, id)).not.toBeNull();
  });

  it("번호 모양이 이상하면 404다", async () => {
    for (const id of ["abc", "0", "9999999999"]) {
      expect((await createEventHandlers(deps()).remove(post({}), id)).status, id).toBe(404);
    }
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/events/handlers.test.ts`
Expected: FAIL — `./handlers` 모듈을 찾을 수 없다는 오류.

- [ ] **Step 3: 구현한다**

**`src/lib/events/handlers.ts`**

`````ts
import { requireEditSession } from "@/lib/auth/handlers";
import type { Db } from "@/lib/db/types";
import { json, readJsonBody } from "@/lib/http";
import { loadPeople, type Person } from "@/lib/people";
import { createEvent, deleteEvent, updateEvent } from "./store";
import { validateEventInput } from "./validate";

type Env = Record<string, string | undefined>;

export type EventDeps = {
  getDb: () => Db | null;
  env: () => Env;
  now: () => Date;
};

type Context = { db: Db; body: unknown; people: Person[] };

/** 1~999,999,999. 앞에 0이 붙거나 소수, 음수, 문자가 섞인 값은 없는 일정으로 본다. */
const EVENT_ID = /^[1-9]\d{0,8}$/;

const notFound = () => json({ error: "일정을 찾을 수 없어요." }, 404);
const invalid = (errors: unknown) => json({ error: "입력을 확인해 주세요.", errors }, 400);

export function createEventHandlers(deps: EventDeps) {
  /** 편집 권한 → JSON 본문 → 명단 → DB 순으로 확인한 뒤 실행한다. 인증이 가장 먼저라서 권한 없는 요청에는 검증 정보를 알려주지 않는다. */
  async function guarded(request: Request, run: (context: Context) => Promise<Response>): Promise<Response> {
    const session = requireEditSession(request, deps.env(), deps.now());
    if (!session.ok) return session.response;

    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const people = loadPeople(deps.env());
    if (!people.ok) return json({ error: people.error }, 503);

    const db = deps.getDb();
    if (!db) return json({ error: "데이터베이스가 설정되지 않았어요." }, 503);

    try {
      return await run({ db, body: parsed.body, people: people.people });
    } catch (error) {
      console.error("일정을 저장하다 데이터베이스 오류가 났어요", error);
      return json({ error: "데이터베이스에 연결하지 못했어요." }, 503);
    }
  }

  return {
    create(request: Request): Promise<Response> {
      return guarded(request, async ({ db, body, people }) => {
        const result = validateEventInput(body, people);
        if (!result.ok) return invalid(result.errors);
        return json({ id: await createEvent(db, result.value) }, 201);
      });
    },

    update(request: Request, rawId: string): Promise<Response> {
      return guarded(request, async ({ db, body, people }) => {
        if (!EVENT_ID.test(rawId)) return notFound();
        const result = validateEventInput(body, people);
        if (!result.ok) return invalid(result.errors);
        return (await updateEvent(db, Number(rawId), result.value)) ? json({ ok: true }) : notFound();
      });
    },

    remove(request: Request, rawId: string): Promise<Response> {
      return guarded(request, async ({ db }) => {
        if (!EVENT_ID.test(rawId)) return notFound();
        return (await deleteEvent(db, Number(rawId))) ? json({ ok: true }) : notFound();
      });
    },
  };
}
`````

**`src/lib/events/instance.ts`**

`````ts
import "server-only";
import { getDbOrNull } from "@/lib/db";
import { createEventHandlers } from "./handlers";

/** 실제 환경(환경변수, Neon, 현재 시각)에 연결한 일정 쓰기 핸들러. */
export const eventHandlers = createEventHandlers({
  getDb: () => getDbOrNull(),
  env: () => process.env,
  now: () => new Date(),
});
`````

**`src/app/api/events/route.ts`**

`````ts
import { eventHandlers } from "@/lib/events/instance";

/** 일정 등록. 쓰기는 POST만 받는다. */
export async function POST(request: Request): Promise<Response> {
  return eventHandlers.create(request);
}
`````

**`src/app/api/events/[id]/route.ts`**

`````ts
import { eventHandlers } from "@/lib/events/instance";

/** 일정 수정. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return eventHandlers.update(request, (await params).id);
}
`````

**`src/app/api/events/[id]/delete/route.ts`**

`````ts
import { eventHandlers } from "@/lib/events/instance";

/** 일정 삭제. 삭제도 GET이 아니라 POST로만 받는다. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return eventHandlers.remove(request, (await params).id);
}
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/events`
Expected: PASS — 일정 쓰기 API 테스트를 포함해 모두 통과.

- [ ] **Step 5: 전체를 확인하고 커밋한다**

```bash
npm test
npm run typecheck
npm run lint
git add src/lib/events/handlers.ts src/lib/events/handlers.test.ts src/lib/events/instance.ts src/app/api/events
git commit -m "feat: add event create, update and delete APIs behind the edit session"
```

Expected: 전체 테스트 통과, 타입 오류와 린트 오류 없음.

---

### Task 7: 일정 알림 (문구, 차지와 해제, 한 번의 실행)

**Files:**
- Create: `src/lib/reminders/types.ts`, `src/lib/reminders/format.ts`, `src/lib/reminders/format.test.ts`, `src/lib/reminders/claim.ts`, `src/lib/reminders/claim.test.ts`, `src/lib/reminders/run.ts`, `src/lib/reminders/run.test.ts`, `src/lib/push/delivery.test.ts`
- Modify: `src/lib/push/send.ts` (`PushDeps`, `PushDepsResult`, `nothingDelivered` 추가)

**Interfaces:**
- Consumes: Task 1의 `todayInSeoul`, Task 3의 `events`·`sent_reminders`·`createEvent`·`updateEvent`, 계획 2의 `sendToAll`, `Sender`, `SendSummary`, `PushPayload`, `saveSubscription`
- Produces:
  - `send.ts`: `type PushDeps = { db: Db; sender: Sender }`, `type PushDepsResult = { ok: true; deps: PushDeps } | { ok: false; missing: string[] }`, `nothingDelivered(summary): boolean` (구독자가 있는데 한 명에게도 못 보냈으면 true. 만료 정리만 한 경우는 false)
  - `type ReminderItem = { eventId; title; date; startTime: string | null; offsetDays: number }`
  - `reminderPayload(items: ReminderItem[]): PushPayload` (빈 배열이면 오류)
  - `claimDueReminders(db, today): Promise<ReminderItem[]>` — 그날 보낼 항목을 `sent_reminders`에 넣어 **실제로 삽입된 것만** 돌려준다(오프셋 → 시각 → 번호 순). `releaseReminders(db, items): Promise<void>` — 그 항목의 기록을 지운다.
  - `runReminders(deps: PushDeps, now: Date): Promise<{ today: string; claimed: number; summary: SendSummary | null; released: boolean }>`
    - 보낼 항목이 없으면 발송하지 않는다. 발송이 예외로 끝났거나 **구독자가 있는데 전부 실패하면** 방금 차지한 기록을 풀어서 다시 호출하면 재시도된다. 일부라도 받았거나, 구독자가 없거나, 만료 정리만 했으면 기록을 남긴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/push/delivery.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { nothingDelivered } from "./send";

describe("nothingDelivered", () => {
  it("구독자가 있는데 아무에게도 못 보냈고 실패가 있으면 true다", () => {
    expect(nothingDelivered({ total: 3, sent: 0, removed: 0, failed: 3 })).toBe(true);
    expect(nothingDelivered({ total: 2, sent: 0, removed: 1, failed: 1 })).toBe(true);
  });

  it("한 명이라도 받았으면 false다", () => {
    expect(nothingDelivered({ total: 3, sent: 1, removed: 0, failed: 2 })).toBe(false);
  });

  it("구독자가 없거나 만료된 구독만 정리한 경우는 실패로 보지 않는다", () => {
    expect(nothingDelivered({ total: 0, sent: 0, removed: 0, failed: 0 })).toBe(false);
    expect(nothingDelivered({ total: 2, sent: 0, removed: 2, failed: 0 })).toBe(false);
  });
});
`````

**`src/lib/reminders/format.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { reminderLine, reminderPayload } from "./format";
import type { ReminderItem } from "./types";

const item = (overrides: Partial<ReminderItem> = {}): ReminderItem => ({
  eventId: 1,
  title: "회의",
  date: "2026-10-07",
  startTime: null,
  offsetDays: 0,
  ...overrides,
});

describe("reminderLine", () => {
  it("종일 일정은 '오늘: 제목', 시각이 있으면 '오늘 14:00: 제목'이다", () => {
    expect(reminderLine(item())).toBe("오늘: 회의");
    expect(reminderLine(item({ startTime: "14:00" }))).toBe("오늘 14:00: 회의");
  });

  it("1일 전은 '내일', 3일 전은 '3일 뒤'다", () => {
    expect(reminderLine(item({ offsetDays: 1 }))).toBe("내일: 회의");
    expect(reminderLine(item({ offsetDays: 3, startTime: "09:30" }))).toBe("3일 뒤 09:30: 회의");
  });

  it("제목이 40자를 넘으면 자르고 …을 붙인다(이모지도 한 글자로 센다)", () => {
    expect(reminderLine(item({ title: "가".repeat(40) }))).toBe(`오늘: ${"가".repeat(40)}`);
    expect(reminderLine(item({ title: "가".repeat(41) }))).toBe(`오늘: ${"가".repeat(39)}…`);
    expect(reminderLine(item({ title: "😀".repeat(41) }))).toBe(`오늘: ${"😀".repeat(39)}…`);
  });
});

describe("reminderPayload", () => {
  it("한 건이면 그 날짜의 달력을 연다", () => {
    expect(reminderPayload([item({ startTime: "14:00" })])).toEqual({
      title: "일정 알림",
      body: "오늘 14:00: 회의",
      url: "/calendar?month=2026-10&date=2026-10-07",
      tag: "event-reminders",
    });
  });

  it("여러 건이면 줄로 나누고, 첫 항목의 달을 연다", () => {
    const payload = reminderPayload([
      item({ eventId: 1, title: "회의" }),
      item({ eventId: 2, title: "발표", offsetDays: 1, date: "2026-10-08" }),
      item({ eventId: 3, title: "제출", offsetDays: 3, date: "2026-10-10" }),
    ]);
    expect(payload.body).toBe("오늘: 회의\n내일: 발표\n3일 뒤: 제출");
    expect(payload.url).toBe("/calendar?month=2026-10");
  });

  it("세 줄을 넘으면 '외 N건'으로 줄인다", () => {
    const items = Array.from({ length: 5 }, (_, i) => item({ eventId: i + 1, title: `일정 ${i + 1}` }));
    expect(reminderPayload(items).body).toBe("오늘: 일정 1\n오늘: 일정 2\n오늘: 일정 3\n외 2건");
  });

  it("가장 긴 경우에도 웹 푸시 본문 제한(약 4KB)보다 훨씬 작다", () => {
    const items = Array.from({ length: 10 }, (_, i) => item({ eventId: i + 1, title: "가".repeat(100), startTime: "14:00" }));
    const size = new TextEncoder().encode(JSON.stringify(reminderPayload(items))).length;
    expect(size).toBeLessThan(1000);
  });

  it("보낼 항목이 없으면 오류를 던진다", () => {
    expect(() => reminderPayload([])).toThrow();
  });
});
`````

**`src/lib/reminders/claim.test.ts`**

`````ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { createEvent } from "@/lib/events/store";
import type { EventInput } from "@/lib/events/validate";
import { claimDueReminders, releaseReminders } from "./claim";

const TODAY = "2026-10-07";

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(async () => {
  await close();
});

const ev = (title: string, date: string, overrides: Partial<EventInput> = {}): EventInput => ({
  title,
  date,
  startTime: null,
  endTime: null,
  memo: null,
  attendeeIds: [],
  remindOffsets: [0, 1],
  ...overrides,
});

async function seed(): Promise<void> {
  await createEvent(db, ev("오늘 일정", TODAY, { startTime: "14:00", endTime: "15:00" })); // 당일 → 0
  await createEvent(db, ev("내일 일정", "2026-10-08")); // 1일 전 → 1
  await createEvent(db, ev("사흘 뒤 일정", "2026-10-10", { remindOffsets: [3] })); // 3일 전 → 3
  await createEvent(db, ev("모레 일정", "2026-10-09")); // 2일 전은 알림 시점이 아니다
  await createEvent(db, ev("알림 없음", TODAY, { remindOffsets: [] }));
  await createEvent(db, ev("지난 일정", "2026-10-06", { remindOffsets: [0, 1, 3] }));
  await createEvent(db, ev("3일 전이 빠진 일정", "2026-10-10")); // 0, 1만 선택 → 오늘은 해당 없음
}

describe("claimDueReminders", () => {
  it("오늘 보낼 항목만 골라서 당일 → 1일 전 → 3일 전 순으로 돌려준다", async () => {
    await seed();
    const items = await claimDueReminders(db, TODAY);

    expect(items.map((i) => [i.title, i.offsetDays])).toEqual([
      ["오늘 일정", 0],
      ["내일 일정", 1],
      ["사흘 뒤 일정", 3],
    ]);
    expect(items[0]).toMatchObject({ date: TODAY, startTime: "14:00" });
    expect(items[1]).toMatchObject({ date: "2026-10-08", startTime: null });
  });

  it("같은 날 다시 불러도 이미 차지한 항목은 돌려주지 않는다(중복 실행 방지)", async () => {
    await seed();
    expect(await claimDueReminders(db, TODAY)).toHaveLength(3);
    expect(await claimDueReminders(db, TODAY)).toEqual([]);
  });

  it("차지한 기록에 오늘 날짜가 남는다", async () => {
    await seed();
    await claimDueReminders(db, TODAY);
    const rows = await db.query<{ sent_on: string; n: number }>(
      "select to_char(sent_on, 'YYYY-MM-DD') as sent_on, count(*)::int as n from sent_reminders group by 1",
    );
    expect(rows).toEqual([{ sent_on: TODAY, n: 3 }]);
  });

  it("해제하면 다시 차지할 수 있고, 해제한 항목만 다시 나온다", async () => {
    await seed();
    const items = await claimDueReminders(db, TODAY);

    await releaseReminders(db, [items[1]]);
    expect((await claimDueReminders(db, TODAY)).map((i) => i.title)).toEqual(["내일 일정"]);

    await releaseReminders(db, items);
    expect(await claimDueReminders(db, TODAY)).toHaveLength(3);
  });

  it("해제할 항목이 없으면 아무 일도 하지 않는다", async () => {
    await expect(releaseReminders(db, [])).resolves.toBeUndefined();
  });

  it("같은 날 당일 알림과 3일 전 알림이 겹치는 일정은 한 번에 함께 나온다", async () => {
    await createEvent(db, ev("A", TODAY, { remindOffsets: [0] }));
    await createEvent(db, ev("B", "2026-10-10", { remindOffsets: [3] }));
    expect((await claimDueReminders(db, TODAY)).map((i) => i.title)).toEqual(["A", "B"]);
  });

  it("일정이 없으면 빈 배열이다", async () => {
    expect(await claimDueReminders(db, TODAY)).toEqual([]);
  });
});
`````

**`src/lib/reminders/run.test.ts`**

`````ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { createEvent, updateEvent } from "@/lib/events/store";
import type { EventInput } from "@/lib/events/validate";
import type { Sender } from "@/lib/push/send";
import { saveSubscription, type PushSubscriptionInput } from "@/lib/push/subscriptions";
import { runReminders } from "./run";

const NOW = new Date("2026-10-07T00:30:00Z"); // 한국시간 2026-10-07 09:30

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

const sub = (n: number): PushSubscriptionInput => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`,
  p256dh: "B".repeat(87),
  auth: "a".repeat(22),
});

const ev = (title: string, date: string, overrides: Partial<EventInput> = {}): EventInput => ({
  title,
  date,
  startTime: null,
  endTime: null,
  memo: null,
  attendeeIds: [],
  remindOffsets: [0, 1],
  ...overrides,
});

const claimedRows = async () => (await db.query<{ n: number }>("select count(*)::int as n from sent_reminders"))[0].n;

describe("runReminders", () => {
  it("보낼 일정이 없으면 발송하지 않는다", async () => {
    await saveSubscription(db, sub(1));
    const sender = vi.fn<Sender>(async () => undefined);
    expect(await runReminders({ db, sender }, NOW)).toEqual({ today: "2026-10-07", claimed: 0, summary: null, released: false });
    expect(sender).not.toHaveBeenCalled();
  });

  it("오늘 보낼 항목을 한 통으로 묶어 모든 구독자에게 보낸다", async () => {
    await saveSubscription(db, sub(1));
    await saveSubscription(db, sub(2));
    await createEvent(db, ev("스터디", "2026-10-07", { startTime: "14:00", endTime: "16:00" }));
    await createEvent(db, ev("발표", "2026-10-08"));
    const bodies: string[] = [];
    const sender: Sender = async (_subscription, body) => {
      bodies.push(body);
    };

    const result = await runReminders({ db, sender }, NOW);

    expect(result).toMatchObject({ today: "2026-10-07", claimed: 2, released: false });
    expect(result.summary).toEqual({ total: 2, sent: 2, removed: 0, failed: 0 });
    expect(bodies).toHaveLength(2);
    expect(JSON.parse(bodies[0])).toEqual({
      title: "일정 알림",
      body: "오늘 14:00: 스터디\n내일: 발표",
      url: "/calendar?month=2026-10",
      tag: "event-reminders",
    });
  });

  it("같은 날 두 번 실행해도 알림은 한 번만 간다", async () => {
    await saveSubscription(db, sub(1));
    await createEvent(db, ev("스터디", "2026-10-07"));
    const sender = vi.fn<Sender>(async () => undefined);

    expect((await runReminders({ db, sender }, NOW)).claimed).toBe(1);
    expect((await runReminders({ db, sender }, NOW)).claimed).toBe(0);
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it("구독자가 있는데 전부 실패하면 기록을 풀어서 다시 실행하면 재시도된다", async () => {
    await saveSubscription(db, sub(1));
    await saveSubscription(db, sub(2));
    await createEvent(db, ev("스터디", "2026-10-07"));
    const broken: Sender = async () => {
      throw new Error("bad vapid key");
    };

    const first = await runReminders({ db, sender: broken }, NOW);
    expect(first).toMatchObject({ claimed: 1, released: true });
    expect(first.summary).toEqual({ total: 2, sent: 0, removed: 0, failed: 2 });
    expect(await claimedRows()).toBe(0);

    const fixed = vi.fn<Sender>(async () => undefined);
    const second = await runReminders({ db, sender: fixed }, NOW);
    expect(second).toMatchObject({ claimed: 1, released: false });
    expect(fixed).toHaveBeenCalledTimes(2);
  });

  it("구독 목록을 읽다 오류가 나면 기록을 풀고 오류를 그대로 던진다", async () => {
    await saveSubscription(db, sub(1));
    await createEvent(db, ev("스터디", "2026-10-07"));
    let failing = true;
    const flaky: Db = {
      query: async (text, params) => {
        if (failing && text.includes("push_subscriptions")) throw new Error("neon blip");
        return db.query(text, params);
      },
    };
    const sender = vi.fn<Sender>(async () => undefined);

    await expect(runReminders({ db: flaky, sender }, NOW)).rejects.toThrow("neon blip");
    expect(await claimedRows()).toBe(0);

    failing = false;
    expect((await runReminders({ db: flaky, sender }, NOW)).claimed).toBe(1);
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it("일부만 받았거나 만료된 구독만 정리했으면 기록을 남긴다", async () => {
    await saveSubscription(db, sub(1));
    await saveSubscription(db, sub(2));
    await createEvent(db, ev("A", "2026-10-07"));
    const partial: Sender = async (subscription) => {
      if (subscription.endpoint.endsWith("device-1")) throw new Error("boom");
    };
    expect(await runReminders({ db, sender: partial }, NOW)).toMatchObject({ claimed: 1, released: false });
    expect(await claimedRows()).toBe(1);

    await db.query("delete from sent_reminders");
    const gone: Sender = async () => {
      throw Object.assign(new Error("gone"), { statusCode: 410 });
    };
    expect(await runReminders({ db, sender: gone }, NOW)).toMatchObject({ claimed: 1, released: false });
    expect(await claimedRows()).toBe(1);
  });

  it("구독자가 없으면 발송 없이 끝나고 기록은 남는다", async () => {
    await createEvent(db, ev("스터디", "2026-10-07"));
    const sender = vi.fn<Sender>(async () => undefined);
    const result = await runReminders({ db, sender }, NOW);
    expect(result).toMatchObject({ claimed: 1, released: false });
    expect(result.summary).toEqual({ total: 0, sent: 0, removed: 0, failed: 0 });
    expect(sender).not.toHaveBeenCalled();
  });

  it("'오늘'은 한국시간 자정(UTC 15:00)에 바뀐다", async () => {
    await saveSubscription(db, sub(1));
    await createEvent(db, ev("자정 경계", "2026-10-07", { remindOffsets: [0] }));
    const sender = vi.fn<Sender>(async () => undefined);

    const before = await runReminders({ db, sender }, new Date("2026-10-06T14:59:59Z"));
    expect(before).toMatchObject({ today: "2026-10-06", claimed: 0 });

    const after = await runReminders({ db, sender }, new Date("2026-10-06T15:00:00Z"));
    expect(after).toMatchObject({ today: "2026-10-07", claimed: 1 });
  });

  it("보낸 뒤 날짜를 고친 일정은 새 날짜에 다시 알린다", async () => {
    await saveSubscription(db, sub(1));
    const id = await createEvent(db, ev("옮긴 일정", "2026-10-07", { remindOffsets: [0] }));
    const sender = vi.fn<Sender>(async () => undefined);
    await runReminders({ db, sender }, NOW);

    await updateEvent(db, id, ev("옮긴 일정", "2026-10-09", { remindOffsets: [0] }));
    const later = new Date("2026-10-09T00:30:00Z");
    expect((await runReminders({ db, sender }, later)).claimed).toBe(1);
    expect(sender).toHaveBeenCalledTimes(2);
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/push/delivery.test.ts src/lib/reminders`
Expected: FAIL — `nothingDelivered`가 없고, `./format`, `./claim`, `./run`, `./types` 모듈을 찾을 수 없다는 오류.

- [ ] **Step 3: 구현한다**

`src/lib/push/send.ts`에서 다음을 찾아서

`````ts
export type SendSummary = { total: number; sent: number; removed: number; failed: number };
`````

이렇게 바꾼다.

`````ts
export type SendSummary = { total: number; sent: number; removed: number; failed: number };

/** 알림을 보내는 쪽(일정 알림, 모임 알림)이 함께 쓰는 재료: 데이터베이스와 발송기. */
export type PushDeps = { db: Db; sender: Sender };
export type PushDepsResult = { ok: true; deps: PushDeps } | { ok: false; missing: string[] };

/**
 * 구독자가 있는데 한 명에게도 보내지 못했는지. (VAPID 키 오타처럼 설정 문제일 가능성이 크다.)
 * 만료된 구독(404/410)만 정리한 경우와 구독자가 없는 경우는 실패로 보지 않는다.
 */
export function nothingDelivered(summary: SendSummary): boolean {
  return summary.total > 0 && summary.sent === 0 && summary.failed > 0;
}
`````

**`src/lib/reminders/types.ts`**

`````ts
/** 오늘 알려야 하는 일정 하나. `offsetDays`는 일정 며칠 전인지(0=당일). */
export type ReminderItem = {
  eventId: number;
  title: string;
  date: string;
  startTime: string | null;
  offsetDays: number;
};
`````

**`src/lib/reminders/format.ts`**

`````ts
import type { PushPayload } from "@/lib/push/payload";
import type { ReminderItem } from "./types";

const MAX_LINES = 3;
const MAX_TITLE_LENGTH = 40;

function offsetLabel(days: number): string {
  if (days === 0) return "오늘";
  if (days === 1) return "내일";
  return `${days}일 뒤`;
}

/** 제목은 사용자가 정한 값이라 얼마든지 길 수 있다. 알림 본문이 커지지 않도록 자른다(이모지도 한 글자로 센다). */
function shorten(title: string): string {
  const chars = [...title];
  return chars.length > MAX_TITLE_LENGTH ? `${chars.slice(0, MAX_TITLE_LENGTH - 1).join("")}…` : title;
}

/** "오늘: 제목", 시각이 있으면 "오늘 14:00: 제목". */
export function reminderLine(item: ReminderItem): string {
  const time = item.startTime ? ` ${item.startTime}` : "";
  return `${offsetLabel(item.offsetDays)}${time}: ${shorten(item.title)}`;
}

/** 오늘 보낼 일정 전체를 알림 하나로 묶는다. 세 줄까지 보여주고 나머지는 "외 N건"이다. */
export function reminderPayload(items: ReminderItem[]): PushPayload {
  if (items.length === 0) throw new Error("알릴 일정이 없어요.");

  const lines = items.slice(0, MAX_LINES).map(reminderLine);
  const rest = items.length - lines.length;
  if (rest > 0) lines.push(`외 ${rest}건`);

  const first = items[0];
  const month = first.date.slice(0, 7);
  return {
    title: "일정 알림",
    body: lines.join("\n"),
    url: items.length === 1 ? `/calendar?month=${month}&date=${first.date}` : `/calendar?month=${month}`,
    tag: "event-reminders",
  };
}
`````

**`src/lib/reminders/claim.ts`**

`````ts
import type { Db } from "@/lib/db/types";
import type { ReminderItem } from "./types";

type ClaimRow = { event_id: number; title: string; date: string; start_time: string | null; offset_days: number };

/**
 * 오늘 보낼 알림을 `sent_reminders`에 넣어 "차지"하고, **실제로 새로 넣은 것만** 돌려준다.
 * (일정 날짜 − 알림 시점 = 오늘인 항목.) 같은 실행이 두 번 돌거나 cron이 중복 전달돼도
 * 이미 차지한 항목은 `on conflict do nothing`으로 걸러져서 알림이 두 번 가지 않는다.
 * 한 문장이라 차지와 조회가 함께 일어난다.
 */
export async function claimDueReminders(db: Db, today: string): Promise<ReminderItem[]> {
  const rows = await db.query<ClaimRow>(
    `with claimed as (
       insert into sent_reminders (event_id, offset_days, sent_on)
       select e.id, o.days, $1::date
         from events e
         cross join lateral unnest(e.remind_offsets) as o(days)
        where e.event_date - o.days = $1::date
       on conflict do nothing
       returning event_id, offset_days
     )
     select e.id as event_id, e.title,
            to_char(e.event_date, 'YYYY-MM-DD') as date,
            to_char(e.start_time, 'HH24:MI') as start_time,
            c.offset_days
       from claimed c
       join events e on e.id = c.event_id
      order by c.offset_days, e.start_time nulls first, e.id`,
    [today],
  );
  return rows.map((row) => ({
    eventId: row.event_id,
    title: row.title,
    date: row.date,
    startTime: row.start_time,
    offsetDays: row.offset_days,
  }));
}

/** 차지한 항목을 풀어서, 알림을 못 보냈을 때 다시 호출하면 재시도되게 한다. */
export async function releaseReminders(db: Db, items: ReminderItem[]): Promise<void> {
  if (items.length === 0) return;
  await db.query(
    `delete from sent_reminders
      using unnest($1::integer[], $2::integer[]) as r(event_id, offset_days)
      where sent_reminders.event_id = r.event_id and sent_reminders.offset_days = r.offset_days`,
    [items.map((item) => item.eventId), items.map((item) => item.offsetDays)],
  );
}
`````

**`src/lib/reminders/run.ts`**

`````ts
import { todayInSeoul } from "@/lib/events/dates";
import { nothingDelivered, sendToAll, type PushDeps, type SendSummary } from "@/lib/push/send";
import { claimDueReminders, releaseReminders } from "./claim";
import { reminderPayload } from "./format";

export type RunResult = {
  today: string;
  claimed: number;
  summary: SendSummary | null;
  /** 발송이 전부 실패해서 차지한 기록을 풀었는지 */
  released: boolean;
};

/**
 * 하루 한 번 돌아서 오늘 알릴 일정을 구독자 전체에게 한 통으로 보낸다.
 * 보낼 항목을 먼저 차지하므로 같은 날 두 번 실행돼도 알림은 한 번이다. 다만 아무에게도 보내지 못했다면
 * (발송이 예외로 끝났거나, 구독자가 있는데 전부 실패) 기록을 풀어서 원인을 고친 뒤 다시 호출하면 재시도된다.
 */
export async function runReminders({ db, sender }: PushDeps, now: Date): Promise<RunResult> {
  const today = todayInSeoul(now);
  const items = await claimDueReminders(db, today);
  if (items.length === 0) return { today, claimed: 0, summary: null, released: false };

  let summary: SendSummary;
  try {
    summary = await sendToAll(db, sender, reminderPayload(items));
  } catch (error) {
    await releaseReminders(db, items).catch(() => undefined);
    throw error;
  }

  if (nothingDelivered(summary)) {
    await releaseReminders(db, items);
    return { today, claimed: items.length, summary, released: true };
  }
  return { today, claimed: items.length, summary, released: false };
}
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/push src/lib/reminders`
Expected: PASS — 계획 2의 푸시 테스트와 새 테스트 모두 통과.

- [ ] **Step 5: 전체를 확인하고 커밋한다**

```bash
npm test
npm run typecheck
npm run lint
git add src/lib/push/send.ts src/lib/push/delivery.test.ts src/lib/reminders
git commit -m "feat: claim due reminders once per day and send them as one notification"
```

Expected: 전체 테스트 통과, 타입 오류와 린트 오류 없음.

---

### Task 8: cron 엔드포인트와 `vercel.json`

**Files:**
- Create: `src/lib/reminders/handler.ts`, `src/lib/reminders/handler.test.ts`, `src/lib/reminders/vercel-config.test.ts`, `src/lib/push/deps.ts`, `src/app/api/cron/reminders/route.ts`, `vercel.json`

**Interfaces:**
- Consumes: Task 7의 `runReminders`, `PushDepsResult`, 계획 2의 `loadPushConfig`, `createWebPushSender`, `getDbOrNull`, Task 4의 `safeEqual`
- Produces:
  - `createReminderHandler({ env, loadDeps, now })` → `GET(request): Promise<Response>`. `CRON_SECRET`이 없으면 **503**(열려 있지 않다), `Authorization`이 정확히 `Bearer <CRON_SECRET>`이 아니면 **401**, 푸시 설정이 부족하면 503과 `{ error, missing }`, 실행 중 오류는 500, 성공은 200과 `runReminders`의 결과(`{ today, claimed, summary, released }`).
  - `loadPushDeps(env?): PushDepsResult` (서버 전용) — 푸시 환경변수와 DB가 다 있으면 `{ ok: true, deps }`.
  - `GET /api/cron/reminders`, `vercel.json`의 cron `0 0 * * *`(UTC = 한국시간 09:00~09:59경, Hobby는 하루 한 번·시 단위 ±59분).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/reminders/handler.test.ts`**

`````ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { createEvent } from "@/lib/events/store";
import type { PushDepsResult, Sender } from "@/lib/push/send";
import { saveSubscription } from "@/lib/push/subscriptions";
import { createReminderHandler, type ReminderHandlerDeps } from "./handler";

const SECRET = "cron-secret-1234567890";
const NOW = new Date("2026-10-07T00:10:00Z");

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await createTestDb());
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await close();
});

const request = (authorization?: string) =>
  new Request("http://localhost/api/cron/reminders", { headers: authorization ? { authorization } : {} });

function handler(sender: Sender, overrides: Partial<ReminderHandlerDeps> = {}) {
  const loadDeps = vi.fn((): PushDepsResult => ({ ok: true, deps: { db, sender } }));
  const get = createReminderHandler({ env: () => ({ CRON_SECRET: SECRET }), loadDeps, now: () => NOW, ...overrides });
  return { get, loadDeps };
}

const seedEvent = () =>
  createEvent(db, {
    title: "스터디",
    date: "2026-10-07",
    startTime: "14:00",
    endTime: "16:00",
    memo: null,
    attendeeIds: [],
    remindOffsets: [0],
  });

describe("GET /api/cron/reminders", () => {
  it("CRON_SECRET이 설정되지 않았으면 열어 두지 않고 503이다", async () => {
    const sender = vi.fn<Sender>(async () => undefined);
    const { get, loadDeps } = handler(sender, { env: () => ({}) });
    expect((await get(request(`Bearer ${SECRET}`))).status).toBe(503);
    expect((await get(request())).status).toBe(503);
    expect(loadDeps).not.toHaveBeenCalled();
    expect(sender).not.toHaveBeenCalled();
  });

  it("Authorization이 없거나 틀리면 401이고 아무것도 실행하지 않는다", async () => {
    await seedEvent();
    await saveSubscription(db, { endpoint: "https://fcm.googleapis.com/fcm/send/d1", p256dh: "B".repeat(87), auth: "a".repeat(22) });
    const sender = vi.fn<Sender>(async () => undefined);
    const { get, loadDeps } = handler(sender);

    for (const header of [undefined, "", "Bearer", "Bearer wrong", SECRET, `bearer ${SECRET}`, `Basic ${SECRET}`, `Bearer  ${SECRET}`]) {
      const response = await get(request(header));
      expect(response.status, String(header)).toBe(401);
    }
    expect(loadDeps).not.toHaveBeenCalled();
    expect(sender).not.toHaveBeenCalled();
  });

  it("올바른 Bearer 값이면 오늘의 알림을 보내고 결과를 200으로 알려준다", async () => {
    await seedEvent();
    await saveSubscription(db, { endpoint: "https://fcm.googleapis.com/fcm/send/d1", p256dh: "B".repeat(87), auth: "a".repeat(22) });
    const sender = vi.fn<Sender>(async () => undefined);

    const response = await handler(sender).get(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      today: "2026-10-07",
      claimed: 1,
      summary: { total: 1, sent: 1, removed: 0, failed: 0 },
      released: false,
    });
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it("같은 날 다시 불러도 알림이 또 가지 않는다", async () => {
    await seedEvent();
    await saveSubscription(db, { endpoint: "https://fcm.googleapis.com/fcm/send/d1", p256dh: "B".repeat(87), auth: "a".repeat(22) });
    const sender = vi.fn<Sender>(async () => undefined);
    const { get } = handler(sender);

    await get(request(`Bearer ${SECRET}`));
    const second = await get(request(`Bearer ${SECRET}`));

    expect((await second.json()).claimed).toBe(0);
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it("푸시 설정이 부족하면 503과 무엇이 없는지 알려준다", async () => {
    const sender = vi.fn<Sender>(async () => undefined);
    const { get } = handler(sender, { loadDeps: () => ({ ok: false, missing: ["DATABASE_URL", "VAPID_PRIVATE_KEY"] }) });
    const response = await get(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ missing: ["DATABASE_URL", "VAPID_PRIVATE_KEY"] });
  });

  it("실행 중 오류가 나면 500이고, 비밀 값이나 내부 오류 문구를 응답에 싣지 않는다", async () => {
    const broken: Db = {
      query: async () => {
        throw new Error(`neon down ${SECRET}`);
      },
    };
    const { get } = handler(vi.fn<Sender>(), { loadDeps: () => ({ ok: true, deps: { db: broken, sender: vi.fn<Sender>() } }) });
    const response = await get(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("neon down");
  });
});
`````

**`src/lib/reminders/vercel-config.test.ts`**

`````ts
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type VercelConfig = { crons?: { path: string; schedule: string }[] };
const config = JSON.parse(readFileSync("vercel.json", "utf8")) as VercelConfig;

describe("vercel.json의 cron", () => {
  it("일정 알림 cron이 하나 있고, 매일 UTC 00:00(한국시간 09:00~09:59경)에 돈다", () => {
    expect(config.crons).toHaveLength(1);
    expect(config.crons?.[0]).toEqual({ path: "/api/cron/reminders", schedule: "0 0 * * *" });
  });

  it("Hobby는 하루 한 번만 허용되므로 일·월·요일은 모두 *이다", () => {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = (config.crons?.[0].schedule ?? "").split(" ");
    expect(minute).toMatch(/^\d+$/);
    expect(hour).toMatch(/^\d+$/);
    expect([dayOfMonth, month, dayOfWeek]).toEqual(["*", "*", "*"]);
  });

  it("cron이 부르는 경로에 라우트 파일이 있다", () => {
    expect(existsSync("src/app/api/cron/reminders/route.ts")).toBe(true);
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/reminders/handler.test.ts src/lib/reminders/vercel-config.test.ts`
Expected: FAIL — `./handler` 모듈을 찾을 수 없고, `vercel.json`을 읽을 수 없다는 오류.

- [ ] **Step 3: 구현한다**

**`src/lib/reminders/handler.ts`**

`````ts
import { safeEqual } from "@/lib/auth/safe-equal";
import { json } from "@/lib/http";
import type { PushDepsResult } from "@/lib/push/send";
import { runReminders } from "./run";

export type ReminderHandlerDeps = {
  env: () => Record<string, string | undefined>;
  loadDeps: () => PushDepsResult;
  now: () => Date;
};

/**
 * Vercel Cron이 하루 한 번 부르는 엔드포인트. Vercel은 프로젝트에 `CRON_SECRET`이 있으면
 * `Authorization: Bearer <값>` 헤더를 붙여서 부른다. 값이 없거나 틀리면 실행하지 않는다.
 */
export function createReminderHandler({ env, loadDeps, now }: ReminderHandlerDeps) {
  return async function GET(request: Request): Promise<Response> {
    const secret = env().CRON_SECRET?.trim();
    // 비밀 값이 없으면 누구든 부를 수 있게 되므로, 열어 두지 않고 막는다.
    if (!secret) return json({ error: "CRON_SECRET이 설정되지 않았어요." }, 503);
    if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
      return json({ error: "인증되지 않았어요." }, 401);
    }

    const pushDeps = loadDeps();
    if (!pushDeps.ok) {
      console.warn(`푸시 알림 설정이 부족해서 일정 알림을 보내지 못해요: ${pushDeps.missing.join(", ")}`);
      return json({ error: "푸시 알림 설정이 부족해요.", missing: pushDeps.missing }, 503);
    }

    try {
      return json(await runReminders(pushDeps.deps, now()));
    } catch (error) {
      console.error("일정 알림을 보내지 못했어요", error);
      return json({ error: "일정 알림을 보내지 못했어요." }, 500);
    }
  };
}
`````

**`src/lib/push/deps.ts`**

`````ts
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
`````

**`src/app/api/cron/reminders/route.ts`**

`````ts
import { loadPushDeps } from "@/lib/push/deps";
import { createReminderHandler } from "@/lib/reminders/handler";

// Vercel Cron이 매일 한 번 GET으로 부른다. 항상 요청 시점에 실행해야 하므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export const GET = createReminderHandler({
  env: () => process.env,
  loadDeps: () => loadPushDeps(),
  now: () => new Date(),
});
`````

**`vercel.json`**

`````json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [{ "path": "/api/cron/reminders", "schedule": "0 0 * * *" }]
}
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/reminders`
Expected: PASS — 핸들러와 `vercel.json` 테스트를 포함해 모두 통과.

- [ ] **Step 5: 전체를 확인하고 커밋한다**

```bash
npm test
npm run typecheck
npm run lint
git add src/lib/reminders/handler.ts src/lib/reminders/handler.test.ts src/lib/reminders/vercel-config.test.ts src/lib/push/deps.ts src/app/api/cron vercel.json
git commit -m "feat: add the daily reminder cron endpoint secured by CRON_SECRET"
```

Expected: 전체 테스트 통과, 타입 오류와 린트 오류 없음.

---

### Task 9: 달력 화면

**Files:**
- Create: `src/lib/calendar/view.ts`, `src/lib/calendar/view.test.ts`, `src/lib/events/form.ts`, `src/lib/events/form.test.ts`, `src/lib/events/client.ts`, `src/lib/events/client.test.ts`, `src/components/CalendarGrid.tsx`, `src/components/EventEditor.tsx`, `src/app/calendar/page.tsx`
- Modify: `src/app/layout.tsx` (머리글 메뉴), `src/app/globals.css` (달력·폼 스타일)

**Interfaces:**
- Consumes: Task 1의 `monthGrid` 등, Task 2의 `EventInput`·`FieldErrors`·`REMIND_OPTIONS`·`Person`·`nameOf`·`loadPeople`, Task 3의 `EventRecord`·`listEventsInRange`, Task 5의 `hasEditSession`, Task 6의 API
- Produces:
  - `view.ts`: `WEEKDAY_LABELS`, `groupByDate(events): Record<string, EventRecord[]>`, `visibleTitles(events, max = 2): { shown; more }`, `formatTimeRange(event): string`(`종일` 또는 `14:00–16:00`), `dayLabel(date): string`(`10월 7일 (수)`), `pickSelectedDate(raw, grid, today): string | null`, `remindLabel(offsets): string`
  - `form.ts`: `EventFormState`, `emptyForm(date)`, `formFromEvent(event)`, `formToPayload(form)`, `toggleValue(list, value)`
  - `client.ts`(fetch 주입): `login(fetchImpl, code)`, `logout(fetchImpl)`, `saveEvent(fetchImpl, id | null, payload)`, `deleteEvent(fetchImpl, id)` → `{ ok: true, data } | { ok: false, status, message, fieldErrors?, retryAfterMinutes? }` (네트워크 오류는 `status: 0`)
  - 화면 `/calendar?month=YYYY-MM&date=YYYY-MM-DD`: 월 이동(‹ ›)과 `오늘`, 날짜 칸(일정 제목 2개 + `+N`), 선택한 날의 일정 목록(시간, 메모, 참석자 이름)과 추가·수정·삭제, 편집 코드 입력, 편집 끝내기. DB 문제는 안내 배너로 보여준다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/calendar/view.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import type { EventRecord } from "@/lib/events/store";
import { monthGrid } from "./month";
import { dayLabel, formatTimeRange, groupByDate, pickSelectedDate, remindLabel, visibleTitles } from "./view";

const event = (id: number, date: string, overrides: Partial<EventRecord> = {}): EventRecord => ({
  id,
  title: `일정 ${id}`,
  date,
  startTime: null,
  endTime: null,
  memo: null,
  attendeeIds: [],
  remindOffsets: [0, 1],
  ...overrides,
});

describe("groupByDate", () => {
  it("날짜별로 묶고 들어온 순서를 지킨다", () => {
    const grouped = groupByDate([event(1, "2026-10-07"), event(2, "2026-10-08"), event(3, "2026-10-07")]);
    expect(Object.keys(grouped).sort()).toEqual(["2026-10-07", "2026-10-08"]);
    expect(grouped["2026-10-07"].map((e) => e.id)).toEqual([1, 3]);
  });

  it("일정이 없으면 빈 객체다", () => {
    expect(groupByDate([])).toEqual({});
  });
});

describe("visibleTitles", () => {
  it("두 개까지 보여주고 나머지는 개수로 줄인다", () => {
    const events = [event(1, "2026-10-07"), event(2, "2026-10-07"), event(3, "2026-10-07"), event(4, "2026-10-07")];
    const { shown, more } = visibleTitles(events);
    expect(shown.map((e) => e.id)).toEqual([1, 2]);
    expect(more).toBe(2);
  });

  it("둘 이하면 더 있다는 표시가 없다", () => {
    expect(visibleTitles([event(1, "2026-10-07")])).toEqual({ shown: [event(1, "2026-10-07")], more: 0 });
    expect(visibleTitles([])).toEqual({ shown: [], more: 0 });
  });
});

describe("formatTimeRange / dayLabel / remindLabel", () => {
  it("시각이 없으면 종일, 있으면 시작–종료다", () => {
    expect(formatTimeRange(event(1, "2026-10-07"))).toBe("종일");
    expect(formatTimeRange(event(1, "2026-10-07", { startTime: "14:00", endTime: "16:30" }))).toBe("14:00–16:30");
  });

  it("날짜 라벨은 월 일 (요일)이다", () => {
    expect(dayLabel("2026-10-07")).toBe("10월 7일 (수)");
    expect(dayLabel("2026-02-01")).toBe("2월 1일 (일)");
    expect(dayLabel("2026-10-31")).toBe("10월 31일 (토)");
  });

  it("알림 시점을 읽기 쉽게 보여준다", () => {
    expect(remindLabel([0, 1])).toBe("당일, 1일 전");
    expect(remindLabel([3])).toBe("3일 전");
    expect(remindLabel([])).toBe("없음");
  });
});

describe("pickSelectedDate", () => {
  const grid = monthGrid({ year: 2026, month: 10 });

  it("보이는 달력 안의 날짜면 그대로 쓴다(이웃 달 칸도 포함)", () => {
    expect(pickSelectedDate("2026-10-15", grid, "2026-10-07")).toBe("2026-10-15");
    expect(pickSelectedDate("2026-09-28", grid, "2026-10-07")).toBe("2026-09-28");
  });

  it("보이는 달력 밖이거나 이상한 값이면 무시하고, 오늘이 이 달이면 오늘을 고른다", () => {
    for (const raw of ["2026-12-01", "2026-02-30", "abc", "", undefined, ["2026-10-15"]]) {
      expect(pickSelectedDate(raw as string | undefined, grid, "2026-10-07"), String(raw)).toBe("2026-10-07");
    }
  });

  it("오늘이 이 달이 아니면 고르지 않는다", () => {
    expect(pickSelectedDate(undefined, grid, "2026-11-20")).toBeNull();
    expect(pickSelectedDate(undefined, grid, "2026-09-28")).toBeNull(); // 이웃 달 칸의 오늘은 자동 선택하지 않는다
  });
});
`````

**`src/lib/events/form.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { emptyForm, formFromEvent, formToPayload, toggleValue } from "./form";
import type { EventRecord } from "./store";

describe("emptyForm", () => {
  it("선택한 날짜, 종일, 알림은 당일과 1일 전이 기본이다", () => {
    expect(emptyForm("2026-10-07")).toEqual({
      title: "",
      date: "2026-10-07",
      allDay: true,
      startTime: "09:00",
      endTime: "10:00",
      memo: "",
      attendeeIds: [],
      remindOffsets: [0, 1],
    });
  });
});

describe("formFromEvent / formToPayload", () => {
  const timed: EventRecord = {
    id: 5,
    title: "스터디",
    date: "2026-10-07",
    startTime: "14:00",
    endTime: "16:30",
    memo: "3층",
    attendeeIds: ["p1", "p3"],
    remindOffsets: [0, 3],
  };

  it("시각이 있는 일정은 종일을 끄고 시각을 채운다", () => {
    const form = formFromEvent(timed);
    expect(form).toEqual({
      title: "스터디",
      date: "2026-10-07",
      allDay: false,
      startTime: "14:00",
      endTime: "16:30",
      memo: "3층",
      attendeeIds: ["p1", "p3"],
      remindOffsets: [0, 3],
    });
    expect(formToPayload(form)).toEqual({
      title: "스터디",
      date: "2026-10-07",
      startTime: "14:00",
      endTime: "16:30",
      memo: "3층",
      attendeeIds: ["p1", "p3"],
      remindOffsets: [0, 3],
    });
  });

  it("종일 일정은 시각을 보내지 않는다(입력칸에 남은 값과 상관없이)", () => {
    const form = formFromEvent({ ...timed, startTime: null, endTime: null, memo: null });
    expect(form.allDay).toBe(true);
    expect(form.memo).toBe("");
    expect(formToPayload(form)).toMatchObject({ startTime: null, endTime: null, memo: "" });
  });

  it("종일을 켜면 입력칸의 시각을 무시한다", () => {
    const payload = formToPayload({ ...emptyForm("2026-10-07"), allDay: true, startTime: "13:00", endTime: "14:00" });
    expect(payload).toMatchObject({ startTime: null, endTime: null });
  });

  it("폼을 고치는 도중 원본 배열이 바뀌지 않는다", () => {
    const form = formFromEvent(timed);
    form.attendeeIds.push("p2");
    expect(timed.attendeeIds).toEqual(["p1", "p3"]);
  });
});

describe("toggleValue", () => {
  it("없으면 더하고 있으면 뺀다(원본은 그대로)", () => {
    const list = [0, 1];
    expect(toggleValue(list, 3)).toEqual([0, 1, 3]);
    expect(toggleValue(list, 1)).toEqual([0]);
    expect(list).toEqual([0, 1]);
  });
});
`````

**`src/lib/events/client.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { deleteEvent, login, logout, saveEvent } from "./client";

type Recorded = { url: string; init: RequestInit | undefined };

function fakeFetch(respond: (url: string) => Response | Error) {
  const requests: Recorded[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    const result = respond(url);
    if (result instanceof Error) throw result;
    return result;
  }) as unknown as typeof fetch;
  return { impl, requests };
}

const ok = (body: unknown = { ok: true }, status = 200) => new Response(JSON.stringify(body), { status });

describe("login / logout", () => {
  it("코드를 JSON POST로 보내고 성공을 알린다", async () => {
    const { impl, requests } = fakeFetch(() => ok());
    expect(await login(impl, "my-code")).toEqual({ ok: true, data: { ok: true } });
    expect(requests[0].url).toBe("/api/auth/login");
    expect(requests[0].init?.method).toBe("POST");
    expect(requests[0].init?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({ code: "my-code" });
  });

  it("틀린 코드(401)와 잠금(429)의 메시지와 남은 분을 그대로 돌려준다", async () => {
    const wrong = await login(fakeFetch(() => ok({ error: "코드가 맞지 않아요." }, 401)).impl, "x");
    expect(wrong).toEqual({ ok: false, status: 401, message: "코드가 맞지 않아요." });

    const locked = await login(fakeFetch(() => ok({ error: "시도가 너무 많아요. 7분 뒤에 다시 시도해 주세요.", retryAfterMinutes: 7 }, 429)).impl, "x");
    expect(locked).toMatchObject({ ok: false, status: 429, retryAfterMinutes: 7 });
  });

  it("로그아웃도 POST다", async () => {
    const { impl, requests } = fakeFetch(() => ok());
    await logout(impl);
    expect(requests[0].url).toBe("/api/auth/logout");
    expect(requests[0].init?.method).toBe("POST");
  });
});

describe("saveEvent / deleteEvent", () => {
  it("새 일정은 /api/events, 수정은 /api/events/번호로 보낸다", async () => {
    const { impl, requests } = fakeFetch(() => ok({ id: 9 }, 201));
    expect(await saveEvent(impl, null, { title: "a" })).toEqual({ ok: true, data: { id: 9 } });
    await saveEvent(impl, 7, { title: "b" });
    expect(requests.map((r) => r.url)).toEqual(["/api/events", "/api/events/7"]);
    expect(requests.every((r) => r.init?.method === "POST")).toBe(true);
    expect(JSON.parse(String(requests[1].init?.body))).toEqual({ title: "b" });
  });

  it("검증 실패(400)는 필드별 메시지를 돌려준다", async () => {
    const { impl } = fakeFetch(() => ok({ error: "입력을 확인해 주세요.", errors: { title: "제목을 입력해 주세요." } }, 400));
    expect(await saveEvent(impl, null, {})).toEqual({
      ok: false,
      status: 400,
      message: "입력을 확인해 주세요.",
      fieldErrors: { title: "제목을 입력해 주세요." },
    });
  });

  it("삭제는 /api/events/번호/delete로 POST한다", async () => {
    const { impl, requests } = fakeFetch(() => ok());
    expect((await deleteEvent(impl, 4)).ok).toBe(true);
    expect(requests[0].url).toBe("/api/events/4/delete");
    expect(requests[0].init?.method).toBe("POST");
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({});
  });

  it("401은 상태 코드로 구분할 수 있다(코드를 다시 물어야 한다)", async () => {
    const { impl } = fakeFetch(() => ok({ error: "편집 코드를 먼저 입력해 주세요." }, 401));
    expect(await saveEvent(impl, null, {})).toMatchObject({ ok: false, status: 401 });
  });
});

describe("오류 처리", () => {
  it("네트워크가 끊기면 던지지 않고 status 0으로 알린다", async () => {
    const { impl } = fakeFetch(() => new Error("offline"));
    const result = await saveEvent(impl, null, {});
    expect(result).toMatchObject({ ok: false, status: 0 });
    if (!result.ok) expect(result.message).toContain("네트워크");
  });

  it("응답이 JSON이 아니어도 기본 문구로 알린다", async () => {
    const { impl } = fakeFetch(() => new Response("<html>oops</html>", { status: 500 }));
    const result = await deleteEvent(impl, 1);
    expect(result).toMatchObject({ ok: false, status: 500 });
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });

  it("성공 응답 본문이 비어 있어도 죽지 않는다", async () => {
    const { impl } = fakeFetch(() => new Response(null, { status: 200 }));
    expect((await logout(impl)).ok).toBe(true);
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/calendar/view.test.ts src/lib/events/form.test.ts src/lib/events/client.test.ts`
Expected: FAIL — `./view`, `./form`, `./client` 모듈을 찾을 수 없다는 오류.

- [ ] **Step 3: 순수 도우미를 구현한다**

**`src/lib/calendar/view.ts`**

`````ts
import { weekday } from "@/lib/events/dates";
import type { EventRecord } from "@/lib/events/store";
import type { DayCell } from "./month";

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function groupByDate(events: EventRecord[]): Record<string, EventRecord[]> {
  const grouped: Record<string, EventRecord[]> = {};
  for (const event of events) (grouped[event.date] ??= []).push(event);
  return grouped;
}

/** 날짜 칸에는 제목을 `max`개만 보여주고 나머지는 "+N"으로 줄인다. */
export function visibleTitles(events: EventRecord[], max = 2): { shown: EventRecord[]; more: number } {
  return { shown: events.slice(0, max), more: Math.max(0, events.length - max) };
}

export function formatTimeRange(event: Pick<EventRecord, "startTime" | "endTime">): string {
  return event.startTime && event.endTime ? `${event.startTime}–${event.endTime}` : "종일";
}

/** "10월 7일 (수)" */
export function dayLabel(date: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 (${WEEKDAY_LABELS[weekday(date)]})`;
}

const REMIND_LABELS: Record<number, string> = { 0: "당일", 1: "1일 전", 3: "3일 전" };

export function remindLabel(offsets: number[]): string {
  return offsets.length === 0 ? "없음" : offsets.map((offset) => REMIND_LABELS[offset] ?? `${offset}일 전`).join(", ");
}

/**
 * 화면에서 선택한 날짜. `?date=`가 지금 보이는 달력 안의 날짜면 그 날짜, 아니면
 * 오늘이 이 달 안에 있을 때만 오늘, 그 밖에는 선택하지 않는다.
 */
export function pickSelectedDate(raw: string | string[] | undefined, grid: DayCell[][], today: string): string | null {
  const cells = grid.flat();
  if (typeof raw === "string" && cells.some((cell) => cell.date === raw)) return raw;
  return cells.some((cell) => cell.date === today && cell.inMonth) ? today : null;
}
`````

**`src/lib/events/form.ts`**

`````ts
import type { EventRecord } from "./store";

/** 일정 폼에 입력 중인 값. 종일이면 시각 칸은 무시된다. */
export type EventFormState = {
  title: string;
  date: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  memo: string;
  attendeeIds: string[];
  remindOffsets: number[];
};

export function emptyForm(date: string): EventFormState {
  return {
    title: "",
    date,
    allDay: true,
    startTime: "09:00",
    endTime: "10:00",
    memo: "",
    attendeeIds: [],
    remindOffsets: [0, 1],
  };
}

export function formFromEvent(event: EventRecord): EventFormState {
  return {
    title: event.title,
    date: event.date,
    allDay: event.startTime === null,
    startTime: event.startTime ?? "09:00",
    endTime: event.endTime ?? "10:00",
    memo: event.memo ?? "",
    attendeeIds: [...event.attendeeIds],
    remindOffsets: [...event.remindOffsets],
  };
}

/** 서버로 보낼 본문. 종일이면 시각은 null로 보낸다. */
export function formToPayload(form: EventFormState): Record<string, unknown> {
  return {
    title: form.title,
    date: form.date,
    startTime: form.allDay ? null : form.startTime,
    endTime: form.allDay ? null : form.endTime,
    memo: form.memo,
    attendeeIds: form.attendeeIds,
    remindOffsets: form.remindOffsets,
  };
}

/** 체크박스용: 없으면 더하고 있으면 뺀 새 배열. */
export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}
`````

**`src/lib/events/client.ts`**

`````ts
import type { FieldErrors } from "./validate";

export type ApiOk<T> = { ok: true; data: T };
export type ApiError = {
  ok: false;
  /** 0이면 네트워크 오류, 401이면 편집 코드를 다시 물어야 한다. */
  status: number;
  message: string;
  fieldErrors?: FieldErrors;
  retryAfterMinutes?: number;
};
export type ApiResult<T> = ApiOk<T> | ApiError;

const JSON_HEADERS = { "content-type": "application/json" };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** 쓰기 요청은 모두 JSON POST다. 브라우저의 fetch를 주입받아서 진짜 브라우저 없이도 시험할 수 있다. */
async function post<T>(fetchImpl: typeof fetch, url: string, body: unknown): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetchImpl(url, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  } catch {
    return { ok: false, status: 0, message: "네트워크에 연결하지 못했어요. 잠시 뒤에 다시 시도해 주세요." };
  }

  const data: unknown = await response.json().catch(() => null);
  if (response.ok) return { ok: true, data: data as T };

  const record = isRecord(data) ? data : {};
  return {
    ok: false,
    status: response.status,
    message: typeof record.error === "string" ? record.error : "요청을 처리하지 못했어요.",
    ...(isRecord(record.errors) ? { fieldErrors: record.errors as FieldErrors } : {}),
    ...(typeof record.retryAfterMinutes === "number" ? { retryAfterMinutes: record.retryAfterMinutes } : {}),
  };
}

export const login = (fetchImpl: typeof fetch, code: string) => post<{ ok: true }>(fetchImpl, "/api/auth/login", { code });

export const logout = (fetchImpl: typeof fetch) => post<{ ok: true }>(fetchImpl, "/api/auth/logout", {});

/** `id`가 null이면 새 일정, 있으면 그 일정을 고친다. */
export const saveEvent = (fetchImpl: typeof fetch, id: number | null, payload: Record<string, unknown>) =>
  post<{ id?: number }>(fetchImpl, id === null ? "/api/events" : `/api/events/${id}`, payload);

export const deleteEvent = (fetchImpl: typeof fetch, id: number) => post<{ ok: true }>(fetchImpl, `/api/events/${id}/delete`, {});
`````

- [ ] **Step 4: 순수 도우미의 통과를 확인한다**

Run: `npx vitest run src/lib/calendar src/lib/events`
Expected: PASS — 모두 통과.

- [ ] **Step 5: 컴포넌트와 화면을 만든다**

이 부분은 브라우저에서 확인한다(Task 10 Step 6). 로직은 위의 순수 함수에 있고, 컴포넌트는 그 위에 얹는 얇은 층이다.

**`src/components/CalendarGrid.tsx`**

`````tsx
import Link from "next/link";
import { monthKey, monthOf, type DayCell, type MonthRef } from "@/lib/calendar/month";
import { WEEKDAY_LABELS, dayLabel, visibleTitles } from "@/lib/calendar/view";
import type { EventRecord } from "@/lib/events/store";

type Props = {
  month: MonthRef;
  weeks: DayCell[][];
  eventsByDate: Record<string, EventRecord[]>;
  today: string;
  selected: string | null;
};

/** 월 달력 표. 날짜 칸은 링크라서 누르면 그 날짜가 선택된다(서버가 그려 주므로 자바스크립트가 없어도 동작한다). */
export function CalendarGrid({ month, weeks, eventsByDate, today, selected }: Props) {
  return (
    <table className="cal">
      <caption className="sr-only">{`${month.year}년 ${month.month}월 달력`}</caption>
      <thead>
        <tr>
          {WEEKDAY_LABELS.map((label, index) => (
            <th key={label} scope="col" className={index === 0 ? "sun" : index === 6 ? "sat" : undefined}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0].date}>
            {week.map((cell) => {
              const events = eventsByDate[cell.date] ?? [];
              const { shown, more } = visibleTitles(events);
              const classes = ["cal-cell", cell.inMonth ? "" : "out", cell.date === today ? "today" : "", cell.date === selected ? "selected" : ""]
                .filter(Boolean)
                .join(" ");
              // 이웃 달의 칸을 누르면 그 달로 넘어가고, 이 달의 칸은 지금 보는 달을 유지한다.
              const target = cell.inMonth ? month : monthOf(cell.date);
              return (
                <td key={cell.date}>
                  <Link
                    href={`/calendar?month=${monthKey(target)}&date=${cell.date}`}
                    className={classes}
                    aria-label={`${dayLabel(cell.date)}, 일정 ${events.length}개`}
                    aria-current={cell.date === today ? "date" : undefined}
                  >
                    <span className="cal-day">{cell.day}</span>
                    {shown.map((event) => (
                      <span key={event.id} className="cal-event">
                        {event.title}
                      </span>
                    ))}
                    {more > 0 && <span className="cal-more">+{more}</span>}
                  </Link>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
`````

**`src/components/EventEditor.tsx`**

`````tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatTimeRange, remindLabel } from "@/lib/calendar/view";
import { deleteEvent, login, logout, saveEvent, type ApiError } from "@/lib/events/client";
import { emptyForm, formFromEvent, formToPayload, toggleValue, type EventFormState } from "@/lib/events/form";
import type { EventRecord } from "@/lib/events/store";
import { MAX_MEMO_LENGTH, MAX_TITLE_LENGTH, REMIND_OPTIONS, type FieldErrors } from "@/lib/events/validate";
import { nameOf, type Person } from "@/lib/people";

type Props = {
  /** 선택한 날짜(YYYY-MM-DD). 날짜가 바뀌면 부모가 key를 바꿔서 이 컴포넌트를 새로 시작한다. */
  date: string;
  events: EventRecord[];
  people: Person[];
  canEdit: boolean;
};

/** 코드를 확인한 뒤에 이어서 할 일. "resume"은 작성 중이던 폼으로 돌아간다. */
type Pending = { kind: "add" } | { kind: "edit"; event: EventRecord } | { kind: "delete"; event: EventRecord } | { kind: "resume" };
type Draft = { eventId: number | null; form: EventFormState };
type Prompt = { then: Pending; message: string | null };

const REMIND_LABEL: Record<number, string> = { 0: "당일", 1: "1일 전", 3: "3일 전" };
const browserFetch: typeof fetch = (input, init) => fetch(input, init);

export function EventEditor({ date, events, people, canEdit }: Props) {
  const router = useRouter();
  const [authed, setAuthed] = useState(canEdit);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function perform(action: Pending) {
    if (action.kind === "add") setDraft({ eventId: null, form: emptyForm(date) });
    else if (action.kind === "edit") setDraft({ eventId: action.event.id, form: formFromEvent(action.event) });
    else if (action.kind === "delete") void remove(action.event);
  }

  /** 편집 코드를 아직 입력하지 않았으면 코드부터 묻고, 맞으면 하려던 일을 이어서 한다. */
  function begin(action: Pending) {
    setError(null);
    setFieldErrors({});
    if (!authed) {
      setPrompt({ then: action, message: null });
      return;
    }
    perform(action);
  }

  function fail(result: ApiError, retry: Pending) {
    if (result.status === 401) {
      // 쿠키가 만료됐거나 없어진 경우: 코드를 다시 받고, 하려던 일(폼 내용 포함)은 그대로 둔다.
      setAuthed(false);
      setPrompt({ then: retry, message: "편집 코드를 다시 입력해 주세요." });
      return;
    }
    setFieldErrors(result.fieldErrors ?? {});
    setError(result.message);
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (!prompt) return;
    setBusy(true);
    setError(null);
    const result = await login(browserFetch, code);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setAuthed(true);
    setCode("");
    const next = prompt.then;
    setPrompt(null);
    perform(next);
  }

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const result = await saveEvent(browserFetch, draft.eventId, formToPayload(draft.form));
    setBusy(false);
    if (result.ok) {
      setDraft(null);
      router.refresh();
      return;
    }
    fail(result, { kind: "resume" });
  }

  async function remove(target: EventRecord) {
    if (!window.confirm(`"${target.title}" 일정을 삭제할까요?`)) return;
    setBusy(true);
    setError(null);
    const result = await deleteEvent(browserFetch, target.id);
    setBusy(false);
    if (result.ok) {
      router.refresh();
      return;
    }
    fail(result, { kind: "delete", event: target });
  }

  async function endEditing() {
    await logout(browserFetch);
    setAuthed(false);
    router.refresh();
  }

  function patch(update: Partial<EventFormState>) {
    setDraft((current) => (current ? { ...current, form: { ...current.form, ...update } } : current));
  }

  function cancel() {
    setDraft(null);
    setPrompt(null);
    setCode("");
    setError(null);
    setFieldErrors({});
  }

  return (
    <div className="editor">
      {prompt ? (
        <form className="code-form" onSubmit={submitCode}>
          <p className="meta">{prompt.message ?? "일정을 바꾸려면 팀 편집 코드가 필요해요."}</p>
          <label>
            편집 코드
            <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" required />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={busy}>
              {busy ? "확인 중…" : "확인"}
            </button>
            <button type="button" onClick={cancel} disabled={busy}>
              취소
            </button>
          </div>
        </form>
      ) : draft ? (
        <form className="event-form" onSubmit={submitForm}>
          <label>
            제목
            <input
              type="text"
              value={draft.form.title}
              maxLength={MAX_TITLE_LENGTH}
              onChange={(e) => patch({ title: e.target.value })}
              required
            />
            {fieldErrors.title && <span className="field-error">{fieldErrors.title}</span>}
          </label>

          <label>
            날짜
            <input type="date" value={draft.form.date} onChange={(e) => patch({ date: e.target.value })} required />
            {fieldErrors.date && <span className="field-error">{fieldErrors.date}</span>}
          </label>

          <label className="check">
            <input type="checkbox" checked={draft.form.allDay} onChange={(e) => patch({ allDay: e.target.checked })} />
            종일
          </label>
          {!draft.form.allDay && (
            <div className="time-row">
              <input type="time" aria-label="시작 시각" value={draft.form.startTime} onChange={(e) => patch({ startTime: e.target.value })} required />
              <span aria-hidden="true">~</span>
              <input type="time" aria-label="종료 시각" value={draft.form.endTime} onChange={(e) => patch({ endTime: e.target.value })} required />
            </div>
          )}
          {fieldErrors.time && <span className="field-error">{fieldErrors.time}</span>}

          <label>
            메모
            <textarea
              rows={3}
              value={draft.form.memo}
              maxLength={MAX_MEMO_LENGTH}
              onChange={(e) => patch({ memo: e.target.value })}
            />
            {fieldErrors.memo && <span className="field-error">{fieldErrors.memo}</span>}
          </label>

          {people.length > 0 && (
            <fieldset>
              <legend>참석자</legend>
              {people.map((person) => (
                <label key={person.id} className="check">
                  <input
                    type="checkbox"
                    checked={draft.form.attendeeIds.includes(person.id)}
                    onChange={() => patch({ attendeeIds: toggleValue(draft.form.attendeeIds, person.id) })}
                  />
                  {person.name}
                </label>
              ))}
              {fieldErrors.attendeeIds && <span className="field-error">{fieldErrors.attendeeIds}</span>}
            </fieldset>
          )}

          <fieldset>
            <legend>알림</legend>
            {REMIND_OPTIONS.map((offset) => (
              <label key={offset} className="check">
                <input
                  type="checkbox"
                  checked={draft.form.remindOffsets.includes(offset)}
                  onChange={() => patch({ remindOffsets: toggleValue(draft.form.remindOffsets, offset).sort((a, b) => a - b) })}
                />
                {REMIND_LABEL[offset]}
              </label>
            ))}
            {fieldErrors.remindOffsets && <span className="field-error">{fieldErrors.remindOffsets}</span>}
          </fieldset>

          <div className="form-actions">
            <button type="submit" disabled={busy}>
              {busy ? "저장 중…" : "저장"}
            </button>
            <button type="button" onClick={cancel} disabled={busy}>
              취소
            </button>
          </div>
        </form>
      ) : (
        <>
          {events.length === 0 ? (
            <p className="empty">이날은 일정이 없어요.</p>
          ) : (
            <ul className="event-list">
              {events.map((event) => (
                <li key={event.id} className="event-item">
                  <div className="event-title">{event.title}</div>
                  <p className="event-meta">{formatTimeRange(event)}</p>
                  {event.memo && <p className="event-memo">{event.memo}</p>}
                  {event.attendeeIds.length > 0 && (
                    <p className="event-meta">참석: {event.attendeeIds.map((id) => nameOf(people, id)).join(", ")}</p>
                  )}
                  <p className="event-meta">알림: {remindLabel(event.remindOffsets)}</p>
                  <div className="event-buttons">
                    <button type="button" onClick={() => begin({ kind: "edit", event })} disabled={busy}>
                      수정
                    </button>
                    <button type="button" onClick={() => begin({ kind: "delete", event })} disabled={busy}>
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="editor-actions">
            <button type="button" onClick={() => begin({ kind: "add" })} disabled={busy}>
              일정 추가
            </button>
            {authed && (
              <button type="button" className="link-button" onClick={endEditing}>
                편집 끝내기
              </button>
            )}
          </div>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
`````

**`src/app/calendar/page.tsx`**

`````tsx
import Link from "next/link";
import { CalendarGrid } from "@/components/CalendarGrid";
import { EventEditor } from "@/components/EventEditor";
import { hasEditSession } from "@/lib/auth/server";
import { gridRange, monthGrid, monthKey, monthOf, monthTitle, parseMonthParam, shiftMonth } from "@/lib/calendar/month";
import { dayLabel, groupByDate, pickSelectedDate } from "@/lib/calendar/view";
import { getDbOrNull } from "@/lib/db";
import { todayInSeoul } from "@/lib/events/dates";
import { listEventsInRange, type EventRecord } from "@/lib/events/store";
import { loadPeople } from "@/lib/people";

export const metadata = { title: "달력" };

type SearchParams = Promise<{ month?: string | string[]; date?: string | string[] }>;

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const today = todayInSeoul();
  const month = parseMonthParam(params.month, monthOf(today));
  const weeks = monthGrid(month);
  const range = gridRange(month);
  const selected = pickSelectedDate(params.date, weeks, today);

  // 데이터베이스 문제는 달력 화면에서만 안내하고, 문서 뷰어에는 영향을 주지 않는다.
  let events: EventRecord[] = [];
  let problem: string | null = null;
  const db = getDbOrNull();
  if (!db) {
    problem = "데이터베이스가 설정되지 않아서 일정을 불러올 수 없어요.";
  } else {
    try {
      events = await listEventsInRange(db, range.from, range.to);
    } catch (error) {
      console.error("일정을 불러오지 못했어요", error);
      problem = "일정을 불러오지 못했어요. 잠시 뒤에 다시 시도해 주세요.";
    }
  }

  const people = loadPeople();
  const canEdit = await hasEditSession();
  const eventsByDate = groupByDate(events);
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <main className="page page-wide">
      <div className="cal-nav">
        <Link href={`/calendar?month=${monthKey(prev)}`} aria-label="이전 달">
          ‹
        </Link>
        <h1>{monthTitle(month)}</h1>
        <Link href={`/calendar?month=${monthKey(next)}`} aria-label="다음 달">
          ›
        </Link>
        <Link href="/calendar" className="cal-today">
          오늘
        </Link>
      </div>

      {problem && <p className="banner">{problem}</p>}
      {!people.ok && <p className="banner">{people.error}</p>}

      <CalendarGrid month={month} weeks={weeks} eventsByDate={eventsByDate} today={today} selected={selected} />

      {selected && !problem ? (
        <section className="day-panel" aria-label={`${dayLabel(selected)} 일정`}>
          <h2>{dayLabel(selected)}</h2>
          <EventEditor
            key={selected}
            date={selected}
            events={eventsByDate[selected] ?? []}
            people={people.ok ? people.people : []}
            canEdit={canEdit}
          />
        </section>
      ) : (
        !problem && <p className="empty">날짜를 눌러 그날의 일정을 확인하세요.</p>
      )}
    </main>
  );
}
`````

`src/app/layout.tsx`에서 다음을 찾아서

`````tsx
          <Link href="/" className="site-title">
            Docs Backoffice
          </Link>
          <NotificationBell />
`````

이렇게 바꾼다.

`````tsx
          <div className="site-nav">
            <Link href="/" className="site-title">
              Docs Backoffice
            </Link>
            <nav aria-label="주요 메뉴" className="site-links">
              <Link href="/">문서</Link>
              <Link href="/calendar">달력</Link>
            </nav>
          </div>
          <NotificationBell />
`````

`src/app/globals.css`에서 다음을 찾아서

`````css
.notify-error {
  color: #cf222e;
}
`````

이렇게 바꾼다.

`````css
.notify-error {
  color: #cf222e;
}

.site-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 1rem;
}

.site-links {
  display: flex;
  gap: 0.9rem;
  font-size: 0.95rem;
}

.site-links a {
  color: var(--muted);
  text-decoration: none;
}

.site-links a:hover {
  color: var(--fg);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.cal-nav {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.cal-nav h1 {
  margin: 0;
  font-size: 1.25rem;
}

.cal-nav a {
  padding: 0.15rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--fg);
  text-decoration: none;
}

.cal-nav .cal-today {
  margin-left: auto;
  font-size: 0.9rem;
}

.cal {
  width: 100%;
  margin: 1rem 0;
  border-collapse: collapse;
  table-layout: fixed;
}

.cal th {
  padding: 0.3rem 0;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
}

.cal th.sun {
  color: #cf222e;
}

.cal th.sat {
  color: var(--accent);
}

.cal td {
  padding: 0;
  border: 1px solid var(--border);
  vertical-align: top;
}

.cal-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 4.5rem;
  padding: 0.2rem;
  overflow: hidden;
  color: var(--fg);
  text-decoration: none;
}

.cal-cell.out {
  background: var(--code-bg);
  color: var(--muted);
}

.cal-cell.selected {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.cal-day {
  font-size: 0.8rem;
  line-height: 1.4rem;
}

.cal-cell.today .cal-day {
  display: inline-block;
  min-width: 1.4rem;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  text-align: center;
}

.cal-event {
  display: block;
  padding: 0 0.2rem;
  overflow: hidden;
  border-radius: 3px;
  background: #ddf4ff;
  color: #0550ae;
  font-size: 0.68rem;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cal-more {
  color: var(--muted);
  font-size: 0.68rem;
}

.day-panel {
  margin-top: 1rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}

.day-panel h2 {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
}

.event-list {
  margin: 0 0 0.75rem;
  padding: 0;
  list-style: none;
}

.event-item {
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--border);
}

.event-title {
  font-weight: 600;
}

.event-meta {
  margin: 0;
  color: var(--muted);
  font-size: 0.85rem;
}

.event-memo {
  margin: 0.25rem 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.event-buttons,
.editor-actions,
.form-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.4rem;
}

.link-button {
  padding: 0.5rem 0.25rem;
  border: 0;
  background: none;
  color: var(--muted);
  text-decoration: underline;
}

.event-form,
.code-form {
  display: grid;
  gap: 0.75rem;
}

.event-form label,
.code-form label {
  display: grid;
  gap: 0.25rem;
  font-size: 0.9rem;
}

.event-form input[type="text"],
.event-form input[type="date"],
.event-form input[type="time"],
.event-form textarea,
.code-form input {
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  font: inherit;
}

.event-form fieldset {
  margin: 0;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.event-form legend {
  padding: 0 0.3rem;
  color: var(--muted);
  font-size: 0.85rem;
}

.event-form .check {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-right: 0.8rem;
}

.time-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.field-error,
.form-error {
  margin: 0;
  color: #cf222e;
  font-size: 0.85rem;
}
`````

- [ ] **Step 6: 타입, 린트, 빌드를 확인한다**

```bash
npm test
npm run typecheck
npm run lint
GITHUB_REPO=kakaotechcampus-4/ktc4-kyungpook-3 GITHUB_BRANCH=develop DOCS_PATHS=frontend/docs/plan GITHUB_WEBHOOK_SECRET=test-secret npm run build
```

Expected: 전체 테스트 통과, 타입·린트 오류 없음, 빌드 결과의 라우트 목록에 `/calendar`(동적), `/api/auth/login`, `/api/auth/logout`, `/api/events`, `/api/events/[id]`, `/api/events/[id]/delete`, `/api/cron/reminders`가 나온다.

- [ ] **Step 7: 커밋한다**

```bash
git add src/lib/calendar src/lib/events/form.ts src/lib/events/form.test.ts src/lib/events/client.ts src/lib/events/client.test.ts src/components/CalendarGrid.tsx src/components/EventEditor.tsx src/app/calendar src/app/layout.tsx src/app/globals.css
git commit -m "feat: add the month calendar page with event add, edit and delete"
```

---

### Task 10: 로컬 미리보기, 문서, 실제 서버와 브라우저 확인

**Files:**
- Create: `src/lib/db/memory.ts`, `src/lib/db/memory.test.ts`
- Modify: `src/lib/db/index.ts`, `.env.example`, `README.md`, `docs/superpowers/specs/2026-09-30-docs-backoffice-design.md`, `docs/superpowers/specs/2026-09-30-calendar-and-meetups-design.md`

**Interfaces:**
- Consumes: 계획 2의 `createTestDb`, 앞 작업의 전체 결과
- Produces:
  - `createMemoryDb(): Db` — 메모리 Postgres(PGlite)를 만들고 마이그레이션을 적용한다(준비되는 동안 들어온 쿼리는 기다린다).
  - `getDbOrNull()`이 **개발 모드에서 `LOCAL_MEMORY_DB=1`이면** 메모리 DB를 돌려준다(서버를 끄면 데이터가 사라진다). 프로덕션 빌드에서는 이 분기가 통째로 빠지고 PGlite도 번들에 들어가지 않는다(Step 7에서 확인).
  - 진짜 서버와 브라우저에서 확인한 결과.

Neon 계정 없이도 사용자가 `localhost`에서 달력을 써 볼 수 있게 하려는 개발 편의 기능이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

**`src/lib/db/memory.test.ts`**

`````ts
import { describe, expect, it } from "vitest";
import { createEvent, getEvent } from "@/lib/events/store";
import { createMemoryDb } from "./memory";

const input = {
  title: "미리보기 일정",
  date: "2026-10-07",
  startTime: null,
  endTime: null,
  memo: null,
  attendeeIds: [],
  remindOffsets: [0, 1],
};

describe("createMemoryDb", () => {
  it("마이그레이션이 적용된 메모리 데이터베이스를 돌려준다", async () => {
    const db = createMemoryDb();
    const id = await createEvent(db, input);
    expect(await getEvent(db, id)).toMatchObject({ id, title: "미리보기 일정" });
  });

  it("서로 다른 인스턴스는 데이터를 공유하지 않는다", async () => {
    const first = createMemoryDb();
    const second = createMemoryDb();
    const id = await createEvent(first, input);
    expect(await getEvent(second, id)).toBeNull();
  });
});
`````

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/db/memory.test.ts`
Expected: FAIL — `./memory` 모듈을 찾을 수 없다는 오류.

- [ ] **Step 3: 구현한다**

**`src/lib/db/memory.ts`**

`````ts
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
`````

아래 `src/lib/db/index.ts`는 파일 전체를 이 내용으로 바꾼다.

**`src/lib/db/index.ts`**

`````ts
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
`````

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/db`
Expected: PASS — 모두 통과.

- [ ] **Step 5: 설정 예시와 문서를 채운다**

`.env.example` 끝의 `VAPID_SUBJECT=` 줄 뒤에 다음을 덧붙인다.

`````dotenv

# ---- 달력과 일정 ----

# 일정을 추가·수정·삭제할 때 입력하는 팀 공용 편집 코드. 8자 이상(16자 이상 무작위 권장). 저장소나 공개 채팅에 올리지 않는다.
EDIT_CODE=

# 편집 쿠키 서명용 비밀키. 16자 이상 무작위 문자열. 바꾸면 기존 편집 로그인이 모두 풀린다.
SESSION_SECRET=

# 일정 알림 cron 엔드포인트 인증용. 16자 이상 무작위 문자열. Vercel이 Authorization: Bearer 헤더로 자동 전송한다.
CRON_SECRET=

# 참가자 명단 "번호:이름"을 쉼표로 (비우면 참가자 1~5). 데이터에는 번호만 저장되므로 이름은 나중에 바꿔도 된다.
PEOPLE=

# 로컬 미리보기: 1이면 Neon 없이 메모리 데이터베이스를 쓴다(개발 모드 전용, 서버를 끄면 데이터가 사라진다).
LOCAL_MEMORY_DB=
`````

`README.md`에서 다음을 찾아서

`````markdown
| `VAPID_SUBJECT` | `mailto:이메일` 또는 `https://주소` (푸시 알림) |
`````

이렇게 바꾼다.

`````markdown
| `VAPID_SUBJECT` | `mailto:이메일` 또는 `https://주소` (푸시 알림) |
| `EDIT_CODE` | 일정을 바꿀 때 입력하는 팀 공용 편집 코드 (8자 이상, 16자 이상 무작위 권장) |
| `SESSION_SECRET` | 편집 쿠키 서명용 비밀키 (16자 이상). 바꾸면 기존 편집 로그인이 모두 풀린다 |
| `CRON_SECRET` | 일정 알림 cron 인증용 (16자 이상). Vercel이 `Authorization: Bearer` 헤더로 자동 전송한다 |
| `PEOPLE` | 참가자 명단 `p1:참가자 1,p2:참가자 2,...` (1~10명, 비우면 `참가자 1~5`) |
| `LOCAL_MEMORY_DB` | `1`이면 Neon 없이 메모리 DB로 달력을 미리 본다 (개발 모드 전용) |
`````

그리고 다음을 찾아서

`````markdown
## 푸시 알림 설정
`````

이렇게 바꾼다.

`````markdown
## 달력과 일정

헤더의 **달력**(`/calendar`)에서 월 달력으로 일정을 봅니다. 날짜를 누르면 그날의 일정이 나오고, **일정 추가·수정·삭제**는 팀 편집 코드(`EDIT_CODE`)를 아는 사람만 할 수 있습니다. 바꾸려 할 때 코드를 묻고, 맞으면 7일 동안 기억합니다. 조회는 코드 없이 됩니다.

- 일정에는 제목, 날짜, 시각(종일 또는 시작~종료), 메모, 참석자, 알림 시점(당일·1일 전·3일 전)이 있습니다.
- 편집 코드를 5번 틀리면 그 IP는 10분 동안 막힙니다.
- **일정 알림:** 매일 한 번(한국시간 오전 9시~9시 59분 사이) 오늘 알릴 일정을 구독한 기기 전체에 한 통으로 보냅니다. Vercel Hobby의 cron은 하루 한 번만 되고, 실행 시각이 그 시(時) 안에서 흔들립니다. 보낼 항목을 먼저 기록하므로 같은 날 두 번 실행돼도 알림은 한 번이고, 아무에게도 못 보냈으면 기록을 풀어서 다시 호출하면 재시도됩니다. Vercel은 cron 전달이 드물게 누락되거나 중복될 수 있다고 안내하고, 실패해도 다시 시도하지 않습니다.
- 알림을 수동으로 보내 보려면(서버를 띄운 뒤나 배포 후): `curl -H "Authorization: Bearer <CRON_SECRET>" https://<주소>/api/cron/reminders`
- 필요한 값 만들기: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`를 세 번 실행해서 `EDIT_CODE`(팀에게 알릴 것), `SESSION_SECRET`, `CRON_SECRET`에 각각 넣습니다. 편집 코드는 저장소나 공개 채팅에 올리지 마세요.
- **Neon 없이 미리 보기:** `.env.local`에 `LOCAL_MEMORY_DB=1`, `EDIT_CODE=...`, `SESSION_SECRET=...`을 넣고 `npm run dev`를 실행하면 메모리 데이터베이스로 달력을 써 볼 수 있습니다(서버를 다시 켜면 일정이 사라집니다). 일정 알림까지 시험하려면 `DATABASE_URL=local-memory`와 VAPID 값, `CRON_SECRET`도 넣습니다.
- 참가자 명단은 `PEOPLE`로 정합니다. 일정의 참석자는 번호(`p1`)로 저장되므로, 나중에 실제 이름으로 바꿔도 기록이 유지됩니다.

## 푸시 알림 설정
`````

그리고 다음을 찾아서

`````markdown
- `public/sw.js`: 알림을 화면에 띄우는 서비스 워커
`````

이렇게 바꾼다.

`````markdown
- `public/sw.js`: 알림을 화면에 띄우는 서비스 워커
- `src/lib/events/`, `src/lib/calendar/`: 일정 검증·저장·쓰기 API와 월 달력 계산
- `src/lib/auth/`: 편집 코드 로그인(서명 쿠키, 실패 잠금)
- `src/lib/reminders/`: 일정 알림(보낼 항목 차지·해제, 문구, cron 요청 처리). cron 설정은 `vercel.json`
`````

`docs/superpowers/specs/2026-09-30-docs-backoffice-design.md`에서 두 곳을 고친다.

(1) 5.7의 다음을 찾아서

`````text
(Vercel Cron의 시간대는 UTC로 알고 있으며 구현 때 공식 문서로 확인)
`````

이렇게 바꾼다.

`````text
(확인 완료: Vercel Cron의 시간대는 항상 UTC이고, `CRON_SECRET`은 `Authorization: Bearer <값>` 헤더로 전달된다.)
`````

(2) 10번 "구현 전 확인 항목"의 7번을 찾아서

`````text
7. Vercel Cron의 시간대(UTC 가정)와 `CRON_SECRET` 검증 방식(요청 헤더 형식)을 공식 문서로 확인.
`````

이렇게 바꾼다.

`````text
7. (확인 완료) Vercel Cron의 시간대는 항상 UTC이고, `CRON_SECRET`은 `Authorization: Bearer <값>` 헤더로 전달된다. Hobby는 하루 한 번만 되고 시각은 지정한 시 안에서 임의(±59분)이며, 실패해도 재시도하지 않고 전달이 누락되거나 중복될 수 있다.
`````

`docs/superpowers/specs/2026-09-30-calendar-and-meetups-design.md`에서 다음을 찾아서

`````text
시간대는 모두 한국시간(시간대 없는 날짜와 시각)으로 다룬다.
`````

이렇게 바꾼다.

`````text
시간대는 모두 한국시간(시간대 없는 날짜와 시각)으로 다룬다. 계획 3은 `events`를 `meetup_id` 없이 만들고, 계획 4의 마이그레이션이 `meetups`를 만든 뒤 `events.meetup_id`를 더한다.
`````

- [ ] **Step 6: 진짜 개발 서버로 API와 화면을 확인한다**

Neon 없이 메모리 DB로 확인한다. 알림용 키를 하나 만들어서 함께 넣는다(실제 푸시 서비스로는 아무것도 보내지 않는다. 구독자가 없다).

```bash
npx web-push generate-vapid-keys --json
```

출력의 `publicKey`, `privateKey`를 아래 `<공개키>`, `<비공개키>`에 넣는다.

```bash
export LOCAL_MEMORY_DB=1 EDIT_CODE=test-edit-code-1234 SESSION_SECRET=test-session-secret-0123456789abcdef CRON_SECRET=test-cron-secret-0123456789
export DATABASE_URL=local-memory VAPID_SUBJECT=mailto:test@example.com NEXT_PUBLIC_VAPID_PUBLIC_KEY=<공개키> VAPID_PRIVATE_KEY=<비공개키>
export GITHUB_REPO=kakaotechcampus-4/ktc4-kyungpook-3 GITHUB_BRANCH=develop DOCS_PATHS=frontend/docs/plan GITHUB_WEBHOOK_SECRET=test-secret
npm run dev -- -p 3115
```

서버를 띄워 둔 채 다른 터미널에서 확인한다. (`TODAY`는 한국시간 오늘 날짜다.)

```bash
B=http://localhost:3115
JAR=$(mktemp)
TODAY=$(node -e "console.log(new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10))")

# 화면: 이상한 쿼리도 죽지 않는다
curl -s -o /dev/null -w "달력 %{http_code}\n" "$B/calendar"
curl -s -o /dev/null -w "달력(월 지정) %{http_code}\n" "$B/calendar?month=2026-10&date=2026-10-07"
curl -s -o /dev/null -w "달력(이상한 값) %{http_code}\n" "$B/calendar?month=abc&date=zzz"

# 쓰기는 편집 코드 없이 안 된다
curl -s -w " -> %{http_code}\n" -X POST "$B/api/events" -H "content-type: application/json" -d '{"title":"a","date":"2026-10-07"}'
curl -s -o /dev/null -w "GET으로 쓰기 시도 %{http_code}\n" "$B/api/events"

# 로그인: 틀린 코드 → 맞는 코드
curl -s -w " -> %{http_code}\n" -X POST "$B/api/auth/login" -H "content-type: application/json" -d '{"code":"wrong"}'
curl -s -D - -o /dev/null -c "$JAR" -X POST "$B/api/auth/login" -H "content-type: application/json" -d '{"code":"test-edit-code-1234"}' | grep -iE "^HTTP|set-cookie"

# 일정: 검증 실패 → 등록 → 목록에 보임 → 수정 → 삭제
curl -s -w " -> %{http_code}\n" -b "$JAR" -X POST "$B/api/events" -H "content-type: application/json" -d '{"title":"","date":"2026-02-30"}'
curl -s -w " -> %{http_code}\n" -b "$JAR" -X POST "$B/api/events" -H "content-type: application/json" -d "{\"title\":\"오늘 스터디\",\"date\":\"$TODAY\",\"startTime\":\"14:00\",\"endTime\":\"16:00\",\"attendeeIds\":[\"p1\",\"p2\"],\"remindOffsets\":[0]}"
curl -s "$B/calendar?date=$TODAY" | grep -o "오늘 스터디" | head -1
curl -s -w " -> %{http_code}\n" -b "$JAR" -X POST "$B/api/events/1" -H "content-type: application/json" -d "{\"title\":\"오늘 스터디(수정)\",\"date\":\"$TODAY\",\"remindOffsets\":[0]}"
curl -s -w " -> %{http_code}\n" -b "$JAR" -X POST "$B/api/events/999/delete" -H "content-type: application/json" -d '{}'

# cron: 헤더 없음/있음
curl -s -w " -> %{http_code}\n" "$B/api/cron/reminders"
curl -s -w " -> %{http_code}\n" -H "Authorization: Bearer test-cron-secret-0123456789" "$B/api/cron/reminders"
curl -s -w " -> %{http_code}\n" -H "Authorization: Bearer test-cron-secret-0123456789" "$B/api/cron/reminders"
```

Expected:
- 달력 세 가지 모두 `200`.
- 코드 없이 등록은 `{"error":"편집 코드를 먼저 입력해 주세요."} -> 401`, GET은 `405`.
- 틀린 코드는 `{"error":"코드가 맞지 않아요."} -> 401`. 맞는 코드는 `HTTP/1.1 200`과 `set-cookie: edit_session=...; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax`(개발 서버라 `Secure`는 없다).
- 검증 실패는 `-> 400`과 `errors`에 `title`, `date`. 등록은 `{"id":1} -> 201`. 달력 HTML에 `오늘 스터디`가 나온다. 수정은 `{"ok":true} -> 200`, 없는 번호 삭제는 `-> 404`.
- cron: 헤더 없이는 `-> 401`. 맞는 헤더는 첫 호출이 `{"today":"<TODAY>","claimed":1,"summary":{"total":0,"sent":0,"removed":0,"failed":0},"released":false} -> 200`(구독자가 없어 실제 발송은 없다), **두 번째 호출은 `"claimed":0`**(같은 날 중복 없음).

- [ ] **Step 7: 브라우저에서 화면을 확인한다**

같은 개발 서버(`http://localhost:3115/calendar`)를 브라우저로 열어서 확인한다.

- [ ] 헤더에 `Docs Backoffice · 문서 · 달력`이 보이고, 달력에는 이번 달 표(일요일 시작)와 `‹ 2026년 M월 › 오늘`이 있다. 오늘 칸이 파란 원으로 표시되고 오늘이 선택돼 아래에 `M월 D일 (요일)` 패널이 열린다.
- [ ] `›`를 누르면 다음 달로, `오늘`을 누르면 이번 달로 돌아온다. 이웃 달의 회색 칸을 누르면 그 달로 넘어간다.
- [ ] **일정 추가**를 누르면(아직 편집 코드를 안 넣은 상태) 편집 코드 입력창이 뜬다. 틀린 코드를 넣으면 `코드가 맞지 않아요.`가 나오고, 맞는 코드(`test-edit-code-1234`)를 넣으면 곧바로 일정 폼이 열린다.
- [ ] 폼에서 제목을 비우고 저장하면 브라우저 기본 검증이 막는다. 제목 `테스트 일정`, 종일을 끄고 `14:00 ~ 13:00`(종료가 앞)으로 저장하면 `종료 시각은 시작 시각보다 뒤여야 해요.`가 시각 칸 아래에 나온다. `14:00 ~ 16:00`, 참석자 두 명을 체크해서 저장하면 폼이 닫히고, 목록에 제목·`14:00–16:00`·`참석: 참가자 1, 참가자 2`·`알림: 당일, 1일 전`이 보이고 달력 칸에도 제목이 나온다.
- [ ] **수정**으로 제목을 바꿔 저장하면 반영된다. **삭제**는 확인창이 뜨고 승인하면 사라진다.
- [ ] 같은 날 일정을 3개 이상 만들면 칸에는 2개 제목과 `+N`이 보인다.
- [ ] **편집 끝내기**를 누른 뒤 **일정 추가**를 누르면 다시 코드를 묻는다.
- [ ] 브라우저 창을 폭 375px 정도로 줄여도 달력 표와 폼이 가로로 넘치지 않는다.
- [ ] 개발자 도구 콘솔에 오류가 없다.

확인이 끝나면 서버를 끈다(`Ctrl+C`).

- [ ] **Step 8: 프로덕션 빌드에 메모리 DB 코드가 들어가지 않았는지 확인한다**

```bash
rm -rf .next
GITHUB_REPO=kakaotechcampus-4/ktc4-kyungpook-3 GITHUB_BRANCH=develop DOCS_PATHS=frontend/docs/plan GITHUB_WEBHOOK_SECRET=test-secret npm run build
grep -rli "pglite" .next/server | head -3
echo "(위에 파일 이름이 하나도 나오지 않아야 한다)"
```

Expected: 빌드가 성공하고 `/calendar`, `/api/auth/login`, `/api/auth/logout`, `/api/events`, `/api/events/[id]`, `/api/events/[id]/delete`, `/api/cron/reminders`가 라우트 목록에 있다. `grep`은 아무것도 출력하지 않는다. 만약 파일이 나오면 메모리 DB 분기가 번들에 남은 것이므로, `src/lib/db/index.ts`의 분기를 `process.env.NODE_ENV === "development"` 검사로 바꾸는 등 다른 방식으로 고치고 계획에 기록한다.

- [ ] **Step 9: 전체 검사를 돌리고 커밋한다**

```bash
npm test
npm run typecheck
npm run lint
git add src/lib/db .env.example README.md docs
git commit -m "docs: add local memory database preview and the calendar setup guide"
```

Expected: 전체 테스트 통과, 타입 오류와 린트 오류 없음.

---

### Task 11: 실제 Neon, Vercel, 폰에서 확인 (사용자 확인 필요)

앞의 작업들은 메모리 Postgres, 가짜 발송기, 로컬 서버로 검증했다. 이 작업은 **실제 서비스**로 확인한다. Neon과 Vercel에 프로젝트를 만들고 환경변수를 넣는 일이라 **시작하기 전에 사용자에게 확인을 받는다.** (계획 2의 Task 11과 함께 한 번에 진행한다: Neon, VAPID 키, 데스크톱·폰 구독, 배포.)

**Files:**
- Modify: `README.md` (운영 메모)

- [ ] **Step 1: Neon에서 마이그레이션을 적용한다**

계획 2의 Task 11 Step 1~3을 먼저 끝낸다(Neon 프로젝트, `DATABASE_URL`, VAPID 키, `npm run db:migrate`). `0002_events.sql`이 `0001_push.sql` 뒤에 적용되는지 본다.

Run: `npm run db:migrate` (두 번 실행)
Expected: 첫 실행은 `적용한 마이그레이션: 0002_events.sql`, 두 번째는 `적용할 새 마이그레이션이 없어요.`

- [ ] **Step 2: 실제 Neon에서 일정 화면과 API를 확인한다**

`.env.local`에 `DATABASE_URL`, `EDIT_CODE`, `SESSION_SECRET`, `CRON_SECRET`을 넣고(`LOCAL_MEMORY_DB`는 비운다) `npm run dev`로 Task 10 Step 6~7을 다시 해 본다. 특히 Neon이 5분 유휴 뒤 깨어날 때 첫 요청이 몇 초 걸리는지 기록한다.

Expected: 메모리 DB와 같은 결과. 일정이 서버를 다시 켜도 남아 있다. 배열·날짜·시각 값(`참석자`, `알림 시점`, `14:00`)이 그대로 읽힌다.

- [ ] **Step 3: Vercel에 배포하고 cron을 확인한다**

Vercel 프로젝트에 환경변수(`DATABASE_URL` 등 위의 값과 `EDIT_CODE`, `SESSION_SECRET`, `CRON_SECRET`, `PEOPLE`)를 넣고 배포한다. 프로젝트의 **Settings → Cron Jobs**에 `/api/cron/reminders`(`0 0 * * *`)가 보이는지 확인하고, 배포 주소로 수동 호출한다.

```bash
curl -s -w " -> %{http_code}\n" -H "Authorization: Bearer <CRON_SECRET>" https://<배포 주소>/api/cron/reminders
```

Expected: `200`과 `{"today":"...","claimed":N,...}`. 잘못된 값이나 헤더 없이는 `401`.

- [ ] **Step 4: 폰에서 일정 알림을 받아 본다**

폰(Android, iPhone은 홈 화면에 추가한 앱)에서 종 아이콘으로 알림을 켜고, **오늘 날짜의 일정**(알림 시점 `당일`)을 하나 만든 뒤 위 `curl`로 cron을 호출한다.

Expected: 폰에 `일정 알림 / 오늘 14:00: 제목`이 오고, 누르면 그 날짜의 달력이 열린다. 같은 `curl`을 다시 호출하면 알림이 오지 않는다(`"claimed":0`). 다음 날 아침(한국시간 9시~10시) 실제 cron이 알림을 보내는지 확인한다(내일 일정에 `1일 전` 알림을 걸어 둔다).

- [ ] **Step 5: 결과를 기록한다**

`README.md`의 "운영 메모"에 Neon 깨어나는 시간, 배포 주소, cron이 실제로 돈 시각, 폰 수신 결과를 적고 커밋한다.

```bash
git add README.md
git commit -m "docs: record real-service checks for the calendar and daily reminders"
```

---

## 스펙 커버리지

| 스펙 항목 | 작업 |
|---|---|
| 달력 스펙 1-1 월 달력에서 일정 보기·추가·수정·삭제, 시각 선택 | Task 1, 2, 3, 6, 9 |
| 달력 스펙 1-4 일정 전날·당일 알림, 중복 없음 | Task 7, 8 |
| 달력 스펙 1-5 편집 코드 없이는 일정 추가·수정·삭제 불가 | Task 4, 5, 6 |
| 달력 스펙 3 명단(`PEOPLE`) | Task 2, 10 |
| 달력 스펙 5 `events`(모임 연결 제외), 시각 ↔ 한국시간 | Task 3 |
| 달력 스펙 6.1 화면(‹ ›, 오늘, 칸에 제목 2개 + `+N`, 일정 폼, 코드 입력창) | Task 9 |
| 달력 스펙 7.3 권한(서명 쿠키, 잠금) | Task 4, 5 |
| 달력 스펙 7.4 일정 전날·당일 문구 | Task 7 |
| 달력 스펙 8 오류 처리(필드별 메시지, DB 장애 배너) | Task 2, 6, 9 |
| 기존 스펙 5.6 일정(날짜·알림 시점 수정 시 알림 기록 삭제) | Task 3 |
| 기존 스펙 5.7 스케줄러(`0 0 * * *`, `CRON_SECRET`, 차지 후 발송, 전부 실패 시 해제) | Task 7, 8 |
| 기존 스펙 5.8 편집 인증(HMAC 쿠키, 7일, 10분 5회 잠금, POST만) | Task 4, 5, 6 |
| 기존 스펙 6.5 환경변수 `EDIT_CODE`, `SESSION_SECRET`, `CRON_SECRET` | Task 4, 8, 10 |
| 기존 스펙 10-7 Vercel Cron 시간대·헤더 확인 | 위 "확인한 공식 문서", Task 10 |
| **계획 4로 미룸:** 모임(`meetups`, `availability`, `sent_notices`), 겹침 계산, 확정, 모임 알림, `/meetups`, `events.meetup_id`·참석자 자동 채움 | 계획 4 |

## 계획 4로 넘기는 것

계획 4는 이 계획이 만든 다음을 그대로 쓴다.

- `readJsonBody`, `json`(`src/lib/http.ts`), `requireEditSession`(`src/lib/auth/handlers.ts`), `createEventHandlers`의 `guarded` 패턴(편집 권한 → JSON → 명단 → DB → 검증 → 저장).
- `loadPeople`, `nameOf`, `validateEventInput`의 필드별 오류 구조, `createEvent`(확정 시 일정 생성).
- `PushDeps`, `nothingDelivered`, `sendToAll`, `loadPushDeps`, `claimDueReminders`/`releaseReminders`의 **"먼저 차지하고, 아무에게도 못 보냈으면 푼다"** 패턴 — `sent_notices(kind, ref_id)`에 같은 방식으로 적용한다. 알림 문구는 40자 제한 같은 길이 제한을 직접 둔다(`reminders/format.ts`를 견본으로).
- `Db`에는 아직 트랜잭션·배치가 없다. 모임 확정(`meetups.status` 변경 + 일정 생성)은 한 문장(CTE)으로 쓰거나 `Db`에 `batch`를 더해서 처리한다(Neon `sql.transaction`, PGlite `transaction`).
- `events.meetup_id`(→ `meetups`, `on delete set null`)는 계획 4의 `0003_*.sql`에서 `alter table events add column if not exists ...`로 더한다.
