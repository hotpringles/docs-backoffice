import { describe, expect, it } from "vitest";
import { loadAuthConfig } from "./config";

describe("loadAuthConfig", () => {
  it("둘 다 없으면 무엇이 없는지 알려준다", () => {
    const result = loadAuthConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(["EDIT_CODE (8자 이상)", "SESSION_SECRET (16자 이상)"]);
  });

  it("너무 짧은 값은 없는 것으로 본다", () => {
    const result = loadAuthConfig({ EDIT_CODE: "short", SESSION_SECRET: "too-short" });
    expect(result.ok).toBe(false);
  });

  it("충분히 길면 공백을 다듬어서 돌려준다", () => {
    expect(loadAuthConfig({ EDIT_CODE: "  code-12345678 ", SESSION_SECRET: "s".repeat(16) })).toEqual({
      ok: true,
      config: { editCode: "code-12345678", sessionSecret: "s".repeat(16) },
    });
  });
});
