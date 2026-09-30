import { describe, expect, it } from "vitest";
import { areaOfPath, docAreas, pickArea } from "./areas";

describe("docAreas", () => {
  it("문서 폴더를 첫 폴더 이름(frontend, backend, ai)으로 묶고 화면에 보일 이름을 붙인다", () => {
    expect(docAreas(["frontend", "backend", "ai"])).toEqual([
      { key: "frontend", label: "Frontend", roots: ["frontend"] },
      { key: "backend", label: "Backend", roots: ["backend"] },
      { key: "ai", label: "AI", roots: ["ai"] },
    ]);
  });

  it("같은 종류의 폴더 여러 개는 한 묶음이고, 순서는 처음 나온 순서를 따른다", () => {
    expect(docAreas(["ai/docs", "frontend/docs", "ai/decision_log", "frontend/docs/plan"])).toEqual([
      { key: "ai", label: "AI", roots: ["ai/docs", "ai/decision_log"] },
      { key: "frontend", label: "Frontend", roots: ["frontend/docs", "frontend/docs/plan"] },
    ]);
  });

  it("저장소 맨 위의 docs 폴더는 '공통 문서'로 보여 주고, 종류 뒤에 두면 마지막 탭이 된다", () => {
    expect(docAreas(["frontend/docs", "backend/docs", "ai/docs", "docs"])).toEqual([
      { key: "frontend", label: "Frontend", roots: ["frontend/docs"] },
      { key: "backend", label: "Backend", roots: ["backend/docs"] },
      { key: "ai", label: "AI", roots: ["ai/docs"] },
      { key: "docs", label: "공통 문서", roots: ["docs"] },
    ]);
  });

  it("모르는 첫 폴더는 그 이름을 그대로 보여 준다", () => {
    expect(docAreas(["design/specs", "wiki"])).toEqual([
      { key: "design", label: "design", roots: ["design/specs"] },
      { key: "wiki", label: "wiki", roots: ["wiki"] },
    ]);
  });

  it("문서 폴더가 없으면(저장소 전체를 보여 주는 설정) 묶음도 없다", () => {
    expect(docAreas([])).toEqual([]);
  });
});

describe("pickArea", () => {
  const areas = docAreas(["frontend", "backend", "ai"]);

  it("주소의 ?area= 값이 있는 종류면 그것을, 없거나 이상하면 첫 번째 종류를 고른다", () => {
    expect(pickArea(areas, "ai")?.key).toBe("ai");
    expect(pickArea(areas, "backend")?.key).toBe("backend");
    for (const raw of [undefined, "", "nope", "AI", ["ai"], "ai/docs", "__proto__", "constructor"]) {
      expect(pickArea(areas, raw as string | undefined)?.key, String(raw)).toBe("frontend");
    }
  });

  it("묶음이 없으면 null이다", () => {
    expect(pickArea([], "ai")).toBeNull();
  });
});

describe("areaOfPath", () => {
  const areas = docAreas(["frontend/docs", "backend", "ai/docs", "ai/decision_log"]);

  it("문서 경로가 속한 종류를 돌려준다", () => {
    expect(areaOfPath(areas, "frontend/docs/plan/m0.md")?.key).toBe("frontend");
    expect(areaOfPath(areas, "backend/README.md")?.key).toBe("backend");
    expect(areaOfPath(areas, "ai/decision_log/2026-09-01.md")?.key).toBe("ai");
  });

  it("공통 문서(docs/) 아래의 문서는 공통 문서 종류에 속한다. frontend/docs와는 섞이지 않는다", () => {
    const withCommon = docAreas(["frontend/docs", "docs"]);
    expect(areaOfPath(withCommon, "docs/README.md")?.key).toBe("docs");
    expect(areaOfPath(withCommon, "frontend/docs/plan/m0.md")?.key).toBe("frontend");
    expect(areaOfPath(withCommon, "docs-old/a.md")).toBeUndefined();
  });

  it("어느 문서 폴더에도 없으면 undefined다(폴더 경계까지 맞아야 한다)", () => {
    expect(areaOfPath(areas, "frontend/other/a.md")).toBeUndefined();
    expect(areaOfPath(areas, "backend-old/a.md")).toBeUndefined();
    expect(areaOfPath(areas, "README.md")).toBeUndefined();
  });
});
