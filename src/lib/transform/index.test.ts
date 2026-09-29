import { describe, expect, it } from "vitest";
import { buildLinkIndex } from "./link-index";
import { parseDocument } from "./index";
import { toHtml } from "./markdown";

const repo = { owner: "org", name: "repo", branch: "develop" };
const entries = ["d/a.md", "d/b.md", "d/fig.excalidraw.md"].map((path) => ({ path, sha: path }));
const base = (currentPath: string) => ({ currentPath, index: buildLinkIndex(entries, ["d"]), repo });

describe("parseDocument", () => {
  it("frontmatter 제목이 있으면 그것을 쓴다", async () => {
    const doc = await parseDocument("---\ntitle: 앞머리 제목\ntags: [x]\n---\n# 본문 제목\n## 소제목", base("d/a.md"));
    expect(doc.title).toBe("앞머리 제목");
    expect(doc.frontmatter.tags).toEqual(["x"]);
    expect(doc.hasH1).toBe(true);
    expect(doc.toc.map((h) => h.text)).toEqual(["소제목"]);
  });

  it("frontmatter 제목이 없으면 첫 h1, 그것도 없으면 파일 이름을 쓴다", async () => {
    expect((await parseDocument("# 첫 제목\n내용", base("d/a.md"))).title).toBe("첫 제목");
    const noHeading = await parseDocument("내용만", base("d/a.md"));
    expect(noHeading.title).toBe("a");
    expect(noHeading.hasH1).toBe(false);
  });

  it("frontmatter가 깨져 있어도 문서는 그려지고 오류가 남는다", async () => {
    const doc = await parseDocument("---\ntitle: [깨짐\n---\n# 살아있음", base("d/a.md"));
    expect(doc.frontmatterError).toBeTruthy();
    expect(doc.title).toBe("살아있음");
  });

  it("그림 임베드와 없는 링크를 모아 돌려준다", async () => {
    const doc = await parseDocument("![[fig.excalidraw]]\n\n[[b]] [[없음]]", base("d/a.md"));
    expect(doc.embeds).toEqual(["d/fig.excalidraw.md"]);
    expect(doc.missing).toEqual(["없음"]);
    expect(toHtml(doc.tree)).toContain('href="/docs/d/b.md"');
  });

  it("BOM과 빈 문서를 견딘다", async () => {
    expect((await parseDocument("﻿# BOM", base("d/a.md"))).title).toBe("BOM");
    const empty = await parseDocument("", base("d/a.md"));
    expect(empty.title).toBe("a");
    expect(toHtml(empty.tree)).toBe("");
  });
});
