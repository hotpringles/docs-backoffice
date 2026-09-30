import { describe, expect, it } from "vitest";
import { parseRemindOffsets } from "./validate";

describe("parseRemindOffsets", () => {
  it("값이 없으면 기본(당일, 1일 전)이다", () => {
    expect(parseRemindOffsets(undefined)).toEqual([0, 1]);
  });

  it("중복을 없애고 정렬하며, 빈 배열은 알림 없음이다", () => {
    expect(parseRemindOffsets([3, 0, 3])).toEqual([0, 3]);
    expect(parseRemindOffsets([])).toEqual([]);
  });

  it("허용되지 않은 값이나 배열이 아닌 값은 null이다", () => {
    for (const value of [[2], [-1], ["0"], "0", null, [0, 7], [1.5], {}]) {
      expect(parseRemindOffsets(value), JSON.stringify(value)).toBeNull();
    }
  });

  it("기본값을 돌려줄 때마다 새 배열이다(고쳐 써도 다음 호출에 영향이 없다)", () => {
    const first = parseRemindOffsets(undefined);
    first?.push(3);
    expect(parseRemindOffsets(undefined)).toEqual([0, 1]);
  });
});
