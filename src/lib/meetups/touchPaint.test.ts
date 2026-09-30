import { describe, expect, it, vi } from "vitest";
import { cellKey } from "./slots";
import { createTouchPainter } from "./touchPaint";

const key = (slot: number, day = "2026-10-07") => cellKey(day, slot);

/** 시간이 저절로 흐르지 않는 가짜 타이머: `fire()`로 "0.3초가 지났다"를 만든다. */
function setup(beginResult = true) {
  let pending: (() => void) | null = null;
  const cleared: unknown[] = [];
  const begin = vi.fn<(key: string) => boolean>(() => beginResult);
  const paint = vi.fn<(keys: string[], on: boolean) => void>();
  const painter = createTouchPainter({
    begin,
    paint,
    setTimer: (fn) => {
      pending = fn;
      return "handle";
    },
    clearTimer: (handle) => {
      cleared.push(handle);
      pending = null;
    },
  });
  return {
    painter,
    begin,
    paint,
    cleared,
    fire: () => {
      const fn = pending;
      pending = null;
      fn?.();
    },
    hasTimer: () => pending !== null,
  };
}

describe("createTouchPainter", () => {
  it("칸 위에 손가락을 가만히 두면(0.3초) 그 칸이 칠해지고 칠하기가 시작된다", () => {
    const t = setup();

    t.painter.start(100, 100, key(2));
    expect(t.painter.active).toBe(false);
    expect(t.paint).not.toHaveBeenCalled();

    t.fire();

    expect(t.begin).toHaveBeenCalledWith(key(2));
    expect(t.paint).toHaveBeenCalledWith([key(2)], true);
    expect(t.painter.active).toBe(true);
  });

  it("이미 켜진 칸에서 시작하면 끄는 칠하기다(begin이 false를 돌려준다)", () => {
    const t = setup(false);

    t.painter.start(0, 0, key(4));
    t.fire();
    t.painter.move(0, 30, key(5));

    expect(t.paint).toHaveBeenNthCalledWith(1, [key(4)], false);
    expect(t.paint).toHaveBeenLastCalledWith([key(4), key(5)], false);
  });

  it("시간이 차기 전에 많이 움직이면 스크롤이다: 칠하지 않고 타이머도 취소한다", () => {
    const t = setup();

    t.painter.start(100, 100, key(2));
    const scrolling = t.painter.move(100, 140, key(3));
    t.fire();

    expect(scrolling).toBe(false);
    expect(t.cleared).toEqual(["handle"]);
    expect(t.paint).not.toHaveBeenCalled();
    expect(t.painter.active).toBe(false);
  });

  it("손가락이 조금 떨리는 정도(기준 이하)는 무시하고 그대로 칠하기가 시작된다", () => {
    const t = setup();

    t.painter.start(100, 100, key(2));
    t.painter.move(103, 102, key(2));
    t.fire();

    expect(t.paint).toHaveBeenCalledWith([key(2)], true);
    expect(t.painter.active).toBe(true);
  });

  it("칠하는 중에 다른 칸으로 옮기면 건너뛴 칸까지 같은 상태로 칠하고, 스크롤을 막아야 한다고 알린다", () => {
    const t = setup();
    t.painter.start(0, 0, key(2));
    t.fire();

    const blocking = t.painter.move(0, 90, key(5));

    expect(blocking).toBe(true);
    expect(t.paint).toHaveBeenLastCalledWith([key(2), key(3), key(4), key(5)], true);
  });

  it("같은 칸에서 계속 움직이면 다시 칠하지 않는다", () => {
    const t = setup();
    t.painter.start(0, 0, key(2));
    t.fire();
    t.paint.mockClear();

    t.painter.move(1, 5, key(2));
    t.painter.move(2, 8, key(2));

    expect(t.paint).not.toHaveBeenCalled();
  });

  it("표 밖(칸이 없는 곳)을 지나가도 칠하기는 이어지고, 칸에 돌아오면 그 사이를 채운다", () => {
    const t = setup();
    t.painter.start(0, 0, key(2));
    t.fire();
    t.paint.mockClear();

    expect(t.painter.move(0, 200, null)).toBe(true);
    expect(t.paint).not.toHaveBeenCalled();

    t.painter.move(0, 60, key(4));
    expect(t.paint).toHaveBeenCalledWith([key(2), key(3), key(4)], true);
  });

  it("칠한 뒤 손가락을 떼면 true를 돌려주고(뒤따르는 탭을 무시하라는 뜻) 처음 상태로 돌아간다", () => {
    const t = setup();
    t.painter.start(0, 0, key(2));
    t.fire();

    expect(t.painter.end()).toBe(true);
    expect(t.painter.active).toBe(false);
    expect(t.painter.move(0, 80, key(6))).toBe(false);
  });

  it("시간이 차기 전에 손가락을 떼면 그냥 탭이다: false를 돌려주고 타이머를 취소한다", () => {
    const t = setup();
    t.painter.start(0, 0, key(2));

    expect(t.painter.end()).toBe(false);
    expect(t.hasTimer()).toBe(false);
    t.fire();
    expect(t.paint).not.toHaveBeenCalled();
  });

  it("칸이 아닌 곳(날짜 머리글, 표 바깥)에서 시작하면 아무것도 하지 않는다", () => {
    const t = setup();

    t.painter.start(0, 0, null);

    expect(t.hasTimer()).toBe(false);
    expect(t.painter.move(0, 50, key(3))).toBe(false);
    expect(t.painter.end()).toBe(false);
  });

  it("cancel(터치가 시스템에 의해 끊김)하면 칠하기가 끝나고 대기 중인 타이머도 없앤다", () => {
    const t = setup();
    t.painter.start(0, 0, key(2));
    t.fire();

    t.painter.cancel();

    expect(t.painter.active).toBe(false);
    const pendingCase = setup();
    pendingCase.painter.start(0, 0, key(2));
    pendingCase.painter.cancel();
    expect(pendingCase.hasTimer()).toBe(false);
  });
});
