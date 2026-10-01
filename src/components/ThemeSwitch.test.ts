import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemeSwitch } from "./ThemeSwitch";

describe("ThemeSwitch", () => {
  const html = renderToStaticMarkup(createElement(ThemeSwitch));

  it("시스템, 라이트, 다크, Gruvbox 네 가지를 고를 수 있다", () => {
    const labels = [...html.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((match) => match[1]);
    expect(labels).toEqual(["시스템", "라이트", "다크", "Gruvbox"]);
    expect(html).toContain('value="gruvbox"');
  });

  it("서버가 그릴 때는 '시스템'이 골라져 있고, 스크린 리더용 이름이 있다", () => {
    expect(html).toMatch(/<option value="system" selected="">/);
    expect(html).toContain('aria-label="화면 테마"');
  });
});
