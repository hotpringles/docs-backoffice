import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getDbOrNull = vi.fn();
vi.mock("@/lib/db", () => ({ getDbOrNull }));

const notifyDocsChanged = vi.fn();
vi.mock("./notify-docs", () => ({ notifyDocsChanged }));

const { notifyDocsChangedIfConfigured } = await import("./service");

const input = { commitSha: "abc", changedDocs: ["d/a.md"] };
const fullEnv = {
  DATABASE_URL: "postgres://user:pw@host/db",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub",
  VAPID_PRIVATE_KEY: "priv",
  VAPID_SUBJECT: "mailto:team@example.com",
};

describe("notifyDocsChangedIfConfigured", () => {
  beforeEach(() => {
    getDbOrNull.mockReset();
    notifyDocsChanged.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const key of Object.keys(fullEnv)) vi.stubEnv(key, "");
  });

  it("환경변수가 없으면 DB를 건드리지 않고 건너뛴다", async () => {
    const result = await notifyDocsChangedIfConfigured(input);
    expect(result.status).toBe("skipped-not-configured");
    expect(getDbOrNull).not.toHaveBeenCalled();
    expect(notifyDocsChanged).not.toHaveBeenCalled();
  });

  it("설정이 있으면 알림 로직에 DB와 발송기를 넘긴다", async () => {
    for (const [key, value] of Object.entries(fullEnv)) vi.stubEnv(key, value);
    const db = { query: vi.fn() };
    getDbOrNull.mockReturnValue(db);
    notifyDocsChanged.mockResolvedValue({ status: "sent", summary: { total: 1, sent: 1, removed: 0, failed: 0 } });

    const result = await notifyDocsChangedIfConfigured(input);

    expect(result.status).toBe("sent");
    expect(notifyDocsChanged).toHaveBeenCalledOnce();
    const [deps, passedInput] = notifyDocsChanged.mock.calls[0];
    expect(deps.db).toBe(db);
    expect(typeof deps.sender).toBe("function");
    expect(passedInput).toEqual(input);
  });

  it("알림 로직에서 오류가 나도 던지지 않고 failed로 돌려준다", async () => {
    for (const [key, value] of Object.entries(fullEnv)) vi.stubEnv(key, value);
    getDbOrNull.mockReturnValue({ query: vi.fn() });
    notifyDocsChanged.mockRejectedValue(new Error("db down"));

    await expect(notifyDocsChangedIfConfigured(input)).resolves.toEqual({ status: "failed" });
  });
});
