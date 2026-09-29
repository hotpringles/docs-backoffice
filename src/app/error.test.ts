import { describe, expect, it, vi } from "vitest";
import ErrorPage from "./error";

type ElementLike = { type?: unknown; props?: { children?: unknown; onClick?: () => void } };

/** 함수 컴포넌트가 돌려준 요소 트리에서 지정한 태그의 첫 요소를 찾는다. (DOM 없이 확인하려는 용도) */
function findByType(node: unknown, type: string): ElementLike | undefined {
  if (!node || typeof node !== "object") return undefined;
  const element = node as ElementLike;
  if (element.type === type) return element;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findByType(child, type);
    if (found) return found;
  }
  return undefined;
}

describe("오류 화면", () => {
  it("다시 시도 버튼은 다시 불러오는 retry를 호출한다 (reset은 서버 컴포넌트 오류에서 복구하지 못한다)", () => {
    const retry = vi.fn();
    const element = ErrorPage({ error: new Error("GitHub 502"), retry });

    const button = findByType(element, "button");
    expect(button).toBeDefined();
    button?.props?.onClick?.();

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
