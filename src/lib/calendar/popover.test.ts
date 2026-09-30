import { describe, expect, it } from "vitest";
import { POPOVER_WIDTH, placePopover, type Rect } from "./popover";

const viewport = { width: 1400, height: 850 };
// 달력 표: 화면 왼쪽 16px, 위 120px에서 시작하는 1368×660. 7열(각 약 195px) × 5주(각 약 132px).
const bounds: Rect = { left: 16, top: 120, right: 1384, bottom: 780 };
const COL = (bounds.right - bounds.left) / 7;
const ROW = (bounds.bottom - bounds.top - 30) / 5;
const cellAt = (col: number, row: number): Rect => ({
  left: bounds.left + col * COL,
  right: bounds.left + (col + 1) * COL,
  top: bounds.top + 30 + row * ROW,
  bottom: bounds.top + 30 + (row + 1) * ROW,
});
const size = { width: POPOVER_WIDTH, height: 300 };

function place(anchor: Rect, popoverSize = size, view = viewport, area = bounds) {
  return placePopover({ anchor, bounds: area, viewport: view, size: popoverSize });
}

describe("placePopover", () => {
  it("왼쪽 열(일~수)이면 날짜 칸의 오른쪽 옆에 둔다", () => {
    for (const col of [0, 1, 2, 3]) {
      const anchor = cellAt(col, 1);
      const placement = place(anchor)!;
      expect(placement.side, `열 ${col}`).toBe("right");
      expect(placement.left, `열 ${col}`).toBeGreaterThanOrEqual(anchor.right);
    }
  });

  it("오른쪽 열(목~토)이면 날짜 칸의 왼쪽 옆에 둔다", () => {
    for (const col of [4, 5, 6]) {
      const anchor = cellAt(col, 1);
      const placement = place(anchor)!;
      expect(placement.side, `열 ${col}`).toBe("left");
      expect(placement.left + POPOVER_WIDTH, `열 ${col}`).toBeLessThanOrEqual(anchor.left);
    }
  });

  it("양쪽 다 들어가면 자리가 더 넓은 쪽을 고른다", () => {
    // 가운데 열(수): 오른쪽이 왼쪽보다 넓지 않다면 왼쪽. 여기서는 4열 이후 오른쪽 여유가 3열 = 585px.
    const anchor = cellAt(3, 2);
    const placement = place(anchor)!;
    const spaceRight = bounds.right - anchor.right;
    const spaceLeft = anchor.left - bounds.left;
    expect(placement.side).toBe(spaceRight >= spaceLeft ? "right" : "left");
  });

  it("날짜 칸의 세로 가운데에 맞춘다", () => {
    const anchor = cellAt(1, 2);
    const placement = place(anchor)!;
    const anchorCenter = (anchor.top + anchor.bottom) / 2;
    expect(placement.top + size.height / 2).toBeCloseTo(anchorCenter, 0);
  });

  it("맨 윗줄이면 달력 표의 위쪽 경계 안으로, 맨 아랫줄이면 아래쪽 경계 안으로 밀어 넣는다", () => {
    const top = place(cellAt(1, 0))!;
    expect(top.top).toBeGreaterThanOrEqual(bounds.top);
    const bottom = place(cellAt(1, 4))!;
    expect(bottom.top + size.height).toBeLessThanOrEqual(bounds.bottom);
    expect(bottom.top).toBeGreaterThanOrEqual(bounds.top);
  });

  it("창이 달력 표보다 높으면 표 높이에 맞추고 나머지는 창 안에서 스크롤하게 한다", () => {
    const placement = place(cellAt(1, 2), { width: POPOVER_WIDTH, height: 2000 })!;
    expect(placement.top).toBeGreaterThanOrEqual(bounds.top);
    expect(placement.maxHeight).toBeLessThanOrEqual(bounds.bottom - bounds.top);
    expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(bounds.bottom);
  });

  it("클릭한 날짜 칸을 가리지 않는다(옆에 둘 때는 칸과 가로로 겹치지 않는다)", () => {
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row < 5; row++) {
        const anchor = cellAt(col, row);
        const p = place(anchor)!;
        if (p.side === "below") continue;
        const overlapsX = p.left < anchor.right && p.left + POPOVER_WIDTH > anchor.left;
        expect(overlapsX, `열 ${col} 행 ${row}`).toBe(false);
      }
    }
  });

  it("어떤 칸에서든 화면과 달력 표 안에 들어온다", () => {
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row < 5; row++) {
        const p = place(cellAt(col, row))!;
        const label = `열 ${col} 행 ${row}`;
        expect(p.left, label).toBeGreaterThanOrEqual(8);
        expect(p.left + POPOVER_WIDTH, label).toBeLessThanOrEqual(viewport.width - 8);
        expect(p.top, label).toBeGreaterThanOrEqual(bounds.top);
        expect(p.top + Math.min(size.height, p.maxHeight), label).toBeLessThanOrEqual(bounds.bottom);
      }
    }
  });

  it("옆에 둘 자리가 없는 좁은 데스크톱 창(600~700px)에서는 칸 아래(없으면 위)에 두고 화면 안에 맞춘다", () => {
    const narrow = { width: 620, height: 800 };
    const area: Rect = { left: 16, top: 100, right: 604, bottom: 780 };
    const col = (area.right - area.left) / 7; // 84px
    const anchor: Rect = { left: 16 + col * 3, right: 16 + col * 4, top: 200, bottom: 300 };
    const p = place(anchor, size, narrow, area)!;
    expect(p.side).toBe("below");
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + POPOVER_WIDTH).toBeLessThanOrEqual(narrow.width - 8);
    expect(p.top).toBeGreaterThanOrEqual(anchor.bottom);
  });

  it("폰처럼 좁은 화면(600px 미만)에서는 위치를 정하지 않고 null을 돌려준다(아래에서 올라오는 시트로 그린다)", () => {
    expect(place(cellAt(0, 0), size, { width: 375, height: 800 })).toBeNull();
    expect(place(cellAt(0, 0), size, { width: 599, height: 800 })).toBeNull();
    expect(place(cellAt(0, 0), size, { width: 600, height: 800 }, { left: 8, top: 100, right: 592, bottom: 780 })).not.toBeNull();
  });
});
