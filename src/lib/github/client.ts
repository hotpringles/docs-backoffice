import { TREE_REVALIDATE_SECONDS, TREE_TAG } from "./tags";
import type { TreeEntry } from "./tree";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export class RateLimitError extends GitHubError {
  constructor(readonly resetAt: Date | undefined) {
    super("GitHub API 호출 한도를 넘었어요.", 429);
    this.name = "RateLimitError";
  }
}

export type RepoConfig = { owner: string; name: string; branch: string };
export type LatestCommit = { sha: string; committedAt: string };

export type GitHubClient = {
  getTree(): Promise<TreeEntry[]>;
  getBlobText(sha: string): Promise<string>;
  getLatestCommit(): Promise<LatestCommit>;
};

export type GitHubClientOptions = {
  repo: RepoConfig;
  token?: string;
  fetchImpl?: typeof fetch;
};

const API = "https://api.github.com";

type TreeResponse = {
  truncated?: boolean;
  tree: { path: string; type: string; sha: string; size?: number }[];
};

type CommitResponse = { sha: string; commit: { committer: { date: string } } };

export function createGitHubClient({ repo, token, fetchImpl = fetch }: GitHubClientOptions): GitHubClient {
  const base = `${API}/repos/${repo.owner}/${repo.name}`;

  function headers(accept: string): Record<string, string> {
    return {
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "docs-backoffice",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async function request(url: string, accept: string, init: RequestInit): Promise<Response> {
    const response = await fetchImpl(url, { ...init, headers: headers(accept) });
    if (response.ok) return response;

    const limited =
      (response.status === 403 || response.status === 429) &&
      (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after"));
    if (limited) {
      const reset = Number(response.headers.get("x-ratelimit-reset"));
      throw new RateLimitError(reset > 0 ? new Date(reset * 1000) : undefined);
    }
    throw new GitHubError(`GitHub API ${response.status}: ${url}`, response.status);
  }

  const treeCache = { next: { revalidate: TREE_REVALIDATE_SECONDS, tags: [TREE_TAG] } };

  return {
    async getTree() {
      const url = `${base}/git/trees/${repo.branch}?recursive=1`;
      const response = await request(url, "application/vnd.github+json", treeCache);
      const data = (await response.json()) as TreeResponse;
      if (data.truncated) throw new GitHubError("저장소 트리가 너무 커서 일부만 왔어요.", 200);
      return data.tree
        .filter((item) => item.type === "blob")
        .map((item) => ({ path: item.path, sha: item.sha, size: item.size }));
    },

    async getBlobText(sha) {
      // 주소에 내용 해시(sha)가 들어 있어서 응답은 바뀌지 않는다. 영구 캐시한다.
      const response = await request(`${base}/git/blobs/${sha}`, "application/vnd.github.raw+json", {
        cache: "force-cache",
      });
      return response.text();
    },

    async getLatestCommit() {
      const url = `${base}/commits/${repo.branch}`;
      const response = await request(url, "application/vnd.github+json", treeCache);
      const data = (await response.json()) as CommitResponse;
      return { sha: data.sha, committedAt: data.commit.committer.date };
    },
  };
}

export type Loaded<T> = { value: T; stale: boolean };

/**
 * 불러오기에 실패하면 마지막으로 성공한 값을 대신 돌려준다(stale: true).
 * 서버리스 인스턴스 메모리에만 남는 최선 노력 방식이라, 새 인스턴스에서 처음 실패하면 오류가 그대로 난다.
 */
export function withStaleFallback<T>(load: () => Promise<T>): () => Promise<Loaded<T>> {
  let lastGood: { value: T } | undefined;
  return async () => {
    try {
      const value = await load();
      lastGood = { value };
      return { value, stale: false };
    } catch (error) {
      if (lastGood) return { value: lastGood.value, stale: true };
      throw error;
    }
  };
}
