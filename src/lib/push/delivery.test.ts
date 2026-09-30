import { describe, expect, it } from "vitest";
import { nothingDelivered } from "./send";

describe("nothingDelivered", () => {
  it("구독자가 있는데 아무에게도 못 보냈고 실패가 있으면 true다", () => {
    expect(nothingDelivered({ total: 3, sent: 0, removed: 0, failed: 3 })).toBe(true);
    expect(nothingDelivered({ total: 2, sent: 0, removed: 1, failed: 1 })).toBe(true);
  });

  it("한 명이라도 받았으면 false다", () => {
    expect(nothingDelivered({ total: 3, sent: 1, removed: 0, failed: 2 })).toBe(false);
  });

  it("구독자가 없거나 만료된 구독만 정리한 경우는 실패로 보지 않는다", () => {
    expect(nothingDelivered({ total: 0, sent: 0, removed: 0, failed: 0 })).toBe(false);
    expect(nothingDelivered({ total: 2, sent: 0, removed: 2, failed: 0 })).toBe(false);
  });
});
