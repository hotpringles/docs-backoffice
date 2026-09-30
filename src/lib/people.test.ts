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
