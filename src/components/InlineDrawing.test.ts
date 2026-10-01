import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Excalidraw 자체는 브라우저에서만 그려지므로 여기서는 자리만 확인한다.
vi.mock("./ExcalidrawView", () => ({ ExcalidrawView: () => null }));

const { InlineDrawing } = await import("./InlineDrawing");
const { StandaloneDrawing } = await import("./StandaloneDrawing");

const scene = { elements: [] };

describe("InlineDrawing", () => {
  it("처음에는 잠겨 있어서 그림 위 스와이프와 휠이 페이지 스크롤로 넘어간다", () => {
    const html = renderToStaticMarkup(
      createElement(InlineDrawing, { scene, path: "d/fig.excalidraw.md" }),
    );

    expect(html).toContain("drawing-locked");
    expect(html).toContain("그림 조작하기");
    expect(html).toContain('aria-pressed="false"');
  });

  it("크게 보기 링크로 그림 단독 화면에 갈 수 있다", () => {
    const html = renderToStaticMarkup(
      createElement(InlineDrawing, { scene, path: "d/Manager's fig.excalidraw.md" }),
    );
    expect(html).toContain('href="/docs/d/Manager&#x27;s%20fig.excalidraw.md"');
    expect(html).toContain("크게 보기");
  });
});

describe("전체화면", () => {
  it("문서 안의 그림에 전체화면 버튼이 있고, 처음에는 전체화면이 아니다", () => {
    const html = renderToStaticMarkup(createElement(InlineDrawing, { scene, path: "d/fig.excalidraw.md" }));
    expect(html).toContain("전체화면");
    expect(html).not.toContain("drawing-overlay");
  });

  it("그림 단독 화면에도 전체화면 버튼이 있고, 처음부터 조작할 수 있다(잠겨 있지 않다)", () => {
    const html = renderToStaticMarkup(createElement(StandaloneDrawing, { scene, title: "그림 제목" }));
    expect(html).toContain("전체화면");
    expect(html).not.toContain("drawing-locked");
    expect(html).not.toContain("drawing-overlay");
  });
});

describe("전체화면 스타일", () => {
  it("전체화면 덮개는 화면 전체(fixed, inset 0)를 덮고 머리글보다 위에 있다", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const rule = /\.drawing-overlay\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).toMatch(/inset:\s*0/);
    expect(rule).toMatch(/z-index:\s*\d{3,}/);
  });
});

describe("모바일 Excalidraw 메뉴 막대", () => {
  const css = readFileSync("src/app/globals.css", "utf8");

  it("햄버거 버튼을 감싼 흰 막대는 투명하고 터치를 통과시킨다(그림 내용을 가리지 않는다)", () => {
    const rule = /\.drawing \.excalidraw--mobile \.App-bottom-bar \.Island\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(rule).toMatch(/background:\s*transparent\s*!important/);
    expect(rule).toMatch(/box-shadow:\s*none\s*!important/);
    const passThrough = /\.Island,\s*\.drawing \.excalidraw--mobile \.App-bottom-bar \.Island \*\s*\{[^}]*pointer-events:\s*none\s*!important/.exec(css);
    expect(passThrough).not.toBeNull();
  });

  it("햄버거 버튼만은 다시 터치를 받는다", () => {
    const rule = /\.main-menu-trigger\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(rule).toMatch(/pointer-events:\s*auto\s*!important/);
  });
});

describe("잠금 스타일", () => {
  it("잠긴 그림은 자식까지 포인터 이벤트를 받지 않는다 (Excalidraw 캔버스의 touch-action: none이 스크롤을 막기 때문)", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const rule = /\.drawing-locked[^{]*\{[^}]*pointer-events:\s*none\s*!important/.exec(css);
    expect(rule).not.toBeNull();
  });
});
