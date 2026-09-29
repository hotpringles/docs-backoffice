import { describe, expect, it, vi } from "vitest";
import { createGitHubClient, GitHubError, RateLimitError, withStaleFallback } from "./client";

const repo = { owner: "org", name: "repo", branch: "develop" };

function respond(body: unknown, init: ResponseInit = {}): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text, { status: 200, ...init });
}

function clientWith(fetchImpl: typeof fetch, token?: string) {
  return createGitHubClient({ repo, token, fetchImpl });
}

describe("getTree", () => {
  it("blob만 골라 경로와 SHA를 돌려주고, 트리 태그와 만료 시간을 fetch에 붙인다", async () => {
    const fetchImpl = vi.fn(async () =>
      respond({
        truncated: false,
        tree: [
          { path: "a", type: "tree", sha: "t1" },
          { path: "a/b.md", type: "blob", sha: "s1", size: 12 },
          { path: "c.png", type: "blob", sha: "s2" },
        ],
      }),
    );
    const entries = await clientWith(fetchImpl as unknown as typeof fetch).getTree();

    expect(entries).toEqual([
      { path: "a/b.md", sha: "s1", size: 12 },
      { path: "c.png", sha: "s2", size: undefined },
    ]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit & { next?: unknown }];
    expect(url).toBe("https://api.github.com/repos/org/repo/git/trees/develop?recursive=1");
    expect(init.next).toEqual({ revalidate: 600, tags: ["tree"] });
  });

  it("토큰이 있으면 Authorization을, 없으면 넣지 않는다", async () => {
    const withToken = vi.fn(async () => respond({ tree: [] }));
    await clientWith(withToken as unknown as typeof fetch, "tok").getTree();
    expect((withToken.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({
      Authorization: "Bearer tok",
      "User-Agent": "docs-backoffice",
    });

    const without = vi.fn(async () => respond({ tree: [] }));
    await clientWith(without as unknown as typeof fetch).getTree();
    expect((without.mock.calls[0] as unknown as [string, RequestInit])[1].headers).not.toHaveProperty("Authorization");
  });

  it("트리가 잘려서 오면 오류로 알린다", async () => {
    const fetchImpl = vi.fn(async () => respond({ truncated: true, tree: [] }));
    await expect(clientWith(fetchImpl as unknown as typeof fetch).getTree()).rejects.toThrow(GitHubError);
  });
});

describe("getBlobText", () => {
  it("원문을 받고 영구 캐시 옵션을 쓴다", async () => {
    const fetchImpl = vi.fn(async () => respond("# 원문\n한글"));
    const text = await clientWith(fetchImpl as unknown as typeof fetch).getBlobText("abc123");

    expect(text).toBe("# 원문\n한글");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/org/repo/git/blobs/abc123");
    expect(init.cache).toBe("force-cache");
    expect(init.headers).toMatchObject({ Accept: "application/vnd.github.raw+json" });
  });
});

describe("getLatestCommit", () => {
  it("SHA와 커밋 시각을 돌려준다", async () => {
    const fetchImpl = vi.fn(async () =>
      respond({ sha: "deadbeef", commit: { committer: { date: "2026-09-29T13:41:31Z" } } }),
    );
    expect(await clientWith(fetchImpl as unknown as typeof fetch).getLatestCommit()).toEqual({
      sha: "deadbeef",
      committedAt: "2026-09-29T13:41:31Z",
    });
  });
});

describe("오류 처리", () => {
  it("남은 호출이 0인 403은 RateLimitError이고 초기화 시각을 담는다", async () => {
    const fetchImpl = vi.fn(async () =>
      respond({}, { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1790000000" } }),
    );
    const error = await clientWith(fetchImpl as unknown as typeof fetch)
      .getTree()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).resetAt?.getTime()).toBe(1790000000 * 1000);
  });

  it("retry-after가 붙은 429(보조 한도)도 RateLimitError다", async () => {
    const fetchImpl = vi.fn(async () => respond({}, { status: 429, headers: { "retry-after": "30" } }));
    await expect(clientWith(fetchImpl as unknown as typeof fetch).getTree()).rejects.toBeInstanceOf(RateLimitError);
  });

  it("한도와 무관한 403이나 404는 GitHubError이고 상태 코드를 담는다", async () => {
    const forbidden = vi.fn(async () => respond({}, { status: 403 }));
    const error = await clientWith(forbidden as unknown as typeof fetch)
      .getTree()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubError);
    expect(error).not.toBeInstanceOf(RateLimitError);

    const missing = vi.fn(async () => respond({}, { status: 404 }));
    expect(
      await clientWith(missing as unknown as typeof fetch)
        .getBlobText("x")
        .catch((e: unknown) => (e as GitHubError).status),
    ).toBe(404);
  });
});

describe("withStaleFallback", () => {
  it("성공하면 새 값을, 이후 실패하면 마지막 성공 값을 stale로 돌려준다", async () => {
    let calls = 0;
    const load = withStaleFallback(async () => {
      calls += 1;
      if (calls === 2) throw new Error("boom");
      return `v${calls}`;
    });
    expect(await load()).toEqual({ value: "v1", stale: false });
    expect(await load()).toEqual({ value: "v1", stale: true });
    expect(await load()).toEqual({ value: "v3", stale: false });
  });

  it("처음부터 실패하면 오류를 그대로 던진다", async () => {
    const load = withStaleFallback(async () => {
      throw new Error("처음부터 실패");
    });
    await expect(load()).rejects.toThrow("처음부터 실패");
  });
});
