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
