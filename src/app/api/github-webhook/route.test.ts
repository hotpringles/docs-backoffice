import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));

// `after`는 응답이 끝난 뒤 실행할 작업을 예약한다. 테스트에서는 예약만 모아 두었다가 직접 실행한다.
const scheduled: Array<() => unknown> = [];
vi.mock("next/server", () => ({ after: (task: () => unknown) => void scheduled.push(task) }));

const notifyDocsChangedIfConfigured = vi.fn();
vi.mock("@/lib/push/notify-docs", () => ({ notifyDocsChangedIfConfigured }));
const loadPushDeps = vi.fn(() => ({ ok: false as const, missing: ["DATABASE_URL"] }));
vi.mock("@/lib/push/deps", () => ({ loadPushDeps }));

const { POST } = await import("./route");

async function runScheduled(): Promise<void> {
  await Promise.all(scheduled.splice(0).map((task) => task()));
}

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
  notifyDocsChangedIfConfigured.mockReset().mockResolvedValue(undefined);
  scheduled.length = 0;
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

  it("표시 대상 문서가 바뀐 push는 응답 뒤에 알림을 보낸다(캐시 무효화가 먼저)", async () => {
    const order: string[] = [];
    revalidateTag.mockImplementation(() => order.push("revalidate"));
    notifyDocsChangedIfConfigured.mockImplementation(async () => order.push("notify"));

    const response = await POST(webhook(pushBody()));

    expect(response.status).toBe(200);
    expect(notifyDocsChangedIfConfigured).not.toHaveBeenCalled(); // 응답 시점에는 아직 예약만 됐다.
    await runScheduled();
    expect(notifyDocsChangedIfConfigured).toHaveBeenCalledExactlyOnceWith(expect.any(Function), {
      commitSha: "abc",
      changedDocs: ["frontend/docs/plan/a.md"],
    });
    expect(order).toEqual(["revalidate", "notify"]);
  });

  it("알림에 넘기는 설정 읽기 함수는 푸시 설정(DB, VAPID)을 읽는다", async () => {
    await POST(webhook(pushBody()));
    await runScheduled();
    const loadDeps = notifyDocsChangedIfConfigured.mock.calls[0][0] as () => unknown;
    expect(loadDeps()).toEqual({ ok: false, missing: ["DATABASE_URL"] });
    expect(loadPushDeps).toHaveBeenCalled();
  });

  it("응답은 알림 발송이 끝나기를 기다리지 않는다", async () => {
    let finishSending: () => void = () => undefined;
    notifyDocsChangedIfConfigured.mockReturnValue(new Promise<void>((resolve) => (finishSending = resolve)));

    const response = await POST(webhook(pushBody())); // 발송이 끝나지 않았어도 응답이 온다.
    expect(response.status).toBe(200);

    const running = runScheduled();
    finishSending();
    await running;
    expect(notifyDocsChangedIfConfigured).toHaveBeenCalledOnce();
  });

  it("문서가 아닌 파일만 바뀐 push는 캐시만 무효화하고 알림은 보내지 않는다", async () => {
    const body = JSON.stringify({
      ref: "refs/heads/develop",
      after: "abc",
      commits: [{ modified: ["frontend/src/App.tsx", "frontend/docs/other/x.md"] }],
    });
    expect((await POST(webhook(body))).status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledOnce();
    await runScheduled();
    expect(notifyDocsChangedIfConfigured).not.toHaveBeenCalled();
  });

  it("서명이 틀리거나, ping이거나, 다른 브랜치면 알림도 예약하지 않는다", async () => {
    await POST(webhook(pushBody(), { "x-hub-signature-256": "sha256=" + "0".repeat(64) }));
    await POST(webhook("{}", { "x-github-event": "ping", "x-hub-signature-256": sign("{}") }));
    await POST(webhook(pushBody("refs/heads/feature/x")));
    expect(scheduled).toHaveLength(0);
    await runScheduled();
    expect(notifyDocsChangedIfConfigured).not.toHaveBeenCalled();
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
