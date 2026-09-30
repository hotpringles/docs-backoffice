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

describe("getFileCreator", () => {
  const commit = (name: string, login: string | null) => ({ commit: { author: { name } }, author: login ? { login } : null });
  type Call = [string, RequestInit & { next?: unknown }];

  it("그 파일의 커밋 기록에서 가장 오래된 커밋의 작성자를 돌려준다(목록은 최신 순이라 마지막 것)", async () => {
    const fetchImpl = vi.fn(async () => respond([commit("나중에 고친 사람", "editor"), commit("유재환", "letsgojh")]));
    const creator = await clientWith(fetchImpl as unknown as typeof fetch).getFileCreator("ai/docs/2026-09-09-capture.md");

    expect(creator).toEqual({ login: "letsgojh", name: "유재환" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as Call;
    expect(url).toBe("https://api.github.com/repos/org/repo/commits?sha=develop&path=ai%2Fdocs%2F2026-09-09-capture.md&per_page=100");
    // 처음 올린 사람은 바뀌지 않으니 하루 동안 캐시한다(push webhook의 트리 무효화에는 묶지 않는다).
    expect(init.next).toEqual({ revalidate: 86400, tags: ["authors"] });
  });

  it("한글·공백이 든 경로도 주소에 안전하게 넣는다", async () => {
    const fetchImpl = vi.fn(async () => respond([commit("a", "a")]));
    await clientWith(fetchImpl as unknown as typeof fetch).getFileCreator("frontend/docs/한글 문서.md");
    expect((fetchImpl.mock.calls[0] as unknown as Call)[0]).toContain("path=frontend%2Fdocs%2F%ED%95%9C%EA%B8%80%20%EB%AC%B8%EC%84%9C.md");
  });

  it("기록이 100개를 넘어 여러 쪽이면 마지막 쪽을 따로 받아서 거기서 가장 오래된 것을 고른다", async () => {
    const next = '<https://api.github.com/repositories/1/commits?page=2>; rel="next", <https://api.github.com/repositories/1/commits?page=3>; rel="last"';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(respond([commit("최신", "new")], { headers: { link: next } }))
      .mockResolvedValueOnce(respond([commit("중간", "mid"), commit("처음 올린 사람", "first")]));
    const creator = await clientWith(fetchImpl as unknown as typeof fetch).getFileCreator("a.md");

    expect(creator).toEqual({ login: "first", name: "처음 올린 사람" });
    expect((fetchImpl.mock.calls[1] as unknown as Call)[0]).toMatch(/&page=3$/);
  });

  it("기록이 하나도 없으면 null이다", async () => {
    const fetchImpl = vi.fn(async () => respond([]));
    expect(await clientWith(fetchImpl as unknown as typeof fetch).getFileCreator("nope.md")).toBeNull();
  });

  it("GitHub 계정이 지워진 작성자는 계정 이름 없이 커밋에 적힌 이름만 돌려준다", async () => {
    const fetchImpl = vi.fn(async () => respond([commit("탈퇴한 사람", null)]));
    expect(await clientWith(fetchImpl as unknown as typeof fetch).getFileCreator("a.md")).toEqual({ login: null, name: "탈퇴한 사람" });
  });

  it("호출 한도를 넘으면 RateLimitError를 그대로 던진다", async () => {
    const fetchImpl = vi.fn(async () => respond({}, { status: 403, headers: { "x-ratelimit-remaining": "0" } }));
    await expect(clientWith(fetchImpl as unknown as typeof fetch).getFileCreator("a.md")).rejects.toBeInstanceOf(RateLimitError);
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
