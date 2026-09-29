import { describe, expect, it } from "vitest";
import { ctx, html } from "./fixtures";
import { renderMarkdown, toHtml } from "./markdown";

describe("기본 Markdown", () => {
  it("GFM 표, 작업 목록, 취소선, 코드 블록 언어를 유지한다", async () => {
    const out = await html(
      ["| a | b |", "|---|---|", "| 1 | 2 |", "", "- [x] 끝", "- [ ] 남음", "", "~~x~~", "", "```ts", "const a = 1;", "```"].join("\n"),
    );
    expect(out).toContain("<table>");
    expect(out).toContain('type="checkbox"');
    expect(out).toContain("<del>x</del>");
    expect(out).toContain('class="language-ts"');
  });

  it("제목에 id를 붙이고 목록을 만든다(중복은 번호가 붙는다)", async () => {
    const { headings, tree } = await renderMarkdown("# 제목\n## 소제목\n## 소제목\n##### 무시", ctx());
    expect(headings).toEqual([
      { depth: 1, text: "제목", id: "제목" },
      { depth: 2, text: "소제목", id: "소제목" },
      { depth: 2, text: "소제목", id: "소제목-1" },
    ]);
    expect(toHtml(tree)).toContain('<h2 id="소제목-1">');
  });

  it("각주 링크가 서로 맞는다", async () => {
    const out = await html("글[^1]\n\n[^1]: 각주");
    const hrefs = [...out.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    for (const target of hrefs) expect(out).toContain(`id="${target}"`);
    expect(hrefs.length).toBeGreaterThan(0);
  });

  it("빈 문서도 문제없다", async () => {
    expect(await html("")).toBe("");
  });

  it("큰 문서(약 1MB)도 오류 없이 변환한다", async () => {
    const big = Array.from({ length: 20_000 }, (_, i) => `## 제목 ${i}\n\n문단 ${i} [[Note A]] \`code\`\n`).join("\n");
    const { headings } = await renderMarkdown(big, ctx());
    expect(headings).toHaveLength(20_000);
  });
});

describe("보안", () => {
  it("스크립트, 이벤트 핸들러, javascript: 주소를 모두 없앤다", async () => {
    const out = await html(
      [
        "<script>alert(1)</script>",
        "",
        '<img src=x onerror="alert(2)">',
        "",
        "[클릭](javascript:alert(3))",
        "",
        "![img](javascript:alert(4))",
        "",
        '<a href="javascript:alert(5)" onclick="alert(6)">raw</a>',
        "",
        '<iframe src="https://evil.example"></iframe>',
        "",
        '<div style="position:fixed">x</div>',
      ].join("\n"),
    );
    expect(out).not.toMatch(/<script|<iframe|onerror|onclick|javascript:|style=/i);
    expect(out).not.toContain("alert(1)");
  });

  it("data: 주소의 이미지는 허용하지 않는다", async () => {
    const out = await html("![x](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)");
    expect(out).not.toContain("data:");
  });

  it("위키링크 라벨에 든 HTML도 글자로만 나온다", async () => {
    const out = await html("[[<script>alert(1)</script>]]");
    expect(out).not.toContain("<script");
  });

  it("사용자가 만든 data-excalidraw 속성은 위키링크 밖에서는 남지 않는다", async () => {
    const out = await html('<div data-excalidraw="d/diagram.excalidraw.md"></div>');
    expect(out).not.toContain("data-excalidraw");
  });
});
