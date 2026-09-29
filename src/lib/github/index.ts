import "server-only";
import { loadConfig } from "@/lib/config";
import {
  createGitHubClient,
  withStaleFallback,
  type GitHubClient,
  type LatestCommit,
  type Loaded,
} from "./client";
import type { TreeEntry } from "./tree";

let client: GitHubClient | undefined;

/** 설정(환경변수)으로 만든 GitHub 클라이언트. 서버에서만 쓴다(토큰이 들어 있다). */
export function getGitHubClient(): GitHubClient {
  if (!client) {
    const config = loadConfig();
    client = createGitHubClient({
      repo: { ...config.repo, branch: config.branch },
      token: config.githubToken,
    });
  }
  return client;
}

/** 파일 트리. 불러오기에 실패하면 마지막 성공 값을 stale로 돌려준다. */
export const getTree: () => Promise<Loaded<TreeEntry[]>> = withStaleFallback(() =>
  getGitHubClient().getTree(),
);

export function getBlobText(sha: string): Promise<string> {
  return getGitHubClient().getBlobText(sha);
}

/** 최신 커밋 정보. 화면의 부가 정보라서 실패해도 문서 보기를 막지 않는다. */
export async function getLatestCommitOrNull(): Promise<LatestCommit | null> {
  try {
    return await getGitHubClient().getLatestCommit();
  } catch {
    return null;
  }
}
