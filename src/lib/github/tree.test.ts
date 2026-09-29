import { describe, expect, it } from "vitest";
import {
  buildTreeGroups,
  docUrl,
  filterDocTree,
  findDocEntry,
  isDrawingPath,
  isUnderPaths,
  pathFromSegments,
  type TreeEntry,
} from "./tree";

const e = (path: string): TreeEntry => ({ path, sha: `sha-${path}` });

describe("isUnderPaths", () => {
  it("폴더 경계까지 맞아야 한다", () => {
    expect(isUnderPaths("frontend/docs/plan/a.md", ["frontend/docs/plan"])).toBe(true);
    expect(isUnderPaths("frontend/docs/plan-old/a.md", ["frontend/docs/plan"])).toBe(false);
    expect(isUnderPaths("frontend/docs/plan.md", ["frontend/docs/plan"])).toBe(false);
  });

  it("문서 폴더 목록이 비어 있으면 모두 통과한다", () => {
    expect(isUnderPaths("any/where.md", [])).toBe(true);
  });
});

describe("filterDocTree", () => {
  it(".md만 남기고 경로순으로 정렬한다", () => {
    const entries = [
      e("frontend/docs/plan/b.md"),
      e("frontend/docs/plan/a.md"),
      e("frontend/docs/plan/image.png"),
      e("frontend/src/App.tsx"),
      e("README.md"),
    ];
    expect(filterDocTree(entries, ["frontend/docs/plan"]).map((x) => x.path)).toEqual([
      "frontend/docs/plan/a.md",
      "frontend/docs/plan/b.md",
    ]);
  });

  it("대문자 확장자 .MD도 문서로 본다", () => {
    expect(filterDocTree([e("d/A.MD")], ["d"]).map((x) => x.path)).toEqual(["d/A.MD"]);
  });
});

describe("findDocEntry", () => {
  const entries = [e("d/a.md"), e("d/x.png"), e("other/b.md"), e("d/Case.md")];

  it("트리에 있고 문서 폴더 안의 .md만 찾는다", () => {
    expect(findDocEntry(entries, ["d"], "d/a.md")?.sha).toBe("sha-d/a.md");
    expect(findDocEntry(entries, ["d"], "d/Case.md")).toBeDefined();
  });

  it("폴더 밖, .md가 아닌 파일, 트리에 없는 경로, 대소문자가 다른 경로는 못 찾는다", () => {
    expect(findDocEntry(entries, ["d"], "other/b.md")).toBeUndefined();
    expect(findDocEntry(entries, ["d"], "d/x.png")).toBeUndefined();
    expect(findDocEntry(entries, ["d"], "d/nope.md")).toBeUndefined();
    expect(findDocEntry(entries, ["d"], "d/case.md")).toBeUndefined();
    expect(findDocEntry(entries, ["d"], "d/../other/b.md")).toBeUndefined();
  });
});

describe("isDrawingPath", () => {
  it(".excalidraw.md를 그림으로 구분한다", () => {
    expect(isDrawingPath("a/b.excalidraw.md")).toBe(true);
    expect(isDrawingPath("a/b.md")).toBe(false);
  });
});

describe("docUrl", () => {
  it("공백, 작은따옴표, 한글이 든 경로를 조각별로 인코딩한다", () => {
    expect(docUrl("plan/Manager's Manager 프론트엔드 흐름.excalidraw.md")).toBe(
      "/docs/plan/Manager's%20Manager%20%ED%94%84%EB%A1%A0%ED%8A%B8%EC%97%94%EB%93%9C%20%ED%9D%90%EB%A6%84.excalidraw.md",
    );
  });
});

describe("pathFromSegments", () => {
  it("정상 조각은 경로로 합친다", () => {
    expect(pathFromSegments(["a", "b.md"])).toBe("a/b.md");
  });

  it("비었거나 위험한 조각은 null이다", () => {
    expect(pathFromSegments([])).toBeNull();
    expect(pathFromSegments(["a", ".."])).toBeNull();
    expect(pathFromSegments(["."])).toBeNull();
    expect(pathFromSegments(["a", ""])).toBeNull();
    expect(pathFromSegments(["a\\b"])).toBeNull();
    expect(pathFromSegments(["a/b"])).toBeNull();
    expect(pathFromSegments(["a\0b"])).toBeNull();
  });
});

describe("buildTreeGroups", () => {
  it("문서 폴더 아래를 상대 경로의 중첩 트리로 만들고 폴더를 먼저 놓는다", () => {
    const groups = buildTreeGroups(
      [
        e("d/z.md"),
        e("d/sub/a.md"),
        e("d/sub/deep/c.md"),
        e("d/diagram.excalidraw.md"),
        e("other/x.md"),
      ],
      ["d"],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].root).toBe("d");
    expect(groups[0].label).toBe("d");
    expect(groups[0].nodes.map((n) => `${n.type}:${n.name}`)).toEqual([
      "folder:sub",
      "file:diagram.excalidraw.md",
      "file:z.md",
    ]);
    const sub = groups[0].nodes[0];
    if (sub.type !== "folder") throw new Error("folder 아님");
    expect(sub.path).toBe("d/sub");
    expect(sub.children.map((n) => `${n.type}:${n.name}`)).toEqual([
      "folder:deep",
      "file:a.md",
    ]);
  });

  it("그림 파일은 kind가 drawing이다", () => {
    const groups = buildTreeGroups([e("d/x.excalidraw.md"), e("d/y.md")], ["d"]);
    const kinds = groups[0].nodes.map((n) => (n.type === "file" ? n.kind : "folder"));
    expect(kinds).toEqual(["drawing", "doc"]);
  });

  it("겹치는 문서 폴더에서는 가장 길게 일치하는 그룹에만 들어간다", () => {
    const groups = buildTreeGroups([e("a/1.md"), e("a/b/2.md")], ["a", "a/b"]);
    const byRoot = Object.fromEntries(
      groups.map((g) => [g.root, g.nodes.map((n) => n.path)]),
    );
    expect(byRoot).toEqual({ a: ["a/1.md"], "a/b": ["a/b/2.md"] });
  });

  it("문서가 없는 그룹은 뺀다", () => {
    expect(buildTreeGroups([e("x/1.md")], ["d"])).toEqual([]);
  });

  it("문서 폴더 목록이 비어 있으면 저장소 전체를 하나의 그룹으로 만든다", () => {
    const groups = buildTreeGroups([e("README.md"), e("docs/a.md")], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("/");
    expect(groups[0].nodes.map((n) => n.name)).toEqual(["docs", "README.md"]);
  });
});
