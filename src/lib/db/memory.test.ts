import { describe, expect, it } from "vitest";
import { createEvent, getEvent } from "@/lib/events/store";
import { createMemoryDb } from "./memory";

const input = {
  title: "미리보기 일정",
  date: "2026-10-07",
  endDate: null,
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
