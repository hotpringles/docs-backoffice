import { encodeDocPath } from "../github/tree";

export type RepoRef = { owner: string; name: string; branch: string };

/** 브라우저가 직접 받을 수 있는 원본 파일 주소(공개 저장소 전용). */
export function rawUrl(repo: RepoRef, path: string): string {
  return `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${encodeDocPath(repo.branch)}/${encodeDocPath(path)}`;
}

export function blobUrl(repo: RepoRef, path: string): string {
  return `https://github.com/${repo.owner}/${repo.name}/blob/${encodeDocPath(repo.branch)}/${encodeDocPath(path)}`;
}

export function treeUrl(repo: RepoRef, path: string): string {
  return `https://github.com/${repo.owner}/${repo.name}/tree/${encodeDocPath(repo.branch)}/${encodeDocPath(path)}`;
}
