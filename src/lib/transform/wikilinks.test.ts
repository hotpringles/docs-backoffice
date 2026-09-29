import { describe, expect, it } from "vitest";
import { ctx, html } from "./fixtures";
import { renderMarkdown, toHtml } from "./markdown";

describe("위키링크", () => {
  it("이름으로 문서를 찾아 링크한다(대소문자와 .md는 무시)", async () => {
    const out = await html("[[Note A]] [[note a]] [[Note A.md]]");
    expect(out.match(/href="\/docs\/d\/Note%20A\.md"/g)).toHaveLength(3);
  });

  it("별칭과 제목 앵커를 처리한다", async () => {
    const out = await html("[[Note A|보여줄 이름]] [[Note A#Some Heading]]");
    expect(out).toContain('<a href="/docs/d/Note%20A.md">보여줄 이름</a>');
    expect(out).toContain('<a href="/docs/d/Note%20A.md#some-heading">Note A › Some Heading</a>');
  });

  it("[[#제목]]은 현재 문서 안의 앵커다", async () => {
    expect(await html("[[#Some Heading]]")).toContain('<a href="#some-heading">');
  });

  it("경로 일부를 적으면 그 경로의 문서를 찾는다", async () => {
    expect(await html("[[sub/Note B]]")).toContain('href="/docs/d/sub/Note%20B.md"');
  });

  it("같은 이름이 여럿이면 현재 문서와 같은 폴더를 먼저, 없으면 경로순 첫 번째를 고른다", async () => {
    expect(await html("[[Note B]]", "d/sub/x.md")).toContain('href="/docs/d/sub/Note%20B.md"');
    expect(await html("[[Note B]]", "d/other/x.md")).toContain('href="/docs/d/other/Note%20B.md"');
    expect(await html("[[Note B]]", "d/index.md")).toContain('href="/docs/d/other/Note%20B.md"');
  });

  it("대상을 못 찾으면 없는 문서 표시로 남기고 기록한다(문서 폴더 밖 문서도 없는 문서다)", async () => {
    const { tree, missing } = await renderMarkdown("[[없는 문서]] 그리고 [[outside/secret]]", ctx());
    const out = toHtml(tree);
    expect(out).toContain('<span class="wikilink-missing" title="없는 문서">없는 문서</span>');
    expect(missing).toEqual(["없는 문서", "outside/secret"]);
  });

  it("코드 안의 위키링크는 건드리지 않는다", async () => {
    const out = await html("`[[Note A]]`\n\n```\n[[Note A]]\n```");
    expect(out).not.toContain("<a");
  });

  it("이미 링크 안에 있는 위키링크는 중첩하지 않는다", async () => {
    const out = await html("[보기 [[Note A]]](https://example.com)");
    expect(out.match(/<a /g)).toHaveLength(1);
  });

  it("이미지 임베드는 원본 파일 주소의 이미지가 된다", async () => {
    const out = await html("![[pic.png]] ![[pic.png|설명]] ![[pic.png|300]]");
    expect(
      out.match(/src="https:\/\/raw\.githubusercontent\.com\/org\/repo\/develop\/d\/img\/pic\.png"/g),
    ).toHaveLength(3);
    expect(out).toContain('alt="설명"');
    expect(out).toContain('alt="pic.png"');
  });

  it("이미지가 아닌 첨부는 GitHub 링크가 된다", async () => {
    expect(await html("[[guide.pdf]]")).toContain('href="https://github.com/org/repo/blob/develop/d/guide.pdf"');
  });

  it("한 줄짜리 그림 임베드는 p 밖의 그림 블록이 된다", async () => {
    const { tree, embeds } = await renderMarkdown("앞\n\n![[diagram.excalidraw]]\n\n뒤", ctx());
    expect(toHtml(tree)).toBe('<p>앞</p>\n<div data-excalidraw="d/diagram.excalidraw.md"></div>\n<p>뒤</p>');
    expect(embeds).toEqual(["d/diagram.excalidraw.md"]);
  });

  it("문장 속 그림 임베드는 링크로 대신한다", async () => {
    const { tree, embeds } = await renderMarkdown("보세요 ![[diagram.excalidraw]] 입니다", ctx());
    expect(toHtml(tree)).toContain('<a href="/docs/d/diagram.excalidraw.md">diagram.excalidraw</a>');
    expect(embeds).toEqual([]);
  });

  it("없는 그림 임베드는 없는 문서 표시가 된다", async () => {
    const { tree, missing } = await renderMarkdown("![[nope.excalidraw]]", ctx());
    expect(toHtml(tree)).toContain("wikilink-missing");
    expect(missing).toEqual(["nope.excalidraw"]);
  });

  it("이상한 입력에도 죽지 않는다", async () => {
    const weird = [
      "[[]]", "[[ ]]", "[[|]]", "[[a|]]", "[[#]]", "[[a", "a]]", "[[[Note A]]]",
      "![[]]", "[[\\]]", "[[Note A#^block]]", "[[ ../../etc/passwd ]]", "[[/Note A]]",
    ].join("\n\n");
    const out = await html(weird);
    expect(typeof out).toBe("string");
  });
});
