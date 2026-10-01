import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");

describe("모바일에서 화면 확대 막기", () => {
  it("viewport에 확대 제한(maximum-scale=1, user-scalable=no)을 둔다 — Android 등. iOS 10 이상은 이 값을 무시한다", () => {
    expect(layout).toMatch(/maximumScale:\s*1\b/);
    expect(layout).toMatch(/userScalable:\s*false/);
  });

  it("html과 body가 두 손가락 확대와 두 번 탭 확대를 막는다(touch-action: pan-x pan-y) — iOS 13 이상은 이 방법을 따른다", () => {
    const rule = /html,\s*body\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(rule).toMatch(/touch-action:\s*pan-x pan-y/);
  });

  it("터치 화면에서는 선택 상자 글자를 16px 이상으로 둔다(iOS는 16px보다 작은 입력칸을 누르면 화면을 확대한다)", () => {
    const block = /@media \(pointer: coarse\)\s*\{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
    expect(block).toMatch(/\.theme-select\s*\{[^}]*font-size:\s*16px/);
  });

  it("입력칸(글자, 날짜, 시각, 메모)은 본문과 같은 글꼴 크기를 물려받아 16px 이상이다", () => {
    const rule = /\.event-form input\[type="text"\],[^{]*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(rule).toMatch(/font:\s*inherit/);
    expect(css).toMatch(/body\s*\{[^}]*font-size:\s*16px/);
  });
});
