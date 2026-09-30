/** 화면(뷰포트) 기준 사각형. `getBoundingClientRect()`와 같은 좌표다. */
export type Rect = { left: number; top: number; right: number; bottom: number };
/** side는 창이 날짜 칸의 어느 쪽에 붙었는지. "below"는 옆에 둘 자리가 없어 칸 아래(없으면 위)에 둔 경우다. */
export type Placement = { left: number; top: number; maxHeight: number; side: "right" | "left" | "below" };

/** 날짜 옆에 뜨는 작은 창의 너비(px). */
export const POPOVER_WIDTH = 320;
/** 이 너비보다 좁은 화면(폰)에서는 날짜 옆에 둘 자리가 없어서, 아래에서 올라오는 시트로 그린다. */
export const SHEET_BREAKPOINT = 600;

const GAP = 8;
const EDGE = 8;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * 클릭한 날짜 칸(`anchor`) 옆에 작은 창을 어디에 둘지. 달력 표(`bounds`) 전체를 보고 정한다.
 * - 옆: 표 안에서 창이 들어가는 쪽 중 자리가 더 넓은 쪽(같으면 오른쪽)에 둔다. 그래서 일~수요일 칸은 오른쪽, 목~토요일 칸은 왼쪽에 뜬다.
 * - 세로: 날짜 칸의 세로 가운데에 맞추되, 창 전체가 표(와 화면)의 위아래 경계 안에 들어오게 밀어 넣는다.
 *   창이 표보다 높으면 표 높이에 맞추고 나머지는 창 안에서 스크롤한다(`maxHeight`).
 * - 어느 옆에도 들어갈 자리가 없는 좁은 창(600~700px)에서는 칸 아래(아래도 없으면 위)에 둔다.
 * `size`는 창을 그린 뒤 실제로 잰 크기다. 좁은 화면(폰)이면 null이고, 그때는 CSS가 화면 아래에 시트로 그린다.
 */
export function placePopover(input: {
  anchor: Rect;
  bounds: Rect;
  viewport: { width: number; height: number };
  size: { width: number; height: number };
}): Placement | null {
  const { anchor, bounds, viewport } = input;
  if (viewport.width < SHEET_BREAKPOINT) return null;

  const area: Rect = {
    left: Math.max(bounds.left, EDGE),
    right: Math.min(bounds.right, viewport.width - EDGE),
    top: Math.max(bounds.top, EDGE),
    bottom: Math.min(bounds.bottom, viewport.height - EDGE),
  };
  const width = Math.min(input.size.width, area.right - area.left);
  const areaHeight = area.bottom - area.top;
  const height = Math.min(input.size.height, areaHeight);

  const spaceRight = area.right - anchor.right - GAP;
  const spaceLeft = anchor.left - area.left - GAP;
  const fitsRight = spaceRight >= width;
  const fitsLeft = spaceLeft >= width;

  if (fitsRight || fitsLeft) {
    const side = fitsRight && fitsLeft ? (spaceRight >= spaceLeft ? "right" : "left") : fitsRight ? "right" : "left";
    const left = side === "right" ? anchor.right + GAP : anchor.left - GAP - width;
    const center = (anchor.top + anchor.bottom) / 2;
    const top = clamp(center - height / 2, area.top, area.bottom - height);
    return { left, top, maxHeight: Math.min(areaHeight, area.bottom - top), side };
  }

  // 옆에 둘 자리가 없다: 칸 아래에 두고, 아래가 모자라면 위에 둔다.
  const left = clamp((anchor.left + anchor.right) / 2 - width / 2, area.left, area.right - width);
  const roomBelow = area.bottom - anchor.bottom - GAP;
  const roomAbove = anchor.top - area.top - GAP;
  const top =
    roomBelow >= height || roomBelow >= roomAbove
      ? clamp(anchor.bottom + GAP, area.top, area.bottom - height)
      : clamp(anchor.top - GAP - height, area.top, area.bottom - height);
  return { left, top, maxHeight: Math.min(areaHeight, area.bottom - top), side: "below" };
}
