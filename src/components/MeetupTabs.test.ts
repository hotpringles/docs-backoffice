import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MeetupTabs } from "./MeetupTabs";

const mine = createElement("p", null, "내 시간 패널");
const all = createElement("p", null, "전체 결과 패널");

function render(initial: "mine" | "all"): string {
  return renderToStaticMarkup(createElement(MeetupTabs, { initial, mine, all }));
}

describe("MeetupTabs", () => {
  it("두 화면을 모두 그려 둬서, 결과를 보러 갔다 와도 칠하던 표가 사라지지 않는다", () => {
    const html = render("mine");

    expect(html).toContain("내 시간 패널");
    expect(html).toContain("전체 결과 패널");
  });

  it("처음 고른 탭만 보이고 다른 쪽은 hidden이다", () => {
    expect(render("mine")).toMatch(/<div hidden="">\s*<p>전체 결과 패널/);
    expect(render("mine")).not.toMatch(/<div hidden="">\s*<p>내 시간 패널/);
    expect(render("all")).toMatch(/<div hidden="">\s*<p>내 시간 패널/);
    expect(render("all")).not.toMatch(/<div hidden="">\s*<p>전체 결과 패널/);
  });

  it("탭 버튼이 지금 탭을 알려 준다", () => {
    const html = render("all");

    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>내 시간<\/button>/);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>전체 결과<\/button>/);
  });
});
