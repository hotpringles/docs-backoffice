import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthorLabel } from "./AuthorLabel";

const render = (author: { login: string | null; name: string }) => renderToStaticMarkup(createElement(AuthorLabel, { author }));

describe("AuthorLabel", () => {
  it("GitHub 계정 이름을 '작성자 @계정'으로 보여 주고, 커밋에 적힌 이름은 마우스를 올리면 보인다", () => {
    const html = render({ login: "letsgojh", name: "유재환" });
    expect(html).toContain("작성자");
    expect(html).toContain("@letsgojh");
    expect(html).toContain('title="처음 올린 사람: 유재환 (@letsgojh)"');
  });

  it("계정이 없으면 커밋에 적힌 이름을 보여 준다", () => {
    const html = render({ login: null, name: "탈퇴한 사람" });
    expect(html).toContain("탈퇴한 사람");
    expect(html).not.toContain("@");
    expect(html).toContain('title="처음 올린 사람: 탈퇴한 사람"');
  });

  it("이름에 든 꺾쇠나 따옴표는 이스케이프한다", () => {
    const html = render({ login: null, name: '<img src=x onerror="a">' });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
