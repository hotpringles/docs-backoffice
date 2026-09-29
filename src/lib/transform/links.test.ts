import { describe, expect, it } from "vitest";
import { html } from "./fixtures";

describe("상대 링크와 이미지", () => {
  it("표시 대상 문서로 가는 상대 링크는 사이트 안 주소가 되고 앵커를 유지한다", async () => {
    const out = await html("[a](Note%20A.md#섹션) [b](./sub/Note%20B.md)");
    // 한글 앵커는 주소에서 퍼센트 인코딩되어 나오고, 브라우저가 디코딩해서 id와 맞춘다.
    expect(out).toContain('href="/docs/d/Note%20A.md#%EC%84%B9%EC%85%98"');
    expect(out).toContain('href="/docs/d/sub/Note%20B.md"');
  });

  it("문서 폴더 밖 문서와 다른 파일은 GitHub 주소로 연결한다", async () => {
    const out = await html("[s](../outside/secret.md) [f](../src/App.tsx) [d](sub)");
    expect(out).toContain('href="https://github.com/org/repo/blob/develop/outside/secret.md"');
    expect(out).toContain('href="https://github.com/org/repo/blob/develop/src/App.tsx"');
    expect(out).toContain('href="https://github.com/org/repo/tree/develop/d/sub"');
  });

  it("상대 이미지는 원본 파일 주소가 된다", async () => {
    const out = await html("![그림](img/pic.png)");
    expect(out).toContain('src="https://raw.githubusercontent.com/org/repo/develop/d/img/pic.png"');
  });

  it("외부 주소, 앵커, mailto는 그대로다", async () => {
    const out = await html("[a](https://example.com) [b](#top) [c](mailto:x@y.z)");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('href="#top"');
    expect(out).toContain('href="mailto:x@y.z"');
  });

  it("참조 방식 링크의 정의도 고쳐 쓴다", async () => {
    const out = await html("[a][ref]\n\n[ref]: ./Note%20A.md");
    expect(out).toContain('href="/docs/d/Note%20A.md"');
  });

  it("저장소 밖을 가리키는 상대 링크(../..)는 링크가 아니라 없는 문서 표시가 된다", async () => {
    const out = await html("[x](../../../../etc/passwd)");
    expect(out).not.toContain("href=");
    expect(out).toContain('<span class="wikilink-missing" title="없는 문서">x</span>');
  });

  it("잘못된 % 인코딩이 있어도 죽지 않는다", async () => {
    await expect(html("[x](%E0%A4%A.md)")).resolves.toContain("wikilink-missing");
  });

  it("저장소에서 찾지 못한 상대 링크는 우리 사이트의 없는 경로로 이어지지 않게 링크를 걷어낸다", async () => {
    const out = await html("[폰트](/src/shared/fonts/a.woff2) [문서](./nope.md)");
    expect(out).not.toContain("href=");
    expect(out.match(/wikilink-missing/g)).toHaveLength(2);
  });

  it("찾지 못한 상대 이미지는 대체 글자만 남기고, 안쪽에 든 이미지도 처리한다", async () => {
    expect(await html("![로고](./nope.png)")).toContain(">로고</span>");
    const out = await html("[![뱃지](img/pic.png)](./nope.md)");
    expect(out).toContain('src="https://raw.githubusercontent.com/org/repo/develop/d/img/pic.png"');
    expect(out).not.toContain('href="./nope.md"');
  });
});
