/** 화면(뷰포트) 기준 사각형. `getBoundingClientRect()`와 같은 좌표다. */
export type Rect = { left: number; top: number; right: number; bottom: number };
export type Placement = { left: number; top: number; maxHeight: number };

/** 날짜 옆에 뜨는 작은 창의 너비(px). */
export const POPOVER_WIDTH = 320;
/** 이 너비보다 좁은 화면(폰)에서는 날짜 옆에 둘 자리가 없어서, 아래에서 올라오는 시트로 그린다. */
export const SHEET_BREAKPOINT = 600;

const GAP = 8;
const EDGE = 8;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * 클릭한 날짜 칸(`anchor`) 옆에 작은 창을 어디에 둘지. 오른쪽에 자리가 있으면 오른쪽, 없으면 왼쪽,
 * 양쪽 다 없으면 칸 가운데를 기준으로 화면 안에 맞춘다. 창은 화면 밖으로 나가지 않고,
 * 남은 높이(`maxHeight`)를 넘는 내용은 창 안에서 스크롤한다.
 * 좁은 화면(폰)이면 null을 돌려준다. 그때는 CSS가 화면 아래에 시트로 그린다.
 */
export function placePopover(
  anchor: Rect,
  viewport: { width: number; height: number },
  popoverWidth = POPOVER_WIDTH,
  estimatedHeight = 360,
): Placement | null {
  if (viewport.width < SHEET_BREAKPOINT) return null;

  const width = Math.min(popoverWidth, viewport.width - EDGE * 2);
  const fitsRight = anchor.right + GAP + width <= viewport.width - EDGE;
  const fitsLeft = anchor.left - GAP - width >= EDGE;

  let left: number;
  let anchorTop = anchor.top;
  if (fitsRight) left = anchor.right + GAP;
  else if (fitsLeft) left = anchor.left - GAP - width;
  else {
    left = clamp(anchor.left + (anchor.right - anchor.left) / 2 - width / 2, EDGE, viewport.width - EDGE - width);
    anchorTop = anchor.bottom + GAP; // 옆에 둘 수 없으니 칸 아래에 둔다.
  }

  const top = clamp(anchorTop, EDGE, viewport.height - EDGE - estimatedHeight);
  return { left, top, maxHeight: viewport.height - top - EDGE };
}
