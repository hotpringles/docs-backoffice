import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/lib/db/testing";
import type { Db } from "@/lib/db/types";
import { createMeetupHandlers, type MeetupDeps } from "./handlers";
import { cellKey } from "./slots";
import { createMeetup, listAvailability, listAvailabilityModes, saveAvailability, updateMeetup } from "./store";
import { validateAvailabilityInput } from "./validate";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const D1 = "2026-10-07";
const D2 = "2026-10-08";
const ENV = { PEOPLE: "p1:민수,p2:지은" };
const NOW = new Date("2026-10-07T03:00:00Z");
const shape = { dates: [D1, D2], dayStart: "09:00", dayEnd: "11:00", slotMinutes: 30 }; // 하루 4칸, 모두 8칸
const people = [
  { id: "p1", name: "민수" },
  { id: "p2", name: "지은" },
];

describe("validateAvailabilityInput mode", () => {
  it("mode를 안 보내면 available이고, available/unavailable만 받는다", () => {
    const base = { personId: "p1", cells: [cellKey(D1, 0)] };
    expect(validateAvailabilityInput(base, shape, people)).toMatchObject({ ok: true, value: { mode: "available" } });
    expect(validateAvailabilityInput({ ...base, mode: "unavailable" }, shape, people)).toMatchObject({ ok: true, value: { mode: "unavailable" } });
    const bad = validateAvailabilityInput({ ...base, mode: "maybe" }, shape, people);
    expect(bad.ok).toBe(false);
  });
});

describe("저장소와 처리기", () => {
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
  const deps = (): MeetupDeps => ({
    getDb: () => db,
    env: () => ENV,
    now: () => NOW,
    runAfter: () => undefined,
    loadPushDeps: () => ({ ok: true, deps: { db, sender: async () => undefined } }),
  });
  const post = (body: unknown) =>
    new Request("http://localhost/api/meetups", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const open = () => createMeetup(db, { title: "모임", dates: [D1, D2], dayStart: "09:00", dayEnd: "11:00" });

  it("불가능한 칸을 보내면 나머지 모든 칸이 '가능'으로 저장되고 방식은 unavailable로 기억된다", async () => {
    const id = await open();
    const response = await createMeetupHandlers(deps()).availability(post({ personId: "p1", mode: "unavailable", cells: [cellKey(D1, 0), cellKey(D2, 3)] }), String(id));
    expect(response.status).toBe(200);
    const saved = (await listAvailability(db, id)).p1;
    expect(saved).toHaveLength(6);
    expect(saved).not.toContain(cellKey(D1, 0));
    expect(saved).not.toContain(cellKey(D2, 3));
    expect(saved).toContain(cellKey(D1, 1));
    expect(await listAvailabilityModes(db, id)).toEqual({ p1: "unavailable" });
  });

  it("불가능한 칸을 하나도 안 보내면 모든 칸이 가능하다", async () => {
    const id = await open();
    await createMeetupHandlers(deps()).availability(post({ personId: "p1", mode: "unavailable", cells: [] }), String(id));
    expect((await listAvailability(db, id)).p1).toHaveLength(8);
  });

  it("방식을 안 보내면 기존처럼 가능한 칸 그대로 저장되고 방식은 available이다", async () => {
    const id = await open();
    await createMeetupHandlers(deps()).availability(post({ personId: "p1", cells: [cellKey(D1, 0)] }), String(id));
    expect((await listAvailability(db, id)).p1).toEqual([cellKey(D1, 0)]);
    expect(await listAvailabilityModes(db, id)).toEqual({ p1: "available" });
  });

  it("다시 저장하면 방식도 바뀌고, 사람마다 방식이 따로다", async () => {
    const id = await open();
    await saveAvailability(db, id, "p1", [{ day: D1, slot: 0 }], "unavailable");
    await saveAvailability(db, id, "p2", [{ day: D1, slot: 1 }], "available");
    await saveAvailability(db, id, "p1", [{ day: D1, slot: 0 }], "available");
    expect(await listAvailabilityModes(db, id)).toEqual({ p1: "available", p2: "available" });
  });

  it("후보 날짜를 바꿔 표시를 전부 지우면 방식도 지워진다", async () => {
    const id = await open();
    await saveAvailability(db, id, "p1", [{ day: D1, slot: 0 }], "unavailable");
    await updateMeetup(db, id, { title: "모임", dates: [D1, D2], dayStart: "10:00", dayEnd: "12:00" }, { clearAvailability: true });
    expect(await listAvailabilityModes(db, id)).toEqual({});
  });
});

describe("AvailabilityEditor", () => {
  it("불가능 방식인 사람은 가능하지 않은 칸이 빨간 칸(slot off)으로, 방식 선택 버튼도 보인다", async () => {
    const { AvailabilityEditor } = await import("@/components/AvailabilityEditor");
    const html = renderToStaticMarkup(
      createElement(AvailabilityEditor, {
        meetupId: 1,
        dates: [D1],
        dayStart: "09:00",
        slotCount: 4,
        slotMinutes: 30,
        people,
        availability: { p1: [cellKey(D1, 1), cellKey(D1, 2), cellKey(D1, 3)] },
        modes: { p1: "unavailable" },
        readOnly: false,
        initialPersonId: "p1",
      }),
    );
    expect(html.match(/class="slot off"/g)).toHaveLength(1);
    expect(html).toContain("가능한 시간 고르기");
    expect(html).toContain("불가능한 시간 고르기");
  });
});
