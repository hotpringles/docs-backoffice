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
