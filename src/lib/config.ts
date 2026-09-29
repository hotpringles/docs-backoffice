export class ConfigError extends Error {}

export type AppConfig = {
  repo: { owner: string; name: string };
  branch: string;
  /** 표시할 문서 폴더 목록(앞뒤 슬래시 없음). 비어 있으면 저장소 전체. */
  docsPaths: string[];
  githubToken: string | undefined;
  webhookSecret: string | undefined;
};

const REPO_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

export function normalizeDocsPath(input: string): string {
  const path = input.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (path.split("/").some((segment) => segment === ".." || segment === ".")) {
    throw new ConfigError(`DOCS_PATHS 항목에 "." 또는 ".."를 쓸 수 없어요: ${input}`);
  }
  return path;
}

export function parseDocsPaths(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const path = normalizeDocsPath(part);
    if (path) seen.add(path);
  }
  return [...seen];
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  const match = REPO_RE.exec(env.GITHUB_REPO?.trim() ?? "");
  if (!match) {
    throw new ConfigError('GITHUB_REPO는 "owner/name" 형식이어야 해요.');
  }
  return {
    repo: { owner: match[1], name: match[2] },
    branch: env.GITHUB_BRANCH?.trim() || "develop",
    docsPaths: parseDocsPaths(env.DOCS_PATHS),
    githubToken: env.GITHUB_TOKEN?.trim() || undefined,
    webhookSecret: env.GITHUB_WEBHOOK_SECRET?.trim() || undefined,
  };
}
