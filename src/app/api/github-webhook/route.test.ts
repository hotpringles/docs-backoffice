import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));

const { POST } = await import("./route");

const SECRET = "test-secret";
const sign = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

function webhook(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/github-webhook", {
    method: "POST",
    body,
    headers: { "x-github-event": "push", "x-hub-signature-256": sign(body), ...headers },
  });
}

const pushBody = (ref = "refs/heads/develop") =>
  JSON.stringify({ ref, after: "abc", commits: [{ modified: ["frontend/docs/plan/a.md"] }] });

beforeEach(() => {
  revalidateTag.mockClear();
  vi.stubEnv("GITHUB_REPO", "org/repo");
  vi.stubEnv("GITHUB_BRANCH", "develop");
  vi.stubEnv("DOCS_PATHS", "frontend/docs/plan");
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", SECRET);
});

describe("POST /api/github-webhook", () => {
  it("서명이 맞는 develop push는 트리 캐시를 즉시 만료시킨다", async () => {
    const response = await POST(webhook(pushBody()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: true, changedDocs: 1 });
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith("tree", { expire: 0 });
  });

  it("서명이 틀리거나 없으면 401이고 캐시를 건드리지 않는다", async () => {
    const wrong = await POST(webhook(pushBody(), { "x-hub-signature-256": "sha256=" + "0".repeat(64) }));
    expect(wrong.status).toBe(401);
    const request = new Request("https://example.com/api/github-webhook", {
      method: "POST",
      body: pushBody(),
      headers: { "x-github-event": "push" },
    });
    expect((await POST(request)).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("ping은 200이고 캐시를 건드리지 않는다", async () => {
    const response = await POST(webhook("{}", { "x-github-event": "ping", "x-hub-signature-256": sign("{}") }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pong: true });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("다른 브랜치의 push는 202로 무시한다", async () => {
    const response = await POST(webhook(pushBody("refs/heads/feature/x")));
    expect(response.status).toBe(202);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("서명은 맞지만 JSON이 아닌 본문(폼 방식 webhook)은 400으로 안내한다", async () => {
    const body = "payload=%7B%22ref%22%3A%22refs%2Fheads%2Fdevelop%22%7D";
    const response = await POST(webhook(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("application/json");
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("JSON이지만 모양이 이상하면 죽지 않고 무시한다", async () => {
    for (const body of ["null", "[]", '"text"', "42"]) {
      const response = await POST(webhook(body));
      expect(response.status).toBe(202);
    }
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("비밀키가 설정되지 않았으면 500이다(서명이 맞아 보여도 처리하지 않는다)", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "");
    expect((await POST(webhook(pushBody()))).status).toBe(500);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("저장소 설정이 없으면 500이다", async () => {
    vi.stubEnv("GITHUB_REPO", "");
    expect((await POST(webhook(pushBody()))).status).toBe(500);
  });
});
