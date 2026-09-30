import "server-only";
import { loadConfig } from "@/lib/config";
import { loadAuthorOrNull } from "./author";
import {
  createGitHubClient,
  withStaleFallback,
  type FileCreator,
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

/** 작성자 조회를 이만큼(밀리초) 넘게 기다리지 않는다. 라벨은 부가 정보라서 문서 보기를 늦추면 안 된다. */
const AUTHOR_TIMEOUT_MS = 2000;

/** 문서를 처음 올린 사람. 조회가 실패하거나 늦으면 null이다(그러면 라벨을 그냥 생략한다). */
export function getDocAuthorOrNull(path: string): Promise<FileCreator | null> {
  return loadAuthorOrNull(() => getGitHubClient().getFileCreator(path), AUTHOR_TIMEOUT_MS);
}

/** 최신 커밋 정보. 화면의 부가 정보라서 실패해도 문서 보기를 막지 않는다. */
export async function getLatestCommitOrNull(): Promise<LatestCommit | null> {
  try {
    return await getGitHubClient().getLatestCommit();
  } catch {
    return null;
  }
}
