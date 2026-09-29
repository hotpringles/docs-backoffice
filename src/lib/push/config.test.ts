import { describe, expect, it } from "vitest";
import { loadPushConfig } from "./config";

const full = {
  DATABASE_URL: "postgres://user:pw@host/db",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "public-key",
  VAPID_PRIVATE_KEY: "private-key",
  VAPID_SUBJECT: "mailto:team@example.com",
};

describe("loadPushConfig", () => {
  it("모든 값이 있으면 설정을 돌려준다", () => {
    expect(loadPushConfig(full)).toEqual({
      ok: true,
      config: {
        databaseUrl: full.DATABASE_URL,
        vapid: { subject: full.VAPID_SUBJECT, publicKey: "public-key", privateKey: "private-key" },
      },
    });
  });

  it("빠진 값을 모두 알려준다", () => {
    const result = loadPushConfig({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toHaveLength(4);
    expect(result.missing.join(" ")).toContain("DATABASE_URL");
    expect(result.missing.join(" ")).toContain("VAPID_PRIVATE_KEY");
  });

  it("공백뿐인 값은 없는 것으로 본다", () => {
    const result = loadPushConfig({ ...full, VAPID_PRIVATE_KEY: "   " });
    expect(result).toEqual({ ok: false, missing: ["VAPID_PRIVATE_KEY"] });
  });

  it("VAPID_SUBJECT는 mailto: 또는 https://여야 한다", () => {
    for (const subject of ["team@example.com", "http://example.com", "mailto:", "ftp://x"]) {
      expect(loadPushConfig({ ...full, VAPID_SUBJECT: subject }).ok, subject).toBe(false);
    }
    expect(loadPushConfig({ ...full, VAPID_SUBJECT: "https://example.com" }).ok).toBe(true);
  });
});
