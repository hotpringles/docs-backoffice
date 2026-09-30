import { describe, expect, it } from "vitest";
import type { Recommendation } from "./overlap";
import { cellKey } from "./slots";
import {
  columnKeys,
  heatLevel,
  isColumnSelected,
  keysBetween,
  meetupRangeLabel,
  paintKeys,
  recommendationLabel,
  sameKeys,
  slotLabels,
  sortedKeys,
  toggleColumn,
} from "./view";

const rec = (overrides: Partial<Recommendation> = {}): Recommendation => ({
  day: "2026-10-07",
  startSlot: 10,
  endSlot: 14,
  startTime: "14:00",
  endTime: "16:00",
  count: 5,
  total: 5,
  personIds: ["p1", "p2", "p3", "p4", "p5"],
  ...overrides,
});

describe("meetupRangeLabel", () => {
  it("하루면 그 날짜, 여럿이면 처음 ~ 끝이다", () => {
    expect(meetupRangeLabel(["2026-10-07"])).toBe("10/7(수)");
    expect(meetupRangeLabel(["2026-10-07", "2026-10-08", "2026-10-13"])).toBe("10/7(수) ~ 10/13(화)");
    expect(meetupRangeLabel([])).toBe("");
  });
});

describe("recommendationLabel", () => {
  it("전원이 가능하면 'N명 모두 가능', 아니면 'N명 중 M명 가능'이다", () => {
    expect(recommendationLabel(rec())).toBe("10/7(수) 14:00–16:00 · 5명 모두 가능");
    expect(recommendationLabel(rec({ count: 4 }))).toBe("10/7(수) 14:00–16:00 · 5명 중 4명 가능");
  });
});

describe("heatLevel", () => {
  it("0명은 0, 전원은 4, 그 사이는 비율에 따라 1~4다", () => {
    expect(heatLevel(0, 5)).toBe(0);
    expect(heatLevel(5, 5)).toBe(4);
    expect(heatLevel(1, 5)).toBe(1);
    expect(heatLevel(2, 5)).toBe(2);
    expect(heatLevel(3, 5)).toBe(3);
    expect(heatLevel(4, 5)).toBe(4);
  });

  it("총원이 0이거나 이상한 값이어도 죽지 않는다", () => {
    expect(heatLevel(3, 0)).toBe(0);
    expect(heatLevel(-1, 5)).toBe(0);
    expect(heatLevel(9, 5)).toBe(4);
  });
});

describe("slotLabels", () => {
  it("칸마다 시작 시각을 30분씩 늘려서 만든다", () => {
    expect(slotLabels("09:00", 4)).toEqual(["09:00", "09:30", "10:00", "10:30"]);
    expect(slotLabels("09:00", 0)).toEqual([]);
  });
});

describe("칸 칠하기", () => {
  it("columnKeys는 그 날의 모든 칸 키다", () => {
    expect(columnKeys("2026-10-07", 3)).toEqual([cellKey("2026-10-07", 0), cellKey("2026-10-07", 1), cellKey("2026-10-07", 2)]);
  });

  it("paintKeys는 켜면 더하고 끄면 빼며, 중복이 없고 원본은 그대로다", () => {
    const current = ["a:0", "a:1"];
    expect(paintKeys(current, ["a:1", "a:2"], true).sort()).toEqual(["a:0", "a:1", "a:2"]);
    expect(paintKeys(current, ["a:1", "a:9"], false)).toEqual(["a:0"]);
    expect(current).toEqual(["a:0", "a:1"]);
  });

  it("isColumnSelected는 그 날의 칸이 전부 켜져 있을 때만 true다", () => {
    const all = columnKeys("2026-10-07", 3);
    expect(isColumnSelected(all, "2026-10-07", 3)).toBe(true);
    expect(isColumnSelected(all.slice(1), "2026-10-07", 3)).toBe(false);
    expect(isColumnSelected([], "2026-10-07", 3)).toBe(false);
    expect(isColumnSelected(all, "2026-10-08", 3)).toBe(false);
  });

  it("toggleColumn은 일부만 켜져 있으면 전부 켜고, 전부 켜져 있으면 전부 끈다(다른 날짜는 그대로)", () => {
    const other = [cellKey("2026-10-08", 1)];
    const partial = [cellKey("2026-10-07", 1), ...other];
    const filled = toggleColumn(partial, "2026-10-07", 3);
    expect(sortedKeys(filled)).toEqual(sortedKeys([...columnKeys("2026-10-07", 3), ...other]));
    expect(toggleColumn(filled, "2026-10-07", 3)).toEqual(other);
  });
});

describe("sortedKeys / sameKeys", () => {
  it("칸 키를 날짜 → 칸 번호(숫자) 순으로 정렬한다(10번이 2번보다 뒤다)", () => {
    expect(sortedKeys(["2026-10-08:0", "2026-10-07:10", "2026-10-07:2"])).toEqual(["2026-10-07:2", "2026-10-07:10", "2026-10-08:0"]);
  });

  it("sameKeys는 순서와 상관없이 같은 칸들인지 본다", () => {
    expect(sameKeys(["a:1", "a:2"], ["a:2", "a:1"])).toBe(true);
    expect(sameKeys(["a:1"], ["a:1", "a:2"])).toBe(false);
    expect(sameKeys([], [])).toBe(true);
    expect(sameKeys(["a:1", "a:1"], ["a:1"])).toBe(true);
  });
});

describe("keysBetween", () => {
  const key = (slot: number, day = "2026-10-07") => cellKey(day, slot);

  it("같은 날이면 두 칸 사이의 칸을 모두 돌려준다(빨리 끌어서 건너뛴 칸까지)", () => {
    expect(keysBetween(key(2), key(5))).toEqual([key(2), key(3), key(4), key(5)]);
  });

  it("거꾸로 끌어도 같은 칸들이다", () => {
    expect(keysBetween(key(5), key(2))).toEqual([key(5), key(4), key(3), key(2)]);
  });

  it("같은 칸이면 그 칸 하나다", () => {
    expect(keysBetween(key(3), key(3))).toEqual([key(3)]);
  });

  it("다른 날로 넘어가면 도착한 칸만이다(대각선 사이를 채우지 않는다)", () => {
    expect(keysBetween(key(2), key(6, "2026-10-08"))).toEqual([key(6, "2026-10-08")]);
  });

  it("이전 칸이 없거나 알아볼 수 없는 키면 도착한 칸만이다", () => {
    expect(keysBetween(null, key(4))).toEqual([key(4)]);
    expect(keysBetween("엉뚱한 값", key(4))).toEqual([key(4)]);
  });
});
