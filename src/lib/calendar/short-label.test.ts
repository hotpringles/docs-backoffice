import { describe, expect, it } from "vitest";
import { shortDayLabel } from "./view";

describe("shortDayLabel", () => {
  it("월/일(요일)로 짧게 쓴다", () => {
    expect(shortDayLabel("2026-10-07")).toBe("10/7(수)");
    expect(shortDayLabel("2026-02-01")).toBe("2/1(일)");
    expect(shortDayLabel("2026-12-31")).toBe("12/31(목)");
  });
});
