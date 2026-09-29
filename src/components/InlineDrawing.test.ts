import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Excalidraw 자체는 브라우저에서만 그려지므로 여기서는 자리만 확인한다.
vi.mock("./ExcalidrawView", () => ({ ExcalidrawView: () => null }));

const { InlineDrawing } = await import("./InlineDrawing");

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

describe("잠금 스타일", () => {
  it("잠긴 그림은 자식까지 포인터 이벤트를 받지 않는다 (Excalidraw 캔버스의 touch-action: none이 스크롤을 막기 때문)", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const rule = /\.drawing-locked[^{]*\{[^}]*pointer-events:\s*none\s*!important/.exec(css);
    expect(rule).not.toBeNull();
  });
});
