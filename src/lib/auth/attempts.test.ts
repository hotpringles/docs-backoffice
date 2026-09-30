import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { MAX_FAILURES, clearFailures, recordAttempt } from "./attempts";

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

// 시도를 "먼저 세고, 그 번호로 평가할지 정한다". 확인과 세기가 한 문장이라 동시에 들어와도 번호가 겹치지 않는다.
describe("recordAttempt", () => {
  it("시도할 때마다 번호가 1씩 늘어난다", async () => {
    for (let n = 1; n <= MAX_FAILURES + 2; n += 1) {
      expect((await recordAttempt(db, "ip-a", T0)).count, `${n}번째`).toBe(n);
    }
  });

  it("남은 시간은 첫 시도로부터 10분 창의 끝까지다(분 단위로 올림, 최소 1분)", async () => {
    expect(await recordAttempt(db, "ip-a", T0)).toEqual({ count: 1, retryAfterMinutes: 10 });
    expect(await recordAttempt(db, "ip-a", at(3))).toEqual({ count: 2, retryAfterMinutes: 7 });
    expect(await recordAttempt(db, "ip-a", new Date(T0.getTime() + 9.5 * 60_000))).toEqual({ count: 3, retryAfterMinutes: 1 });
  });

  it("10분이 지나면 새로 센다", async () => {
    for (let n = 0; n < MAX_FAILURES + 1; n += 1) await recordAttempt(db, "ip-a", T0);
    expect(await recordAttempt(db, "ip-a", at(10))).toEqual({ count: 1, retryAfterMinutes: 10 });
    expect((await recordAttempt(db, "ip-a", at(11))).count).toBe(2);
  });

  it("성공하면 기록을 지운다", async () => {
    for (let n = 0; n < MAX_FAILURES; n += 1) await recordAttempt(db, "ip-a", T0);
    await clearFailures(db, "ip-a");
    expect((await recordAttempt(db, "ip-a", T0)).count).toBe(1);
  });

  it("IP마다 따로 센다", async () => {
    for (let n = 0; n < MAX_FAILURES; n += 1) await recordAttempt(db, "ip-a", T0);
    expect((await recordAttempt(db, "ip-b", T0)).count).toBe(1);
  });

  it("동시에 60번을 시도해도 번호가 겹치거나 빠지지 않는다(그래서 평가되는 시도는 5번뿐이다)", async () => {
    const results = await Promise.all(Array.from({ length: 60 }, () => recordAttempt(db, "ip-a", T0)));
    const counts = results.map((r) => r.count).sort((a, b) => a - b);
    expect(counts).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    expect(counts.filter((count) => count <= MAX_FAILURES)).toHaveLength(MAX_FAILURES);
  });
});
