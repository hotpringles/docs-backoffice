import { keysBetween } from "./view";

export type TouchPainterOptions = {
  /** 칠하기가 시작될 칸을 받아서, 그 칸을 켜야 하면 true, 꺼야 하면 false를 돌려준다. 끄는 동안에도 같은 값으로 칠한다. */
  begin: (key: string) => boolean;
  paint: (keys: string[], on: boolean) => void;
  /** 손가락을 가만히 두어야 하는 시간. 이보다 빨리 움직이면 스크롤이다. */
  holdMs?: number;
  /** 이만큼(픽셀) 이하의 떨림은 "가만히"로 본다. */
  slopPx?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

type State =
  | { kind: "idle" }
  | { kind: "pending"; x: number; y: number; key: string; timer: unknown }
  | { kind: "painting"; on: boolean; lastKey: string };

/**
 * 폰에서 "꾹 누른 채 끌어서 칠하기". 칸 위에 손가락을 `holdMs` 동안 가만히 두면 그 칸을 켜고 끄면서 칠하기가 시작되고,
 * 그 뒤에 끌면 지나가는 칸을 같은 상태로 칠한다. 그 전에 움직이면(스크롤) 아무것도 하지 않는다.
 * 화면·타이머와 분리해 둔 상태 기계라서 브라우저 없이 테스트한다.
 */
export function createTouchPainter(options: TouchPainterOptions) {
  const holdMs = options.holdMs ?? 300;
  const slopPx = options.slopPx ?? 10;
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let state: State = { kind: "idle" };

  function reset() {
    if (state.kind === "pending") clearTimer(state.timer);
    state = { kind: "idle" };
  }

  return {
    /** 손가락이 칸 위에 닿았다. 칸이 아닌 곳이면 `key`가 null이다. */
    start(x: number, y: number, key: string | null) {
      reset();
      if (key === null) return;
      const timer = setTimer(() => {
        if (state.kind !== "pending") return;
        const on = options.begin(key);
        state = { kind: "painting", on, lastKey: key };
        options.paint([key], on);
      }, holdMs);
      state = { kind: "pending", x, y, key, timer };
    },

    /** 손가락이 움직였다. 돌려주는 값이 true면 칠하는 중이라서 화면이 스크롤되지 않게 막아야 한다. */
    move(x: number, y: number, key: string | null): boolean {
      if (state.kind === "pending") {
        if (Math.hypot(x - state.x, y - state.y) > slopPx) reset(); // 시간이 차기 전에 움직였으니 스크롤이다.
        return false;
      }
      if (state.kind !== "painting") return false;
      if (key !== null && key !== state.lastKey) {
        options.paint(keysBetween(state.lastKey, key), state.on);
        state = { ...state, lastKey: key };
      }
      return true;
    },

    /** 손가락을 뗐다. true면 칠하기였으니, 뒤따라 오는 탭(클릭)은 무시해야 한다. */
    end(): boolean {
      const painted = state.kind === "painting";
      reset();
      return painted;
    },

    /** 시스템이 터치를 끊었다(전화가 오는 등). */
    cancel() {
      reset();
    },

    get active() {
      return state.kind === "painting";
    },
  };
}
