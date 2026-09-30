import { describe, expect, it } from "vitest";
import { shorten } from "./text";

describe("shorten", () => {
  it("기본 40자까지는 그대로 두고, 넘으면 39자에 …을 붙인다", () => {
    expect(shorten("가".repeat(40))).toBe("가".repeat(40));
    expect(shorten("가".repeat(41))).toBe(`${"가".repeat(39)}…`);
  });

  it("이모지도 한 글자로 센다", () => {
    expect(shorten("😀".repeat(40))).toBe("😀".repeat(40));
    expect(shorten("😀".repeat(41))).toBe(`${"😀".repeat(39)}…`);
  });

  it("최대 글자 수를 정할 수 있고, 빈 문자열도 문제없다", () => {
    expect(shorten("abcdef", 4)).toBe("abc…");
    expect(shorten("abcd", 4)).toBe("abcd");
    expect(shorten("")).toBe("");
  });
});
