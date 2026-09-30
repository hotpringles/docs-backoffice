import { describe, expect, it } from "vitest";
import { POPOVER_WIDTH, placePopover, type Rect } from "./popover";

const viewport = { width: 1200, height: 800 };
const cell = (left: number, top: number, width = 160, height = 120): Rect => ({ left, top, right: left + width, bottom: top + height });

function inside(placement: { left: number; top: number; maxHeight: number }, width = POPOVER_WIDTH): boolean {
  return (
    placement.left >= 8 &&
    placement.left + width <= viewport.width - 8 &&
    placement.top >= 8 &&
    placement.top + placement.maxHeight <= viewport.height - 8 + 0.001
  );
}

describe("placePopover", () => {
  it("오른쪽에 자리가 있으면 클릭한 날짜 칸의 오른쪽 옆에, 칸과 같은 높이에서 시작한다", () => {
    const placement = placePopover(cell(100, 200), viewport);
    expect(placement).toEqual({ left: 100 + 160 + 8, top: 200, maxHeight: 800 - 200 - 8 });
  });

  it("오른쪽에 자리가 없으면 왼쪽 옆에 둔다", () => {
    const anchor = cell(1000, 200); // 오른쪽 끝(1160)에서 창이 들어갈 자리가 없다
    const placement = placePopover(anchor, viewport);
    expect(placement?.left).toBe(1000 - 8 - POPOVER_WIDTH);
    expect(placement && inside(placement)).toBe(true);
  });

  it("아래쪽 칸이면 창이 화면 밖으로 나가지 않게 위로 올려 둔다(칸보다 위에서 시작해도 된다)", () => {
    const placement = placePopover(cell(100, 700, 160, 90), viewport);
    expect(placement).not.toBeNull();
    expect(placement!.top).toBeLessThanOrEqual(700);
    expect(placement!.top).toBeGreaterThanOrEqual(8);
    expect(placement && inside(placement)).toBe(true);
  });

  it("남은 높이를 창의 최대 높이로 알려 준다(넘치면 창 안에서 스크롤)", () => {
    const placement = placePopover(cell(100, 300), viewport, POPOVER_WIDTH, 360);
    expect(placement!.maxHeight).toBe(viewport.height - placement!.top - 8);
  });

  it("좌우 어느 쪽에도 들어갈 자리가 없으면 칸 가운데를 기준으로 화면 안에 맞춘다", () => {
    const narrow = { width: 700, height: 800 };
    const placement = placePopover(cell(200, 200, 300, 120), narrow); // 양옆 여유 200 / 200 < 328
    expect(placement).not.toBeNull();
    expect(placement!.left).toBeGreaterThanOrEqual(8);
    expect(placement!.left + POPOVER_WIDTH).toBeLessThanOrEqual(narrow.width - 8);
  });

  it("폰처럼 좁은 화면(600px 미만)에서는 위치를 정하지 않고 null을 돌려준다(아래에서 올라오는 시트로 그린다)", () => {
    expect(placePopover(cell(10, 100, 50, 80), { width: 375, height: 800 })).toBeNull();
    expect(placePopover(cell(10, 100, 50, 80), { width: 599, height: 800 })).toBeNull();
    expect(placePopover(cell(10, 100, 50, 80), { width: 600, height: 800 })).not.toBeNull();
  });

  it("어떤 칸에서든 화면 안에 들어온다", () => {
    for (let left = 0; left <= 1040; left += 160) {
      for (let top = 0; top <= 680; top += 120) {
        const placement = placePopover(cell(left, top), viewport);
        expect(placement, `${left},${top}`).not.toBeNull();
        expect(inside(placement!), `${left},${top}`).toBe(true);
      }
    }
  });
});
